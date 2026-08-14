import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Some example grammars are slow to expand. The 5s default is not enough.
    testTimeout: 30000,
  },
})
