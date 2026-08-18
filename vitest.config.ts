import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@dsh-deepseek-web/compat': fileURLToPath(new URL('./packages/compat/src/index.ts', import.meta.url)),
      '@deepseek-ai/dsh-llm': fileURLToPath(new URL('./tests/stubs/dsh-llm.ts', import.meta.url)),
    },
  },
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'tests/vitest.config.ts',
    ],
  },
})
