# rmutt.js API

## Installation

```sh
npm install rmutt
```

```javascript
import rmutt, { expand, compile, transpile, parse } from 'rmutt'
```

**rmutt 2.0 is ESM-only and requires Node 22 or later.** CommonJS consumers can
still `require('rmutt')` . Node supports requiring a synchronous ES module from
CommonJS since 20.19/22.

## Sync or promise, your choice

Every entry point comes in two forms:

| Promise        | Synchronous        |
| -------------- | ------------------ |
| `parse(…)`     | `parseSync(…)`     |
| `transpile(…)` | `transpileSync(…)` |
| `compile(…)`   | `compileSync(…)`   |
| `expand(…)`    | `expandSync(…)`    |

Nothing in rmutt is actually asynchronous today — parsing, transpiling and
expanding are all synchronous work, and the filesystem cache that justified
the 1.x callback API is gone. The promise forms exist so that an asynchronous
include resolver (fetching grammars over the network, say) can be added later
without another breaking change. If you have no use for that, `*Sync` is the
honest shape and costs nothing.

> **Migrating from 1.x:** the err-first callback API is gone. `rmutt.expand(g,
opts, cb)` becomes `await expand(g, opts)`, and errors arrive as rejections
> (or throws) rather than as a first argument.

## Functions

- [`expand`](#expand)
- [`compile`](#compile)
- [`transpile`](#transpile)
- [`parse`](#parse)
- [`transformation`](#transformation)

<a name="expand"></a>

## expand(source[, options])

Compiles and expands in one step. Returns `{ expanded, options }`.

```javascript
const { expanded } = await expand('greeting: "hello"|"hi";')
```

`source` may be a grammar string, an already-parsed rule table, or an expander
returned by [`compile`](#compile).

### Result

- **expanded** (string | undefined) — the expansion of the entry rule.
- **options** (object) — the options actually used. This is **not** the object
  you passed in: `randomSeed` is filled in when one was generated, and
  `iteration` is consumed as expansion walks the choice tree.

`result.options.randomSeed` is how you reproduce a generation you liked:

```javascript
const first = await expand(grammar)
const again = await expand(grammar, { randomSeed: first.options.randomSeed })
// again.expanded === first.expanded
```

<a name="compile"></a>

## compile(source[, options])

Returns `{ compiled, options }`, where `compiled` is an **expander**: a plain
synchronous function you can call repeatedly.

```javascript
const { compiled } = await compile(grammar)
for (let i = 0; i < 5; i++) {
  console.log(compiled({ iteration: i }).expanded)
}
```

Compiling once and expanding many times is much cheaper than calling `expand`
in a loop, which reparses and regenerates every time.

> `compile` evaluates generated code with `new Function`. See
> [Content-Security-Policy](#content-security-policy).

<a name="transpile"></a>

## transpile(source[, options])

Returns `{ transpiled, options }`. `transpiled` is JavaScript source for a bare
function expression:

```javascript
function ($options) { /* … */ }
```

Wrap it with [`wrapModule`](#wrapmodule) to get something importable. **This is
the only entry point that needs no `eval`** — see below.

<a name="parse"></a>

## parse(source[, options])

Returns the rule table: rule names mapped to their AST nodes, plus `$entry`
naming the rule that expands by default. The AST node types are exported and
fully typed (`RuleNode`, `ChoicesNode`, `InvocationNode`, …).

A file that only includes other files has no `$entry` of its own, because the
entry of an included file doesn't carry over. If you expand such a grammar,
rmutt throws an error that lists the available rules. To choose one of them,
set the `entry` option.

<a name="transformation"></a>

## transformation(fn)

Marks an external function as a transformation — one that returns a function,
usable on the right of `>`.

```javascript
import { transformation } from 'rmutt'

const shout = transformation(input => input.toUpperCase())
await expand('t: "hello" > shout;', { externals: { shout } })
```

In 1.x, whether an external was a transformation was guessed by searching its
source text for `return function`. That guess silently fails for arrow
functions and anything minified, so composition quietly degraded to
concatenation. The marker makes it explicit. The old heuristic still runs as a
fallback (widened to recognise arrow forms), so externals written for 1.x keep
working — but new code should use the marker.

## Options

All options are accepted by every entry point that needs them; options for
`parse` apply to `transpile`, `compile` and `expand`, and so on down the chain.

| Option           | Type                     | Meaning                                                             |
| ---------------- | ------------------------ | ------------------------------------------------------------------- |
| `entry`          | string                   | Rule to expand first. Defaults to the first rule in the grammar.    |
| `externals`      | object                   | JavaScript functions callable as rules or transformations.          |
| `iteration`      | number                   | Generate the i-th of N possible combinations, instead of at random. |
| `maxStackDepth`  | number                   | Maximum depth to which the grammar expands.                         |
| `randomSeed`     | number \| number[]       | Seed for the PRNG. Returned in `result.options` when generated.     |
| `randomSeedType` | `'integer'` \| `'array'` | How to generate a seed when none is given. Default `'integer'`.     |
| `workingDir`     | string                   | Base directory for `#include`. Defaults to the process directory.   |
| `resolveInclude` | function                 | Custom include resolution — see [Includes](#includes).              |
| `header`         | string                   | Comment written into generated code.                                |

### iteration

`iteration` is a mixed-radix counter over the grammar's choice points, not a
random seed. Iterating `0, 1, 2, …` enumerates distinct combinations
deterministically, which is what makes it useful in tests.

<a name="includes"></a>

## Includes

On Node, `#include "other.rm"` reads from disk relative to the including file,
exactly as in 1.x. Everywhere else, supply your own resolver:

```javascript
const sources = { 'shared.rm': 'greeting: "hello";' }

await expand(grammar, {
  resolveInclude: path => ({ source: sources[path], base: '' }),
})
```

The resolver receives the requested path and the base of the including file,
and returns the source plus the base for anything that file includes in turn.
Without a resolver, an `#include` raises `RmuttIncludeError` — a clear message
rather than a missing-`fs` crash.

## Errors

| Class               | Thrown when                         |
| ------------------- | ----------------------------------- |
| `RmuttSyntaxError`  | the grammar could not be parsed     |
| `RmuttIncludeError` | an `#include` could not be resolved |
| `RmuttError`        | base class for the above            |

`RmuttSyntaxError` carries `line`, `column`, `offset`, `grammarSource`, and
`snippet` — peggy's caret-annotated view of the offending line. The message
itself stays clean; 1.x appended location text to it, which left consumers
matching on message strings.

```javascript
try {
  await expand('t: "unterminated')
} catch (err) {
  console.error(err.snippet ?? err.message)
  console.error(err.line, err.column)
}
```

<a name="content-security-policy"></a>

## Content-Security-Policy

`compile` and `expand` evaluate generated code with `new Function`, so a page
with a strict CSP must allow `unsafe-eval` for them to work. This is inherent
to how rmutt turns a grammar into a generator, not an implementation detail
that can be worked around.

`transpile` and `parse` need no eval at all. For a CSP-restricted page,
generate ahead of time and ship the artifact:

```sh
rmutt grammar.rm --transpile --module esm > generator.mjs
```

```javascript
import generator from './generator.mjs'
const { expanded } = generator({ iteration: 0 }) // no eval at runtime
```

<a name="wrapmodule"></a>

## wrapModule(transpiled, format)

Wraps transpiled output in a module wrapper: `'esm'`, `'cjs'`, or `'bare'`.
This is what `rmutt --transpile --module <format>` uses.
