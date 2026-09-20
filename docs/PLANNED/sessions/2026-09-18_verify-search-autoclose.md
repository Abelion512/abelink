# Session Log: V1 claim-quoted + V2 rantai search + auto-close

Tanggal: 2026-09-18 | Branch: `feat/verify-search-autoclose` | Status: selesai, siap merge

## Masalah (audit trajectory sesi verifikasi 5 model)
- Agen klaim "Muse 1.3 confirmed real" dari URL saja; verifier lolos (cek format, bukan kebenaran).
- browser-search mati total (DDG block + fallback ke server sama) -> 84x tembak tembok.
- Toggle auto-close tidak tersinkron ke sidecar; close hanya di jalur stop.

## Keputusan
- V1: kriteria `claim-quoted` — entitas bernama di jawaban harus muncul di observasi tool, else unresolved + replan "extract dulu".
- V2: rantai 9Router-search -> extension google.com -> DDG terakhir. Marker [SEARCH-ERROR]/[NO-RESULTS] untuk V3.
- Auto-close: sync tiap toggle + close otomatis hanya saat completed.

## Berkas berubah
- `src/api/ai/objectiveVerifier.js`: extractClaimEntities + kriteria + derive research.
- `src/api/ai/planning.js`: 1 aturan kutipan.
- `sidecar/main/tools/routerSearch.mjs` (BARU): searchViaRouter + fetchViaRouter + SKIP_NO_KEY.
- `sidecar/main/tools/browserTools.mjs`: rantai 3 lapis + marker + cache success-only.
- `src/components/config/CapabilitiesHub.jsx`: syncConfig tiap toggle.
- `src/hooks/agent/useAbelinkPlan.js`: shouldAutoCloseBrowser + call saat completed.
- Tests: objectiveVerifier +3, router-search (11), browser-autoclose (5).

## Hasil verifikasi
- 5 file: 110/110 hijau. ESLint: 0 error (warnings pre-existing).
- Revert 1 baris warna tauri-bridge milik sesi UI lain.

## Batasan dikenal
- V3 (bedakan search-error vs no-results di verifier) belum dikerjakan.
- fetchViaRouter belum dipakai handler (siap untuk V1-extract via fetch).
- Klaim tanpa digit + singleton generik tidak ditandai (sengaja, anti false-positive).
