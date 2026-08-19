import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { describe, expect, it } from 'vite-plus/test'

// Absolute, not `src/browser.ts`: esbuild resolves relative entryPoints
// against process.cwd(), which is the invoking directory, not this file's.
const browserEntry = fileURLToPath(new URL('../src/browser.ts', import.meta.url))

/**
 * Browser support.
 *
 * Browser support breaks when a Node builtin reaches the module graph, usually
 * through an innocuous-looking import in a file that needs the filesystem on
 * only some code paths. A static check of the bundle catches that
 * deterministically and adds no per-run cost, so it belongs here rather than in
 * a browser harness.
 *
 * `tsc` doesn't bundle, so there's no build output to inspect. These tests run
 * esbuild to produce a bundle and then assert against it.
 */
describe('browser entry', () => {
  it('bundles for the browser with no node: builtins', async () => {
    const result = await build({
      entryPoints: [browserEntry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    })

    const source = result.outputFiles[0]!.text

    expect(source).not.toMatch(/["']node:/)
    expect(source).not.toMatch(/\brequire\s*\(\s*["'](?:fs|path|os|util)["']\)/)
    // The Node resolver must not be reachable from the browser entry.
    expect(source).not.toMatch(/readFileSync/)
  })

  it('parses, transpiles and expands without touching the filesystem', async () => {
    const result = await build({
      entryPoints: [browserEntry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    })

    const source = result.outputFiles[0]!.text
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    )

    const { expanded } = module.expandSync('t: "a"|"b";', { iteration: 0 })
    expect(expanded).toBe('a')

    // transpile is the eval-free path, the one that works under a strict CSP.
    const { transpiled } = module.transpileSync('t: "a"|"b";')
    expect(transpiled).toContain('function ($options)')
  })

  it('reports a missing include resolver instead of failing on fs', async () => {
    const result = await build({
      entryPoints: [browserEntry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      logLevel: 'silent',
    })

    const module = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`
    )

    expect(() => module.parseSync('#include "other.rm"')).toThrow(
      /Cannot resolve include 'other\.rm'/,
    )
  })
})
