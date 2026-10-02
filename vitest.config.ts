import { defineConfig, configDefaults } from 'vitest/config'
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
    // Sertakan .mjs agar test crypto/watermark ikut jalan, bukan diam-diam
    // dilewati. 2026-09-26 (M0/B-4): tambah .ts/.tsx SEBELUM migrasi JS->TS —
    // tanpa ini, test yang di-rename ke .ts akan DIAM-DIAM DILEWATI (hijau
    // palsu) dan jaring paritas kehilangan kontraknya.
    include: ['tests/**/*.{test,spec}.{js,mjs,ts,tsx}'],
    // 2026-09-26 (M0/B-8): test yang butuh jaringan atau layanan hidup
    // (9Router :20128, bot Telegram, browser bridge eksternal) memakai
    // konvensi `*.live.test.*` dan DIKELUARKAN dari gate default supaya tidak
    // menahan rilis saat layanan lambat/mati. Jalankan manual: `bun run test:live`.
    // Catatan: `-live.test.mjs` (tanda hubung) TIDAK cocok pola ini — file lama
    // `bench-boundary-live.test.mjs` memang murni (stub) dan tetap ikut gate.
    exclude: [...configDefaults.exclude, 'tests/**/*.live.test.{js,mjs,ts,tsx}']
  }
})
