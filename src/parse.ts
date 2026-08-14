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

/**
 * Resolves an `include` directive.
 *
 * `from` is the base of the file that contains the directive; the Node resolver
 * treats it as that file's directory. The `base` in the returned object becomes
 * the `from` value for any directives inside the resolved file.
 */
export type IncludeResolver = (
  path: string,
  from: string | undefined,
) => { source: string; base: string; grammarSource?: string | undefined }

export interface ParseOptions {
  /** Label for error messages, a file path when the grammar comes from disk. */
  grammarSource?: string | undefined
  /** Base directory for `include` resolution. */
  workingDir?: string | undefined
  /** Required for grammars using `include`. Omitted means includes throw. */
  resolveInclude?: IncludeResolver | undefined
}

/** Parses a grammar (following includes) into its rule table. */
export function parse(source: string, options: ParseOptions = {}): RuleTable {
  const rules: RuleTable = {}
  collect(source, rules, options.workingDir, options, options.grammarSource)
  return rules
}

function parseSource(source: string, grammarSource: string | undefined): Grammar {
  try {
    return parseGrammar(source, { grammarSource })
  } catch (err) {
    throw RmuttSyntaxError.fromPeggy(err as PeggySyntaxError, grammarSource, source)
  }
}

function collect(
  source: string,
  rules: RuleTable,
  base: string | undefined,
  options: ParseOptions,
  grammarSource: string | undefined,
): void {
  let pkg: string | undefined
  let entry: string | undefined

  for (const node of parseSource(source, grammarSource)) {
    switch (node.type) {
      case 'Include': {
        const resolve = options.resolveInclude
        if (resolve == null) {
          throw new RmuttIncludeError(node.path, grammarSource)
        }
        let included
        try {
          included = resolve(node.path, base)
        } catch (err) {
          throw new RmuttIncludeError(node.path, grammarSource, { cause: err })
        }
        collect(
          included.source,
          rules,
          included.base,
          options,
          included.grammarSource ?? node.path,
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
        setRule(rules, name, node, pkg)
        break
      }

      case 'Assignment':
        // Ignored: `a = "x";` outside a rule body is dropped
        // rather than added to the rule table.
        break
    }
  }

  // An include runs this first and sets $entry to its own first rule; the
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
