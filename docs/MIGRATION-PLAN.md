# Migration Plan — Electron → Tauri v2 (fase B5/B6/C3/C4)

Dokumen ini adalah rencana fase migrasi yang tersisa. Setiap fase mencantumkan
titik masuk implementasi yang NYATA di repo (perintah Rust / file sidecar) dan
cara memverifikasinya — klaim tanpa titik masuk tidak ditulis di sini.

Status umum: fase A/B selesai (sidecar channel registry + approval gates,
lihat `../MIGRATION-GAPS.md`). Yang tersisa di bawah.

## Fase B5 — Dialog & screenshot native (Rust)

**Status: SEBAGIAN SELESAI.** Perintah Rust sudah ada dan dipakai renderer:

| Channel lama (Electron) | Pengganti Rust | Status |
| --- | --- | --- |
| `dialog:open-file` | `misc_open_file_dialog` (`src-tauri/src/cmd_misc.rs`) | selesai |
| `dialog:open-directory` | `misc_open_directory_dialog` (`cmd_misc.rs`) | selesai |
| `take-screenshot` | `misc_take_screenshot` (`cmd_misc.rs`) | selesai |
| `save-temp-file` | `misc_save_temp_file` (`cmd_misc.rs`) | selesai |
| `app:get-documents-path` | `misc_get_documents_path` (`cmd_misc.rs`) | selesai |
| `system:get-lite-mode` | `misc_get_lite_mode` (`cmd_misc.rs`) | selesai |
| `show-notification` | `misc_show_notification` (`cmd_misc.rs`) | selesai |
| `open-external` | `misc_open_external` (`cmd_misc.rs`) | selesai |

Pemanggil: `src/api/tauri-bridge.js` (`invoke('misc_*')`).
Verifikasi: `grep -n "invoke('misc_" src/api/tauri-bridge.js`.

## Fase B6 — Desktop automation (os:*) native Rust

**Status: SELESAI di sisi renderer; stub sidecar dipertahankan sebagai fallback.**

Renderer memakai perintah Rust langsung: `os_read`, `os_click`, `os_type`,
`os_key`, `os_scroll`, `os_open`, `os_list_windows`, `os_focus_window`,
`os_ask`, `os_is_x11` (`invoke('os_*')` dari `src/api/tauri-bridge.js`).

Channel sidecar `os:*` (`sidecar/engine/channels/music.mjs`, daftar `unsupported`)
hanya tersisa sebagai fallback era lama dan mengembalikan `unsupported`
(fail-fast) — jangan dianggap bug.

## Fase C3 — Browser automation multi-session (browser:*)

**Status: BELUM DIMULAI (stub eksplisit).**

Butuh Tauri `WebviewWindow` terpisah per sesi (pengganti `BrowserWindow`
Electron). Titik masuk yang direncanakan:

- `sidecar/engine/channels/music.mjs` — daftar stub `browser:navigate`,
  `browser:read-dom`, `browser:action`, `browser:close`, `browser:show`.
- Kandidat implementasi: command Rust `browser_*` di `src-tauri/` yang
  spawn WebviewWindow tersembunyi + inject JS (pola `BrowserPreviewWidget`).

Verifikasi saat fase ini dikerjakan: setiap channel harus menjalankan frame
smoke nyata (navigate → read-dom → action), bukan respons sukses palsu.

## Fase C4 — Plugin execution sandbox (Web Worker)

**Status: BELUM DIMULAI.** `plugin:execute` saat ini memanggil
`main/plugins/plugin-loader.js` langsung di proses sidecar (paritas dengan
era Electron, sudah approval-gated).

Rencana: eksekusi kode plugin dipindah ke sandbox Web Worker ter-isolasi;
`plugins:list` tetap metadata-only (nama/deskripsi/actions, tidak mengeksekusi
kode). Kontrak response plugin tidak berubah, hanya lokasi eksekusi.

## Lanjutan B5 — Screenshot & Telegram send native — SELESAI (2026-09-03)

`take-screenshot` native sudah ada; rantai pengirimannya ke Telegram kini
komplit native: `misc_take_screenshot` (PNG base64) -> `telegram_send_photo`
(multipart `sendPhoto` Bot API, batas 10MB) -> broadcast ke `tgAdminIds`.
Token bot dikirim renderer ke `telegram_configure` lewat `syncConfig` (sebelumnya
tidak ada pemanggilnya sehingga semua perintah `telegram_*` gagal "token kosong").
Pemetaan lengkap + alasan: `MIGRATION-GAPS.md` bagian "Jalur Telegram native".

## Pembersihan dead code era Electron — SELESAI (2026-09-03)

- `sidecar/main/skills/skill-manager.js` — dihapus (tidak pernah di-import;
  paritas fitur sudah di `sidecar/engine/channels/skills.mjs`).
- `sidecar/main/telegram/telegram-service.js` — 3 handler `ipcMain.on`
  (`tg:trigger-screenshot`, `tg:trigger-music-download`, `tg:trigger-music-ui`)
  dihapus; impor electron/desktopCapturer/yts/ffmpeg ikut dibuang; path
  chat/admin ids pindah ke XDG `~/.local/share/mark/`.
- `awareness/window-tracker.js` — powerMonitor diganti `xprintidle` (fallback
  tidak idle). `google/google-service.js` — `app`/`shell` diganti XDG + `open`.

Motivasi: `electron` tidak ada di bun.lock; modul yang mengimpornya gagal
load saat channel dipakai (lazy import menyembunyikan ini dari smoke test).

## Aturan pengerjaan fase baru

1. Channel baru WAJIB didaftarkan di `sidecar/engine/registry.mjs`-style
   (`on()` di modul `engine/channels/`, import di `engine.mjs`) — jangan
   menulis stdout langsung dari modul.
2. Aksi destruktif WAJIB masuk `APPROVAL_ACTIONS` di
   `src-tauri/src/cmd_node_bridge.rs`.
3. Perbarui `../ARCHITECTURE.md` (tabel registry + alur data) di PR yang sama.
4. Perbarui tabel "Sengaja ditunda" di `../MIGRATION-GAPS.md` saat fase
   selesai — stub yang sudah diganti harus dihapus dari daftar.