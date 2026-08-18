import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@dsh-deepseek-web/compat': fileURLToPath(new URL('../packages/compat/src/index.ts', import.meta.url)),
      '@deepseek-ai/dsh-llm': fileURLToPath(new URL('./stubs/dsh-llm.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', 'public/**/*.test.ts'],
    setupFiles: ['./setup-protocol.ts'],
  },
})
