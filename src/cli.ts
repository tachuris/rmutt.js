#!/usr/bin/env node
/**
 * Command-line interface.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { compile, transpile } from './index.js'
import { RmuttError, RmuttSyntaxError } from './errors.js'
import { wrapModule } from './transpile.js'

const USAGE = `Usage: rmutt [grammarfile] [options]

Generates random text from a context-sensitive grammar. Reads stdin when no
grammar file is given.

Options:
  -e, --entry <rule>            Rule to expand first.
  -i, --iteration <integer>     Generate the i-th of N possible combinations.
  -s, --max-stack-depth <int>   Maximum depth to which the grammar expands.
  -r, --random-seed <integer>   Seed for the random number generator.
  -t, --transpile               Output generated code instead of an expansion.
      --module <format>         Wrapper for --transpile output:
                                esm (default), cjs, or bare.
  -h, --help                    Show this message.
  -v, --version                 Show the version.
`

type ModuleFormat = 'esm' | 'cjs' | 'bare'

function integer(value: string | undefined, flag: string): number | undefined {
  if (value == null) return undefined
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new RmuttError(`${flag} expects an integer, got '${value}'`)
  }
  return parsed
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        entry: { type: 'string', short: 'e' },
        iteration: { type: 'string', short: 'i' },
        'max-stack-depth': { type: 'string', short: 's' },
        'random-seed': { type: 'string', short: 'r' },
        transpile: { type: 'boolean', short: 't' },
        module: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    })
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`)
    return 1
  }

  const { values, positionals } = parsed

  if (values.help) {
    process.stdout.write(USAGE)
    return 0
  }

  if (values.version) {
    process.stdout.write('2.0.0\n')
    return 0
  }

  const file = positionals[0]
  const source = file != null ? readFileSync(resolve(file), 'utf8') : readStdin()

  const format = (values.module ?? 'esm') as ModuleFormat
  if (!['esm', 'cjs', 'bare'].includes(format)) {
    process.stderr.write(`--module expects esm, cjs or bare, got '${format}'\n`)
    return 1
  }

  const options = {
    entry: values.entry,
    iteration: integer(values.iteration, '--iteration'),
    maxStackDepth: integer(values['max-stack-depth'], '--max-stack-depth'),
    randomSeed: integer(values['random-seed'], '--random-seed'),
    workingDir: file != null ? resolve(file, '..') : process.cwd(),
    grammarSource: file ?? '<stdin>',
    header: file,
  }

  try {
    if (values.transpile) {
      const { transpiled } = await transpile(source, options)
      process.stdout.write(wrapModule(transpiled, format))
    } else {
      const { compiled } = await compile(source, options)
      const { expanded } = compiled(options)
      process.stdout.write(expanded ?? '')
    }
  } catch (err) {
    process.stderr.write(formatError(err))
    return 1
  }

  return 0
}

function formatError(err: unknown): string {
  if (err instanceof RmuttSyntaxError) {
    // peggy's caret snippet already names the file, line and column.
    return `${err.snippet ?? `${err.message} (${err.grammarSource ?? '<stdin>'}:${err.line}:${err.column})`}\n`
  }
  if (err instanceof RmuttError) {
    return `${err.message}\n`
  }
  return `${(err as Error).stack ?? String(err)}\n`
}

process.exitCode = await main()
