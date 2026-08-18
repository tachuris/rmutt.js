/**
 * The HTTP include resolver.
 *
 * Environment-neutral: it uses the global `fetch`, which both Node and
 * browsers provide, so it carries no `node:` imports and is part of the
 * default chain in either place.
 *
 * It declines **synchronously** for anything that is not a URL.
 * Declining synchronously keeps file-only grammars usable from `expandSync`.
 */

import type { IncludeResolver, IncludeResult } from './parse.js'

const ABSOLUTE = /^https?:\/\//i

export const resolveHttp: IncludeResolver = (path, from, next) => {
  const url = locate(path, from)
  return url == null ? next() : get(url)
}

/** Resolves `path` against `from` when either names an http(s) location. */
function locate(path: string, from: string | undefined): string | undefined {
  if (ABSOLUTE.test(path)) return path
  // A relative include inside a grammar that was itself fetched belongs to the
  // same origin, so it resolves against the URL it came from.
  if (from != null && ABSOLUTE.test(from)) return new URL(path, from).href
  return undefined
}

async function get(url: string): Promise<IncludeResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  }
  return {
    source: await response.text(),
    // The directory, so a relative include inside the fetched grammar
    // resolves against its own location rather than the site root.
    base: new URL('.', url).href,
    grammarSource: url,
  }
}
