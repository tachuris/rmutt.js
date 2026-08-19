/**
 * rmutt: generates random text from context-sensitive grammars.
 *
 * Node entry point: the environment-neutral API from ./core.js with the
 * filesystem include resolver bound as a default, so `#include` reads from
 * disk.
 */

import { composeResolvers, createApi } from './core.js'
import { resolveHttp } from './http.js'
import { resolveInclude } from './node/resolver.js'

export * from './core.js'
export { resolveHttp, resolveInclude }

const api = createApi({ resolveInclude: composeResolvers([resolveHttp, resolveInclude]) })

export const parse = api.parse.bind(api)
export const parseSync = api.parseSync.bind(api)
export const transpile = api.transpile.bind(api)
export const transpileSync = api.transpileSync.bind(api)
export const compile = api.compile.bind(api)
export const compileSync = api.compileSync.bind(api)
export const expand = api.expand.bind(api)
export const expandSync = api.expandSync.bind(api)

export default api
