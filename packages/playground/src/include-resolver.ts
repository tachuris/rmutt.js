import { resolveHttp, type IncludeResolver } from 'rmutt'

export const EXAMPLES_BASE = 'https://tachuris.github.io/rmutt.js/examples/'

export const resolveInclude: IncludeResolver = (path, from, next) =>
  resolveHttp(path, from ?? EXAMPLES_BASE, next)
