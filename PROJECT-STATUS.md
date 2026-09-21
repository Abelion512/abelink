# PROJECT-STATUS — Abelink Agent Linux

> Dokumen publik untuk dibaca manager AI via GitHub. Sanitized: tanpa isi
> percakapan, tanpa detail internal. Diperbarui tiap sesi besar oleh agen lokal.
> Terakhir diperbarui: 2026-09-20.

## Milestone saat ini

- Stabilisasi `v1.0.0-alpha.x` di branch `main` (versioning: `docs/RELEASE-VERSIONING.md`).
- Migrasi Tauri fase A/B selesai; sisa B6/C3/C4 di `docs/MIGRATION-PLAN.md`.
  Browser bridge Jalur A (ekstensi MV3) sudah LIVE dan fail-fast bila ekstensi
  belum terpasang; Jalur B (spawn Chromium per profil) masih rencana.
- Sistem effort/budget (LOW–ULTRA + AUTO) terimplementasi + teruji deterministik
  (spesifikasi: `docs/effort-system-spec.md`).
- **Measurement plane benchmark (PR #46)**: selain benchmark arsitektur
  (`evaluation/bench/`, masih berjalan di stub boundary), sekarang ada lapisan
  pengukuran AbelinkBench: record bukti berprovenance, metrik per-run, laporan
  machine-readable, dan matriks 30 fixture (research/browser/os/study/recovery/
  reuse) dengan oracle world-state deterministik. Perbandingan runtime A/B
  dijalankan sebagai dua arm terpisah dan hanya dinyatakan valid setelah seluruh
  dimensi tetap kontrak benar-benar terverifikasi. Kontrak: 
  `docs/PLANNED/2026-09-21_agent-benchmark-matrix.md`.

## Kesehatan terakhir (terverifikasi 2026-09-20, sesi patch PR #46)

- Full suite: 126 file test, 1294 test pass, 0 fail (`bunx vitest run`).
- Lint: `bun run lint` exit 0 — 0 error, 1004 warning (tech debt terdaftar,
  bukan kegagalan gate).
- Build renderer: `bun run build` (vite) sukses.
- Smoke benchmark tanpa network: `node evaluation/smoke.mjs` → LOLOS, termasuk
  assertion PR #46 (matriks 30 fixture, switch representasi, integritas
  perbandingan dua arm, identitas model exact).
- Rust tidak disentuh pada patch ini, jadi `cargo check`/`clippy` tidak dijalankan
  ulang di sesi tersebut. Gate rilis penuh tetap `bash scripts/verify.sh`.

## Keputusan terakhir

- `ULTRA = MAX + orkestrasi workflow`, bukan sekadar token lebih besar.
- Benchmark menilai sinyal kontrol sistem (planning, tool, verifikasi, loop),
  bukan gaya bahasa.
- **Oracle otoritatif, jawaban model hanya klaim.** Verified-success hanya sah
  bila datang dari oracle world-state yang independen; final answer tidak pernah
  menjadi bukti.
- **Satu angka agregat bukan klaim rilis.** Perbandingan valid hanya bila
  KEDUA arm benar-benar terukur (report pengukuran dengan minimal satu eksekusi —
  identitas saja bukan bukti ada yang berjalan) dan seluruh dimensi tetap
  kontrak identik: provider, model, versi model, prompt, protocol, tools,
  permission, fixture, effort, budget, environment, verifier. Dimensi yang tidak
  terekam membuat perbandingan tetap tidak valid, karena "tidak diperiksa" bukan
  "cocok". Identitas model wajib exact — alias seperti `latest` ditolak.
- **Metrik yang tidak terekspos runtime tidak difabrikasi**: token cost dan
  intervensi manusia dicatat `null`/`available:false`.
- Lane cross-session reuse di matriks diukur sebagai artifact-mediated reuse
  (artefak sesi sebelumnya), bukan reuse memory/skill persisten.
- Dokumentasi internal (`docs/PLANNED/`, `docs/sessions/`) ikut ter-track di
  repo; dokumen ini tetap lapisan ringkas untuk pembaca non-teknis.

## Langkah berikut

1. **Sambungkan sumbu arsitektur ke jalur eksekusi benchmark.** Harness saat ini
   menggerakkan sidecar langsung, sementara supervisor + verification gate hanya
   ada di renderer, jadi `--arch vanilla` dan `--arch basic` berjalan identik di
   sana. Sampai itu tersambung, eksperimen arsitektur A/B tetap deferred dan
   harness menolak melaporkannya sebagai valid (`ARCH_AXIS_IN_BENCH_PATH = false`
   -> `architecture-not-executed-by-harness`).
2. Jalankan perbandingan dua arm pada provider nyata (baseline `--arch vanilla`
   vs kandidat `--arch basic`) setelah nomor 1 selesai, lalu laporkan hasilnya.
2. Ekspos verdict `objectiveVerifier` runtime ke adapter benchmark agar
   verified-success juga bisa berasal dari runtime (perubahan kecil terpisah).
3. Boundary ABELINK nyata (`startRun`/`sendPrompt`/`endRun`/`abortRun`) agar
   benchmark arsitektur `evaluation/bench/` otomatis penuh.
4. Packaging AppImage/.deb + auto-update CI.
