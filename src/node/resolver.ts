/**
 * The Node include resolver.
 *
 * Kept out of src/parse.ts so the core has no filesystem dependency.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { IncludeResolver } from '../parse.js'

/** `scheme://`: anything a filesystem cannot open. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Reads an include from disk, relative to the including file.
 *
 * Declines anything carrying a URL scheme rather than trying to open
 * `https://…` as a filename, so it composes in either order with a resolver
 * that does understand URLs and reports a missing file as a missing file.
 */
export const resolveInclude: IncludeResolver = (path, from, next) => {
  if (ABSOLUTE_URL.test(path)) return next()

  const fullpath = join(from ?? process.cwd(), path)
  return {
    source: readFileSync(fullpath, 'utf8'),
    base: dirname(fullpath),
    grammarSource: fullpath,
  }
}
