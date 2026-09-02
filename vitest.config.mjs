import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Layout Tauri: renderer ada di ./src (bukan lagi ./src/renderer/src)
      '@renderer': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    // Sertakan .mjs agar test crypto/watermark ikut jalan, bukan diam-diam dilewati.
    include: ['tests/**/*.{test,spec}.{js,mjs}']
  }
})
