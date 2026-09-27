# Session Log: B1+B2 — snapshot konten + stop-loop konten kosong

Tanggal: 2026-09-19 | Branch: `feat/browse-snapshot` | Status: selesai, siap merge

## Masalah (trajectory 2026-09-19: 35 read + 16 click untuk 1 soal, gagal T24)
- Tagger hanya 80 elemen interaktif + teks 80 char: teks soal/artikel tak pernah masuk observasi.
- Agen mengulang read/click/extract kosong 20+ giliran (burn token).
- Referensi: chrome-devtools-mcp take_snapshot/wait_for/fill_form; a11y tree Chrome; sumber TeX MathJax di DOM.

## Keputusan
- B1: snapshot konten (teks utama + TeX + gambar) via `browser-snapshot`; extract tanpa selector = teks utama; `browser-wait-for` (15 dtk). Tanpa permission debugger, tanpa CDP.
- B2: aturan stop-loop 3x kosong + fallback analyze-screen; deskripsi tool diperbarui.

## Berkas berubah
- `extension/background.js`: snapshotPageText/snapshotPage + case extract/snapshot/wait-for + return langsung.
- `sidecar/engine/channels/browser.mjs`: allowlist +2.
- `sidecar/main/tools/browserTools.mjs`: handler browser-snapshot/wait-for.
- `src/api/ai/planning.js`: aturan BACA KONTEN DULU + STOP-LOOP.
- `src/api/tools/group-tools.js`: deskripsi extract/snapshot/wait-for.
- Tests: browser-snapshot (4).

## Hasil verifikasi
- Baru: 4/4 hijau. Regresi browser: 74/74. ESLint: 0 error.
- Extension JS butuh Reload manual di chrome://extensions (service worker lama).

## Batasan dikenal
- Soal berupa gambar murni tetap butuh analyze-screen (aturan B2 mengarahkan).
- Snapshot dibatasi 8000 char; MathJax kompleks ambil sumber TeX-nya, bukan render.
