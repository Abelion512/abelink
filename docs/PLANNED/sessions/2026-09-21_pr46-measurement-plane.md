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

## Patch pasca-review (blokir & cacat pengukuran)

Review eksternal menahan PR46: dua blocker (eksperimen A dan B tidak benar-benar
bisa dijalankan) plus tiga cacat pengukuran. Patch ini memperbaikinya TANPA
subsystem baru; seksi di atas tetap catatan asli, bagian ini yang berlaku.

| Temuan | Root cause | Fix |
|---|---|---|
| **Blocker 1** - ablasi browser palsu | `representation` hanya label fixture; `browser-read` selalu memanggil `formatBrowserObservation()` | Switch nyata: `extension/browser-observation.mjs` mengekspor `OBSERVATION_REPRESENTATIONS`, `resolveObservationRepresentation()`, `renderBrowserObservation()`; `sidecar/main/tools/browserTools.mjs` membaca `ABELINK_BROWSER_OBSERVATION`; adapter mengekspornya per-run dari `task.representation`. Default tetap semantic-first. `validateAblationPair()` menolak representasi yang tidak bisa dirender (`runtimeSupported`). |
| **Blocker 2** - eksperimen A tidak runnable | arm `baselineArch: 'basic'` vs `candidateArch: 'pr45'`; `pr45` bukan nilai `ARCH_VALUES`, dan `comparison.valid = Boolean(modelIdentity)` | Arm jadi `vanilla` (model-only/pre-PR45) vs `basic` (runtime PR45) + label `behavior`; `compareArmReports()` mewajibkan kedua arm terukur dengan identitas identik; `run.mjs` menerima `--baseline-report`. `comparison.valid` hanya `true` bila eksplisit, dengan `reason` (`baseline-arm-missing`/`identity-mismatch`/`same-architecture`). |
| Cacat 3 - `architectureCommit` selalu null | `run.mjs` tidak mengirim `config.commit` | `resolveArchitectureCommit()` (`git rev-parse HEAD`) → `identity.architectureCommit` + `…Short` + `…Dirty`; gagal git = `null`, tidak dikarang. |
| Cacat 4 - `runId` bukan per-run | satu `runId` dipakai semua task/iterasi | `benchmarkRunId` (sesi) + `executionId` (`<sesi>-<taskId>-r<n>@<effort>`) di evidence & metrik; agregat melaporkan `executionCount`. |
| Cacat 5 - mislabel metrik | `repeatedActions/toolCalls` dilabeli `unnecessaryActionRate` | Dilaporkan sebagai `repeatActionRate`; `unnecessaryActionRate` = `null` + `unnecessaryActionRateReason` sampai ada instrumentasi yang benar-benar membedakannya. |
| Oracle riset longgar | `research-03` tidak mewajibkan `read-file`; `research-06` hanya butuh satu pasangan klaim↔sumber | `research-03` mewajibkan `read-file`+`write-file`; `research-06` mewajibkan tiga pasangan klaim↔sumber berdekatan (`pairedWithin()`). |
| Lane reuse mudah ditafsirkan berlebih | `pr46-reuse-*` membaca artefak sesi sebelumnya, bukan memory/skill persisten | Tiap fixture reuse mencatat `reuseKind: 'artifact-mediated'`, `measuredClaim`, dan `notMeasured` (`PR46_LANE_CLAIMS`). Lane & jumlah tetap 4 sesuai kontrak. |

Files tambahan pada patch ini: `extension/browser-observation.mjs`,
`sidecar/main/tools/browserTools.mjs`, `evaluation/abelink-adapter.mjs`,
`evaluation/evidence.mjs`, `evaluation/metrics.mjs`, `evaluation/pr46-matrix.mjs`,
`evaluation/pr46-experiments.mjs`, `evaluation/run.mjs`,
`evaluation/terminal-bench.mjs`, `evaluation/smoke.mjs`, 4 test PR46,
`tests/browser-observation.test.mjs`, `docs/ARCHITECTURE.md`,
`evaluation/README.md`.

Verifikasi patch: `bunx vitest run tests/pr46-*.test.mjs tests/browser-observation.test.mjs`
→ 75 pass; `node evaluation/smoke.mjs` → LOLOS; suite penuh + lint + build di
bagian verifikasi PR.

Masih belum: hasil terukur apa pun (tidak ada provider nyata yang dijalankan di
sesi ini), verdict `objectiveVerifier` runtime di adaptor, kanal intervensi
manusia, dan memory/skill reuse lintas-sesi sungguhan.

## Pembaruan dokumentasi (sesi yang sama, tanpa perubahan kode)

Dokumentasi disinkronkan dengan kondisi repo sekarang:

| Dokumen | Perubahan |
|---|---|
| `AGENTS.md` | Bullet Evaluation memuat measurement plane PR46 + perintahnya; tambah subsection invarian **«PR46 Measurement Plane (evaluation/) — aturan anti-fabrikasi»** (oracle otoritatif, perbandingan butuh dua arm, identitas model/eksekusi exact, commit arsitektur, switch representasi, larangan fabrikasi metrik, lane reuse artifact-mediated). |
| `docs/README.md` | Entri baru (12) untuk kontrak `PLANNED/2026-09-21_agent-benchmark-matrix.md` + `…_runtime-standards-adaptation.md`; nomor ganda lama (`8.` dua kali) diperbaiki jadi 13. |
| `docs/PLANNED/2026-09-21_agent-benchmark-matrix.md` | Seksi **Status implementasi (2026-09-20)**: tabel kontrak → implementasi + deviasi yang didokumentasikan (reuse artifact-mediated, verdict runtime belum diekspos, belum ada hasil terukur, token/human interventions `null`). |
| `PROJECT-STATUS.md` | Diperbarui: milestone measurement plane, angka kesehatan terverifikasi (126 file / 1287 pass, lint 0 error, build OK, smoke LOLOS), keputusan terakhir (oracle otoritatif, satu agregat bukan klaim rilis, metrik tak difabrikasi), langkah berikut. Klaim lama yang salah (docs internal di-gitignore, suite 398 pass/24 fail) dikoreksi. |
| `TASK.md` | Status sesi di-refresh (main @ `9f8ffdb`, PR #46 head `d43a235`, patch review belum di-push), 3 keputusan owner yang menunggu, topik berikutnya; heading «Topik berikutnya» yang terduplikasi dihapus. |

`CHANGELOG.md` sengaja TIDAK disentuh: file itu dihasilkan `scripts/release-helper.mjs` saat release prepare.

## Langkah aman berikutnya

1. Jalankan `run.mjs --suite pr46 --runs 3` pada baseline `main` dan kandidat
   PR45 dengan model/provider/version identik, lalu bandingkan
   `report.measurement`.
2. Jalankan ablasi `pr46-browser-04` vs `pr46-browser-05` untuk mengukur efek
   representasi semantic-first.
3. Bila butuh verified-success dari runtime, ekspos verdict `objectiveVerifier`
   ke adapter sebagai perubahan kecil terpisah (bukan bagian PR46).
