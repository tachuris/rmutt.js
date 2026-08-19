import { defineConfig } from 'vite-plus'

// Caching disabled on every build task: build:lib and build:parser both
// write into dist/generated/, and a cache-hit replay after dist/ is deleted
// (e.g. a fresh CI checkout, with setup-vp's task cache persisted from a
// prior run) restores only part of that shared directory instead of failing
// loudly. Always rebuilding matches the pre-migration plain npm scripts,
// which had no caching at all.
export default defineConfig({
  run: {
    tasks: {
      'build:parser': { command: 'node scripts/build-parser.mjs', cache: false },
      'build:payload': { command: 'node scripts/build-payload.mjs', cache: false },
      'build:lib': { command: 'tsc', cache: false },
      build: {
        command: 'vp run build:parser && vp run build:payload && vp run build:lib',
        cache: false,
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Some example grammars are slow to expand. The 5s default is not enough.
    testTimeout: 30000,
  },
})
