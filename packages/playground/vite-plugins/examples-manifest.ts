import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite-plus'

export interface ExampleEntry {
  name: string
  isLibrary: boolean
}

export const EXAMPLES_MODULE_ID = 'virtual:examples-manifest'
const RESOLVED_MODULE_ID = '\0' + EXAMPLES_MODULE_ID

const PACKAGE_DIRECTIVE = /^\s*package\s+\S+\s*;/m

export function buildExamplesManifest(examplesDir: string): ExampleEntry[] {
  return readdirSync(examplesDir)
    .filter(name => name.endsWith('.rm'))
    .sort()
    .map(name => {
      const source = readFileSync(join(examplesDir, name), 'utf8')
      return { name, isLibrary: PACKAGE_DIRECTIVE.test(source) }
    })
}

/** Emits `virtual:examples-manifest`: `examples/*.rm` as name and whether it's a `package` */
export function examplesManifestPlugin(examplesDir: string): Plugin {
  return {
    name: 'examples-manifest',
    resolveId(id) {
      if (id === EXAMPLES_MODULE_ID) return RESOLVED_MODULE_ID
      return undefined
    },
    load(id) {
      if (id !== RESOLVED_MODULE_ID) return undefined
      const examples = buildExamplesManifest(examplesDir)
      for (const { name } of examples) this.addWatchFile(join(examplesDir, name))
      return (
        `export const EXAMPLES = ${JSON.stringify(examples, null, 2)};\n` +
        `export const EXAMPLE_NAMES = new Set(EXAMPLES.map((e) => e.name));\n` +
        // Matches http.ts's own check. A remote #include's raw path is a URL.
        `const ABSOLUTE_URL = /^https?:\\/\\//i;\n` +
        `export function isMissingExample(path) {\n` +
        `  return !ABSOLUTE_URL.test(path) && !EXAMPLE_NAMES.has(path);\n` +
        `}\n`
      )
    },
  }
}
