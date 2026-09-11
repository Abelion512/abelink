# Abelink Cognitive Runtime — Fase 2 Design (A+C: Trajectory Search + Real-Activity Bench)

- Date: 2026-09-11
- Status: approved design (sections 1-7 reviewed in chat), awaiting spec review
- Scope: incremental Fase 2 on top of Fase 1. Full model router + thinking controller = Fase 3 (deferred, needs Fase 2 data first).
- Branch context: `feat/trajectory-supervisor` — Fase 1 already landed (`trajectorySupervisor.js` deterministic, `effortSystem.js`, `objectiveVerifier.js`, `trajectory.js` buffer).

## 1. Problem & goal

Fase 1 proved: deterministic supervisor hint + verification-oriented termination + effort budgets can run additively without breaking the loop.

Fase 2 gap (verified against repo 2026-09-11):

- `src/api/trajectory.js` = flat UI log (reasoning/tool/step), not search memory. No score, no lineage, no branch.
- `src/api/ai/trajectorySupervisor.js` = hint injector (max 2 hints/task, cooldown 2, silence at stepsLeft<=7). No strategy ranking, no branch selection, no best-known-state restore.
- `src/api/ai/effortSystem.js` = canonical budget table (low→ultra). Not capability-aware per model.
- `evaluation/terminal-bench.mjs` verifiers check output *text* (e.g. `tb-git-01` checks string "git add..."). Text checks are gameable: model can pass without executing anything real.

Goal Fase 2: turn "agent that works long" into "agent that learns how to work better during the task" for the primary task class (mahasiswa + pekerja korporat: research/file/code), measured by a **world-state** benchmark where the same model + same task + same toolset is compared across architectures (vanilla vs basic vs AVO-style).

Non-goals (Fase 3): heterogeneous model router, per-provider thinking controller, vision-heavy routing, dashboard renderer, Telegram notifications for bench.

## 2. Constraints (locked from brainstorm)

- Cloud-only (laptop lemah, no local LLM). Token unlimited for a 1-week research window (24h/5 days) — budget for long-horizon search exists, but loops stay bounded by `maxTurns` + step budget + watchdog, never infinite.
- Privacy-first: no new tracking/analytics/cloud hard dependency. Offline fallback preserved (smoke CI runs without network/LLM).
- Modularity: new modules pure (no window/db/network). Executor passes evidence in. Existing files get thin wiring only (5-15 lines each).
- Harness must stay green: `bash scripts/verify.sh` (vitest + watermark + vite build + cargo check) + `bun evaluation/smoke.mjs`.
- Repo rules: version SSOT `src-tauri/tauri.conf.json` + `bun run sync-version`; no emoji in UI/responses; Linux-only toolchain (`run-shell` canonical, no new Windows-era tools); CSP dual-declared (`tauri.conf.json` + `index.html`) stays in sync.

## 3. Architecture

```text
USER GOAL
  │
  ▼
GOAL classification (existing classifyObjectiveKind: conversational/file/code/browser/os/research/communication/general)
  │
  ▼
Effort budget (existing effortSystem.js — UNCHANGED)
  │
  ▼
┌─ ReAct loop (useMarkPlan.js / subagentExecutor.js — thin wiring only) ─┐
│ Planner (planning.js) → Executor (toolDispatcher) → Observation         │
│   → Verifier rank 0..3 (objectiveVerifier.js — UNCHANGED logic)         │
│   → Scorer 0..1 (NEW scoring.js, pure)                                  │
│   → Lineage.append (NEW trajLineage.js, pure)                           │
│   → Supervisor directive (EXTEND trajectorySupervisor.js, pure)         │
│   → Next strategy (NEW strategyLib.js ranking, deterministic)           │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
Benchmark (evaluation/: NEW tasks-student-corporate.mjs, EXTEND matrix.mjs/run.mjs)
```

New files (3) + extend (2) + eval (2):

| File | Action | Contract |
| --- | --- | --- |
| `src/api/ai/trajLineage.js` | NEW, pure | lineage tree + stagnation score, no I/O |
| `src/api/ai/scoring.js` | NEW, pure | `f(attempt) -> 0..1`, deterministic |
| `src/api/ai/strategyLib.js` | NEW, pure | 6 strategies + deterministic ranking |
| `src/api/ai/trajectorySupervisor.js` | EXTEND Fase 1→2 | ranking + branch select, keeps all Fase 1 guards |
| `src/api/trajectory.js` | UNCHANGED | stays UI buffer (MAX_ENTRIES 500) |
| `evaluation/tasks-student-corporate.mjs` | NEW | 8-12 real-activity tasks |
| `evaluation/matrix.mjs` + `run.mjs` | EXTEND | arch column vanilla/basic/avo-style |

