# Abelink Benchmark Inventory & PR #46 Evaluation Contract

Date: 2026-09-21

## Purpose

This document defines what the current Abelink benchmark suite already tests and what the next evaluation PR is allowed to add.

The benchmark measures runtime and architecture behavior, not a leaderboard of model intelligence.

For architecture A/B:
- keep model/provider/version fixed;
- keep task fixtures, tool permissions, budgets, and verifier fixed;
- change only the Abelink runtime architecture under test.

Public model benchmark scores are reference material, not Abelink runtime acceptance criteria.

## Current benchmark inventory

The repository currently contains four complementary benchmark families.

### 1. Abelink Architecture Benchmark: evaluation/bench/

Current task catalog: 11 probes.

| Category | Tasks | What it probes |
| --- | --- | --- |
| Brain | brain-01-memory-injection-and-recall; brain-02-multi-fact-retrieval | memory use, recall, continuity |
| Logic | logic-01-conditional-file-action; logic-02-loop-discipline | conditional execution, anti-repeat behavior |
| Body | body-01-file-batch-io; body-02-io-latancy-signal | native I/O execution and observation |
| Soul | soul-01-pressure-response; soul-02-praise-response | contextual response behavior |
| Planning | plan-01-sequenced-task; plan-02-error-recovery-planning | planning and re-planning |
| I/O | io-01-read-modify-write | read -> modify -> verify |

Limitation: these are architecture probes, not full task-success benchmarks. Some rubrics inspect trajectory text/behavior and therefore should not be treated as authoritative world-state proof.

### 2. AbelinkBench terminal-style registry: evaluation/terminal-bench.mjs

The base registry currently contains 8 tasks:

1. tb-echo-01: exact response
2. tb-constraint-01: destructive-command refusal
3. tb-context-01: per-run sentinel/context fidelity
4. tb-git-01: real Git commit in isolated fixture
5. tb-plan-01: ordered planning
6. tb-browser-dead: browser no-handshake / blocked-state handling
7. tb-provider-down: provider connection failure handling
8. tb-subagent-budget: bounded failure when subagent tools are unavailable

These use deterministic predicates. Some verify the world state; others verify output and/or step logs.

### 3. Real-activity student/corporate tasks: evaluation/tasks-student-corporate.mjs

Current registry: 8 tasks.

| Task | Main capability |
| --- | --- |
| corp-report-01 | create verified Markdown report |
| corp-sheet-01 | create structured CSV |
| corp-docx-01 | read DOCX -> produce grounded summary |
| student-research-01 | research + write sourced report |
| student-notes-01 | read notes -> structured study notes |
| code-fix-01 | inspect, modify, run tests, document fix |
| code-explain-01 | grounded code explanation |
| tb-git-02 | real Git commit with tool evidence |

Coding tasks remain a separate boundary from the general runtime. Opencode/Hermes remain the preferred coding-agent systems.

### 4. Long-horizon limit ladder: evaluation/tasks-limit.mjs + evaluation/limit-ladder.mjs

Current ladder: 6 rungs.

8 -> 16 -> 32 -> 64 -> 96 -> 128 artifacts

Each rung requires sequential files whose contents depend on the artifact index. The verifier checks the actual fixture world, not just the final chat answer.

Report both:
- sustainedArtifacts = largest rung that actually passes;
- maxWithinBudget = largest passing rung that fits the selected production effort budget.

A failure at a larger rung must not erase an earlier passing rung.

## Existing architecture metrics

evaluation/abelink-eval.mjs already defines deterministic architecture dimensions:

- planning
- tool orchestration
- recovery
- memory
- safety boundary
- efficiency
- objective completion
- termination correctness
- replanning quality
- recovery success rate
- unnecessary action rate
- human intervention rate
- verification discipline
- HITL discipline

These consume trajectories and/or final outputs. They complement task verifiers.

## PR #45 -> PR #46 measurement boundary

PR #45 is an architectural hypothesis. It must not claim runtime improvement from unit tests alone.

PR #46 should add a measurement plane, not another planner or supervisor.

