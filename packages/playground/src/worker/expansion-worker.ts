/// <reference lib="webworker" />

import { runGrammar } from './run-grammar.js'
import type { RunRequest, RunResult } from './protocol.js'

self.onmessage = (event: MessageEvent<RunRequest>): void => {
  void runGrammar(event.data).then((result: RunResult) => self.postMessage(result))
}
