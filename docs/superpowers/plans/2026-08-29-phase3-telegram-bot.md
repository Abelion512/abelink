# Phase 3: Telegram Bot Native Commands

**Tanggal:** 2026-08-29  
**Status:** COMPLETED (partial)

## Completed

- Rust `telegram_send_message` — direct `reqwest` call ke Bot API
- Rust `telegram_broadcast_to_admins` — broadcast ke semua admin chat_id
- Rust `telegram_configure` — set bot token
- Rust `telegram_register_admin_chat` — daftar chat_id admin
- Rust `telegram_status` — status koneksi

## Remaining (Phase 4)

- **Telegraf event loop** — tetap JS karena:
  - Long-polling/ webhook
  - `desktopCapturer` (Electron screen API)
  - `yt-dlp` subprocess
  - `ffmpeg` integration
  - Middleware pattern (`bot.command`, `bot.on`)

## Recommendation

Pindahkan teknologi:
- Gunakan `teloxide` crate untuk bot framework Rust (alternatif Telegraf)
- Atau biarkan Telegraf di JS side + bridge via `invoke()`

---

# Phase 3 & 4: PC Automation (pc-agent.js)

**Status:** PENDING

## Komponen yang Perlu Ditranslasikan

1. **Overlay UI** — Electron BrowserWindow + HTML/CSS/JS
2. **Python daemon** — UI Automation via AT-SPI/DBus
3. **Session Control** — os-control-open/close + emergency stop

## Pendekatan yang Mungkin

- Gunakan `napi-rs` untuk expose JS API ke Python daemon
- Atau rewrite daemon ke Rust + socket IPC
- Overlay window: gunakan Tauri Custom Protocol + Window API

---

# Phase 3: Browser Tools

**Status:** PENDING (stub)

## Tools yang Tidak Bisa Diporting ke Rust

- `browser-navigate` — require browser engine runtime
- `browser-read` — DOM inspection via headless browser
- `browser-click` — simulation melalui page interact
- YouTube tools — yt-dlp + FFmpeg subprocess

## Solusi

- Jalankan di sidecar Electron (browser engine)
- Atau gunakan `headless_chrome` crate + playwright-rs