Required additions:
1. Normalize existing observations/tool results into a minimal evidence record without forcing every tool into browser-shaped fields.
2. Record per-run metrics: task success, independently verified success, turns/steps, tool calls, retries, repeated actions, stagnation events, recovery events, elapsed time, token/context cost when available, and human interventions.
3. Keep the task oracle independent from the model's final claim.
4. Preserve provenance from result -> evidence -> verifier -> report.
5. Add regression comparison between baseline architecture and PR #45.

## Proposed PR #46 fixture matrix

Target: 30 deterministic fixtures.

| Lane | Count | Short | Long | Primary oracle |
| --- | ---: | ---: | ---: | --- |
| Research / evidence | 6 | 4 | 2 | source/evidence predicate |
| Browser / web-use | 5 | 3 | 2 | page/world-state predicate |
| OS automation | 5 | 3 | 2 | filesystem/window/world-state predicate |
| Study / learning | 5 | 3 | 2 | artifact/answer predicate |
| Failure recovery | 5 | 3 | 2 | injected-failure + recovery predicate |
| Cross-session reuse | 4 | 2 | 2 | verified outcome + provenance |

This 30-fixture suite is a new measurement set for PR #46. It must not silently replace or duplicate the existing benchmark registries.

## Required paired experiments

### A. Main vs PR #45

Keep identical:
- model
- provider
- model version
- system prompt/protocol
- tools
- tool permissions
- task fixture
- effort/budget
- environment
- verifier

Only runtime architecture differs.

### B. Browser representation ablation

Compare:
- existing/raw observation representation
- PR #45 semantic-first observation

Everything else remains identical.

### C. Model compatibility matrix

This is a compatibility experiment, not a ranking.

Store exact provider + model_id + model_version in every report. Never use the string "latest" as benchmark identity.

Reference snapshot for 2026-09-21, after checking official sources:
- OpenAI GPT-6 Astra
- Anthropic Claude Fable 5.1
- Google Gemini 3.8 Flash
- DeepSeek V4.1-Flash
- Alibaba Qwen3.8-Max
- Moonshot Kimi K3
- xAI Grok 4.6

Model aliases and availability can change, so the actual resolved identifier used in each run must be recorded.

## Core report fields

Every benchmark report should be able to answer:
- What task was run?
- Which architecture commit was tested?
- Which exact model/provider/version was used?
- Which tool configuration and budget were used?
- Did the world-state oracle pass?
- Was success independently verified?
- How many turns/tool calls/retries were required?
- Did stagnation occur?
- Did recovery occur?
- What evidence supported the verdict?
- What failed and why?
- Is the result comparable to another run?

## Regression rules

Do not turn a single aggregate number into a release claim.

At minimum report:
- pass rate
- verified-success rate
- median/mean turns
- median/mean tool calls
- recovery success rate
- unnecessary-action rate
- verification discipline
- evidence/oracle failures
- latency
- token/context cost when available

Use repeated runs for stochastic models. Keep run count explicit. The current AbelinkBench runner defaults to 3 runs per task.

## Anti-cheat / anti-hallucination rules

- Use per-run random sentinels for applicable tasks.
- Prefer world-state verification over chat-text claims.
- Tool success is not objective success.
- A final answer is not evidence by itself.
- Reusing a skill is not proof that the skill is correct.
- Valid negative evidence, such as a genuine empty search result, is different from tool execution failure.
- Do not use an LLM judge as the sole completion oracle.

## Sequencing

1. Keep PR #45 focused on the general agentic runtime.
2. Document and review this benchmark contract with PR #45.
3. Merge PR #45 only after CI and review requirements are satisfied.
4. Open PR #46 from the merged main branch.
5. Implement the measurement plane and 30-fixture evaluation matrix.
6. Run main-vs-PR45 and browser-ablation experiments.
7. Report results before proposing additional runtime architecture.

## Reference families

Use primary sources before derivative summaries:
- Anthropic agent/context engineering
- OpenAI agent/evaluation documentation
- Hermes Agent / Nous Research
- NVIDIA AVO
- OSWorld
- WebArena / BrowserGym
- WebVoyager
- Mind2Web
- AndroidWorld
- AgentBench
- Terminal-Bench
- METR autonomy evaluations

These are methodology references. Their published scores must not be copied into Abelink reports as if they were directly comparable.

## Decision

