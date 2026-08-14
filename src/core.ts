/**
 * The environment-neutral API.
 *
 * No code in this module touches the filesystem. Each entry point supplies its
 * own include resolver:
 *
 * - `src/index.ts` (Node) binds the filesystem resolver as the default.
 * - `src/browser.ts` binds no resolver, so an `#include` throws
 *   `RmuttIncludeError`.
 *
 * The public surface is promise-based and provides a `*Sync` variant of every
 * method. None of the work is asynchronous: parsing, transpiling, and expanding
 * are all synchronous. The promise shape leaves room to add an async include
 * resolver later without another breaking change.
 */

import type { RuleTable } from './ast.js'
import {
  compile as compileImpl,
  type CompileOptions,
  type CompileResult,
  type ExpandOptions,
  type Expander,
  type ExpandResult,
} from './compile.js'
import { parse as parseImpl, type IncludeResolver, type ParseOptions } from './parse.js'
import { transpile as transpileRules, type TranspileResult } from './transpile.js'

export type {
  CompileOptions,
  CompileResult,
  ExpandOptions,
  Expander,
  ExpandResult,
  IncludeResolver,
  ParseOptions,
  TranspileResult,
}

export interface Defaults {
  resolveInclude?: IncludeResolver | undefined
}

export interface Rmutt {
  parse(source: string, options?: ParseOptions): Promise<RuleTable>
  parseSync(source: string, options?: ParseOptions): RuleTable

  transpile(
    source: string | RuleTable,
    options?: CompileOptions,
  ): Promise<TranspileResult>
  transpileSync(source: string | RuleTable, options?: CompileOptions): TranspileResult

  compile(source: string | RuleTable, options?: CompileOptions): Promise<CompileResult>
  compileSync(source: string | RuleTable, options?: CompileOptions): CompileResult

  expand(
    source: string | RuleTable | Expander,
    options?: ExpandOptions,
  ): Promise<ExpandResult>
  expandSync(source: string | RuleTable | Expander, options?: ExpandOptions): ExpandResult
}

/** Builds the API with a given set of environment defaults. */
export function createApi(defaults: Defaults = {}): Rmutt {
  const withDefaults = <T extends ParseOptions>(options: T): T =>
    options.resolveInclude != null || defaults.resolveInclude == null
      ? options
      : { ...options, resolveInclude: defaults.resolveInclude }

  const parseSync = (source: string, options: ParseOptions = {}): RuleTable =>
    parseImpl(source, withDefaults(options))

  const toRules = (source: string | RuleTable, options: CompileOptions): RuleTable =>
    typeof source === 'string' ? parseSync(source, options) : source

  const transpileSync = (
    source: string | RuleTable,
    options: CompileOptions = {},
  ): TranspileResult => transpileRules(toRules(source, options), options)

  const compileSync = (
    source: string | RuleTable,
    options: CompileOptions = {},
  ): CompileResult => compileImpl(toRules(source, options), withDefaults(options))

  const expandSync = (
    source: string | RuleTable | Expander,
    options: ExpandOptions = {},
  ): ExpandResult =>
    typeof source === 'function'
      ? source(options)
      : compileSync(source, options).compiled(options)

  return {
    parseSync,
    transpileSync,
    compileSync,
    expandSync,
    parse: async (source, options) => parseSync(source, options),
    transpile: async (source, options) => transpileSync(source, options),
    compile: async (source, options) => compileSync(source, options),
    expand: async (source, options) => expandSync(source, options),
  }
}

export * from './ast.js'
export { RmuttError, RmuttIncludeError, RmuttSyntaxError } from './errors.js'
export {
  transformation,
  wrapModule,
  type External,
  type TranspileOptions,
} from './transpile.js'