Explicitly unchanged: `effortSystem.js`, `objectiveVerifier.js` logic, `agentDecision.js` claim taxonomy, `cmd_node_bridge.rs` approval gate, `cmd_fs.rs` containment.

## 4. Trajectory search memory (`trajLineage.js`)

Per-session object (fresh per mission, no cross-task leakage — same isolation rule as Fase 1 supervisor instance):

```js
{
  taskId, goal, objectiveKind,
  attempts: [{
    id, strategy,           // strategyLib key
    tool, targetKey,        // targetKey = normalizeAttemptKey(tool, query), existing fn reused
    success,                // tool-level bool
    verificationRank,       // 0..3 via rankOf (failed=0, not_run/unavailable=1, partial=2, verified=3)
    score,                  // scoring.js output 0..1
    ts
  }],
  bestAttemptId,            // max score, ties → latest verified
  failedKeys: [],           // abandoned keys, never re-hinted
  preferredKeys: [],        // succeeded keys in order (for RETRIEVE)
  stagnation: 0..1          // staleRun/attempts blended with verify-not-moving flag
}
```

- Cap: sliding window 25 attempts (reuse `MAX_ATTEMPTS=25` constant, import from supervisor to avoid magic duplication).
- `stagnation = max(trailingRepeat/5, staleRun/attempts)` gated by `verificationRank<=1`; conversational objectives exempt (no lineage built).
- Pure functions: `createLineage()`, `appendAttempt(lineage, attempt)`, `bestAttempt(lineage)`, `stagnationScore(lineage)`. All unit-testable offline.

## 5. Scoring function (`scoring.js`)

```text
score = 0.5 * (verificationRank / 3) + 0.3 * isNewSuccessKey + 0.2 * toolSuccessRate(window=5)
```

- `verificationRank`: existing `rankOf` semantics (verified=3 … failed=0). Conversational tasks never scored (exempt upstream).
- `isNewSuccessKey`: 1 if tool success on a key never succeeded before in this task, else 0. Reuses `normalizeAttemptKey`.
- `toolSuccessRate`: trailing-5 tool success ratio. Prevents "5x fail = 0" vs "5x success-but-stale" confusion — stale-success case is caught by stagnation, not by this term.
- Range pinned 0..1, no LLM judge, no network. Factors fixed for Fase 2 (tuning needs bench data → Fase 3).

## 6. Strategy library (`strategyLib.js`)

Six strategies (closed set for Fase 2):

```text
DIRECT, DECOMPOSE, EXPLORE, VERIFY, BACKTRACK, RETRIEVE_MEMORY
```

Deterministic ranking given (failedKeys, preferredKeys, attemptedStrategies):

1. `preferredKeys` adaptation (RETRIEVE) if exists and target differs
2. least-recently-attempted strategy not in failedKeys
3. VERIFY when verificationRank in {1} and a proof tool exists for the kind (file→read-back, code→test run, browser→browser-read, os→os-read/screenshot, research→second source fetch)
4. BACKTRACK to bestAttemptId when stagnation>=0.6
5. Never return a failedKey strategy for the same targetKey (hysteresis, same rule as Fase 1 one-directive-per-key)

No LLM call for meta-policy in Fase 2. LLM executes; ranking decides *what class* to try next.

## 7. Supervisor Fase 2 (extend, stays pure + additive)

Keeps every Fase 1 locked rule: deterministic, no window/db/network, thresholds MODIFY=3 / ABANDON=5 / silence stepsLeft<=7, verify-gate deferral, 2-turn cooldown, max 2 hint injections then silent ESCALATE, strategy key = tool+normalized target, success-on-succeeded-key = neutral, never throws.

Additions:

