import { expand, parse, RmuttIncludeError, RmuttSyntaxError, type RuleTable } from 'rmutt'
import { isMissingExample } from 'virtual:examples-manifest'
import { EXAMPLES_BASE, resolveInclude } from '../include-resolver.js'
import type { RunError, RunRequest, RunResult } from './protocol.js'

export async function runGrammar(request: RunRequest): Promise<RunResult> {
  try {
    const table = await parse(request.source, { resolveInclude })
    const ruleNames = ruleNamesOf(table)
    const defaultEntry = table.$entry

    const result = await expand(table, {
      entry: request.entry,
      iteration: request.iteration,
      randomSeed: request.randomSeed,
    })

    if (typeof result.expanded !== 'string') {
      const entry = request.entry ?? defaultEntry ?? 'the entry rule'
      return {
        status: 'error',
        error: {
          kind: 'not-text',
          message: `\`${entry}\` is a transformation. pick a text entry rule.`,
          ruleNames,
          defaultEntry,
        },
      }
    }

    return {
      status: 'ok',
      expanded: result.expanded,
      randomSeed: result.options.randomSeed,
      randomSeedType: result.options.randomSeedType,
      ruleNames,
      defaultEntry,
    }
  } catch (err) {
    return { status: 'error', error: toRunError(err) }
  }
}

function ruleNamesOf(table: RuleTable): string[] {
  return Object.keys(table).filter(name => name !== '$entry')
}

export function toRunError(err: unknown): RunError {
  if (err instanceof RmuttSyntaxError) {
    return {
      kind: 'syntax',
      message: err.message,
      snippet: err.snippet,
      grammarSource: err.grammarSource,
      line: err.line,
      column: err.column,
    }
  }

  if (err instanceof RmuttIncludeError) {
    const inExamples = err.from == null || err.from.startsWith(EXAMPLES_BASE)
    const missing = inExamples && isMissingExample(err.path)
    return {
      kind: 'include',
      path: err.path,
      from: err.from,
      missing,
      message: missing
        ? `no example named \`${err.path}\``
        : err.cause instanceof Error
          ? `could not fetch \`${err.path}\`: ${err.cause.message}`
          : `could not fetch \`${err.path}\``,
    }
  }

  if (err instanceof RangeError) {
    return {
      kind: 'runaway',
      message:
        'this grammar never finishes expanding. check for a rule that refers to itself',
      trace: err.message,
    }
  }

  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) }
}
