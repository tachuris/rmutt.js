import { describe, expect, it } from 'vite-plus/test'

import type { ChoicesNode, RuleNode } from '../src/ast.js'
import { RmuttIncludeError, RmuttSyntaxError } from '../src/errors.js'
import { compileSync, expand, parseSync } from '../src/index.js'
import { parse, parseAsync, type IncludeResolver } from '../src/parse.js'

describe('parse', () => {
  it('builds a rule table with the first rule as the entry', () => {
    const rules = parse('t: "a"|"b"; u: "c";')

    expect(Object.keys(rules).sort()).toEqual(['$entry', 't', 'u'])
    expect(rules.$entry).toBe('t')
  })

  it('produces the documented AST shape', () => {
    const rules = parse('t: "a"|"b";')
    const rule = rules.t as RuleNode

    expect(rule.type).toBe('Rule')
    const choices = rule.expr as ChoicesNode
    expect(choices.type).toBe('Choices')
    expect(choices.mode).toBe('any')
    expect(choices.items).toEqual(['a', 'b'])
    expect(typeof choices.id).toBe('number')
  })

  it('recognises the choosing modes', () => {
    const any = (parse('t: "a"|"b";').t as RuleNode).expr as ChoicesNode
    const shuffle = (parse('t: & "a","b";').t as RuleNode).expr as ChoicesNode
    const reshuffle = (parse('t: && "a","b";').t as RuleNode).expr as ChoicesNode

    expect([any.mode, shuffle.mode, reshuffle.mode]).toEqual([
      'any',
      'shuffle',
      'reshuffle',
    ])
  })

  it('namespaces rules declared in a package', () => {
    const rules = parse('package p; t: "a"; u: t;')

    expect(Object.keys(rules).sort()).toEqual(['$entry', 'p.t', 'p.u'])
    expect(rules.$entry).toBe('p.t')
  })

  it('ignores top-level assignments', () => {
    // `a = "x";` outside a rule body is dropped rather than added to the
    // rule table.
    const rules = parse('a = "x"; t: "y";')

    expect(Object.keys(rules).sort()).toEqual(['$entry', 't'])
  })

  describe('errors', () => {
    it('throws RmuttSyntaxError with structured location data', () => {
      let error: RmuttSyntaxError | undefined
      try {
        parse('t: "unterminated')
      } catch (err) {
        error = err as RmuttSyntaxError
      }

      expect(error).toBeInstanceOf(RmuttSyntaxError)
      expect(error?.line).toBe(1)
      expect(typeof error?.column).toBe('number')
      expect(typeof error?.offset).toBe('number')
      // The message stays clean. Location lives in properties, not appended
      // text, so consumers never have to match on message strings.
      expect(error?.message).not.toMatch(/\n {4}at \(/)
    })

    it('includes a caret snippet rendered by peggy', () => {
      let error: RmuttSyntaxError | undefined
      try {
        parse('t: "unterminated', { grammarSource: 'demo.rm' })
      } catch (err) {
        error = err as RmuttSyntaxError
      }

      expect(error?.grammarSource).toBe('demo.rm')
      expect(error?.snippet).toContain('demo.rm')
      expect(error?.snippet).toContain('>')
    })

    it('reports a missing include resolver clearly', () => {
      expect(() => parse('#include "other.rm"')).toThrow(RmuttIncludeError)
      // A browser would otherwise see `fs is not defined` instead.
      expect(() => parse('#include "other.rm"')).toThrow(
        /Cannot resolve include 'other\.rm'/,
      )
    })
  })

  describe('pluggable includes', () => {
    it('resolves includes through an injected resolver, with no filesystem', () => {
      const files: Record<string, string> = {
        'shared.rm': 'greeting: "hello";',
      }
      const resolveInclude: IncludeResolver = path => ({
        source: files[path] ?? '',
        base: '',
      })

      const rules = parse('#include "shared.rm"\nt: greeting;', {
        resolveInclude,
      })

      expect(Object.keys(rules).sort()).toEqual(['$entry', 'greeting', 't'])
      expect(rules.$entry).toBe('t')
    })

    it('lets an including file overwrite $entry -- even with undefined', () => {
      // `rules.$entry = entry` is unconditional at the end of every nested
      // parse. A file that only includes has no entry of its own and
      // overwrites the included one, so it expands to the empty string.
      const resolveInclude: IncludeResolver = () => ({
        source: 'inner: "x";',
        base: '',
      })

      const rules = parse('#include "inner.rm"', { resolveInclude })

      expect(rules.inner).toBeDefined()
      expect(rules.$entry).toBeUndefined()
    })
  })
})

describe('choice ids across files', () => {
  // The grammar's own counter restarts for every file it parses, so without
  // renumbering two files each number their choices from zero. The runtime
  // keys chooser state by that number, so colliding ids make unrelated choice
  // sites share one chooser: sized by whichever ran first, it hands the other
  // an out-of-range index and that part of the expansion silently disappears.
  const files: Record<string, string> = {
    'inc.rm': 'package p;\nthree: "a", "b", "c";',
  }
  const resolveInclude = (path: string) => ({ source: files[path] as string, base: '' })

  it('numbers every choice site uniquely across included files', () => {
    const rules = parseSync('#include "inc.rm"\nfour: "1", "2", "3", "4";', {
      resolveInclude,
    })

    const ids = Object.values(rules)
      .filter(rule => typeof rule === 'object' && rule?.expr != null)
      .map(rule => (rule as RuleNode).expr as ChoicesNode)
      .filter(expr => expr?.type === 'Choices')
      .map(expr => expr.id)

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('never drops a term because two sites shared a chooser', () => {
    const { compiled } = compileSync(
      '#include "inc.rm"\ntop: four "-" p.three;\nfour: "1", "2", "3", "4";',
      { resolveInclude },
    )

    const seen = new Set<string | undefined>()
    for (let i = 0; i < 400; i++) seen.add(compiled().expanded)

    // All 4x3 combinations, and never a truncated "1-".
    expect(seen.size).toBe(12)
    expect([...seen].every(value => /^[1-4]-[abc]$/.test(value as string))).toBe(true)
  })
})

describe('asynchronous includes', () => {
  // The motivating case: grammars fetched over the network. Resolution is the
  // only place rmutt can do I/O, so it is the only place a promise appears.
  //
  // The grammar may name a full URL directly; what a path means is entirely
  // the resolver's business.
  const HOST = 'https://example.test/'
  const remote: Record<string, string> = {
    [`${HOST}shared.rm`]: '#include "deep.rm"\ngreeting: hello;',
    [`${HOST}deep.rm`]: 'hello: "hello";',
  }

  const fetchInclude: IncludeResolver = async path => {
    await Promise.resolve() // stand in for a network round trip
    const source = remote[`${HOST}${path}`]
    if (source == null) throw new Error(`404 ${path}`)
    return { source, base: HOST }
  }

  it('follows includes through an async resolver, transitively', async () => {
    const rules = await parseAsync('#include "shared.rm"\ntop: greeting;', {
      resolveInclude: fetchInclude,
    })

    expect(Object.keys(rules).sort()).toEqual(['$entry', 'greeting', 'hello', 'top'])
    expect(rules.$entry).toBe('top')
  })

  it('expands end to end through the promise API', async () => {
    const { expanded } = await expand('#include "deep.rm"\ntop: hello " world";', {
      resolveInclude: fetchInclude,
    })

    expect(expanded).toBe('hello world')
  })

  it('surfaces a rejected resolver as RmuttIncludeError', async () => {
    await expect(
      parseAsync('#include "missing.rm"', { resolveInclude: fetchInclude }),
    ).rejects.toThrow(RmuttIncludeError)
  })

  it('refuses an async resolver on the synchronous path, by name', () => {
    // Without this check the promise would be treated as a source object and
    // fail much later, somewhere unrelated.
    expect(() => parse('#include "deep.rm"', { resolveInclude: fetchInclude })).toThrow(
      /returned a promise\. Use parseAsync/,
    )
  })

  it('accepts a full URL in the include directive', async () => {
    const url = `${HOST}deep.rm`
    const seen: string[] = []

    const rules = await parseAsync(`#include "${url}"\ntop: hello;`, {
      resolveInclude: async path => {
        seen.push(path)
        return { source: remote[path] as string, base: '' }
      },
    })

    // Handed to the resolver verbatim, colons, slashes and all.
    expect(seen).toEqual([url])
    expect(rules.hello).toBeDefined()
  })

  it('accepts paths the old character class excluded', () => {
    for (const path of ['Upper.rm', 'a b.rm', '../up.rm', 'q.rm?v=2&k=1']) {
      const seen: string[] = []
      parse(`#include "${path}"`, {
        resolveInclude: p => {
          seen.push(p)
          // Not empty: the parser rejects an empty grammar as a syntax error.
          return { source: 'included: "x";', base: '' }
        },
      })
      expect(seen).toEqual([path])
    }
  })

  it('still accepts a synchronous resolver on the async path', async () => {
    const rules = await parseAsync('#include "inner.rm"\ntop: inner;', {
      resolveInclude: () => ({ source: 'inner: "x";', base: '' }),
    })

    expect(rules.top).toBeDefined()
    expect(rules.inner).toBeDefined()
  })
})
