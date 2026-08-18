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
import {
  composeResolvers,
  parse as parseImpl,
  parseAsync as parseAsyncImpl,
  type IncludeResolver,
  type IncludeResult,
  type ParseOptions,
} from './parse.js'
import { transpile as transpileRules, type TranspileResult } from './transpile.js'

export type {
  CompileOptions,
  CompileResult,
  ExpandOptions,
  Expander,
  ExpandResult,
  IncludeResolver,
  IncludeResult,
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

  const parse = async (source: string, options: ParseOptions = {}): Promise<RuleTable> =>
    parseAsyncImpl(source, withDefaults(options))

  const parseSync = (source: string, options: ParseOptions = {}): RuleTable =>
    parseImpl(source, withDefaults(options))

  // Parsing is the only step that can be asynchronous, because resolving an
  // `#include` is the only I/O rmutt performs. Everything downstream
  // (codegen, `new Function`, expansion) is pure computation, so the async
  // entry points await here and are synchronous from this line on.
  const toRules = async (
    source: string | RuleTable,
    options: CompileOptions,
  ): Promise<RuleTable> => (typeof source === 'string' ? parse(source, options) : source)

  const toRulesSync = (source: string | RuleTable, options: CompileOptions): RuleTable =>
    typeof source === 'string' ? parseSync(source, options) : source

  const transpile = async (source: string | RuleTable, options: CompileOptions = {}) =>
    transpileRules(await toRules(source, options), options)

  const transpileSync = (
    source: string | RuleTable,
    options: CompileOptions = {},
  ): TranspileResult => transpileRules(toRulesSync(source, options), options)

  const compile = async (source: string | RuleTable, options: CompileOptions = {}) =>
    compileImpl(await toRules(source, options), withDefaults(options))

  const compileSync = (
    source: string | RuleTable,
    options: CompileOptions = {},
  ): CompileResult => compileImpl(toRulesSync(source, options), withDefaults(options))

  const expand = async (
    source: string | RuleTable | Expander,
    options: ExpandOptions = {},
  ) =>
    typeof source === 'function'
      ? source(options)
      : compileImpl(await toRules(source, options), withDefaults(options)).compiled(
          options,
        )

  const expandSync = (
    source: string | RuleTable | Expander,
    options: ExpandOptions = {},
  ): ExpandResult =>
    typeof source === 'function'
      ? source(options)
      : compileSync(source, options).compiled(options)

  return {
    parse,
    parseSync,
    transpile,
    transpileSync,
    compile,
    compileSync,
    expand,
    expandSync,
  }
}

export { composeResolvers }
export * from './ast.js'
export { RmuttError, RmuttIncludeError, RmuttSyntaxError } from './errors.js'
export {
  transformation,
  wrapModule,
  type External,
  type TranspileOptions,
} from './transpile.js'
