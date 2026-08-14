/**
 * Typed errors.
 */

/** Location data as peggy reports it. */
export interface Location {
  offset: number
  line: number
  column: number
}

export interface PeggySyntaxError extends Error {
  location?: { start: Location; end: Location } | undefined
  expected?: unknown
  found?: string | null | undefined
  format?: (sources: { source: unknown; text: string }[]) => string
}

/** Base for every expected error rmutt throws. */
export class RmuttError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions)
    this.name = new.target.name
  }
}

/** A grammar that could not be parsed. */
export class RmuttSyntaxError extends RmuttError {
  /** Path of the file the error is in, when it came from disk or an include. */
  readonly grammarSource: string | undefined
  readonly line: number | undefined
  readonly column: number | undefined
  readonly offset: number | undefined

  /** peggy's caret-annotated snippet, when the source text was available. */
  readonly snippet: string | undefined

  constructor(
    message: string,
    details: {
      grammarSource?: string | undefined
      location?: { start: Location } | undefined
      snippet?: string | undefined
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: details.cause })
    this.grammarSource = details.grammarSource
    this.line = details.location?.start.line
    this.column = details.location?.start.column
    this.offset = details.location?.start.offset
    this.snippet = details.snippet
  }

  /**
   * Builds from a peggy SyntaxError, keeping its structured data.
   */
  static fromPeggy(
    err: PeggySyntaxError,
    grammarSource: string | undefined,
    source: string | undefined,
  ): RmuttSyntaxError {
    let snippet: string | undefined
    if (typeof err.format === 'function' && source != null) {
      try {
        snippet = err.format([{ source: grammarSource ?? undefined, text: source }])
      } catch {
        // A formatting failure must never mask the actual syntax error.
        snippet = undefined
      }
    }

    return new RmuttSyntaxError(err.message, {
      grammarSource,
      location: err.location,
      snippet,
      cause: err,
    })
  }
}

/** An `include` that could not be read. */
export class RmuttIncludeError extends RmuttError {
  readonly path: string
  readonly from: string | undefined

  constructor(path: string, from: string | undefined, options?: { cause?: unknown }) {
    super(
      from == null
        ? `Cannot resolve include '${path}'`
        : `Cannot resolve include '${path}' from '${from}'`,
      options,
    )
    this.path = path
    this.from = from
  }
}