- Input per `update()` gains `{ strategy, verificationRank, score, stagnation, bestKey }` (all passed by executor, never fetched).
- Output gains `{ directive, hintText, nextStrategy, restoreHint }` where `restoreHint` = bestAttempt's tool+target summary when directive is BACKTRACK (executor decides how to re-read/re-navigate; supervisor never executes).
- Semantic tripwire kept (5+ successes, 6+ attempts, rank<=1, staleRun>=3) and additionally fires BACKTRACK when stagnation>=0.6 and bestAttempt exists.
- `snapshot()` gains `{ bestAttemptId, stagnation, nextStrategy }` for trajectory UI + bench stepLog.
- Wiring: `useMarkPlan.js` (~10 lines: build lineage alongside supervisor.update, append attempt with score, inject `hintText` as single system observation — existing staged-hint slot reused) + `subagentExecutor.js` (same, smaller: sub-agents share lineage shape so main/sub comparisons are apples-to-apples).

## 8. Real-activity benchmark (Fase 2 C — core anti-gaming design)

### 8.1 Principle: verifier checks the world, not the chat

Current weakness: text verifiers pass on memorized strings. Fase 2 rule: **every non-conversational task must assert observable side effects via tool trajectory + independent read-back**.

- File/code: verifier re-reads the artifact from an isolated temp dir (`fs_read_file` / `run-shell ls/cat`) and checks content predicates (contains sentinel, 3 headers, CSV row count recomputed via shell — not via model arithmetic).
- Git: verifier runs real `git status/log` in the fixture repo, not string matching.
- Tests: `code-fix-01` passes only if `bunx vitest` exits 0 in the fixture (verifier spawns the command itself).
- Browser: pass requires ≥1 successful `browser-navigate` + ≥1 `browser-read/extract` to the cited domain in `executedToolsList`, plus cited URL actually fetched (domain match). Text citation without tool evidence = fail.
- OS: pass requires `os-*` action + `os-read/list-windows/screenshot` confirmation read. Action without confirmation read = fail (existing `OS_ACTION_RE` vs verify-tools split in objectiveVerifier reused).
- Conversational tasks keep text verifiers (no world state to check — existing `classifyObjectiveKind` exemption).

### 8.2 Fresh fixtures per run (anti-memorization)

- `run.mjs` creates `tmp/markbench-<runId>/` per run; task module creates random filenames (`laporan-<sentinel>.md`, `data-<sentinel>.csv`) and injects `{{SENTINEL}}` (existing `mkSentinel()`) into the prompt.
- World-state predicates must find the sentinel **inside the artifact**, not just in chat output. Hard-coded `expected` strings forbidden for world tasks.
- Agent never sees verifier code; verifier runs in the orchestrator process after the run, reading temp dir + stepLog.

### 8.3 Forced tool-use

- Each real task declares `requiredTools` (e.g. `['write-file','read-file']`, `['browser-navigate','browser-read']`) and `minSuccessEvidence`. `mark-adapter.mjs` already multiplexes `ai:fetch` + `native-tool:execute` over one persistent sidecar per run — reuse, add per-task `maxTurns` (already supported) and record full `stepLog` (LLM steps + tool calls + observations, existing shape).
- Missing required tool evidence → task fail regardless of chat text. This is computed from trajectory, never self-reported.

### 8.4 Task suite: student + corporate (8-12, all real)

| ID | Class | Real activity | World verifier |
| --- | --- | --- | --- |
| `corp-report-01` | file/research | 2 random source .md → write `laporan-<S>.md` 3 sections | file exists, contains S, ≥3 headers |
| `corp-sheet-01` | file/code | summarize real CSV → write summary | row count recomputed via shell matches claim ±0 |
| `corp-docx-01` | file | .docx fixture → extract + summarize | summary contains sentinel-keyed fact from doc |
| `student-research-01` | research | deepSearch topic (random pick) + cite | ≥2 fetched URLs in toolCalls, citations match fetched domains |
| `student-notes-01` | file | lecture .txt → structured notes .md | notes contain 3 required sections + key terms |
| `code-fix-01` | code | fixture repo 1-bug → patch | `bunx vitest` exit 0 (verifier-spawned) |
| `code-explain-01` | conversational | explain function | text rubric (exempt from world check) |
| `tb-git-01` (upgraded) | terminal | real fixture repo: stage+commit | `git status/log` shows commit with sentinel in msg |
| `browser-info-01` | browser | navigate + extract fact (planned until bridge C3 stable) | browser tool evidence + fact matches page extract |
| `os-file-01` | os | create+verify file via os tools (planned) | os action + confirmation read |

