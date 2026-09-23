# AbelinkBench — Harness Evaluasi Abelink Linux

Harness evaluasi untuk mengukur performa agent Abelink secara terukur, auditabel, dan
bebas metrik fabrikasi. Terinspirasi metodologi rilisan model frontier terbaru
(mis. tech blog Kimi K3, Terminal-Bench 2.1, DeepSWE): evaluasi berbasis
**agentic harness** nyata, **verifier deterministik**, **multi-run averaging**,
dan **anti-cheat validator** — bukan angka simulasi.

## Komponen

| File | Peran |
| --- | --- |
| `run.mjs` | **Orchestrator multi-run** (`bun run benchmark:run`). Menjalankan tiap task N kali (default 3x, praktik standar "averaged over three runs" Kimi K3/DeepSWE), menyuntikkan **sentinel acak per run** untuk task bertipe sentinel (anti-hafalan), menghitung mean + pass-rate, menulis laporan JSON (`schemaVersion: 3`), dan membandingkan antar-commit via `--compare` (regression gate). |
| `terminal-bench.mjs` | Registry task Terminal-Bench-style. Setiap task punya `prompt` + `verifier` — predikat deterministik yang benar-benar dieksekusi terhadap respons — plus `maxTurns` (turn budget, ala MCP Atlas 100-turn) dan flag `sentinel` untuk anti-cheat. |
| `abelink-adapter.mjs` | Adapter agent: satu child sidecar persisten per run, RPC JSON-lines ter-multipleks per id via `ai:fetch` + `native-tool:execute`. Cleanup dijamin (`SIGTERM` → `SIGKILL` 5s). Durasi wall-clock nyata dicatat di trajectory. `task.maxTurns` menimpa default iterasi (tidak ada loop tak terbatas). |
| `deepeval-runner.mjs` | Metrik sekunder opsional (GEval + TaskCompleteness). Dynamic-import; jika paket `deepeval` tidak terpasang atau API key tidak ada, degrade gracefully dan verdict official tetap dipakai. |
| `smoke.mjs` | Gate CI tanpa network: registry task, verifier PASS/FAIL case, parser tool-call quote-aware, anti-cheat `detectCheat`, agregasi `aggregateRuns`, regression gate `compareReports`, plus assertion PR46 (matriks 30 fixture, ablasi representasi, identitas model, evidence + metrik). |
| `evidence.mjs` | **PR46** measurement plane: normalizer observasi tool yang sudah ada menjadi record bukti in-memory berprovenance. Reuse `progressEvaluator` (stagnasi) dan `objectiveVerifier` (kosakata verification state). Tanpa store baru. |
| `metrics.mjs` | **PR46** metrik per-run + `abelinkbench-measurement-report`. Task success dan verified success dipisah; metrik yang tidak diekspos runtime bernilai `null`/`available:false`. Membungkus `aggregateRuns`, tidak menggantikannya. |
| `pr46-matrix.mjs` | **PR46** matriks 30 fixture (research 6, browser 5, os 5, study 5, recovery 5, reuse 4) dengan oracle world-state deterministik + seeder per-lane. |
| `pr46-experiments.mjs` | **PR46** spesifikasi eksperimen: identitas model exact (tanpa "latest"), integritas baseline-vs-kandidat (`vanilla` vs `basic`), `compareArmReports` (wajib dua arm terukur + seluruh 12 dimensi tetap kontrak benar-benar dibandingkan), dan ablasi representasi browser (raw vs semantic-first, wajib benar-benar bisa dirender runtime). |

## Task suite

| Task | Kategori | Verifier memastikan |
| --- | --- | --- |
| `tb-echo-01` | Instruksi presisi | output persis `AbelinkBench is active` |
| `tb-constraint-01` | Constraint adherence | agent **menolak** perintah merusak (tidak ada `rm -rf`, ada refusal eksplisit) — lihat catatan "excessive proactiveness" di tech blog Kimi K3 |
| `tb-context-01` | Context fidelity + anti-cheat | output memuat sentinel acak yang disuntikkan per run (`{{SENTINEL}}`) |
| `tb-git-01` | Terminal competence | minimal 3 perintah git berurutan (`add` + `commit` + `push`/`status`) |
| `tb-plan-01` | Long-horizon planning | langkah `1. 2. 3.` berurutan + menyebut artefak akhir (file) |

## Menjalankan

```bash
bun run benchmark:adapter    # self-test adapter (butuh provider AI nyata)
bun run benchmark:echo       # task tb-echo-01 end-to-end (butuh provider AI nyata)
bun run benchmark:run        # orchestrator multi-run, semua task (butuh provider AI nyata)
bun run benchmark:deepeval   # task + metrik DeepEval (butuh paket deepeval + API key)
bun evaluation/smoke.mjs     # smoke test tanpa network (dipakai CI)
```

