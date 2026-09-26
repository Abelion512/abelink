# Session 2026-09-22 — Browser handshake humanless scenarios

Mode: build. Lanjutan sesi Jarvis slice 1 (Task 1-7 done).

## Latar

User: extension di luar scope terus = browse_use mati selamanya, siapa solve?
Jawab: Jalur A live (bridge + extension), gagal harness = handshake belum
pairing, bukan modul rusak. User: handshake sering putus (suspend + close),
minta audit + auto-connect stabil. User: testing humanless, malas manual.

## Audit kode (read-only dulu)

- `extension/background.js`: keepalive `chrome.alarms` 1 menit, `onStartup`
  + `tryAutoResume` (niat `wantConnected` persist), token refresh via
  native host, rotasi refresh-on-use, pairing pin flavor.
- `sidecar/main/browser/bridge-core.mjs`: `SESSION_TTL_MS` 5 menit,
  sweep 60 detik (`server.mjs`), rotasi 30 hari grace 24 jam, reason 401
  eksplisit (`token-stale`/`token-unknown`/`session-unknown`).
- `sidecar/main/browser/launcher.mjs`: auto-launch `xdg-open` + tunggu
  handshake 20 detik bounded + throttle anti tab-storm.

Titik putus by design: suspend/close >5 menit = sweep; SW suspend = jeda
sampai alarm; restart = 1x 401 pulih via helper.

## Berkas berubah

- `tests/browser-reconnect-scenarios.test.mjs` (baru): 5 test humanless,
  ekstensi palsu via fetch ke server bridge nyata (port 49798).
  - A tutup-buka: sweep + handshake ulang; sesi default reseed token file.
  - B suspend: connected=false saat basi, handshake ulang hidup lagi.
  - C restart: prevToken grace -> tokenOk; 401 reason eksplisit.
- `docs/PLANNED/2026-09-22_browser-handshake-scenarios.md`: checklist manual
  E2E (butuh Chrome + tangan) — opsional, bukan gate.

## Koreksi ekspektasi saat implement (bukan bug kode)

- Handshake `ensureSession` dulu baru cek token: sesi sapu + token lama =
  401 `token-unknown`, bukan `session-unknown`.
- `tokenRejectReason` cek kecocokan prevToken tanpa grace: stale di luar
  grace tetap `token-stale` (grace dicek di `tokenOk`).

## Hasil verifikasi

- File: 5 passed. Full: 1442 passed (1437 + 5). Smoke LOLOS. Lint 0 error.

## Batasan dikenal

- background.js (chrome.* API) tidak tercover test — tetap runbook manual.
- Selalu-nyala = tidak, by design aman. Stabil = pairing sekali +
  wantConnected + keepalive + native host + auto-launch on.
- Jalur B (spawn Chromium per profil) tetap backlog.
