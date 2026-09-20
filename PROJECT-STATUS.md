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

## Kesehatan terakhir (terverifikasi 2026-09-20)

- Scope effort + bench: 113 pass, 0 fail
  (`tests/effort-fixtures` + `effortOverride` + `effortEstimator` +
  `bench-contract` + `bench-capture`).
- Full suite (vitest): 115 passed, 2 skipped (117 test files), 1174 passed, 16 skipped (1190 tests), 0 fail.
  16 pre-existing tests in trading budget/wallet dipisahkan ke `test:known-issues` via `describe.skip`.
- Gate rilis: `bash scripts/verify.sh` lolos bersih (0 fail).

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
