# Session Log: E1+E2+E3 — Extension 401 clarity

Tanggal: 2026-09-18 | Branch: `feat/extension-401-clarity` | Status: selesai, siap merge

## Masalah (screenshot popup: Dev:49713 "Token ditolak sidecar (401)")
- Token basi setelah restart/rotasi; extension baru sadar saat ditolak.
- Semua 401 satu pesan generik "Sambungkan ulang".
- Rem launch bisu: agen terima no-handshake generik lalu mengulang xdg-open.

## Keputusan
- E2: kode sebab 401 (token-stale/unknown/session-unknown) dari server ke popup+poll.
- E1: handshake 401 token-stale -> ambil via helper + handshake ulang OTOMATIS sekali.
- E3: launchBlockMessage(reason) -> instruksi berhenti+lapor per alasan.

## Berkas berubah
- `bridge-core.mjs`: TOKEN_REJECT_* + tokenRejectReason (tokenOk utuh).
- `server.mjs`: reason di 4 respons 401.
- `background.js`: pesan sebab + auto-retry helper + sebab di poll-401.
- `browserTools.mjs`: LAUNCH_REASON_HINT + launchBlockMessage + navigate pakai itu.
- Tests: bridge +1 (sebab), readRecovery +2 (E3).

## Hasil verifikasi
- 6 file bridge: 90/90 hijau. ESLint: 0 error.
- Pesan "Enable browser extension in Capabilities" yang dikutip user = parafrase model dari NO_EXTENSION_HINT (bukan string kode) — kini pesannya spesifik per alasan.

## Batasan dikenal
- Auto-retry helper 1x; bila helper tak ada -> pesan manual (tetap butuh klik).
- Muat ulang extension di Chrome perlu user klik Reload bila background.js berubah.
