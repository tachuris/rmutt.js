import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { expand, expandSync, parse, parseSync } from '../src/index.js'
import { resolveHttp } from '../src/http.js'

/**
 * Include resolution works out of the box for both files and URLs, so a
 * grammar that mixes them needs no configuration at all.
 *
 * `fetch` is stubbed throughout: a test that reaches the network fails for
 * reasons that have nothing to do with this project.
 */

const REMOTE: Record<string, string> = {
  'https://example.test/util.rm': 'package util;\nshout: "HI";',
  'https://example.test/nested.rm': '#include "leaf.rm"\nmid: leaf;',
  'https://example.test/leaf.rm': 'leaf: "leaf";',
}

function stubFetch(): void {
  vi.stubGlobal('fetch', async (url: string) => {
    const source = REMOTE[String(url)]
    return source == null
      ? { ok: false, status: 404, statusText: 'Not Found' }
      : { ok: true, status: 200, statusText: 'OK', text: async () => source }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('default include resolution', () => {
  it('fetches a URL include with no resolver configured', async () => {
    stubFetch()

    const { expanded } = await expand(
      '#include "https://example.test/util.rm"\ntop: util.shout;',
    )

    expect(expanded).toBe('HI')
  })

  it('resolves a relative include inside a fetched grammar against its origin', async () => {
    stubFetch()

    const rules = await parse('#include "https://example.test/nested.rm"\ntop: mid;')

    // leaf.rm was named relatively, from a grammar that arrived over HTTP.
    expect(rules.leaf).toBeDefined()
    expect(rules.mid).toBeDefined()
  })

  it('reports a failed fetch as an include error naming the path', async () => {
    stubFetch()

    await expect(parse('#include "https://example.test/missing.rm"')).rejects.toThrow(
      /Cannot resolve include 'https:\/\/example\.test\/missing\.rm'/,
    )
  })
})

describe('resolveHttp', () => {
  it('declines a non-URL synchronously', () => {
    // The property that keeps file-only grammars off the async path: an
    // `async function` here would return a promise for every include, and
    // expandSync would refuse them all.
    const declined = resolveHttp('local.rm', undefined, () => ({
      source: 'x: "y";',
      base: '',
    }))

    expect(declined).not.toBeInstanceOf(Promise)
    expect(declined).toEqual({ source: 'x: "y";', base: '' })
  })

  it('leaves a file-only grammar fully synchronous', () => {
    const files: Record<string, string> = { 'inc.rm': 'inner: "x";' }

    // Goes through the default chain: resolveHttp declines, and the caller's
    // resolver answers, all without a promise in sight.
    const rules = parseSync('#include "inc.rm"\ntop: inner;', {
      resolveInclude: (path, _from, next) =>
        files[path] != null ? { source: files[path], base: '' } : next(),
    })

    expect(rules.inner).toBeDefined()
  })

  it('keeps expandSync working for grammars that only touch disk', () => {
    const { expanded } = expandSync('top: "no includes here";')

    expect(expanded).toBe('no includes here')
  })
})
