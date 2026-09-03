# MarkBench — Harness Evaluasi Mark Linux

Harness evaluasi untuk mengukur performa agent Mark secara terukur, auditabel, dan
bebas metrik fabrikasi. Terinspirasi metodologi rilisan model frontier terbaru
(mis. tech blog Kimi K3, Terminal-Bench 2.1, DeepSWE): evaluasi berbasis
**agentic harness** nyata, **verifier deterministik**, **multi-run averaging**,
dan **anti-cheat validator** — bukan angka simulasi.

## Komponen

| File | Peran |
| --- | --- |
| `run.mjs` | **Orchestrator multi-run** (`bun run benchmark:run`). Menjalankan tiap task N kali (default 3x, praktik standar "averaged over three runs" Kimi K3/DeepSWE), menyuntikkan **sentinel acak per run** untuk task bertipe sentinel (anti-hafalan), menghitung mean + pass-rate, menulis laporan JSON (`schemaVersion: 1`), dan membandingkan antar-commit via `--compare` (regression gate). |
| `terminal-bench.mjs` | Registry task Terminal-Bench-style. Setiap task punya `prompt` + `verifier` — predikat deterministik yang benar-benar dieksekusi terhadap respons — plus `maxTurns` (turn budget, ala MCP Atlas 100-turn) dan flag `sentinel` untuk anti-cheat. |
| `mark-adapter.mjs` | Adapter agent: satu child sidecar persisten per run, RPC JSON-lines ter-multipleks per id via `ai:fetch` + `native-tool:execute`. Cleanup dijamin (`SIGTERM` → `SIGKILL` 5s). Durasi wall-clock nyata dicatat di trajectory. `task.maxTurns` menimpa default iterasi (tidak ada loop tak terbatas). |
| `deepeval-runner.mjs` | Metrik sekunder opsional (GEval + TaskCompleteness). Dynamic-import; jika paket `deepeval` tidak terpasang atau API key tidak ada, degrade gracefully dan verdict official tetap dipakai. |
| `smoke.mjs` | Gate CI tanpa network: registry task, verifier PASS/FAIL case, parser tool-call quote-aware, anti-cheat `detectCheat`, agregasi `aggregateRuns`, regression gate `compareReports`. |

## Task suite

| Task | Kategori | Verifier memastikan |
| --- | --- | --- |
| `tb-echo-01` | Instruksi presisi | output persis `MarkBench is active` |
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

Runner butuh salah satu provider AI yang dikonfigurasi di Mark (gemini-web,
LM Studio lokal, atau endpoint OpenAI-compatible). Tanpa provider, smoke test
tetap bisa jalan karena tidak memanggil LLM.

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
- [x] **Laporan JSON berversi** (`schemaVersion: 1`) per run + perbandingan
      antar-commit (`--compare`, regression gate: skor task tidak boleh turun
      > X%).
- [~] **Task suite lebih berat** — constraint adherence, context/sentinel, git,
      planning sudah masuk; multi-tool end-to-end (file CRUD + shell + memory
      dengan grader parsial) menyusul.
- [ ] **Dashboard renderer** untuk hasil run + notifikasi Telegram yang sudah
      disiapkan di sidecar.