/**
 * Grammar parsing and rule-table construction.
 *
 * The parser itself is pre-generated from src/rmutt.pegjs at build time
 * (see scripts/build-parser.mjs).
 */

import type {
  AssignmentNode,
  Expression,
  ExpressionNode,
  Grammar,
  InvocationNode,
  RuleNode,
  RuleTable,
} from './ast.js'
import { RmuttIncludeError, RmuttSyntaxError, type PeggySyntaxError } from './errors.js'
import { parse as parseGrammar } from './generated/parser.js'

const PACKAGE_SEPARATOR = '.'

export interface IncludeResult {
  source: string
  /** Becomes the `from` for anything the included file itself includes. */
  base: string
  grammarSource?: string | undefined
}

/**
 * Resolves an `#include` directive.
 *
 * `from` is the base of the file that contains the directive. The Node resolver
 * treats it as that file's directory. `next` delegates to the rest of the
 * chain, so a resolver that understands only some paths can decline the rest:
 *
 * ```javascript
 * const http = (path, from, next) =>
 *   path.startsWith('http') ? fetchGrammar(path) : next()
 * ```
 *
 * A resolver can also call `next` and post-process the result, which is how you
 * write a caching, logging, or path-rewriting layer.
 *
 * A resolver can return a promise. Resolving an include is the only I/O that
 * rmutt performs, and therefore the only reason any of the API is asynchronous.
 * An async resolver requires `parseAsync` or another promise-returning entry
 * point. The synchronous ones detect the promise and throw an error that says
 * so, instead of mistaking it for a source object.
 */
export type IncludeResolver = (
  path: string,
  from: string | undefined,
  next: () => IncludeResult | Promise<IncludeResult>,
) => IncludeResult | Promise<IncludeResult>

export interface ParseOptions {
  /** Label for error messages, a file path when the grammar comes from disk. */
  grammarSource?: string | undefined
  /** Base directory for `include` resolution. */
  workingDir?: string | undefined
  /**
   * How to resolve `#include`. A single resolver, or several tried in order
   * until one returns instead of calling `next`. Omitted means includes throw.
   */
  resolveInclude?: IncludeResolver | readonly IncludeResolver[] | undefined
}

/**
 * Folds a list of resolvers into one.
 *
 * Each is handed a `next` that runs the remainder of the list. Falling off the
 * end means nothing claimed the path, which is an error naming the path rather
 * than whatever the last resolver happened to fail on.
 */
export function composeResolvers(resolvers: readonly IncludeResolver[]): IncludeResolver {
  return (path, from) => {
    const step = (index: number): IncludeResult | Promise<IncludeResult> => {
      const resolver = resolvers[index]
      if (resolver == null) {
        throw new RmuttIncludeError(path, from, {
          reason: `no resolver handled it (tried ${resolvers.length})`,
        })
      }
      return resolver(path, from, () => step(index + 1))
    }
    return step(0)
  }
}

function toResolver(
  resolveInclude: IncludeResolver | readonly IncludeResolver[],
): IncludeResolver {
  return Array.isArray(resolveInclude)
    ? composeResolvers(resolveInclude)
    : (resolveInclude as IncludeResolver)
}

/**
 * Mutable state shared by every file in one parse.
 *
 * `nextChoiceId` keeps choice IDs unique across the whole parse. The grammar's
 * own counter restarts for each file it parses, so two files each number their
 * choices from zero. The runtime keys chooser state by that number, so
 * colliding IDs make two unrelated choice sites share one chooser: a chooser
 * sized for the larger site hands the smaller one an out-of-range index, and
 * the expansion silently comes back empty.
 *
 * Only the identity of an ID matters, not its value, because an ID names one
 * choice site. Renumbering therefore has no effect on a single-file grammar.
 */
interface ParseState {
  nextChoiceId: number
}

