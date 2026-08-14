import { describe, expect, it } from 'vite-plus/test'

import {
  assertSelfContained,
  buildPayload,
  PAYLOAD_GLOBAL,
} from '../scripts/build-payload.mjs'

/**
 * The payload contract.
 *
 * `src/payload/*` is bundled into one IIFE whose text is inserted into
 * generated code and evaluated with `new Function`. Nothing in the type
 * system enforces that this actually works, so the contract is tested the
 * only way that cannot drift: by evaluating the built payload exactly the way
 * generated code does.
 */
describe('runtime payload', () => {
  it('builds and satisfies the self-containment contract', async () => {
    const source = await buildPayload()
    expect(() => assertSelfContained(source)).not.toThrow()
  })

  it('evaluates inside `new Function` with no ambient scope', async () => {
    const source = await buildPayload()
    // oxlint-disable-next-line no-implied-eval
    const exported = new Function(`${source}\nreturn ${PAYLOAD_GLOBAL};`)()

    expect(typeof exported.Random).toBe('function')
    expect(typeof exported.createRuntime).toBe('function')
  })

  it('exposes exactly the bindings generated code destructures', async () => {
    const source = await buildPayload()
    // oxlint-disable-next-line no-implied-eval
    const exported = new Function(`${source}\nreturn ${PAYLOAD_GLOBAL};`)()

    // Must stay in sync with RUNTIME_BINDINGS in src/transpile.ts: a missing
    // name surfaces as `X is not defined` at expansion time, far from its
    // cause.
    const runtime = exported.createRuntime({ maxStackDepth: 100 }, new exported.Random())
    for (const name of [
      '$Scope',
      'choose',
      'compose',
      'concat',
      'expand',
      'mapping',
      'repeat',
      'transform',
    ]) {
      expect(runtime[name], `payload should export ${name}`).toBeTypeOf('function')
    }
  })

  it('rejects a payload that reaches outside itself', () => {
    expect(() => assertSelfContained('var $rmutt = require("fs");')).toThrow(
      /not self-contained/,
    )
  })

  it('rejects a payload that does not bind the expected global', () => {
    expect(() => assertSelfContained('var nope = 1;')).toThrow(/does not evaluate/)
  })

  it('rejects a payload missing a binding codegen depends on', () => {
    expect(() => assertSelfContained('var $rmutt = { Random: function () {} };')).toThrow(
      /createRuntime` is undefined, not a function/,
    )
  })
})
