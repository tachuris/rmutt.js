/**
 * Browser entry point.
 *
 * This entry point matches the Node entry point except that it binds no include
 * resolver, so its module graph contains no `node:` builtins. CI verifies this
 * by bundling the entry point with esbuild and inspecting the output.
 *
 * To expand a grammar that uses `#include`, pass your own `resolveInclude`
 * function, backed by `fetch`, a bundled map of sources, or an editor's virtual
 * filesystem. Without a resolver, an include throws `RmuttIncludeError` with a
 * message that says so, instead of failing on a missing `fs` module.
 *
 * `compile` and `expand` call `new Function`, so the page's Content Security
 * Policy must allow `unsafe-eval`. `transpile` doesn't. To avoid eval at
 * runtime, generate the expander at build time and ship that artifact.
 */

import { createApi } from './core.js'

export * from './core.js'

const api = createApi()

export const parse = api.parse.bind(api)
export const parseSync = api.parseSync.bind(api)
export const transpile = api.transpile.bind(api)
export const transpileSync = api.transpileSync.bind(api)
export const compile = api.compile.bind(api)
export const compileSync = api.compileSync.bind(api)
export const expand = api.expand.bind(api)
export const expandSync = api.expandSync.bind(api)

export default api
