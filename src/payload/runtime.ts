/**
 * The rmutt runtime.
 *
 * ## Factory design
 *
 * The build inlines this module as a self-contained IIFE. Generated expanders
 * embed that text and evaluate it with `new Function`, which provides no
 * enclosing scope to close over, so the runtime takes `$options` and `$random`
 * as parameters instead. Each expansion calls `createRuntime` once, which makes
 * `$chooser`, the choice memoization cache, per-expansion state rather than
 * module state.
 *
 * ## Lazy evaluation
 *
 * Almost every operation returns a named function instead of calling it.
 * Generated code appends `()` where it wants evaluation, and `expand()` calls
 * any thunk it encounters in the tree. Each returned function carries a
 * descriptive name, such as `invokeExpand` or `ruleAssignExpand`, so a grammar
 * that recurses too deeply produces a readable stack trace.
 */

import type { Random } from './random.js'

export type Value = unknown
export type Thunk = () => Value

export interface Range {
  min: number
  max: number
}

export interface RuntimeOptions {
  iteration?: number | undefined
  maxStackDepth?: number | undefined
  externals?: Record<string, (...args: Value[]) => Value> | undefined
  [key: string]: Value
}

type Invocation = ((parent: Scope, args?: Value[]) => Value) & {
  $name?: string
  displayName?: string
}

interface Choice {
  q?: number
  p?: number
  cum?: number
}

export interface Runtime {
  $Scope: new (parent?: Scope) => Scope
  choose: (mode: string, id: number, ...choices: Value[]) => Thunk
  compose: (...args: Value[]) => Thunk
  concat: (...args: Value[]) => Thunk
  expand: (value: Value) => Value
  mapping: (search: Value, replacement: Value) => Thunk
  repeat: (value: Value, range: Range) => Thunk
  transform: (input: Value, through: Value) => Thunk
}

// Declared here only so the class can be named in its own method signatures.
interface Scope {
  parent?: Scope | undefined
  root: Scope
  vars: Record<string, Value>
  stackDepth: number
  package?: string | undefined
  rule(
    name: string,
    argnames: string[],
    expandible: (invoke: Value) => Value,
    scope?: string,
  ): Thunk
  assign(name: string, value: Value, scope?: string): Thunk
  assignInternal(name: string, value: Value, scope?: string): void
  evaluate(code: string): Thunk
  invokeRule(invocation: Invocation, args?: Value[]): Value
  invokeIndirection(name: string, args?: Value[]): Thunk
  invoke(name: string, args?: Value[]): Thunk
}

