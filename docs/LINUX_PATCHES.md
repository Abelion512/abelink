# LINUX_PATCHES — overlay fork di atas upstream/master

Disiplin utama: **setiap modifikasi wajib kecil + tercatat di file ini.**
Drift bukan lagi "diff acak" — ia patch bernomor. Overlay branch `5.5.0`
duduk di atas `upstream/master`. Update official = merge, bukan reset.

## Alur update official (satu-satunya cara ke depan)

```bash
git fetch upstream
git merge upstream/master          # 99% auto-merge; konflik hanya di file yang kita patch
# tiap konflik: resolve sekali, di file itu saja
# review: official sudah punya fitur patch? → buang patch (patch itu sementara)
```

Larangan: `git checkout upstream/master -- src/` (reset total) — KECUALI
keputusan eksplisit user untuk memulai ulang dari nol.

## Patch aktif

### P1 — ai-bridge.js: default endpoint 9Router + model abelink
- File: `src/main/ai-bridge.js`
- Alasan: Linux tanpa GPU; 9Router proxy `http://localhost:20128` composite
  `abelink` (DeepSeek V4 Flash + Nemotron + Mimo 2.5) = 1 model id.
- Isi (3 baris):
  - default `endpoint` → `http://localhost:20128/v1/chat/completions`
  - `conf.customEndpoint` default → `http://localhost:20128/...`
  - default `body.model` → `'abelink'`
- Konflik saat merge upstream: HARUS dicek (upstream ubah endpoint logic).

### P2 — index.js: tray icon Linux + quit via before-quit
- File: `src/main/index.js`
- Alasan: `app.getFileIcon(execPath)` Windows-only; fallback `.ico` blank di
  Linux. Tanpa tray visible, close → hide → user terjebak.
- Isi:
  - import `iconPng` dari `resources/icon.png?asset`
  - fallback tray: `nativeImage.createFromPath(iconPng)` 22px Linux
  - `app.on('before-quit')` set `isQuiting = true`

### P3 — App.jsx: WindowControls standalone guard (+ drag grip)
- File: `src/renderer/src/App.jsx`
- Alasan: titlebar `-webkit-app-region:drag` menangkap klik di strip 40px;
  di route standalone (telegram-bot) titlebar menutupi navbar page.
- Isi:
  - `mainLayout` menerima prop `isStandalone`; `WindowControls` disembunyikan saat standalone
  - drag region dipindah dari container ke grip center saja

### ~~P5 — index.js: preload .mjs (ESM output — upstream bug)~~ DEPRECATED
- Status: **OBSOLETE**. Upstream build sekarang menghasilkan `preload/index.js`
  (bukan `.mjs`). P5 tidak diperlukan di base `b531932`.

### P4 — package.json: +ytmusic-api (private)
- File: `package.json`
- Alasan: upstream `src/main/index.js` import `ytmusic-api` tapi package.json
  upstream tidak mencantumkan (bug upstream). Kita keep `5.3.1`.
- Catatan: kalau upstream pernah menambahkan, hapus dari sini.

### P6 — README.md: PowerShell → Shell (cross-platform)
- File: `README.md`
- Alasan: Linux migration; gunakan "shell" bukan "PowerShell"

### P7 — src/main/*: comment + string updates for Linux
- Files: `src/main/index.js`, `node-tools.js`, `pc-agent.js`, `plugins/plugin-loader.js`, `telegram/telegram-service.js`
- Alasan: hapus referensi Windows-only di komentar dan UI strings

### P8 — telegram-service.js: yt-dlp binary path fix
- File: `src/main/telegram/telegram-service.js`
- Alasan: `youtube-dl-exec` bundle binary berbeda per OS
  (`yt-dlp.exe` Win32 vs `yt-dlp` Linux/macOS)

### P9 — renderer: WhatNew + Guidebook UI simplifications
- Files: `src/renderer/src/components/WhatNew.jsx`, `Guidebook.jsx`, `whats-new.json`
- Alasan: cleaned up WhatNew UI; Guidebook descriptions now Linux-compatible

## Fitur shelve (cutoff 2026-08-16 — mau diimplementasikan ulang)

1. Auto scan model dari endpoint (/models) + selectable hasil config
2. What's New
3. 4 mode (chat/voice/camera/screen)
4. Jam digital saat click orb
5. Connector last.fm API (biarkan di connector, just api)
6. Fitur import chat

Setiap fitur yang di-reimplementasi = patch bernomor baru (P5+), kecil, terdokumentasi.

## Status terakhir

- Base: `upstream/master` @ 2026-08-22 (diff src/ = P1–P4, P6–P9)
- Branch: `5.5.0`
- P5 deprecated; build outputs `preload/index.js` (not `.mjs`)
- Commit history:
  - `d4f447f` Merge upstream
  - `0ea4d30` Re-apply P1–P5 after merge
  - `1156c1c` Revert P5 (preload .mjs obsolete)
  - `55cec51` Apply stash P6–P9 (Linux migration)