/** Reassigns every choice id in a subtree from the parse-wide counter. */
function renumberChoices(node: Expression, state: ParseState): void {
  if (node == null || typeof node === 'string') return

  if (node.type === 'Choices') {
    node.id = state.nextChoiceId++
  }

  if ('items' in node && node.items != null) {
    for (const item of node.items) renumberChoices(item, state)
  }
  if ('expr' in node && node.expr != null) renumberChoices(node.expr, state)
  if ('func' in node && node.func != null) renumberChoices(node.func, state)
  if ('search' in node && node.search != null) renumberChoices(node.search, state)
  if ('replace' in node && node.replace != null) renumberChoices(node.replace, state)
  if ('args' in node && node.args != null) {
    for (const arg of node.args) {
      if (typeof arg !== 'string') renumberChoices(arg, state)
    }
  }
}

/** An include the traversal has paused on, waiting to be resolved. */
interface IncludeRequest {
  path: string
  from: string | undefined
  /** The file the directive appears in, for error messages. */
  grammarSource: string | undefined
}

function isThenable(value: unknown): value is Promise<IncludeResult> {
  return typeof (value as { then?: unknown } | null)?.then === 'function'
}

/**
 * Parses a grammar (following includes) into its rule table.
 *
 * Throws if the resolver is asynchronous. Use `parseAsync` for that.
 */
export function parse(source: string, options: ParseOptions = {}): RuleTable {
  const rules: RuleTable = {}
  const state: ParseState = { nextChoiceId: 0 }
  const walk = collect(
    source,
    rules,
    options.workingDir,
    options,
    options.grammarSource,
    state,
  )

  let step = walk.next()
  while (!step.done) {
    const request = step.value
    const resolved = resolveOrThrow(request, options)
    if (isThenable(resolved)) {
      throw new RmuttIncludeError(request.path, request.grammarSource, {
        reason:
          'the include resolver returned a promise. Use parseAsync, compile or ' +
          'expand (the promise-returning forms) with an asynchronous resolver.',
      })
    }
    step = walk.next(resolved)
  }

  return rules
}

/** Parses a grammar, awaiting each include. Use with an async resolver. */
export async function parseAsync(
  source: string,
  options: ParseOptions = {},
): Promise<RuleTable> {
  const rules: RuleTable = {}
  const state: ParseState = { nextChoiceId: 0 }
  const walk = collect(
    source,
    rules,
    options.workingDir,
    options,
    options.grammarSource,
    state,
  )

  // Includes are resolved one at a time, in the order the grammar declares
  // them, because an included file can itself declare includes and the
  // traversal is depth-first. N remote includes cost N round trips.
  let step = walk.next()
  while (!step.done) {
    const request = step.value
    let resolved
    try {
      resolved = await resolveOrThrow(request, options)
    } catch (err) {
      throw err instanceof RmuttIncludeError
        ? err
        : new RmuttIncludeError(request.path, request.grammarSource, { cause: err })
    }
    step = walk.next(resolved)
  }

  return rules
}

function resolveOrThrow(
  request: IncludeRequest,
  options: ParseOptions,
): IncludeResult | Promise<IncludeResult> {
  try {
    // Presence is checked by the traversal before it yields.
    const resolve = toResolver(
      options.resolveInclude as IncludeResolver | readonly IncludeResolver[],
    )
    // The terminal `next`: reaching it means a lone resolver declined.
    return resolve(request.path, request.from, () => {
      throw new RmuttIncludeError(request.path, request.grammarSource, {
        reason: 'the resolver declined it',
      })
    })
  } catch (err) {
    throw err instanceof RmuttIncludeError
      ? err
      : new RmuttIncludeError(request.path, request.grammarSource, { cause: err })
  }
}

function parseSource(source: string, grammarSource: string | undefined): Grammar {
  try {
    return parseGrammar(source, { grammarSource })
  } catch (err) {
    throw RmuttSyntaxError.fromPeggy(err as PeggySyntaxError, grammarSource, source)
  }
}

/**
 * The traversal, written once as a generator.
 *
 * It yields each include it reaches and receives the resolved source back, so
 * the same code serves the synchronous and asynchronous entry points above.
 * Writing it twice would leave two copies of the ordering rules below, which
 * are subtle enough that they would drift.
 */
