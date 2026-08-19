/**
 * Code generation: rule table in, expander source out.
 */

import {
  assertNever,
  type AssignmentNode,
  type ChoicesNode,
  type Expression,
  type InvocationNode,
  type MappingNode,
  type QuantifiedNode,
  type RuleNode,
  type RuleTable,
  type TermsNode,
  type TransformationNode,
} from './ast.js'
import { PAYLOAD_GLOBAL, PAYLOAD_SOURCE } from './generated/payload.js'

const ROOT_SCOPE_VAR = '$root'
const LOCAL_SCOPE_VAR = '$'

/** Names the payload provides that generated code refers to directly. */
const RUNTIME_BINDINGS = [
  '$Scope',
  'choose',
  'compose',
  'concat',
  'expand',
  'mapping',
  'repeat',
  'transform',
] as const

/**
 * A JavaScript function usable as a rule or transformation.
 *
 * The parameter list is `never[]` rather than `unknown[]` so that ordinary
 * typed externals stay assignable. Parameter types are contravariant, so
 * TypeScript rejects `(input: string) => string` as
 * `(...args: unknown[]) => unknown`. Because `never` is the bottom type, a
 * `never[]` parameter list accepts any signature.
 *
 * Don't call an external through this type. The type describes what callers
 * pass in, and rmutt invokes externals only from generated code.
 */
export type External = (...args: never[]) => unknown

/**
 * The `externals` map.
 *
 * Values need not be functions: the runtime returns a non-function external
 * as-is, so a grammar can invoke it as a variable
 * (`externals: { name: 'value' }`). Typing this as `Record<string, External>`
 * looks tighter but rejects a documented, tested use.
 */
export type Externals = Record<string, unknown>

export interface TranspileOptions {
  /** Rule to expand first. Defaults to the first rule in the grammar. */
  entry?: string | undefined
  /** Label for error messages, a file path when the grammar comes from disk. */
  grammarSource?: string | undefined
  /** JavaScript functions (or plain values) callable as rules. */
  externals?: Externals | undefined
  /** How to seed the PRNG when no `randomSeed` is supplied. */
  randomSeedType?: 'integer' | 'array' | undefined
  /** Comment written into the generated header. */
  header?: string | undefined
  /** Populated during transpilation. Rules detected as composable. */
  composable?: string[] | undefined
}

/**
 * Guesses whether a chunk of source is a transformation (a function returning
 * a function), so `Terms` can emit `compose` rather than `concat`.
 */
