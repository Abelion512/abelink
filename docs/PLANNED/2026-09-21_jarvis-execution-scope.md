# Jarvis Execution Scope — Distilasi Kecil-Smart

Date: 2026-09-21
Status: plan-only, docs-only. No code touched this session.
Mode: ask + plan. Zero build.

## 1. Definisi Jarvis (locked)

Jarvis Tony Stark = voice + kontrol lab/suits + eksekusi otonom multi-langkah +
proaktif monitor + ingat preferensi + bukti data + safety gate + delegasi suits.

Dipadatkan via 3 referensi primer (AGENTS.md §5):

- Anthropic context engineering: smallest high-signal tokens, just-in-time
  retrieval, progressive disclosure, compaction, notes, subagents.
- OpenAI agents: loop di app, tools/skills contract, state antar task,
  approvals, tracing, eval separation.
- Hermes: satu AIAgent layani CLI/gateway/ACP/batch, closed learning loop,
  memory nudges, skill create/improve, FTS5 recall, delegasi paralel.

Inti utara (locked): **eksekusi verified**.
Objective -> plan -> act -> observe -> verify world-state -> recover bounded ->
learn grounded. Sukses = real task verified. Tanpa ini sisanya gimmick.

Lapis berikutnya (urut): proaktif monitor, ingat + belajar, voice + kontrol
(pending, surface MCU bukan core).

Prinsip: distilasi seperti quantization — kecil tapi smart. ATM ke Abelink,
bukan override. No rebrand sok ("Abelink rasa Jarvis"), no vaporware.

## 2. Aset Abelink dipertahankan

- `src/api/ai/objectiveVerifier.js`: `gateCompletion`, `evaluateEvidence`,
  `MAX_VERIFY_REPLANS=2`.
- `src/api/ai/trajectorySupervisor.js`: `createTrajectorySupervisor`, aditif,
  never throw, never terminate.
- 2 call site real: `src/hooks/agent/useAbelinkPlan.js:777,781,1352,1363`,
  `src/api/subagent/subagentExecutor.js:145,146,265,270`.
- Axis murni: `src/api/ai/benchArch.js` vanilla/basic, default basic.
- CLI ada: `bin/abelink.mjs` + `src/api/ai/agentRunner.js` reuse modul asli,
  tapi GUI belum pakai loop sama.
- Gap: `evaluation/abelink-adapter.mjs:347` `ARCH_AXIS_IN_BENCH_PATH=false`,
  vanilla/basic identik di bench.
- Dok arah benar: `docs/ABELINK_CLI_DIRECTION.md` (CLI client bukan otak kedua),
  `docs/PLANNED/2026-09-21_pr48-arch-axis-wiring.md` opsi B,
  `docs/ARCHITECTURE.md:88` general runtime.

## 3. Keputusan locked

1. Eksekusi verified = inti.
2. Campuran minimal file+browser+OS via CLI = real test.
3. A kini B arah = CLI harness dulu, core share belakangan.
4. Slice = 1 kini 3 arah:
   - 1 distilasi garansi (kini): archPolicy + bench pakai modul asli.
   - 2 konsolidasi loop (jalan tengah bila perlu).
   - 3 engine otoritas Hermes-like (arah akhir).
5. Seksi 1-3 disetujui. Sesi ini docs-only.

## 4. Seksi 1 — Arsitektur slice 1 (distilasi garansi)

- `archPolicy.js` tunggal: `getArchPolicy(arch)` -> supervisor on/off,
  gate on/off, terminal reason. Migrasi 2 call site renderer tanpa ubah perilaku.
- Loop bench hormati kebijakan, panggil modul asli (bukan duplikat):
  basic inject supervisor hint + `evaluateEvidence/gateCompletion/
  buildReplanObservation` bounded replan, trace `verify/supervisor`.
  Vanilla stop di klaim model.
- Flip `ARCH_AXIS_IN_BENCH_PATH=true` hanya setelah 2 arm fixture sama
  hasilkan trajectory beda nyata.
- GUI/CLI tidak disentuh. 3 loop beda (GUI hook, CLI agentRunner, bench
  adapter) dinyatakan jujur, bukan disamakan palsu.

## 5. Seksi 2 — Acceptance + non-goal

Selesai bila:

- Mock klaim selesai tanpa bukti: vanilla stop, basic minimal 1 replan bounded.
- `run.mjs --arch vanilla` vs `--arch basic --baseline-report` hasilkan
  `comparison.valid:true` + `architectureAxisWired:true` kedua arm.
- Smoke offline deterministik + no-regression suite hijau.
- Nol angka fabrikasi: token/intervensi null bila kanal tak ada.

Non-goal slice 1: ekstrak loop renderer, ganti planner/memory/browser,
klaim angka provider nyata, rebrand/gimmick surface.

## 6. Seksi 3 — Scope real test + arah

- Real test = campuran minimal file+browser+OS, world-state oracle,
  sentinel per-run, multi-run average. Klaim model bukan bukti.
- CLI = client (`run/status/wait/result/logs/cancel/version/doctor`),
  engine tetap otak tunggal. Sesuai `docs/ABELINK_CLI_DIRECTION.md`.
- Arah akhir (bukan slice ini): engine otoritas durable task,
  CLI/GUI/bench klien RPC task lifecycle. Satu otak, banyak host.
- Opsi 2 konsolidasi loop jadi jalan tengah bila fidelitas bench dipertanyakan.

## 7. Referensi silang (bukan duplikat)

- Kontrak adaptasi: `docs/PLANNED/2026-09-21_runtime-standards-adaptation.md`.
- Wiring detail: `docs/PLANNED/2026-09-21_pr48-arch-axis-wiring.md`.
- Benchmark contract: `docs/PLANNED/2026-09-21_agent-benchmark-matrix.md`,
  `evaluation/README.md`.
- CLI direction: `docs/ABELINK_CLI_DIRECTION.md`.
- Runtime: `docs/ARCHITECTURE.md`, `docs/PLANNED/2026-09-20_general-agentic-runtime.md`.

## 8. Next (plan saja, belum build)

1. Tulis spek PR48 slice 1 dari seksi 1 (archPolicy truth-table + bench trace).
2. Definisikan fixture campuran minimal + oracle world-state per domain.
3. Baru setelah spek disetujui: implementasi slice 1, verifikasi penuh,
   session log, update `docs/ARCHITECTURE.md` di PR yang sama.
