import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import { examplesManifestPlugin } from './vite-plugins/examples-manifest'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const examplesDir = join(packageRoot, '../../examples')

// Repo name path: the site is served from a project page.
export default defineConfig({
  base: '/rmutt.js/',
  // Registered on both sides: the Worker bundle is a separate build that
  // does not inherit `plugins`, so the manifest needs its own entry there
  // too. See examples-manifest.ts.
  plugins: [examplesManifestPlugin(examplesDir)],
  worker: {
    plugins: () => [examplesManifestPlugin(examplesDir)],
  },
  run: {
    tasks: {
      // Caching disabled: dist/ is gitignored and absent on every fresh CI
      // checkout, while setup-vp's task cache persists across runs.
      build: { command: 'vp build', cache: false },
    },
  },
})
