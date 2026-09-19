# Session 2026-09-19 — Bridge helper crash + RAG Lite fallback + planning retry burn

## Keputusan
- `OC | <title>`: untuk sesi OpenCode, BUKAN sesi Abelink. Rename sesi Abelink DIBATALKAN; user rename manual di UI OpenCode.
- Lite Mode: ingest tetap jalan fulltext-only + toast degradasi jujur (bukan blokir, bukan fake hash).
- `Knowledge.jsx` toast hunk ikut batch redesign (bergantung `processFile`), bukan commit ini.

## Berkas berubah (commit a22c134, branch fix/bridge-helper-rag-planning, PR #42)
- `sidecar/main/browser/native-host.mjs`: python literal `'` -> `"` (shell-quoting crash); hapus gate namespace palsu di wrapper flavor-pinned.
- `src/api/ragPipeline.js`: `generateStorableVector`, fulltext-only rows, return `{storableCount, degraded}`.
- `src/api/oramaStore.js`: `insertDocumentChunksToOrama` via `toIndexRow`.
- `src/api/ai/planning.js`: prose recovery attempt-1 (>=40 char), digest retry 120 char.
- `tests/native-host.test.mjs`: exec `.sh` nyata (regresi quoting). `tests/ragLiteFallback.test.mjs`: baru.

## Hasil verifikasi
- `vitest`: 101 files / 1082 tests hijau. Lint 0 errors.
- Live wrapper prod+dev exec nyata: `{"ok":true}` + token benar per flavor.
- Tindakan user: Reload extension di `chrome://extensions`, klik Pakai Dev sekali (buat pairing), pastikan sidecar/dev jalan (port 49713; prod 49712 mati saat itu).

## Batasan dikenal
- Prose-recovery `getNextAction` tanpa unit test (mock fetchAI+konteks mahal; perubahan relaksasi ketat).
- 16 file redesign + `AppleSwitch.jsx` masih uncommitted (batch terpisah).