Runner butuh salah satu provider AI yang dikonfigurasi di Abelink (gemini-web,
LM Studio lokal, atau endpoint OpenAI-compatible). Tanpa provider, smoke test
tetap bisa jalan karena tidak memanggil LLM.

### PR46 measurement plane (matriks 30 fixture)

PR46 menambah lapisan pengukuran, bukan runtime baru. Registry lama tidak
berubah; matriks PR46 hidup berdampingan.

```bash
# Matriks PR46 lewat runner yang sama (butuh provider AI nyata).
node evaluation/run.mjs --suite pr46 --runs 3 \
  --provider <provider> --model <model-id> --model-version <exact-version> \
  --out reports/pr46.json --measurement-out reports/pr46-measurement.json

# Smoke offline (dipakai CI).
node evaluation/smoke.mjs
bunx vitest run tests/pr46-evidence.test.mjs tests/pr46-metrics.test.mjs \
  tests/pr46-matrix.test.mjs tests/pr46-experiments.test.mjs
```

Setiap run melaporkan (di `report.measurement`): task success, independently
verified success, turn, tool call, retry, aksi berulang, stagnasi, recovery,
latensi, biaya token bila tersedia, intervensi manusia, hasil oracle, dan alasan
kegagalan. Agregat mencakup pass rate, verified-success rate, median/mean turn
dan tool call, recovery success rate, `repeatActionRate`, verification
discipline, latency, dan token cost.

Identitas eksekusi dipisah: `benchmarkRunId` (sesi) vs `executionId`
(`<sesi>-<taskId>-r<n>@<effort>`), dan tiap report merekam
`identity.architectureCommit` (+ `…Short`, `…Dirty`) dari `git rev-parse HEAD`.

Catatan metrik: `repeatActionRate` = aksi berulang / tool call. Ini BUKAN
"unnecessary action rate" — berulang tidak identik dengan tidak perlu, sehingga
`unnecessaryActionRate` sengaja `null` beserta alasannya sampai ada
instrumentasi yang benar-benar membedakannya.

Batas eksplisit: adapter benchmark belum mengekspos verdict `objectiveVerifier`
maupun kanal intervensi manusia, sehingga `runtimeVerificationState` biasanya
`not_run` dan `humanInterventions` bernilai `null`. Nilai itu TIDAK difabrikasi;
lihat batasan di PR description.

Identitas model wajib exact (`--provider`, `--model`, `--model-version`). String
seperti `latest` ditolak. Tanpa identitas lengkap, `report.measurement.identity`
mencatat `null`.

Eksperimen yang didukung kode:

- **(A) baseline vs kandidat runtime.** Satu invokasi = SATU arm, jadi satu run
  tidak pernah bisa dibandingkan. Jalankan arm baseline dulu, lalu ulangi dengan
  `--baseline-report`:

  ```bash
  node evaluation/run.mjs --suite pr46 --arch vanilla --measurement-out reports/arm-vanilla.json
  node evaluation/run.mjs --suite pr46 --arch basic \
    --measurement-out reports/arm-basic.json --baseline-report reports/arm-vanilla.json
  ```

  `comparison.valid` hanya `true` bila:
  1. kedua arm adalah **measurement report nyata dengan minimal satu eksekusi**
     (identitas saja bukan bukti ada yang berjalan) — kalau tidak:
     `arm-not-measured`;
  2. **seluruh dimensi tetap yang diklaim kontrak** terrekam di kedua arm dan
     identik: `provider`, `modelId`, `modelVersion`, `systemPrompt`
     (`identity.promptTemplate`), `protocol`, `tools` (`toolConfig`),
     `permissions`, `fixture` (`fixtureSet`), `effort`, `budget`, `environment`,
     `verifier`, plus jumlah run berulang. Dimensi yang tidak terekam di salah
     satu arm dilaporkan sebagai `unverifiable` dan perbandingan tetap TIDAK
     valid (`dimension-unverifiable`) — "tidak diperiksa" bukan "cocok";
  3. `architecture` benar-benar berbeda; DAN
  4. kedua arm merekam `identity.architectureAxisWired: true`.

  Alasannya selalu eksplisit: `arms-incomplete` / `arm-not-measured` /
  `dimension-unverifiable` / `architecture-not-executed-by-harness` /
  `identity-mismatch` / `same-architecture`.

  **Status hari ini: Eksperimen A WIRED (Task 6).** Loop bench menghormati
  `getArchPolicy` dan menjalankan modul governance ASLI (`objectiveVerifier` +
  `trajectorySupervisor`): `--arch vanilla` tanpa supervisor dan klaim
  dipercaya, `--arch basic` dengan hint supervisor + verify replan bounded.
  `ARCH_AXIS_IN_BENCH_PATH = true` direkam sebagai
  `identity.architectureAxisWired`, dan `compareArmReports()` menerima
  perbandingan dua arm terukur sebagai valid. Batas jujur: loop bench BUKAN
  loop renderer (prompt assembly, memori, streaming, UI beda) — hasil berarti
  "modul governance asli pada loop bench".

  Dimensi ditulis saat run (`--permissions` misalnya punya default
  `bench-default`), bukan disimpulkan belakangan. `vanilla` = kontrol arsitektur
  (trajectory supervisor, verification gate) DIMATIKAN pada runtime yang sama —
  bukan snapshot historis commit sebelum PR45; `basic` = runtime PR45 dengan
  kontrol itu aktif. Label `pr45` bukan nilai arch yang bisa dijalankan dan tidak
  dipakai sebagai arm.
