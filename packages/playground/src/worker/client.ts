import type { RunRequest, RunResult } from './protocol.js'

export interface ExpansionRunner {
  run(request: RunRequest): Promise<RunResult>
  /** Terminates the in-flight run. `terminate()` is final, so the next `run()` spawns a fresh Worker. */
  stop(): void
  /** Debounces `run` for live-typing. */
  runDebounced(
    request: RunRequest,
    onResult: (result: RunResult) => void,
    delayMs?: number,
  ): void
}

/** Owns one Worker at a time, spawned on demand and replaced after a stop. */
export function createExpansionRunner(): ExpansionRunner {
  let worker: Worker | null = null
  let settle: ((result: RunResult) => void) | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function spawn(): Worker {
    const w = new Worker(new URL('./expansion-worker.ts', import.meta.url), {
      type: 'module',
    })
    w.onmessage = (event: MessageEvent<RunResult>) => {
      settle?.(event.data)
      settle = null
    }
    return w
  }

  function run(request: RunRequest): Promise<RunResult> {
    if (settle != null) throw new Error('a run is already in flight; call stop() first')
    worker ??= spawn()
    return new Promise<RunResult>(resolve => {
      settle = resolve
      worker?.postMessage(request)
    })
  }

  function stop(): void {
    if (debounceTimer != null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    worker?.terminate()
    worker = null
    settle?.({ status: 'stopped' })
    settle = null
  }

  function runDebounced(
    request: RunRequest,
    onResult: (result: RunResult) => void,
    delayMs = 300,
  ): void {
    if (debounceTimer != null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (settle != null) stop()
      void run(request).then(onResult)
    }, delayMs)
  }

  return { run, stop, runDebounced }
}
