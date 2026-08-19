/**
 * Browser entry point.
 *
 * This entry point matches the Node entry point except that it binds only the
 * HTTP resolver, so its module graph contains no `node:` builtins. CI verifies
 * this by bundling the entry point with esbuild and inspecting the output.
 *
 * `#include "https://…"` works without configuration. To resolve any other
 * path, pass your own `resolveInclude` function, backed by a bundled map of
 * sources or an editor's virtual filesystem. Without such a resolver, an
 * include throws `RmuttIncludeError` naming the path, instead of failing on a
 * missing `fs` module.
 *
 * `compile` and `expand` call `new Function`, so the page's Content Security
 * Policy must allow `unsafe-eval`. `transpile` doesn't. To avoid eval at
 * runtime, generate the expander at build time and ship that artifact.
 */

import { createApi } from './core.js'
import { resolveHttp } from './http.js'

export * from './core.js'
export { resolveHttp }

const api = createApi({ resolveInclude: resolveHttp })

export const parse = api.parse.bind(api)
export const parseSync = api.parseSync.bind(api)
export const transpile = api.transpile.bind(api)
export const transpileSync = api.transpileSync.bind(api)
export const compile = api.compile.bind(api)
export const compileSync = api.compileSync.bind(api)
export const expand = api.expand.bind(api)
export const expandSync = api.expandSync.bind(api)

export default api
