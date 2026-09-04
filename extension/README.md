# Mark Browser Extension (Fase C3 — Jalur A)

Ekstensi Chrome/Chromium yang menghubungkan browser user (dengan profil dan
login yang sudah ada) ke sidecar Mark lewat HTTP lokal `127.0.0.1`.

**Status: jalan di jalur baru, BELUM lolos smoke frame end-to-end.** Sesuai
aturan `docs/MIGRATION-PLAN.md`, smoke frame nyata (navigate -> read-dom ->
action -> close) terhadap browser sungguhan baru dilakukan setelah langkah
verifikasi manual di bawah dijalankan. Unit test protokol ada di
`tests/browser-bridge.test.mjs` (queue/dispatch/resolve/timeout — tanpa
browser).

## Cara pakai (dev)

1. Jalankan Mark (sidecar hidup). Saat channel `browser:*` pertama dipakai,
   sidecar menulis token ke `~/.local/share/mark/browser-bridge-token`
   (mode 0600). Untuk memaksa token dibuat, panggil channel `browser:status`
   (mis. lewat `bun run harness` + frame `{"id":1,"action":"browser:status","payload":[]}`).
2. Buka `chrome://extensions` -> aktifkan **Developer mode** ->
   **Load unpacked** -> pilih folder `extension/` ini.
3. Salin isi file token, klik ikon Mark Bridge, tempel token, klik
   **Sambungkan**.
4. Dari Mark: `browser:navigate` ke sebuah URL -> ekstensi membuka/memakai
   tab, men-tag elemen interaktif (maks 80, `data-mark-id`), lalu `browser:action`
   mengeksekusi klik/type pada `markId` yang dipilih.

## Model keamanan

- Bind **127.0.0.1 saja**, tanpa 0.0.0.0.
- Token acak per proses sidecar; endpoint menolak tanpa token (401).
- Origin fetch dibatasi `chrome-extension://` / `moz-extension://` (403 lain).
- Token disimpan di `chrome.storage.session` (hilang saat browser mati).
- Arah kepercayaan satu arah: sidecar -> ekstensi. Ekstensi tidak bisa
  mengeksekusi apa pun di mesin selain aksi DOM yang diminta channel.

## Arsitektur

```
engine/channels/browser.mjs   kontrak channel (navigate/read-dom/action/close/show/status)
main/browser/bridge-core.mjs  antrean per-session, inflight map, timeout, token
main/browser/server.mjs       HTTP 127.0.0.1: handshake / long-poll / result
extension/                    MV3: background long-poll + content injection
```

Perintah mengalir: channel `browser:*` -> `dispatchCommand()` (antrean +
inflight) -> long-poll diambil ekstensi -> `chrome.scripting` di tab ->
`POST /result` -> promise channel selesai.

## Keterbatasan saat ini (jujur)

- Satu ekstensi = satu browser. Multi-session tetap didukung di protokol
  (sessionId per perintah), tapi semua session di browser yang sama; untuk
  isolasi penuh antar sub-agent, Jalur B (spawn Chromium per profil) menyusul.
- Belum ada screenshot per-sesi untuk `BrowserPreviewWidget` (pola base64
  menyusul lewat `chrome.tabs.captureVisibleTab`).
- `browser-ask-user` era lama tidak ada di jalur ini (fail-fast, bukan palsu).