export function createRuntime($options: RuntimeOptions, $random: Random): Runtime {
  // ---- expand ------------------------------------------------------------
  // Declared as a function, not a `const`, so that hoisting applies: `$Scope`
  // and `$Chooser` reference `expand` earlier in source order.
  function expand(value: Value): Value {
    return typeof value === 'function' ? (value as Thunk)() : value
  }

  // ---- $Scope ------------------------------------------------------------

  function CodeBlock(args: string[], code: string): (...values: Value[]) => Value {
    // `new Function(...argNames, body)`: this is where eval happens, making
    // grammar code blocks work, and the reason `compile`/`expand` need
    // unsafe-eval under a strict CSP.
    return Function.apply(null, args.concat(code) as string[]) as (
      ...values: Value[]
    ) => Value
  }

  class $Scope implements Scope {
    parent?: Scope | undefined
    root: Scope
    vars: Record<string, Value>
    stackDepth: number
    package?: string | undefined

    constructor(parent?: Scope) {
      this.parent = parent
      this.vars = {}
      if (this.parent != null) {
        this.root = this.parent.root
        for (const k in this.parent.vars) {
          this.vars[k] = this.parent.vars[k]
        }
        this.stackDepth = this.parent.stackDepth + 1
      } else {
        this.root = this
        this.stackDepth = 1
      }
    }

    rule(
      name: string,
      argnames: string[],
      expandible: (invoke: Value) => Value,
      scope?: string,
    ): Thunk {
      const ruleAssignExpand = (): void => {
        const invocation: Invocation = (parent: Scope, args?: Value[]): Value => {
          const local = new $Scope(parent)
          if (name.indexOf('.') !== -1) {
            local.package = name.split('.')[0]
          }
          if (args != null) {
            for (let i = 0; i < args.length; i++) {
              // positional argument:
              local.vars['_' + (i + 1)] = args[i]
              // named argument:
              if (argnames.length > 0) {
                local.vars[argnames[i]] = args[i]
              }
            }
          }
          const localInvoke = ((invokeName: string, invokeArgs?: Value[]): Thunk =>
            local.invoke(invokeName, invokeArgs)) as Value as Record<string, Value> &
            ((n: string, a?: Value[]) => Thunk)

          // See header note 1: ES class methods are non-enumerable.
          scopeMethodNames.forEach(k => {
            const v = (local as unknown as Record<string, Value>)[k]
            if (typeof v !== 'function') return
            localInvoke[k] = (v as (...a: Value[]) => Value).bind(local)
          })

          return expandible(localInvoke)
        }
        invocation.$name = name
        invocation.displayName = 'invocation: ' + name
        this.assignInternal(name, invocation, scope)
      }
      return ruleAssignExpand
    }

    assign(name: string, value: Value, scope?: string): Thunk {
      const assignExpand = (): void => {
        this.assignInternal(name, expand(value), scope)
      }
      return assignExpand
    }

    assignInternal(name: string, value: Value, scope?: string): void {
      if (scope === 'root') {
        this.root.vars[name] = value
      } else {
        this.vars[name] = value
        if (this.parent != null && scope === 'parent') {
          this.parent.vars[name] = value
        }
      }
    }

    evaluate(code: string): Thunk {
      const evaluateExpand = (): Value => {
        let args = Object.keys(this.vars)
        const values = args.map(v => this.vars[v])
        if (this.package != null) {
          args = args.map(v => v.replace(this.package + '.', ''))
        }
        const fn = CodeBlock(args, code)
        const result = fn.apply(null, values)
        if (typeof result === 'function') return result
        // oxlint-disable-next-line no-base-to-string
        return (result ?? '').toString()
      }
      return evaluateExpand
    }

    invokeRule(invocation: Invocation, args?: Value[]): Value {
      let invoked: Value
      try {
        invoked = invocation(
          this,
          args?.map(a => expand(a)),
        )
      } catch (err) {
        // Node ignores displayName on Error objects, so append it to the message.
        ;(err as Error).message += '\n    at rule ' + invocation.displayName
        throw err
      }

      const ruleExpand = (): Value => expand(invoked)
      ;(ruleExpand as { displayName?: string }).displayName =
        'expansion: ' + invocation.$name

      try {
        return ruleExpand()
      } catch (err) {
        // Node ignores displayName on Error objects, so append it to the message.
        ;(err as Error).message +=
          '\n    at rule ' + (ruleExpand as { displayName?: string }).displayName
        throw err
      }
    }

    invokeIndirection(name: string, args?: Value[]): Thunk {
      const invokeIndirectionExpand = (): Value => {
        const value = this.invoke(name, args)()
        return this.invoke(value as string, args)()
      }
      return invokeIndirectionExpand
    }

    invoke(name: string, args?: Value[]): Thunk {
      const invokeExpand = (): Value => {
        if (this.stackDepth >= ($options.maxStackDepth as number)) return undefined

        const tryScope = (scope: Scope): [boolean, Value?] => {
          const ref = scope.vars[name]
          if (ref == null) return [false]
          if (typeof ref === 'function')
            return [true, this.invokeRule(ref as Invocation, args)]
          return [true, ref]
        }

        // local
        let [found, value] = tryScope(this)
        if (found) return value

        // parent
        if (this.parent != null) {
          ;[found, value] = tryScope(this.parent)
          if (found) return value
        }

        // root
        ;[found, value] = tryScope(this.root)
        if (found) return value

        const externals = $options.externals

        // external rule with arguments
        if (args != null && externals?.[name] != null) {
          return externals[name].apply(
            null,
            args.map(a => expand(a)),
          )
        }

        // Args with no matching rule to receive them.
        if (args != null) {
          throw new Error(`Missing parameterized rule '${name}'`)
        }

        // external rule (maybe used as variable or transformation)
        if (externals?.[name] != null) {
          return externals[name]
        }

        // $options virtual package
        if (name.indexOf('$options.') === 0) {
          // oxlint-disable-next-line no-base-to-string
          return ($options[name.split('.')[1]] ?? '').toString()
        }

        return name
      }
      return invokeExpand
    }
  }

  const scopeMethodNames = Object.getOwnPropertyNames($Scope.prototype).filter(
    k => k !== 'constructor',
  )

  // ---- $Chooser ----------------------------------------------------------

  const round = (value: number): number => +value.toFixed(5)

  function firstUnderCumulative(choices: Choice[], value: number): number | undefined {
    for (let index = 0; index < choices.length; index++) {
      if (value <= (choices[index].cum as number)) return index
    }
    return undefined
  }

  function randomIndex(choices: Choice[]): number | undefined {
    return firstUnderCumulative(choices, $random.realZeroToOneExclusive())
  }

  function fillProbabilities(choices: Choice[]): void {
    // sum and count specified quantifiers
    let sum = 0
    let count = 0
    let extra = 0
    for (const choice of choices) {
      if (choice.q == null) continue
      if (choice.q < 1) {
        // q is probability
        choice.p = choice.q
        sum += choice.p
        count++
      } else {
        // q is multiplier
        extra += choice.q - 1
      }
    }

    // distribute remaining probability
    const d = (1 - sum) / (choices.length + extra - count)

    for (const choice of choices) {
      if (choice.q == null) {
        choice.p = round(d)
      } else if (choice.q > 1) {
        choice.p = round(d) * choice.q
      }
    }
  }

  function isEven(choices: Choice[]): boolean {
    let p: number | null = null
    for (const choice of choices) {
      if (p != null && choice.p !== p) return false
      p ??= choice.p as number
    }
    return true
  }

  function fillCumulative(choices: Choice[]): void {
    let cum = 0
    const last = choices.length - 2
    for (let i = 0; i <= last; i++) {
      const choice = choices[i]
      cum += choice.p as number
      choice.cum = round(cum)
    }

    // to avoid rounding issues
    choices[choices.length - 1].cum = 1
  }

  function redistribute(choices: { p?: number; cum?: number; index: number }[]): void {
    let sum = 0
    for (const choice of choices) {
      sum += choice.p as number
    }

    let cum = 0
    for (const choice of choices) {
      choice.p = round((choice.p as number) / sum)
      cum += choice.p
      choice.cum = round(cum)
    }

    // to avoid rounding issues
    choices[choices.length - 1].cum = 1
  }

  class $Chooser {
    mode: string
    size: number
    choices: Choice[]
    even: boolean
    shuffled?: number[]
    shuffleIndex?: number

    constructor(mode: string, values: Value[]) {
      this.mode = mode
      this.size = values.length
      this.choices = values.map(value =>
        typeof value === 'object' && value !== null
          ? { q: (value as { q?: number }).q }
          : ({} as Choice),
      )

      fillProbabilities(this.choices)
      this.even = isEven(this.choices)
      if (!this.even) {
        // Skipped for even probabilities: a plain random index works as well.
        fillCumulative(this.choices)
      }

      if (this.mode === 'shuffle' || this.mode === 'reshuffle') {
        this.shuffle()
      }
    }

    /** shuffle, probabilities in descending order */
    shuffle(): void {
      this.shuffled = []
      const choices = this.choices.map((choice, index) => ({
        p: choice.p,
        cum: choice.cum,
        index,
      }))

      // The bound is captured before the loop because the body splices
      // `choices` shorter on every pass. Re-reading `.length` each iteration
      // ends the loop early and leaves the shuffle one entry short.
      const passes = choices.length - 1
      for (let i = 1; i <= passes; i++) {
        // select random (most probable) choice
        const index = this.even
          ? ($Chooser.choose(choices.length) as number)
          : (randomIndex(choices) as number)
        this.shuffled.push(choices[index].index)

        // remove choice and redistribute probabilities
        choices.splice(index, 1)
        if (!this.even) redistribute(choices)
      }

      this.shuffled.push(choices[0].index)
    }

    static choose(size: number): number | undefined {
      if ($options.iteration != null) {
        const index = $options.iteration % size
        $options.iteration = Math.floor($options.iteration / size)
        return index
      }
      return $random.integer(0, size - 1)
    }

    choose(): number | undefined {
      if (this.shuffled != null) {
        return this.nextShuffled()
      } else if ($options.iteration != null || this.even) {
        return $Chooser.choose(this.size)
      }
      return randomIndex(this.choices)
    }

    nextShuffled(): number {
      this.shuffleIndex ??= 0
      const index = (this.shuffled as number[])[this.shuffleIndex]
      this.shuffleIndex++
      if (this.shuffleIndex >= (this.shuffled as number[]).length) {
        this.shuffleIndex = 0
        if (this.mode === 'reshuffle') {
          this.shuffle()
        }
      }
      return index
    }
  }

  // ---- combinators -------------------------------------------------------

  // Per-expansion state: choice objects are memoised by their codegen id so
  // that `shuffle`/`reshuffle`/`once` modes keep position across invocations.
  const $chooser: Record<number, $Chooser> = {}

  function choose(mode: string, id: number, ...choices: Value[]): Thunk {
    $chooser[id] ??= new $Chooser(mode, choices)
    const chooseExpand = (): Value => {
      const index = $chooser[id].choose()
      let value = index != null ? choices[index] : undefined
      if (typeof value === 'object' && value !== null) {
        value = (value as { value?: Value }).value
      }
      return expand(value)
    }
    return chooseExpand
  }

  function compose(...args: Value[]): Thunk {
    const composeExpand = (): Value => {
      let res = (v: Value): Value => v
      args.forEach(fn => {
        const nonClosure = res
        res = (v: Value): Value => (expand(fn) as (x: Value) => Value)(nonClosure(v))
      })
      return res
    }
    return composeExpand
  }

  function concat(...args: Value[]): Thunk {
    const concatExpand = (): Value =>
      args
        .map(a => expand(a))
        .filter((x): x is string => typeof x === 'string')
        .reduce((a, b) => a + b, '')
    return concatExpand
  }

  function mapping(search: Value, replacement: Value): Thunk {
    return () => {
      const mappingExpand = (input: Value): Value => {
        if (input == null) return undefined
        if (replacement == null) return input
        return (input as string).replace(new RegExp(search as string, 'g'), function () {
          // eslint-disable-next-line prefer-rest-params
          const args = arguments as unknown as Record<string, string>
          return (expand(replacement) as string).replace(
            /\\(\d+)/g,
            (_m, n: string) => args[n],
          )
        })
      }
      return mappingExpand
    }
  }

  function repeat(value: Value, range: Range): Thunk {
    const repeatExpand = (): Value => {
      const max = range.min + ($Chooser.choose(range.max - range.min + 1) as number)
      const parts: Value[] = []
      for (let i = 1; i <= max; i++) {
        parts.push(expand(value))
      }
      return parts.join('')
    }
    return repeatExpand
  }

  function transform(input: Value, through: Value): Thunk {
    const transformExpand = (): Value => {
      const inputExpanded = expand(input)
      const throughExpanded = expand(through)
      if (typeof throughExpanded !== 'function') {
        return inputExpanded
      }
      return (throughExpanded as (x: Value) => Value)(inputExpanded)
    }
    return transformExpand
  }

  return {
    $Scope: $Scope as unknown as new (parent?: Scope) => Scope,
    choose,
    compose,
    concat,
    expand,
    mapping,
    repeat,
    transform,
  }
}
