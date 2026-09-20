# Session 2026-09-21 - PR46: measurement plane + 30-fixture benchmark matrix

## Ringkasan

**Keywords:** PR46, measurement plane, evidence record, per-run metrics, benchmark
matrix, 30 fixture, browser representation ablation, architecture A/B, model
identity, oracle independence, anti-cheat, research/browser/os/study/recovery/
cross-session reuse lanes.

- **Tanggal:** 2026-09-21 · **Branch:** `feat/typed-evidence-plane-agent-benchmark-matrix` · **Base:** `main` @ `9f8ffdb` (PR #45 merged).
- Scope: mengukur apakah adaptasi runtime PR #45 benar-benar memperbaiki reliabilitas. PR46 adalah lapisan pengukuran, BUKAN redesign runtime.
- Kontrak yang dipakai: `docs/PLANNED/2026-09-21_agent-benchmark-matrix.md` dan `docs/PLANNED/2026-09-21_runtime-standards-adaptation.md`.

## Keputusan

1. **Thin normalizer, bukan subsystem baru.** Observasi tool yang sudah ada
   (stepLog + trace adapter) dinormalkan menjadi record bukti in-memory
   (`evaluation/evidence.mjs`). Tidak ada datastore baru, tidak ada skema Dexie.
2. **Reuse sinyal runtime.** Stagnasi/repeat memakai `progressEvaluator.js`
   (`evaluateProgress`, `observationFingerprint`, `normalizeProgressKey`);
   kosakata verified memakai `objectiveVerifier.js`
   (`VERIFICATION_STATE`, `isIndependentlyVerified`). Tidak menduplikasi logika.
3. **Laporan pengukuran membungkus, bukan mengganti.** `buildMeasurementReport`
   membungkus output `aggregateRuns` yang sudah ada; `schemaVersion: 3` laporan
   lama tidak berubah, smoke existing tetap hijau.
4. **Runner di-reuse.** `runTask` menerima `registry` yang injectable;
   `run.mjs --suite pr46` menjalankan matriks tanpa fork orchestrator.
5. **Task success vs verified success dipisah.** Oracle world-state tetap
   otoritatif; jawaban akhir model ditandai `finalAnswerIsClaim: true`.
   `independentlyVerifiedSuccess` hanya true bila oracle independen.
6. **Tidak menebak metrik.** Adapter tidak mengekspos token usage, verdict
   `objectiveVerifier`, atau kanal intervensi manusia: nilainya `available:false`
   / `null`, bukan 0 atau estimasi.
7. **Fixture tidak menduplikasi registry lama.** Semua 30 id PR46 diuji tidak
   bertabrakan dengan `ALL_TASKS` / `ARCH_TASKS`; tiap fixture punya tag
   `variant` unik (kecuali pasangan ablasi yang memang harus identik).

## Files

Baru:
- `evaluation/evidence.mjs` - normalisasi record bukti + ledger + provenance chain.
- `evaluation/metrics.mjs` - metrik per-run, agregat, `abelinkbench-measurement-report`.
- `evaluation/pr46-matrix.mjs` - 30 fixture (6/5/5/5/5/4) + seeder + oracle world-state.
- `evaluation/pr46-experiments.mjs` - identitas model exact, integritas A/B, ablasi representasi.
- `tests/pr46-evidence.test.mjs`, `tests/pr46-metrics.test.mjs`, `tests/pr46-matrix.test.mjs`, `tests/pr46-experiments.test.mjs`.
- `docs/PLANNED/sessions/2026-09-21_pr46-measurement-plane.md` (file ini).

Diubah:
- `evaluation/terminal-bench.mjs` - `runTask` menerima `registry` + `runId` + `modelIdentity`; menempel `evidence` + `metrics` (aditif).
- `evaluation/run.mjs` - `--suite legacy|pr46`, `--model-version`, `--measurement-out`; seeding per-suite; menyisipkan `report.measurement`.
- `evaluation/smoke.mjs` - assertion PR46 (matriks, ablasi, identitas model, evidence+metrik, oracle dunia).
- `docs/ARCHITECTURE.md` - bullet measurement plane PR46.
- `evaluation/README.md` - komponen + cara menjalankan + batasan eksplisit.

## Verifikasi

- `bunx vitest run tests/pr46-*.test.mjs` → 54 pass.
- `node evaluation/smoke.mjs` → LOLOS (termasuk 5 blok PR46 baru).
- `bunx vitest run` → 126 file, 1269 pass.
- `bun run lint` → 0 error (warning tech-debt existing tidak berubah; file PR46 bersih).
- `bun run build` → vite build sukses.
- Rust tidak disentuh, jadi `cargo check`/`clippy` tidak diperlukan.

## Batasan dikenal

- **Belum ada hasil terukur.** PR46 menyediakan alat, bukan klaim. Klaim "PR45
  meningkatkan runtime" hanya sah bila perbandingan terkontrol dijalankan pada
  provider nyata; itu belum dilakukan di PR ini.
- **Adapter tidak mengekspos verdict runtime.** `runtimeVerificationState`
  biasanya `not_run`; verified-success di sini bersumber dari oracle world-state
  harness, bukan verdict `objectiveVerifier` runtime. Gap didokumentasikan, tidak
  ditambal dengan mengarang nilai.
- **Intervensi manusia belum terinstrumentasi** di jalur adapter → `null`.
- **Lane browser** bergantung tool `browser-*`; oracle memakai bukti tool +
  konten halaman, bukan DOM mentah. Menjalankan lane browser sungguhan tetap
  butuh ekstensi terhubung (lihat `evaluation/README.md`).
- Fixture seed bersifat lokal/offline; situs web live tidak dipakai di oracle.

## Langkah aman berikutnya

1. Jalankan `run.mjs --suite pr46 --runs 3` pada baseline `main` dan kandidat
   PR45 dengan model/provider/version identik, lalu bandingkan
   `report.measurement`.
2. Jalankan ablasi `pr46-browser-04` vs `pr46-browser-05` untuk mengukur efek
   representasi semantic-first.
3. Bila butuh verified-success dari runtime, ekspos verdict `objectiveVerifier`
   ke adapter sebagai perubahan kecil terpisah (bukan bagian PR46).