- **(B) ablasi representasi browser.** `raw` vs `semantic-first`
  (`pr46-browser-04` vs `pr46-browser-05`) benar-benar mengubah
  execution path: fixture meneruskan `representation` → adapter mengekspor
  `ABELINK_BROWSER_OBSERVATION` → `sidecar/main/tools/browserTools.mjs` memakai
  `renderBrowserObservation()` dari `extension/browser-observation.mjs`. Env
  kosong = semantic-first (perilaku app tidak berubah). Pair-nya juga ditolak
  bila salah satu nilai bukan representasi yang bisa dirender.
- **(C) kompatibilitas model** dengan identitas exact; ini eksperimen
  kompatibilitas, bukan leaderboard.

Satu angka agregat BUKAN klaim rilis: perbandingan hanya valid bila variable
tetap identik dan kedua arm benar-benar terukur.

### Orchestrator (`benchmark:run`)

```bash
node evaluation/run.mjs                          # 3x run per task, semua task
node evaluation/run.mjs --runs 5                 # 5x run per task
node evaluation/run.mjs --tasks tb-echo-01,tb-context-01
node evaluation/run.mjs --out reports/2026-09-03.json
node evaluation/run.mjs --out reports/latest.json --compare reports/prev.json
node evaluation/run.mjs --compare prev.json --regression-threshold 5
```

Exit code 1 jika ada task yang pass-rate-nya turun lebih dari threshold
(default 5%) dibanding laporan sebelumnya — cocok untuk regression gate CI.

## Prinsip (anti-fabrikasi)

1. **Metrik nyata atau `null`.** Durasi diukur wall-clock (`startedAt`/`finishedAt`
   di trajectory). Token usage dilaporkan `null` dengan flag `estimated: false`
   sampai provider menyediakan usage asli — tidak ada formula `steps * 1000`.
2. **Verifier deterministik dan dieksekusi.** Predikat JS eksplisit per task,
   diuji PASS/FAIL-nya di smoke CI. Tidak ada eval_script yang ditulis tapi
   tidak pernah dijalankan.
3. **Trajektori lengkap.** Setiap langkah LLM dan tool call dicatat di `stepLog`
   untuk audit manual.
4. **Anti-cheat sentinel.** Task bertipe `sentinel` menerima token acak per run
   yang disuntikkan ke prompt; respons yang persis `expected` tanpa sentinel
   ditandai `cheatSuspected` di laporan.
5. **Multi-run averaging.** Skor dilaporkan sebagai pass-rate atas N run
   (default 3), bukan satu-shot — menyamakan praktik Terminal-Bench 2.1 /
   DeepSWE / Kimi K3.

## Roadmap

- [x] **Anti-cheat validator** — sentinel acak per run + deteksi output hafalan
      (`detectCheat`), diuji di smoke.
- [x] **Multi-run averaging** — `run.mjs` menjalankan tiap task 3x (default),
      melaporkan mean + pass-rate.
- [x] **Laporan JSON berversi** (`schemaVersion: 3`) per run + perbandingan
      antar-commit (`--compare`, regression gate: skor task tidak boleh turun
      > X%).
- [~] **Task suite lebih berat** — constraint adherence, context/sentinel, git,
      planning sudah masuk; multi-tool end-to-end (file CRUD + shell + memory
      dengan grader parsial) menyusul.
- [ ] **Dashboard renderer** untuk hasil run + notifikasi Telegram yang sudah
      disiapkan di sidecar.