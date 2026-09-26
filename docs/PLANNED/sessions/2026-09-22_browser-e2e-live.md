# Session 2026-09-22 — E2E browser live (sidecar + Brave + extension)

Mode: build. User minta saya jalankan sendiri via CLI + screenshot.

## Temuan kunci

- Google Chrome stable MENOLAK `--load-extension` (log: "not allowed,
  ignoring"). Extension tidak ke-load, ID acak yang muncul = Hangouts bawaan.
- Brave (`/opt/brave.com/brave/brave`, Chromium) menerima `--load-extension`:
  extension ter-load dengan ID terpin `kdcfgmlamndkapaiakhlplckfhmjieml`
  (derivasi sha256 key manifest cocok).

## Driver: scripts/e2e-browser-live.mjs (throwaway, bukan test suite)

- Spawn sidecar engine via bun child + stdio JSON-RPC.
- Launch Brave headful + extension repo + CDP port 9334.
- Buka popup.html sebagai tab via CDP, klik pairing, screenshot tiap tahap
  via `Page.captureScreenshot`.
- `browser:navigate` + `read-dom` via sidecar RPC.

Perbaikan saat jalan: retry tunggu service worker MV3, parse defensif
respons CDP, method PUT untuk `/json/new`.

## Hasil E2E (humanless, browser sungguhan)

- Popup: Prod 49712 aktif, pairing sekali → `tersambung`,
  `Session: default @ 127.0.0.1:49712 [prod:49712 terpin]`.
- Navigate `https://example.com` via sidecar: ok, tab terbuka dalam grup,
  1 elemen ter-tag (`ak1`).
- Read-dom: ok, 1 elements.
- Screenshot `/tmp/abelink-e2e/`: popup-open, after-connect, example-com
  (+ overlay "Abelink bekerja di tab ini" + Stop).

## Berkas

- `scripts/e2e-browser-live.mjs` (driver, bisa dipakai ulang).
- `docs/PLANNED/2026-09-22_browser-handshake-scenarios.md` (checklist manual,
  tetap opsional).

## Batasan dikenal

- Profil uji terpisah (`/tmp/abelink-ext-e2e`), bukan profil harian user.
- Chrome stable butuh instalasi manual via chrome://extensions (by design
  Google); otomatisasi load-unpacked hanya di Chromium/Brave.
- `pkill -f <pola>` tanpa bracket self-match membunuh shell sendiri —
  selalu pakai pola `[x]yz`.
