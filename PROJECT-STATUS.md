# PROJECT-STATUS — Abelink Agent Linux

> Dokumen publik untuk dibaca manager AI via GitHub. Sanitized: tanpa isi
> percakapan, tanpa detail internal. Diperbarui tiap sesi besar oleh agen lokal.
> Terakhir diperbarui: 2026-09-07.

## Milestone saat ini

- Stabilisasi `v1.0.0-alpha.x` di branch `linux` (lihat `docs/ROADMAP.md`).
- Migrasi Tauri fase A/B selesai; sisa B6/C3/C4 di `docs/MIGRATION-PLAN.md`.
- Sistem effort/budget (LOW–ULTRA + AUTO) terimplementasi + teruji deterministik
  (spesifikasi: `docs/effort-system-spec.md`).
- Benchmark arsitektur (`evaluation/bench/`) berjalan di stub boundary;
  otomatisasi penuh menunggu boundary ABELINK nyata (`boundary-spec.mjs`).

## Kesehatan terakhir (terverifikasi 2026-09-07)

- Scope effort + bench: 113 pass, 0 fail
  (`tests/effort-fixtures` + `effortOverride` + `effortEstimator` +
  `bench-contract` + `bench-capture`).
- Full suite: 398 pass, 1 skip, 24 fail — semuanya pre-existing di luar scope
  (trading budget/wallet, driver-tour `vi.stubGlobal`).
- Gate rilis: `bash scripts/verify.sh` sebelum push.

## Keputusan terakhir

- `ULTRA = MAX + orkestrasi workflow`, bukan sekadar token lebih besar.
- Benchmark menilai sinyal kontrol sistem (planning, tool, verifikasi, loop),
  bukan gaya bahasa.
- Repo public: docs internal (`docs/sessions/`, `tasks/`, `docs/PLANNED/`)
  di-gitignore; publik hanya mendapat lapisan sanitized seperti file ini.

## Langkah berikut

1. Boundary ABELINK nyata (`startRun`/`sendPrompt`/`endRun`/`abortRun`) agar
   benchmark arsitektur otomatis penuh.
2. Fase migrasi C3 (browser automation multi-session).
3. Packaging AppImage/.deb + auto-update CI.
