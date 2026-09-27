// vitest.live.config.mjs — gate TERPISAH untuk test yang butuh jaringan atau
// layanan hidup (9Router :20128, bot Telegram, browser bridge sungguhan).
//
// Konteks (M0/B-8): test live pernah flaky (5–27s, kadang lewat batas) dan
// menahan gate default. Solusinya: konvensi nama `*.live.test.*` + config ini,
// dijalankan manual lewat `bun run test:live`, TIDAK ikut `bun run test`.
//
// PENTING: hijau di sini dengan 0 file berarti "belum ada test live", BUKAN
// "live lulus". Skrip `test:live` mencetak jumlah file agar tidak menipu.
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.live.test.{js,mjs,ts,tsx}'],
    // Timeout lebih longgar: 9Router sempat terukur 26s untuk GET /v1/models.
    testTimeout: 60000,
    hookTimeout: 60000,
    passWithNoTests: true
  }
})
