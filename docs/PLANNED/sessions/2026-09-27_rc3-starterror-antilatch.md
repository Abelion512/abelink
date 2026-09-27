# Session Log — Fix RC3: Anti-Latch `startError` pada Bridge Lifecycle

- **Tanggal:** 2026-09-27
- **Branch:** `refactor/m2c-headless-observability`
- **Pemicu:** rekomendasi prioritas 1 dari verifikasi audit (2026-09-26) + pengukuran MV3 (2026-09-27 pagi): latch `startError` permanen membuat satu EADDRINUSE transien (instansi lain keluar, port TIME_WAIT) mematikan bridge selamanya hingga restart proses.

## Perubahan

- `sidecar/main/browser/server.mjs` — lifecycle `startBrowserBridge()`/`stopBrowserBridge()`:
  - `startError` tidak lagi latch permanen; kini hanya deskripsi kegagalan terakhir. Panggilan ulang = dicoba ulang.
  - `startPromise` + `startResolve` mendedupe attempt in-flight: N pemanggil konkuren menunggu hasil attempt yang sama (tanpa dua listen berebut port).
  - Guard race identitas: error handler mengabaikan error bila attempt lain sudah `listening` atau `stop()` telah menyela (`server !== thisServer`); callback listen yang kalah bersihkan server yatimnya.
  - `stopBrowserBridge()` me-reset `server`/`startError` dan me-resolve attempt in-flight dengan hasil jujur (dulu: awaiter bisa menggantung selamanya).
  - `startBrowserBridge()` selalu mengembalikan Promise — dulu jalur sync ("sudah listening"/latch) mengembalikan object polos, sementara `engine/channels/browser.mjs` memanggil `.catch()` atas hasilnya (TypeError laten).
  - Sukses start me-reset `startError = null`.
- `tests/browserAuditVerify.test.mjs` — RC3-A di-flip dari mengasersi latch permanen menjadi matriks lifecycle 8 fase di proses child (gagal EADDRINUSE → pulih saat port bebas → idempoten → stop-reset → pulih lagi), plus RC3-B: kontrak selalu-Promise.

## Verifikasi

- `bunx vitest run tests/browserAuditVerify.test.mjs` — 13/13 hijau.
- Regresi seluruh keluarga test browser (19 file): **169/169 hijau** (termasuk e2e 25, reconnect/ReadRecovery, flavor, handshake-honest).
- `bun run lint` — exit 0, 0 error (1012 warnings = baseline terdaftar).
- Efek samping test (install native host saat env tmp) tetap dipulihkan `afterAll`: manifest Chrome menunjuk data home asli.
- Release gate penuh `bash scripts/verify.sh`: **LOLOS, exit 0** (bootstrap, vitest penuh, sintaks extension, lint 0 error, crypto harness 8+25, perf gate, bench quick, vite build, cargo check, clippy `-D warnings`).

## Keputusan & batasan

- Bukan perubahan arsitektur (semantik lifecycle satu modul, endpoint/kontrak channel tak berubah) — `docs/ARCHITECTURE.md` tidak disentuh.
- In-flight-dedupe memakai modul-level `startPromise` (bukan queue): perilaku yang diinginkan adalah single-flight, bukan serialisasi antrean start.
- `attempt.finally` hanya membersihkan guard bila identitasnya masih attempt terbaru (stop()+start() yang menyela tidak menghapus guard milik attempt baru).
