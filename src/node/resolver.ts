/**
 * The Node include resolver.
 *
 * Kept out of src/parse.ts so the core has no filesystem dependency.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { IncludeResolver } from '../parse.js'

export const resolveInclude: IncludeResolver = (path, from) => {
  const fullpath = join(from ?? process.cwd(), path)
  return {
    source: readFileSync(fullpath, 'utf8'),
    base: dirname(fullpath),
    grammarSource: fullpath,
  }
}
