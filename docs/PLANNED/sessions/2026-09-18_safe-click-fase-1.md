# Session Log: Fase 1 — Klik Aman (jangkar teks)

Tanggal: 2026-09-18 | Branch: `feat/safe-click` | Status: selesai, siap merge

## Masalah
- os-click menembak koordinat OCR basi tanpa cek ulang (layar geser -> klik meleset).
- browser-click ID positional (akN = urutan dokumen); DOM bergeser -> ID lama menunjuk elemen salah.

## Keputusan
- Format jangkar opsional: `ID||teks` / `x||y||teks` (OS), `akN||teks` (browser).
- Ada jangkar: baca-ulang posisi + cocokkan teks (substring, case-insensitive); tidak cocok -> BATALKAN klik + pesan `lakukan *-read ulang`.
- Tanpa jangkar: perilaku lama persis (tanpa biaya tambahan).
- Deskripsi tool di prompt mengajar format jangkar sebagai WAJIB bila layar bisa bergeser.

## Berkas berubah
- `sidecar/main/pc-agent.js`: parseClickQuery + matchElementText + centerOf + clickAt; executeClick jalur jangkar (resolveCoordinates + double-click utuh).
- `sidecar/main/tools/browserTools.mjs`: parseClickTarget + elementTextMatches; click teruskan expectedText; tryExtensionAct opt-in raw.
- `extension/background.js`: actionFn click verifikasi sebelum dispatch event; act() teruskan expectedText.
- `src/api/tools/group-tools.js`: deskripsi browser-click + os-click.
- Tests: os-click-revalidate (18), browser-click-verify (11).

## Hasil verifikasi
- Baru: 29/29 hijau. Regresi browser (bridge/e2e/readRecovery) + toolCallCoverage: 63/63.
- ESLint: 0 error; warning = pre-existing (pc-agent 24, background 10 — via stash).

## Batasan dikenal
- tryExtensionAct masih menelan !ok->null untuk caller lain — hanya click-jangkar yang opt-out.
- Double-click OS belum dijangkar (jalur terpisah, susulan bila perlu).
- Pola soal-terverifikasi (baca-jawab-cek) level prompt, belum diwajibkan di planner.