export function isTransformationSource(code: string): boolean {
  if (code.indexOf('return function') !== -1) return true
  // `=> (x) =>`, `=> function`, `=> x =>`.
  return /=>\s*(?:function\b|\(?[A-Za-z_$][\w$]*\)?\s*=>|\()/.test(code)
}

/** Marks an external as a transformation, making composition explicit. */
const TRANSFORMATION = Symbol.for('rmutt.transformation')

export function transformation<T extends External>(fn: T): T {
  ;(fn as unknown as Record<symbol, boolean>)[TRANSFORMATION] = true
  return fn
}

function isTransformationExternal(fn: unknown): boolean {
  // Non-function externals are variables, never transformations.
  if (typeof fn !== 'function') return false
  if ((fn as unknown as Record<symbol, boolean>)[TRANSFORMATION] === true) return true
  // Unmarked externals fall back to the text heuristic.
  return isTransformationSource(fn.toString())
}

function detectComposableRules(rules: RuleTable, options: TranspileOptions): string[] {
  const result: string[] = []
  for (const [name, fn] of Object.entries(options.externals ?? {})) {
    if (isTransformationExternal(fn)) result.push(name)
  }
  for (const [name, rule] of Object.entries(rules)) {
    if (name === '$entry' || rule == null || typeof rule === 'string') continue
    const expr = rule.expr
    if (expr != null && typeof expr !== 'string' && expr.type === 'CodeBlock') {
      if (isTransformationSource(expr.code)) result.push(name)
    }
  }
  return result
}

// --- expression codegen ---

function generate(node: Expression, options: TranspileOptions): string {
  if (node == null) return '""'
  if (typeof node === 'string') return JSON.stringify(node)

  switch (node.type) {
    case 'Assignment':
      return generateAssignment(LOCAL_SCOPE_VAR, node, generate(node.expr, options))

    case 'Choices':
      return generateChoices(node, options)

    case 'CodeBlock':
      return `${LOCAL_SCOPE_VAR}.evaluate(${JSON.stringify(node.code)})`

    case 'Invocation':
      return generateInvocation(node, options)

    case 'Quantified':
      // The quantifier is consumed by Choices, which is the only place it is
      // meaningful. Parsed at this level for backward compatibility.
      return generate(node.expr, options)

    case 'Mapping':
      return generateMapping(node, options)

    case 'Repetition':
      return `repeat(${generate(node.expr, options)}, ${JSON.stringify(node.range)})`

    case 'Rule':
      return generateRuleDefinition(LOCAL_SCOPE_VAR, node, options)

    case 'Template':
      return `concat(${generateList(node.items, options)})`

    case 'Terms':
      return generateTerms(node, options)

    case 'Transformation':
      return generateTransformation(node, options)

    default:
      return assertNever(node, 'transpile')
  }
}

function generateList(nodes: Expression[], options: TranspileOptions): string {
  return nodes
    .filter(node => node !== undefined)
    .map(node => generate(node, options))
    .join(', ')
}

function generateChoices(node: ChoicesNode, options: TranspileOptions): string {
  // Simplify single choice
  if (node.items.length === 1) return generate(node.items[0], options)

  const choices = node.items
    .map(item => {
      if (item == null) return "''"
      if (typeof item !== 'string' && item.type === 'Quantified') {
        const quantified = item as QuantifiedNode
        return `{value: ${generate(quantified.expr, options)}, q: ${quantified.quantifier}}`
      }
      return generate(item, options)
    })
    .join(', ')

  return `choose('${node.mode}', ${node.id}, ${choices})`
}

function generateInvocation(node: InvocationNode, options: TranspileOptions): string {
  const method = node.prefix === '@' ? '.invokeIndirection' : '.invoke'
  const args = node.args != null ? `, [${generateList(node.args, options)}]` : ''
  return `${LOCAL_SCOPE_VAR}${method}('${node.name}'${args})`
}

function generateMapping(node: MappingNode, options: TranspileOptions): string {
  return `mapping(${generate(node.search, options)}, ${generate(node.replace, options)})`
}

function generateTerms(node: TermsNode, options: TranspileOptions): string {
  // Simplify single term
  if (node.items.length === 1) return generate(node.items[0], options)

  const composable = options.composable ?? []
  const isComposable = (item: Expression): boolean => {
    if (item == null || typeof item === 'string') return false
    if (item.type === 'Mapping') return true
    if (item.type === 'CodeBlock') return isTransformationSource(item.code)
    if (item.type === 'Invocation') return composable.indexOf(item.name) !== -1
    return false
  }

  const fn = node.items.every(isComposable) ? 'compose' : 'concat'
  return `${fn}(${generateList(node.items, options)})`
}

function generateTransformation(
  node: TransformationNode,
  options: TranspileOptions,
): string {
  // For transformation chaining, the tree must be made left-recursive.
  let rule: TransformationNode = node
  const func = node.func
  if (func != null && typeof func !== 'string' && func.type === 'Transformation') {
    rule = makeTreeLeftRecursive(node)
  }
  return `transform(${generate(rule.expr, options)}, ${generate(rule.func, options)})`
}

function generateAssignment(
  scope: string,
  node: AssignmentNode,
  generated: string,
): string {
  const scopeArg = node.scope != null ? `, '${node.scope}'` : ''
  return `${scope}.assign('${node.name}', ${generated}${scopeArg})`
}

function generateRuleDefinition(
  scope: string,
  rule: RuleNode,
  options: TranspileOptions,
): string {
  const scopeArg = rule.scope != null ? `, '${rule.scope}'` : ''
  return (
    `${scope}.rule(${JSON.stringify(rule.name)}, ${JSON.stringify(rule.args ?? [])}, ` +
    `${LOCAL_SCOPE_VAR} =>\n  ${generate(rule.expr, options)}\n${scopeArg})`
  )
}

/**
 * Converts a right-recursive transformation chain to a left-recursive one.
 *
 *     (node1 (node2 (node3 node4)))  =>  (((node1 node2) node3) node4)
 */
function makeTreeLeftRecursive(node: TransformationNode): TransformationNode {
  const walk = (current: Expression, fifo: Expression[]): TransformationNode => {
    const flipped = { type: 'Transformation' } as TransformationNode
    if (
      current != null &&
      typeof current !== 'string' &&
      current.type === 'Transformation'
    ) {
      fifo.push(current.expr)
      flipped.expr = walk(current.func, fifo)
      flipped.func = fifo.shift()
    } else {
      flipped.expr = fifo.shift()
      flipped.func = fifo.shift()
      fifo.push(current)
    }
    return flipped
  }

  return walk(node.func, [node.expr])
}

// --- module assembly ---

function preamble(options: TranspileOptions): string {
  const bindings = RUNTIME_BINDINGS.map(name => `${name} = $rt.${name}`).join(', ')

  return `${PAYLOAD_SOURCE}
var $Random = ${PAYLOAD_GLOBAL}.Random;

$options.randomSeed = (function (seed) {
  if (typeof seed == "number") return seed;
  if (seed instanceof Array) return seed;
  if ($options.randomSeedType == null) {
    $options.randomSeedType = ${JSON.stringify(options.randomSeedType ?? 'integer')};
  }
  if ($options.randomSeedType == "array") {
    return $Random.generateEntropyArray();
  } else {
    return (Math.random() * 0x100000000) | 0;
  }
})($options.randomSeed);

var $random = (function (seed) {
  var engine = $Random.engines.mt19937();
  if (seed instanceof Array) {
    return new $Random(engine.seedWithArray(seed));
  } else {
    return new $Random(engine.seed(seed));
  }
})($options.randomSeed);

var $rt = ${PAYLOAD_GLOBAL}.createRuntime($options, $random);
var ${bindings};
`
}

function ruleDefinitions(rules: RuleTable, options: TranspileOptions): string {
  const out: string[] = [`var ${ROOT_SCOPE_VAR} = new $Scope();\n`]
  for (const [name, rule] of Object.entries(rules)) {
    if (name === '$entry' || rule == null || typeof rule === 'string') continue
    // A rule definition. The table cannot hold Assignments:
    // `parse` calls setRule for Rule nodes, and imports synthesise Rules.
    out.push(`${generateRuleDefinition(ROOT_SCOPE_VAR, rule as RuleNode, options)}();\n`)
  }
  return out.join('\n')
}

/**
 * What to say when the grammar names no rule to start from.
 *
 * A grammar that only includes other files is the common cause: the entry of
 * an included file doesn't survive the including file (see `collect` in
 * parse.ts). A hand-built rule table with no `$entry` reaches here too, so the
 * message lists the available rules instead of assuming where they came from.
 */
function noEntryMessage(rules: RuleTable, options: TranspileOptions): string {
  const where = options.grammarSource != null ? ` in '${options.grammarSource}'` : ''
  const names = Object.keys(rules).filter(name => name !== '$entry')
  if (names.length === 0)
    return `Nothing to expand${where}: the grammar defines no rules.`
  const listed = names.slice(0, 5).join(', ') + (names.length > 5 ? ', ...' : '')
  return `No entry rule${where}. Pass 'entry', one of: ${listed}.`
}

function entryInvocation(rules: RuleTable, options: TranspileOptions): string {
  options.entry ??= rules.$entry
  // When the grammar names no entry rule, the caller can still pass one as
  // `$options.entry` at expansion time. If neither does, expansion fails:
  // an empty result isn't something a grammar can ask for.
  const invoke =
    options.entry != null
      ? `result = ${ROOT_SCOPE_VAR}.invoke($options.entry || ${JSON.stringify(options.entry)})();`
      : `if ($options.entry == null) throw new Error(${JSON.stringify(noEntryMessage(rules, options))});
result = ${ROOT_SCOPE_VAR}.invoke($options.entry)();`

  return `var result;
${invoke}

return { expanded: result, options: $options };
`
}

export interface TranspileResult {
  /** A bare function expression: `function ($options) { … }`. */
  transpiled: string
  options: TranspileOptions
}

/** Generates an expander from a rule table. */
export function transpile(
  rules: RuleTable,
  options: TranspileOptions = {},
): TranspileResult {
  const resolved: TranspileOptions = { ...options }
  resolved.composable = detectComposableRules(rules, resolved)

  const header =
    `// Generated by rmutt.js\n` +
    (resolved.header != null ? `// ${resolved.header}\n` : '')

  const transpiled = `${header}function ($options) {
$options = (function (source) {
  var target = {};
  for (var key in source) { target[key] = source[key]; }
  return target;
})($options || {});

${preamble(resolved)}
${ruleDefinitions(rules, resolved)}
${entryInvocation(rules, resolved)}}`

  return { transpiled, options: resolved }
}

/**
 * Wraps a bare expander expression in a module wrapper for `--transpile`.
 *
 * `compile` wants a value and uses `bare`. A file written to disk wants to be
 * importable. Codegen emits an expression to keep these two needs separate.
 */
export function wrapModule(transpiled: string, format: 'esm' | 'cjs' | 'bare'): string {
  switch (format) {
    case 'esm':
      return `export default ${transpiled};\n`
    case 'cjs':
      return `module.exports = ${transpiled};\n`
    case 'bare':
      // Parenthesised so the output is a valid expression statement on its
      // own. An unparenthesised anonymous `function` at statement position is
      // a SyntaxError, which would make `--module bare` produce a file that
      // cannot even be eval'd.
      return `(${transpiled}\n)\n`
    default:
      return assertNever(format, 'wrapModule')
  }
}
