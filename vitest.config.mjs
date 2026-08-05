import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
})