`planned` browser/OS tasks lock their verifier contract now, runner enabled when `browser:*` Fase C3 + `os:*` live paths are stable (existing `b166360` auto-launch noted).

### 8.5 Matrix: SAME MODEL / SAME TASK / SAME TOOLSET, only architecture changes

Extend `evaluation/matrix.mjs` with arch axis:

| Model | Vanilla (no supervisor, no verifier gate) | Basic (Fase 1: supervisor hints + verifier gate) | AVO-style (Fase 2: lineage + scoring + ranking + world verifier) |
| --- | --- | --- | --- |
| Gemini Flash | ? | ? | ? |
| Sonnet-class | ? | ? | ? |
| Opus-class | ? | ? | ? |
| GPT-class | ? | ? | ? |

- `run.mjs` gains `--arch vanilla|basic|avo --effort` flags; `mark-adapter.mjs` toggles supervisor/verifier wiring per arch (env-gated, default basic = current behavior, so existing reports stay comparable).
- Multi-run averaging kept (default 3x, `--runs N`), JSON report versioned (`schemaVersion` bump 2→3 with `arch` + `worldState` fields), `--compare` regression gate kept (fail if task pass-rate drops >threshold).
- Metrics per task: `task_success` (world-state bool), `progress_per_step` (score delta/steps), `recovery_success_rate`, `verification_accuracy` (verifier vs human spot-check on sample), `premature_termination_rate`, `unnecessary_action_rate` (existing `mark-eval.mjs` fns reused: `evalPlanning`, `evalToolOrchestration`, `evalRecovery`, + objective/termination/replan dimensions), `steps/time/tool_calls` wall-clock nyata. Token usage stays `null` until providers return real usage (existing anti-fabrication rule).

### 8.6 Anti-gaming checklist (must all hold)

1. No world task passes on chat text alone (negative control: empty-tool trajectory scores 0).
2. Sentinel appears in artifact, not only chat.
3. Fixture dirs unique per run; reruns don't reuse artifacts.
4. Verifier process separate from agent; agent sees only prompt + tools.
5. stepLog complete (every LLM step + tool call + observation) for manual audit.
6. `smoke.mjs` covers each verifier with PASS + FAIL + cheat-attempt cases (e.g. correct text without tool evidence → FAIL).

## 9. Safety, errors, budgets

- Additive-only: supervisor/lineage/scorer faults degrade to CONTINUE; verifier errors never block legitimate reports (existing additive rule in `useMarkPlan.js` + `subagentExecutor.js`).
- Destructive tools stay behind native `rfd` approval (`APPROVAL_ACTIONS`); bench fixtures use temp dirs + allowlisted non-destructive tools. `tb-constraint-01` refusal behavior unchanged.
- FS containment (`cmd_fs.rs` resolve_contained) unchanged; bench temp dirs inside XDG workspace root.
- `MAX_VERIFY_REPLANS=2` unchanged. Effort budgets unchanged. Lineage window 25, hints 2/task — no new unbounded state.

## 10. Harness & rollout

- Unit tests (offline, no LLM): lineage append/best/stagnation, scoring pins, strategy ranking vs failed/preferred keys, supervisor Fase 2 directives + guards (cooldown, budget silence, verify-gate deferral, never-throw).
- `bun evaluation/smoke.mjs` extended with scorer + world-verifier PASS/FAIL/cheat cases (temp-dir fixtures).
- `bash scripts/verify.sh` must stay green before push. No version bump needed (no release).
- Rollout: (1) pure modules + tests → (2) thin wiring main loop → (3) sub-agent parity → (4) eval tasks + matrix arch axis → (5) 3-model × 3-arch pilot on corp-report/student-research/code-fix → (6) report, then decide Fase 3 (router/thinking controller) tuning from data.

## 11. Rejected alternatives

- Per-model prompt forks (`if claude … else if gemini …`): rejected — capability abstraction deferred to Fase 3 with bench data, not guesses.
- LLM-as-judge scoring: rejected for Fase 2 — non-deterministic, gameable, costs runs; deterministic `f` first, judge only as secondary DeepEval dimension (existing `deepeval-runner.mjs` optional path).
- Full heterogeneous planner/critic/verifier multi-model in Fase 2: rejected — needs strategy data first; would triple provider matrix cost without proven search layer.
