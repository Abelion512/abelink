# Session 2026-09-29 — audit lite/q8/extension + PR #112 (tanpa merge)

Mode: build. Request: audit keseluruhan + fix + test E2E + verifikasi + open PR (jangan merge).

## Status repo saat mulai
- Branch kerja: `refactor/ts-w4-components` (WIP migrasi TS sesi lain, 20M+3?? —
  JANGAN campur ke PR ini). RAM mesin 7.6GB (STANDARD, bukan lite).
- PR dibangun di worktree bersih `/tmp/opencode/pr-work` dari `main`
  (4d9a5b87), berisi tepat 10 file audit. Branch:
  `fix/lite-q8-extension-resume` -> PR #112 ke `main`, belum merge.

## Temuan audit (berbasis bukti, bukan klaim)

### 1. Lite mode vs quantization — user benar, quantization memang tidak ada
- Lite = boolean RAM (<=4.5GB, `cmd_misc.rs:18`) ATAU WASM SIMD rusak
  (`abelink:wasm-broken`). Sekali aktif: `getExtractor()->null`,
  `generateVector()->hash FNV1a` (bukan semantik), `generateStorableVector()
  ->null` sehingga korpus fulltext-only (`vectorModel 'none'`).
- Satu-satunya `dtype` di repo = whisper `fp32` (opsi TERBERAT).
  `onnx.simd` = flag backend, bukan quantization. Grep
  `q8|fp16|int8|quantized` di `src/` = nol hit sebelum fix.
- Bonus bug nyata: `sttRouter.ts:154` mengetik `getLiteMode()` sebagai
  `Promise<boolean>` padahal kembaliannya objek `{isLite,totalRAMGB}` —
  objek selalu truthy -> `isLowEnd` selalu true.

### 2. Trajectory — sehat, tak terkait extension error
- `trajectory.ts`: buffer in-memory 500 + localStorage, listener snapshot,
  flush `pagehide`. Tidak ada jalur dari `background.js` ke trajectory —
  error extension memang tak terlihat di Trajectory UI by construction.
- Minor (tak di-fix, di luar scope): `logToolCall` default success=true
  bila flag absen; truncasi 1-4k char; `getTrajectoryBuffer` kembalikan
  live array.

### 3. Extension popup ijo-dibuka / terputus-ditutup + error berulang
- Hijau = `running===true` in-memory hasil fresh-`start` saat popup dibuka;
  tutup popup = SW suspend = flag hilang. Bukan bug logika, tapi kontrak
  status menipu: pesan transien "Menyambung ulang otomatis..." ditulis ke
  `lastError` -> popup merah "terputus" tiap siklus 5s flat selamanya.
- Token file JSON 105 char vs helper 32 hex BUKAN mismatch — helper parse
  JSON dan ambil field `token`; handshake token asli 200 di kedua port.

## Fix (10 file, 197+/29-)
- `extension/popup-status.mjs`, `popup.js`, `background.js`: field `notice`
  baru (kuning) vs `lastError` (merah); backoff eksponensial
  5s->10s->20s->30s + reset saat sukses; `status` kirim `notice`.
- `src/api/embedding.worker.ts`: tangga q8 (`dtype`) setelah fp32, gate
  hanya-untuk-gagal-memori (SIMD murni langsung lite); lapor tier via
  `init_done(dtype)`.
- `src/api/vectorMemory.ts`: `activeDtype`, `getVectorModel()` ->
  `'minilm-q8'`; `src/api/oramaStore.ts`: keluarga minilm kompatibel
  lintas tier (hash tetap asing).
- `src/api/sttRouter.ts`: baca `res.isLite` dari objek.
- `tests/resumeSelfHeal.test.mjs`: ikut kontrak backoff baru.
- Test baru: `tests/popup-status.test.mjs` (4), `tests/oramaModelFamily.test.mjs` (3).

## Verifikasi
- `bun run lint`: exit 0, 0/0. Targeted: 10 file, 65/65 hijau.
- E2E bridge (`browser-e2e.test.mjs`): 25/25. Full suite: 1825 passed,
  3 gagal pre-existing migrasi W4 (configCapabilities ENOENT .jsx yang
  di-rename; ponytailLedger CodeBlock.tsx) — bukan dari PR ini.
- `bun run build`: chunk real (`index-caiRWkfp.js` 1036KB).
- 2 `prefer-const` + 2 `catch(err)` di file WIP orang lain diperbaiki
  seperlunya agar gate hijau (ElasticSlider.tsx yang terpotong 47/172
  baris di-restore dari HEAD — bukan scope saya).

## Batasan dikenal
- q8 butuh file ONNX q8 di HF (`Xenova/...` — bila tak ada, pipeline
  fallback/error lalu hash seperti sebelumnya; perilaku tak lebih buruk).
- Popup "terputus saat tutup" sisa adalah sifat MV3 suspend; kontrak kini
  jujur (kuning-transien vs merah-error) alih-alih pura-pura hijau.
- Tree utama masih berisi WIP TS-W4 sesi lain; worktree PR sudah dihapus
  setelah push (cabang remote tetap ada untuk review).
