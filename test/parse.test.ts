import { describe, expect, it } from 'vite-plus/test'

import type { ChoicesNode, RuleNode } from '../src/ast.js'
import { RmuttIncludeError, RmuttSyntaxError } from '../src/errors.js'
import { parse, type IncludeResolver } from '../src/parse.js'

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
