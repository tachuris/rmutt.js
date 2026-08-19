/**
 * Turns generated source into a callable expander.
 *
 * Codegen emits a bare function expression, so compilation needs a single
 * `new Function('return …')` call and no module shim.
 *
 * That call is the only eval in the library, and it's why `compile` and
 * `expand` require `unsafe-eval` under a strict Content Security Policy but
 * `transpile` doesn't. For details, see the CSP note in the README.
 */

import type { RuleTable } from './ast.js'
import { parse, type ParseOptions } from './parse.js'
import { transpile, type TranspileOptions } from './transpile.js'

export interface ExpandOptions extends CompileOptions {
  /** Generate the i-th of N possible combinations, instead of at random. */
  iteration?: number | undefined
  /** Maximum depth to which the grammar will expand. */
  maxStackDepth?: number | undefined
  /** Seed for the PRNG. A number, or an array for array seeding. */
  randomSeed?: number | number[] | undefined
}

export interface ExpandResult {
  expanded: string | undefined
  options: ExpandOptions
}

/** A compiled grammar. Synchronous. Expansion performs no I/O. */
export type Expander = (options?: ExpandOptions) => ExpandResult

export interface CompileOptions extends ParseOptions, TranspileOptions {}

export interface CompileResult {
  compiled: Expander
  options: CompileOptions
}

/** Compiles a grammar (or an already-parsed rule table) into an expander. */
export function compile(
  source: string | RuleTable,
  options: CompileOptions = {},
): CompileResult {
  const rules = typeof source === 'string' ? parse(source, options) : source
  const result = transpile(rules, options)

  // Wrapped in parens. The generated source starts with a comment, and a bare`return`
  // before it would hit automatic semicolon insertion and throw a SyntaxError.
  // oxlint-disable-next-line no-implied-eval
  const compiled = new Function(`return (${result.transpiled}\n)`)() as Expander
  return { compiled, options: result.options }
}
