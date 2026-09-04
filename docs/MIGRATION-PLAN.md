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

**Status: SELESAI di sisi renderer; sidecar os-* TOOLS kini memakai
implementasi REAL pc-agent.js (sebelumnya stub gagal permanen).**

Renderer memakai perintah Rust langsung: `os_read`, `os_click`, `os_type`,
`os_key`, `os_scroll`, `os_open`, `os_list_windows`, `os_focus_window`,
`os_ask`, `os_is_x11` (`invoke('os_*')` dari `src/api/tauri-bridge.js`).

Loop AI tidak memanggil perintah Rust itu langsung — ia memanggil tool
`os-*` lewat `native-tool:execute`. Karena itu handler di
`sidecar/main/node-tools.js` kini di-wire ke implementasi real
`pc-agent.js` (daemon `linux-daemon.py` + fallback bash `linux-action.sh`/
`read-ui.sh`/`ocr-region.sh`): `os-read`, `os-click`, `os-double-click`,
`os-type`, `os-key`, `os-scroll`, `os-delay`, `os-search`, `os-open`,
`os-list-windows`, `os-focus-window`, `os-ask`, `os-control-open`,
`os-control-close`. Tanpa sesi (belum `os-control-open`) semua handler
fail-fast — tidak ada sukses palsu.

Channel sidecar `os:*` (`sidecar/engine/channels/music.mjs`, daftar
`unsupported`) tetap fallback era lama — jalur tool AI adalah
`native-tool:execute`, bukan channel `os:*`.

**Emergency stop `Ctrl+Shift+S` kini end-to-end:** Rust
(`pc-emergency-stop` event) → renderer (`useMarkState` listener +
`window.api.pcEmergencyStop`) → channel sidecar `os:emergency-stop` →
`triggerEmergencyStopExternal()` (kill daemon + tandai stop di
pc-agent; reset eksplisit via `os-control-open`/`os-ask`).

## Fase C3 — Browser automation multi-session (browser:*)

**Status: BELUM DIMULAI (stub eksplisit). Rencana tahapan final (2026-09-03).**

Keputusan arsitektur (dua jalur, A primer):

- **Jalur A — Ekstensi browser + CDP attach (PRIMER).** Mark memasang
  ekstensi Chrome/Chromium (pola [BrowserMCP](https://github.com/BrowserMCP/mcp),
  pendekatan browser-use/manus: kontrol browser yang sudah login, profil user
  menempel sehingga tidak perlu login ulang). Ekstensi berkomunikasi dengan
  sidecar via **native messaging** atau WebSocket lokal (127.0.0.1), sidecar
  menerjemahkan `browser:*` menjadi perintah DOM/CDP ke ekstensi. Keuntungan:
  CDP stabil, sesi/cookie user asli, tanpa spawn browser kedua.
- **Jalur B — Spawn Chromium sendiri (FALLBACK).** Paritas upstream
  (`browser-agent.js` lama): `spawn` Chromium dengan `--remote-debugging-port`
  + user-data-dir terpisah per sub-agent. Dipakai otomatis bila ekstensi
  tidak terpasang/tidak terhubung.

Titik masuk implementasi (urutan kerja):

1. `sidecar/engine/channels/music.mjs` — ganti stub loop `browser:*`
   (`browser:navigate`, `browser:read-dom`, `browser:action`, `browser:close`,
   `browser:show`) dengan dispatcher ke transport baru; kontrak response
   TIDAK berubah (renderer & `subagentExecutor` tidak perlu sentuh).
2. Baru: `sidecar/main/browser/transport.mjs` — koneksi WS/native-messaging
   ke ekstensi (Jalur A) DAN launcher Chromium CDP (Jalur B); pilih Jalur A
   bila ekstensi handshake OK, jatuh ke Jalur B otomatis.
3. Baru: `extension/` di root repo — manifest v3 + content script
   (tag elemen interaktif ala `browser-agent.js`: maks 80 elemen,
   `data-mark-id`, baca DOM, eksekusi aksi klik/scroll/capture).
4. `src-tauri/` — TIDAK dibutuhkan untuk Jalur A (murni sidecar + ekstensi);
   Jalur B hanya butuh spawn proses yang sudah aman lewat `run-shell` gate.
   Approval: aksi `browser:*` destruktif (submit form, download) WAJIB
   masuk `APPROVAL_ACTIONS` di `cmd_node_bridge.rs` bila lewat channel baru.
5. `src/components/core/BrowserPreviewWidget.jsx` — preview holo-card
   menampilkan screenshot per sesi (dikirim ekstensi/CDP sebagai base64,
   jalur sama dengan `misc_take_screenshot`).

Verifikasi wajib (anti-respons palsu): setiap channel menjalankan frame
smoke nyata terhadap halaman uji lokal — navigate → read-dom (jumlah elemen
tagged > 0) → action (klik mengubah state DOM terverifikasi) → close.
Stub `unsupported` hanya boleh tersisa bila transport mati, dan pesannya
harus eksplisit menyebut penyebabnya.

Paritas sub-agent: `sessionId` sub-agent sudah dipropagasi sampai channel
`browser:*` — Jalur A memetakan 1 sessionId = 1 tab; Jalur B = 1 profil
Chromium terpisah per sessionId.

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