# Session 2026-09-16 — Browser watchdog + tombol reconnect UI

## Keputusan

- Topik sesi: extension watchdog + tombol reconnect UI (TASK.md item 3).
  Skill relevansi tahap 2 (item 2) TIDAK dikerjakan — topik sesi berikutnya.
  Review/merge + Qwen/DeepSeek di luar scope (instruksi user).
- Desain (bounded, disetujui user sebelum eksekusi): 4 potong satu alur —
  sweep timer prod, fail-fast pre-dispatch, event ke renderer, pill + tombol UI.
- Branch baru `feat/browser-watchdog-reconnect`, stacked di atas PR #37
  (belum merge; watchdog dibangun di atas browse-transparan). PR #38 ke
  `main`, TANPA merge. Merge #37 dulu, lalu rebase branch ini.
- `launch-budget-exhausted` / auto-launch-off ditampilkan jujur di UI;
  tombol reconnect tidak bypass throttle launcher.

## Berkas berubah (PR #38, +206/-3 vs base branch)

- `sidecar/main/browser/bridge-core.mjs`: `dispatchCommand` fail-fast bila
  sesi dikenal tapi basi (`lastSeenAt` > `SESSION_TTL_MS`, antrean kosong);
  sesi baru (`lastSeenAt=0`) tetap jalur normal.
- `sidecar/main/browser/server.mjs`: sweep timer 60s (guard
  `VITEST`/`NODE_ENV=test`, `unref`, disarm saat `stopBrowserBridge`).
- `sidecar/engine/channels/browser.mjs`: channel `browser:reconnect`
  (sweep + reuse connected / auto-launch bounded via launcher /
  reason jujur); impor `emit` + `sweepSessions`.
- `src/api/tauri-bridge.js`: `onBrowserStatus: on('browser:status')`
  (pola identik `onAiStatus`).
- `src/components/config/CapabilitiesHub.jsx`: pill Tersambung/Terputus di
  card Browse Use + tombol Hubungkan Ulang + catatan progres/reason
  (subscribe `onBrowserStatus` untuk string progres launch).
- `tests/browser-bridge.test.mjs`: fail-fast stale + fresh-session normal.
- `tests/browser-e2e.test.mjs`: reconnect reuse + sweep + auto-launch-off.

## Hasil verifikasi

- `bunx vitest run` full: 76 files, 855 tests passed
  (baseline 851 + 4 baru: 2 bridge + 2 e2e).
- `bun run lint`: 0 errors. Warning baru 1 (`set-state-in-effect` di
  `checkBrowserStatus`) mengikuti pola pre-existing `checkGoogleStatus`
  yang sama — bukan regresi.
- `git log main..HEAD` di branch: commit #37 + commit watchdog (stacked).
- Perbaikan saat sesi: edit test pertama salah sasaran merusak struktur
  `rawGet` + header describe (tertangkap `node --check`, diperbaiki);
  test reconnect gagal karena sesi e2e lain connected (diperbaiki dengan
  `dropSession(S)` eksplisit).

## Batasan dikenal

- PR #38 butuh PR #37 merge dulu + rebase sebelum review final.
- CI cloud merah = billing akun (bukan kode); verifikasi lokal penuh.
- Sweep hanya drop sesi antrean kosong (kontrak `sweepSessions` lama);
  sesi basi dengan `pending` tetap menunggu COMMAND_TIMEOUT.
- Skill relevansi tahap 2 (skor index + nested scan + basePath) = topik
  sesi berikutnya; gap sudah dipetakan (subagent explore sesi ini).