function* collect(
  source: string,
  rules: RuleTable,
  base: string | undefined,
  options: ParseOptions,
  grammarSource: string | undefined,
  state: ParseState,
): Generator<IncludeRequest, void, IncludeResult> {
  let pkg: string | undefined
  let entry: string | undefined

  for (const node of parseSource(source, grammarSource)) {
    switch (node.type) {
      case 'Include': {
        if (options.resolveInclude == null) {
          throw new RmuttIncludeError(node.path, grammarSource)
        }
        const included = yield { path: node.path, from: base, grammarSource }
        yield* collect(
          included.source,
          rules,
          included.base,
          options,
          included.grammarSource ?? node.path,
          state,
        )
        break
      }

      case 'Package':
        pkg = node.name
        break

      case 'Import':
        for (const name of node.rules) {
          importRule(rules, name, node.from, pkg)
        }
        break

      case 'Rule': {
        const name = pack(node.name, pkg)
        entry ??= name
        renumberChoices(node, state)
        setRule(rules, name, node, pkg)
        break
      }

      case 'Assignment':
        // Ignored: `a = "x";` outside a rule body is dropped
        // rather than added to the rule table.
        break
    }
  }

  // An include runs this first and sets $entry to its own first rule. The
  // including file then overwrites it, with `undefined` when it has no rules
  // of its own. A grammar that only includes therefore expands to nothing.
  rules.$entry = entry
}

function pack(name: string, pkg: string | undefined): string {
  if (pkg != null && name.indexOf(PACKAGE_SEPARATOR) === -1) {
    return pkg + PACKAGE_SEPARATOR + name
  }
  return name
}

function packReplace(name: string, pkg: string | undefined): string {
  const parts = name.split(PACKAGE_SEPARATOR)
  const last = parts[parts.length - 1] as string
  return pkg != null ? pkg + PACKAGE_SEPARATOR + last : last
}

/** Rewrites names inside a subtree into `pkg`. */
function packDeep(node: Expression, pkg: string | undefined): void {
  if (pkg == null || node == null || typeof node === 'string') return

  if (node.type === 'Invocation' || node.type === 'Assignment') {
    node.name = pack(node.name, pkg)
    const args = (node as InvocationNode).args
    if (args != null) {
      for (const arg of args) {
        if (arg != null) packDeep(arg, pkg)
      }
    }
  }

  if (node.type === 'Rule' && node.args != null) {
    node.args = node.args.map(arg => pack(arg, pkg))
  }

  if ('items' in node && node.items != null) {
    for (const item of node.items) {
      packDeep(item, pkg)
    }
  }

  if ('expr' in node && node.expr != null) packDeep(node.expr, pkg)
  if ('func' in node && node.func != null) packDeep(node.func, pkg)
  if ('replace' in node && node.replace != null) packDeep(node.replace, pkg)
}

function importRule(
  rules: RuleTable,
  name: string,
  from: string,
  into: string | undefined,
): void {
  const nameFrom = pack(name, from)
  const nameInto = pack(name, into)

  const source = rules[nameFrom]
  if (source == null || typeof source === 'string') {
    throw new Error(`Cannot import '${name}' from '${from}': no such rule '${nameFrom}'`)
  }
  const sourceArgs = source.type === 'Rule' ? source.args : undefined

  let args: string[] | undefined
  let invocationArgs: InvocationNode[] | undefined
  if (sourceArgs != null) {
    args = sourceArgs.map((arg: string) => packReplace(arg, into))
    invocationArgs = args.map(
      arg => ({ type: 'Invocation', name: arg }) as InvocationNode,
    )
  }

  const imported: RuleNode = {
    type: 'Rule',
    name: nameInto,
    args,
    expr: {
      type: 'Invocation',
      name: nameFrom,
      args: invocationArgs,
    } as InvocationNode,
  }
  rules[nameInto] = imported
}

function setRule(
  rules: RuleTable,
  name: string,
  rule: RuleNode | AssignmentNode,
  pkg: string | undefined,
): void {
  rule.name = name
  packDeep(rule as ExpressionNode, pkg)
  rules[name] = rule
}