Do not open PR #46 yet.

First update PR #45 with this benchmark contract as documentation. After PR #45 is merged, create PR #46 from main and implement the measurement changes against the documented contract.

## Status implementasi (2026-09-20)

Keputusan di atas sudah dieksekusi: PR #45 merged (`main` @ `9f8ffdb`), PR #46
dibuka dari `main` di branch `feat/typed-evidence-plane-agent-benchmark-matrix`.
Patch PR #46 mengimplementasikan measurement plane + matriks 30 fixture terhadap
kontrak dokumen ini.

| Kontrak di dokumen ini | Implementasi | Catatan |
|---|---|---|
| Record bukti minimal berprovenance, tanpa store baru | `evaluation/evidence.mjs` | ledger in-memory; reuse `progressEvaluator.js` (stagnasi/fingerprint) + `objectiveVerifier.js` (kosakata verified). Tidak ada skema Dexie baru. |
| Metrik per-run + report machine-readable | `evaluation/metrics.mjs` | `abelinkbench-measurement-report` membungkus `aggregateRuns` (schemaVersion 3 tetap hidup), tidak menggantikannya. |
| Matriks 30 fixture (6/5/5/5/5/4) | `evaluation/pr46-matrix.mjs` | id + `variant` unik, nol tabrakan dengan `ALL_TASKS`/`ARCH_TASKS`; oracle world-state deterministik + sentinel per-run. |
| Eksperimen A (main vs PR #45) | `pr46-experiments.mjs` + `run.mjs --baseline-report` | Arm = `vanilla` (kontrol arsitektur dimatikan pada runtime yang sama, BUKAN snapshot historis pre-PR45) vs `basic` (kandidat, runtime PR45). `comparison.valid` hanya `true` bila kedua arm adalah measurement report dengan minimal satu eksekusi DAN seluruh 12 dimensi tetap kontrak terverifikasi satu per satu (`provider`, `modelId`, `modelVersion`, `systemPrompt`, `protocol`, `tools`, `permissions`, `fixture`, `effort`, `budget`, `environment`, `verifier`) — dimensi yang tidak terekam membuat perbandingan tetap tidak valid (`dimension-unverifiable`). |
| Eksperimen B (ablasi representasi) | `extension/browser-observation.mjs` + `sidecar/main/tools/browserTools.mjs` + adapter | Switch nyata lewat `ABELINK_BROWSER_OBSERVATION`; default `semantic-first`; pasangan ditolak bila representasinya tidak bisa dirender. |
| Eksperimen C (kompatibilitas model) | `makeModelIdentity()` | `latest`/`default`/`stable`/… ditolak; eksperimen kompatibilitas, bukan leaderboard. |
| Anti-cheat / anti-hallucination | verifier world-state + sentinel acak per-run + `pairedWithin()` (klaim terikat ke sumbernya) | Lihat ringkasan invarian di `../ARCHITECTURE.md` dan `../../AGENTS.md`. |

Deviasi yang didokumentasikan (bukan disembunyikan):

- **Lane cross-session reuse** diukur sebagai **artifact-mediated reuse** (fixture
  menyemai artefak sesi sebelumnya), BUKAN reuse memory/skill persisten. Dicatat
  di `reuseKind`/`measuredClaim`/`notMeasured` tiap fixture. Lane & jumlah tetap 4.
- **Verdict `objectiveVerifier` runtime belum masuk report** karena adapter
  benchmark belum mengeksposnya, sehingga verified-success bersumber dari oracle
  world-state harness (`runtimeVerificationState` biasanya `not_run`). Ini butuh
  perubahan kecil terpisah, bukan ditambal di PR #46.
- **Belum ada hasil terukur.** Dokumen ini dan PR #46 tidak mengklaim bahwa PR #45
  meningkatkan reliabilitas runtime; klaim semacam itu hanya sah setelah
  perbandingan dua arm pada provider nyata dijalankan dan dilaporkan.
- **Token cost & intervensi manusia** `null`/`available:false` (tidak ada kanal).
  `repeatActionRate` dilaporkan apa adanya; `unnecessaryActionRate` tetap `null`
  sampai ada instrumentasi yang membedakannya dari pengulangan yang sah.
