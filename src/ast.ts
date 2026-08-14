/**
 * The rmutt intermediate representation.
 */

/** How a `Choices` node picks among its items. */
export type ChoiceMode = 'any' | 'shuffle' | 'reshuffle'

/** Which scope an assignment writes to. `^` is parent, `$` is root. */
export type ScopeKind = 'local' | 'parent' | 'root'

/** An expression position. */
export type Expression = string | ExpressionNode | null | undefined

export interface Range {
  min: number
  max: number
}

// -- expression nodes ------------------------------------------------------

/** `{ ... }`: inline JavaScript, evaluated with `new Function`. */
export interface CodeBlockNode {
  type: 'CodeBlock'
  code: string
}

/** `a | b | c` or `a, b, c`, optionally prefixed `&` / `&&`. */
export interface ChoicesNode {
  type: 'Choices'
  items: Expression[]
  mode: ChoiceMode
  /** Assigned by the grammar initialiser. Keys per-expansion chooser state. */
  id: number
}

/** A choice with a probability or multiplier (`"x" 0.25`, `"x" 3`). */
export interface QuantifiedNode {
  type: 'Quantified'
  expr: Expression
  quantifier: number
}

/** Juxtaposition: `a b c`. */
export interface TermsNode {
  type: 'Terms'
  items: Expression[]
}

/** `a?`, `a*`, `a+`, `a{n}`, `a{n,m}`. */
export interface RepetitionNode {
  type: 'Repetition'
  expr: Expression
  range: Range
}

/** `expr > func`: pipe the expansion through a transformation. */
export interface TransformationNode {
  type: 'Transformation'
  expr: Expression
  func: Expression
}

/** `/search/replace/`: regex substitution over the expansion. */
export interface MappingNode {
  type: 'Mapping'
  search: Expression
  replace: Expression
}

/** `name`, `name[args]`, or `@name` for indirection. */
export interface InvocationNode {
  type: 'Invocation'
  name: string
  /** `'@'` for indirect invocation, otherwise absent. */
  prefix?: '@' | null | undefined
  args?: Expression[] | undefined
}

/** `name: body`: a rule definition, possibly nested in an expression. */
export interface RuleNode {
  type: 'Rule'
  name: string
  expr: Expression
  args?: string[] | undefined
  scope?: ScopeKind | undefined
}

/** `name = body`: assignment, evaluated once at the point it appears. */
export interface AssignmentNode {
  type: 'Assignment'
  name: string
  expr: Expression
  scope?: ScopeKind | undefined
}

// -- top-level-only nodes --------------------------------------------------

/** `package name;` */
export interface PackageNode {
  type: 'Package'
  name: string
}

/** `import a, b from pkg;` */
export interface ImportNode {
  type: 'Import'
  rules: string[]
  from: string
}

/** `include "path";` */
export interface IncludeNode {
  type: 'Include'
  path: string
}

// -- unions ----------------------------------------------------------------

/** Every node that can appear in an expression position. */
export type ExpressionNode =
  | AssignmentNode
  | ChoicesNode
  | CodeBlockNode
  | InvocationNode
  | MappingNode
  | QuantifiedNode
  | RepetitionNode
  | RuleNode
  | TermsNode
  | TransformationNode

/** Every node the parser can return at the top level of a grammar. */
export type Statement = AssignmentNode | ImportNode | IncludeNode | PackageNode | RuleNode

/** All 13 node types. */
export type Node = ExpressionNode | ImportNode | IncludeNode | PackageNode

/** A parsed grammar: the top-level statement list. */
export type Grammar = Statement[]

/**
 * The rule table `parse` produces: rule name -> definition, plus the entry.
 *
 * `$entry` is the first rule encountered, used when no `entry` option is
 * given. It shares the namespace with real rules, which is safe only because
 * `$` cannot start an identifier in the grammar.
 */
export interface RuleTable {
  [name: string]: RuleNode | AssignmentNode | string | undefined
  $entry?: string | undefined
}

/** Exhaustiveness helper for codegen switches. */
export function assertNever(node: never, context: string): never {
  const type = (node as { type?: unknown } | null)?.type
  throw new Error(`${context}: unhandled node type ${String(type)}`)
}
