## rmutt.js command-line interface

### Usage

**rmutt.js** has a command-line interface which accepts a [rmutt grammar](GUIDE.md) as an input. Install it:

```sh
npm install --global rmutt
```

> [node.js](https://nodejs.org/) 22 or later is a prerequisite.

The general form to use it is:

```sh
rmutt [grammarfile] [options]
```

> **rmutt** _does not_ require any filename extension, but often you'll see we arbitrarily use `.rm`.

If you have a file with an **rmutt** grammar on it, you can mention it on the command line like this:

```sh
rmutt myfile.rm
```

If you want to save the output to a file you can simply redirect it:

````sh
rmutt myfile.rm > myoutputfile
```

Both grammar file and options are not required.

If you have a program which generates an **rmutt** grammar, you can pipe it through `rmutt` command. For example:

```sh
echo "night-sky:('.' 5, ' ' 100, '*'){100000};" | rmutt
````

### Options

```
  -e, --entry <rule>            Rule to expand first.
  -i, --iteration <integer>     Generate the i-th of N possible combinations.
  -s, --max-stack-depth <int>   Maximum depth to which the grammar expands.
  -r, --random-seed <integer>   Seed for the random number generator.
  -t, --transpile               Output generated code instead of an expansion.
      --module <format>         Wrapper for --transpile output:
                                esm (default), cjs, or bare.
  -h, --help                    Show this message.
  -v, --version                 Show the version.
```

<a name="entry"></a>

#### -e, --entry &lt;rule&gt;

In order to produce a string, **rmutt** must start with one of the rules in the
grammar. By default it expands the first rule it finds; use this to pick another.

<a name="iteration"></a>

#### -i, --iteration &lt;integer&gt;

Rather than choosing at random, generate the i-th of the possible combinations.
This is a mixed-radix counter over the grammar's choice points, so iterating
`0, 1, 2, …` walks distinct combinations deterministically:

```sh
for i in 0 1 2; do rmutt myfile.rm -i $i; done
```

<a name="random-seed"></a>

#### -r, --random-seed &lt;integer&gt;

Seeds the random number generator, so the same seed reproduces the same output.

<a name="transpile"></a>

#### -t, --transpile

Writes the generated JavaScript instead of an expansion. Combined with
`--module`, this is how you use rmutt without shipping the compiler — and the
only way to run a generator on a page whose Content-Security-Policy forbids
`unsafe-eval`, since importing the artifact needs no `eval`.

```sh
rmutt myfile.rm --transpile --module esm > generator.mjs
```

```javascript
import generator from './generator.mjs'
const { expanded } = generator({ iteration: 0 })
```

<a name="module"></a>

#### --module &lt;format&gt;

Which wrapper to put around `--transpile` output.

- `esm` (default) — `export default function ($options) { … }`
- `cjs` — `module.exports = function ($options) { … }`
- `bare` — the parenthesised function expression alone, for embedding

The expander is a plain synchronous function: it takes options and returns
`{ expanded, options }`, throwing on error.

### Changes from 1.x

- The `-c/--cache`, `--cache-file` and `--cache-regenerate` flags are **gone**. Now the parser is generated at build time.
- `--module` is new. 1.x emitted CommonJS only.
- Transpiled expanders are synchronous and return their result, where 1.x expanders took a callback.
