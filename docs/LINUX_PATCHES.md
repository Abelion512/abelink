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

## Apa & Baru? (What's New / Release Notes)

**Trigger**: Saat app pertama kali dijalankan setelah update, atau dari menu `?` → *What's New*

**Alur**:
1. **App boot** → cek `whatsNewData.version` vs `config.lastSeenWhatsNewVersion`
2. **Bedakan** → kalau versi berbeda → tampilkan modal slide-over dari kanan bawah (bukan center modal)
3. **Tampilan**:
   - Header: `v{versi} · {tanggal}`
   - Summary ringkas: "X perubahan rilis"
   - **Top 5 ATM** (perbaikan & adaptasi) — bulleted, 1 baris per item
   - **Top 5 AUTO** (fitur otomatis) — bulleted, 1 baris per item
   - Tombol CTA: "Lihat semua di Linear" → link ke Linear project
   - Tombol dismiss ("×") → simpan `lastSeenWhatsNewVersion` ke config + tutup
4. **Tidak muncul lagi** → kalau user dismiss + versi terbaru sudah dibaca

**Implementasi di codebase**:
- `src/renderer/src/components/WhatNew.jsx` — sudah ada, butuh trigger dari boot
- `src/renderer/src/data/whats-new.json` — perlu kolom `version` yang dibandingkan dengan config
- `src/renderer/src/contexts/ChatContext` → tambah `lastSeenWhatsNewVersion` state + `setConfig`
- `src/main/index.js` → saat `createWindow()` → cek versi dan arahkan ke WhatNew jika perlu

**Catatan visual** (Apple Liquid Glass theme, HIG-compatible):
- Modal floating di kiri/bawah layar (bukan center-block)
- Glassmorphism background `bg-base-200 border border-[var(--glass-border)]`
- `[-webkit-app-region:no-drag]` pada titlebar area
- Warna: teks putih, badge-primary/secondary/accent/info/warning/success/neutral/ghost

## Configuration Sidebar Navigation

**Masalah**: `Configuration.jsx` sekarang 1184 baris — single vertical scroll semua sections (AI Engine, Camera, Shortcut, TTS, Telegram, Memory). User pusing, harus scroll panjang buat nemu setting.

**Solusi**: Sidebar navigation (daftar section di kiri) + content panel di kanan. Pattern: desktop settings UX standar (VS Code, Discord, Slack, macOS System Settings).

**Arsitektur**:
```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Pengaturan Mark"  [Back btn if !firstSetup]       │
├──────────────────┬──────────────────────────────────────────┤
│  SIDEBAR (260px) │  CONTENT PANEL (flex-1)                  │
│  ┌────────────┐  │  ┌────────────────────────────────────┐  │
│  │ 🤖 AI &   │  │  │  Section content (scrollable)       │  │
│  │    Tools   │──▶ │  │                                   │  │
│  ├────────────┤  │  │                                   │  │
│  │ 🎥 Kamera  │  │  │                                   │  │
│  ├────────────┤  │  │                                   │  │
│  │ ⌨ Shortcut │  │  │                                   │  │
│  ├────────────┤  │  │                                   │  │
│  │ 🔊 Audio   │  │  │                                   │  │
│  ├────────────┤  │  │                                   │  │
│  │ 🤖 Telegram│  │  │                                   │  │
│  ├────────────┤  │  │                                   │  │
│  │ 💾 Memory  │  │  │                                   │  │
│  └────────────┘  │  └────────────────────────────────────┘  │
└──────────────────┴──────────────────────────────────────────┘
```

**Sections (dari Configuration.jsx existing)**:
1. **AI & Tools** (lines 541-709): AI Provider, Model, Awareness, Persona, Temperature, Context, Window Opacity
2. **Kamera** (lines 806-851): Camera toggle, device select, preview
3. **Global Shortcut** (lines 854-919): Shortcut key, recorder, presets
4. **Audio & Voice** (lines 924-1090): STT engine, Groq API Key, Mic, TTS Rate/Pitch, Test Voice
5. **Telegram Bot** (lines ~1090+): Bot Token, Admin IDs
6. **Memory & Data** (lines ~1120+): Clear chat, Export chat

**Implementasi**:
- Refactor `Configuration.jsx` jadi parent component + 6 child section components
- State `activeSection` di parent
- Sidebar: `nav` list dengan highlight aktif, `aria-current="page"`
- Keyboard navigation: Arrow Up/Down antar section, Enter buat pilih
- Responsive: mobile (< 768px) → sidebar jadi dropdown/select di header
- HIG compliance: fokus visible, 44px touch target, label jelas

**Files to create/modify**:
- `src/renderer/src/pages/Configuration.jsx` → parent + sections
- `src/renderer/src/components/ConfigSidebar.jsx` (baru)
- `src/renderer/src/components/ConfigSections/*.jsx` (6 files baru)

**Catatan visual** (Apple Liquid Glass theme):
- Sidebar: `bg-base-200/50 backdrop-blur-sm border-r border-white/10`
- Active item: `bg-primary/20 text-primary border-l-2 border-primary`
- Hover: `bg-white/5`
- Content panel: `overflow-y-auto p-6 space-y-8`

**Backwards compat**: `isFirstSetup` prop tetap jalan — sidebar hidden di firstSetup mode (wizard step-by-step via `driver.js` yang sudah ada).
