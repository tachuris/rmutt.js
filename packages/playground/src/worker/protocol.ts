export interface RunRequest {
  source: string
  entry?: string | undefined
  iteration?: number | undefined
  randomSeed?: number | number[] | undefined
}

export type RunError =
  | {
      kind: 'syntax'
      message: string
      snippet: string | undefined
      grammarSource: string | undefined
      line: number | undefined
      column: number | undefined
    }
  | {
      kind: 'include'
      message: string
      path: string
      from: string | undefined
      missing: boolean
    }
  | {
      kind: 'runaway'
      message: string
      /** rmutt's own rule trace, verbatim. */
      trace: string
    }
  | {
      kind: 'not-text'
      message: string
      /** So the entry dropdown remains after picking a transforming rule. */
      ruleNames: string[]
      defaultEntry: string | undefined
    }
  | { kind: 'unknown'; message: string }

export type RunResult =
  | {
      status: 'ok'
      expanded: string
      randomSeed: number | number[] | undefined
      randomSeedType: 'integer' | 'array' | undefined
      /** The parsed table's rule names, `$entry` filtered out */
      ruleNames: string[]
      defaultEntry: string | undefined
    }
  | { status: 'error'; error: RunError }
  /** Never sent by the Worker. The client produces this after `stop()`. */
  | { status: 'stopped' }
