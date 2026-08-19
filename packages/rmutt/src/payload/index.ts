/**
 * Payload entry point.
 *
 * esbuild bundles this module into a single self-contained IIFE. The library
 * embeds the resulting text and injects it into generated code.
 *
 * Don't import anything outside `src/payload/`, and don't use Node or DOM APIs.
 */

export { Random } from './random.js'
export { createRuntime } from './runtime.js'
export type { Engine, MT19937Engine } from './random.js'
export type { Range, Runtime, RuntimeOptions, Thunk, Value } from './runtime.js'
