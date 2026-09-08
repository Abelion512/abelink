# Mark Browser Extension (Fase C3 — Jalur A)

Ekstensi Chrome/Chromium yang menghubungkan browser user (dengan profil dan
login yang sudah ada) ke sidecar Mark lewat HTTP lokal `127.0.0.1`.

> Prasyarat: aplikasi Mark HARUS berjalan (binary atau `bun run app`) —
> server bridge hidup di dalam sidecar. Tanpa Mark berjalan, extension
> tidak tersambung ke apa pun (pill merah, "sidecar tidak terjangkau").

**Status: jalan di jalur baru, BELUM lolos smoke frame end-to-end.** Sesuai
aturan `docs/MIGRATION-PLAN.md`, smoke frame nyata (navigate -> read-dom ->
action -> close) terhadap browser sungguhan baru dilakukan setelah langkah
verifikasi manual di bawah dijalankan. Unit test protokol ada di
`tests/browser-bridge.test.mjs` (queue/dispatch/resolve/timeout — tanpa
browser).

## Cara pakai (dev)

1. Jalankan Mark (sidecar hidup). Saat channel `browser:*` pertama dipakai,
   sidecar menulis token ke `~/.local/share/browser-bridge-token`
   (mode 0600) + memasang native host (`~/.config/google-chrome/` atau
   `chromium/.../NativeMessagingHosts/id.mark.bridge.json`, otomatis).
   Untuk memaksa token dibuat, panggil channel `browser:status`
   (mis. lewat `bun run harness` + frame `{"id":1,"action":"browser:status","payload":[]}`).
2. Buka `chrome://extensions` -> aktifkan **Developer mode** ->
   **Load unpacked** -> pilih folder `extension/` ini.
   ID extension harus `kdcfgmlamndkapaiakhlplckfhmjieml` (di-pin via field
   `key` di manifest; bila beda, native host tidak akan tersambung).
3. Klik ikon Mark Bridge -> klik **Sambungkan** (token diambil otomatis
   via helper lokal; tempel manual hanya bila helper belum terpasang).
4. Dari Mark: `browser:navigate` ke sebuah URL -> ekstensi membuka tab
   baru dalam group, men-tag elemen interaktif (maks 80, `data-mark-id`),
   lalu `browser:action` mengeksekusi klik/type pada `markId` yang dipilih.

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

## E2E manual (checklist, ±10 menit)

Jalankan berurutan. Setiap langkah ada output yang diharapkan — kalau beda,
berhenti dan catat, jangan lanjut.

1. **Sidecar hidup + bridge start.** Terminal 1:
   `echo '{"id":1,"action":"browser:status","payload":[]}' | bun run harness`
   Diharapkan: baris `engine:ready` memuat `browser:status`, baris
   `[BrowserBridge] listening on 127.0.0.1:49712`, dan respons
   `{"id":1,"success":true,"data":{"ready":true,"port":49712,...}}`.
2. **Token ada.** `ls -l ~/.local/share/browser-bridge-token`
   Diharapkan: file ada, mode `-rw-------` (0600).
3. **Handshake ditolak tanpa token benar.**
   `curl -s 'http://127.0.0.1:49712/mark-bridge/handshake?session=default&token=salah'`
   Diharapkan: `{"ok":false,...}` dengan HTTP 401.
4. **Load extension.** `chrome://extensions` → Developer mode → Load unpacked
   → folder `extension/`. Klik ikon Mark Bridge → tempel isi file token →
   Sambungkan. Diharapkan: popup tidak menampilkan error 401.
5. **Smoke frame (browser terbuka).** Terminal 2, `bun run harness`, lalu
   kirim per baris (satu frame satu baris):
   - `{"id":2,"action":"browser:navigate","payload":["https://example.com"]}`
     → sukses, tab example.com terbuka.
   - `{"id":3,"action":"browser:read-dom","payload":[]}`
     → sukses, ada `elements` (maks 80).
   - `{"id":4,"action":"browser:close","payload":[]}`
     → sukses, sesi ditutup.
6. **Jalur negatif otomatis** (tanpa browser, untuk regresi):
   `bun test tests/browser-e2e.test.mjs`
   Diharapkan: semua pass (401/403/404/400/timeout + round-trip).

## Perilaku grup tab + penutupan

- Setiap tab yang dibuka Mark langsung masuk 1 grup sesi (bukan per-subagent).
- Judul grup = `(ikon) <task>`: `⏳` dikerjakan, `✅` selesai, `❌` gagal.
- Task selesai → grup ditandai; tab **dibiarkan terbuka** kecuali
  `browserAutoCloseTabs` aktif di Configuration (default mati). Tab gagal
  selalu dibiarkan untuk inspeksi. Tab manual user tidak pernah disentuh.
- Tombol popup **"Tutup tab task ini"** menutup tab grup aktif kapan pun.

## Skenario klik (E2E dengan browser)

1. Sambungkan extension (langkah 1-4 runbook di atas).
2. Dari Mark: *"buka https://example.com"*, lalu *"baca elemennya"*.
   Diharapkan: tab **baru** dalam group `⏳ ...`, daftar `mk1..mkN`.
3. Klik: *"klik ..."*. Diharapkan: klik beneran di tab (bukan curl),
   respons berisi DOM terbaru sebagai bukti.
4. Anti salah-klik: ID angka (`3`) dinormalisasi ke `mk3`; elemen yang
   tidak ada → error eksplisit menyuruh read-dom ulang, bukan klik buta.
   Tanpa extension: click/type/screenshot gagal jujur dengan petunjuk.
