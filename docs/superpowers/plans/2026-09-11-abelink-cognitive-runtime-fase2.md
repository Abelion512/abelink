# Abelink Cognitive Runtime Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Fase 2 (trajectory search memory + scoring + strategy ranking + supervisor Fase 2 + real-activity bench tasks) on `feat/trajectory-supervisor` without breaking the existing harness.

**Architecture:** Three new pure modules (`scoring.js`, `trajLineage.js`, `strategyLib.js`) with zero I/O; additive extension of `trajectorySupervisor.js` keeping all Fase 1 guards; thin wiring (≤15 lines) in `useAbelinkPlan.js` + `subagentExecutor.js`; new eval task module with world-state verifiers plus `--arch` axis in the bench runner.

**Tech Stack:** Bun + Vitest (`.mjs` tests, node environment), existing `normalizeAttemptKey` reuse, existing `run.mjs` orchestrator + `smoke.mjs` CI gate.

**Spec:** `docs/superpowers/specs/2026-09-11-abelink-cognitive-runtime-fase2-design.md`

## Global Constraints

- New `src/api/ai/*` modules MUST be pure: no `window`, no `db`, no network imports; executor passes all evidence in.
- Supervisor NEVER throws, NEVER terminates, NEVER executes tools, NEVER overrides approval/safety/budget guards.
- Locked thresholds reused verbatim: `MODIFY_REPEAT=3`, `ABANDON_REPEAT=5`, `BUDGET_SILENCE_STEPS_LEFT=7`, `MAX_HINTS_PER_TASK=2`, `HINT_COOLDOWN_TURNS=2`, `MAX_ATTEMPTS=25`, `MAX_HINT_CHARS=300`, `MAX_VERIFY_REPLANS=2`.
- Scoring weights fixed: `score = 0.5*(rank/3) + 0.3*isNewSuccessKey + 0.2*toolSuccessRate(window=5)`, range pinned 0..1.
- Version SSOT is `src-tauri/tauri.conf.json` only, then `bun run sync-version`; no version bump in this plan (no release).
- No emoji in UI strings, responses, or test names.
- `bash scripts/verify.sh` must stay green; `bun evaluation/smoke.mjs` must stay green without network/LLM.
- Bench report `schemaVersion` goes 2→3 with new `arch` + `worldState` fields.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/api/ai/scoring.js` (create) | Pure `scoreAttempt()` + `RANK_OF` map; single owner of the 0..1 formula |
| `src/api/ai/trajLineage.js` (create) | Pure per-session lineage: `createLineage`, `appendAttempt`, `bestAttempt`, `stagnationScore` |
| `src/api/ai/strategyLib.js` (create) | Closed strategy set (6) + `rankNextStrategy()` deterministic ranking |
| `src/api/ai/trajectorySupervisor.js` (modify, additive) | Fase 2 fields: accepts `{strategy, verificationRank, score, stagnation, bestKey}`, returns `{directive, hintText, nextStrategy, restoreHint}`; keeps every Fase 1 behavior byte-identical when new fields absent |
| `tests/scoring.test.mjs` (create) | Pins for scoring formula |
| `tests/trajLineage.test.mjs` (create) | Pins for lineage append/best/stagnation |
| `tests/strategyLib.test.mjs` (create) | Pins for ranking vs failed/preferred keys |
| `tests/trajSupervisorFase2.test.mjs` (create) | Pins for new supervisor outputs + Fase 1 regression (do NOT edit `trajectorySupervisor.test.mjs`) |
| `src/hooks/agent/useAbelinkPlan.js` (modify, ~10 lines) | Build lineage alongside `supervisor.update()`, append scored attempt, inject `hintText` via existing staged-hint slot |
| `src/api/subagent/subagentExecutor.js` (modify, ~8 lines) | Same lineage shape for sub-agents |
| `evaluation/tasks-student-corporate.mjs` (create) | 8 real-activity tasks with world-state verifiers + `requiredTools` declarations |
| `evaluation/terminal-bench.mjs` (modify, `tb-git-01` only) | Upgrade git task verifier from string-match to real `git status/log` check in fixture repo |
| `evaluation/run.mjs` (modify) | `--arch vanilla|basic|avo` flag, per-run temp dir `tmp/abelinkbench-<runId>/`, `schemaVersion: 3`, `arch` + `worldState` fields |
| `evaluation/smoke.mjs` (modify, additive) | PASS/FAIL/cheat cases for scorer + 2 world verifiers using temp-dir fixtures |

---

### Task 1: `scoring.js` + pins

**Files:**
- Create: `src/api/ai/scoring.js`
- Test: `tests/scoring.test.mjs`

**Interfaces:**
- Consumes: nothing (standalone pure module; rank strings match `objectiveVerifier.js` `VERIFICATION_STATE` values).
- Produces: `scoreAttempt({verificationRank, isNewSuccessKey, toolSuccessRate}) -> number` used by Task 4 wiring and Task 2 tests.

- [ ] **Step 1: Write the failing test**

```js
// tests/scoring.test.mjs
import { describe, it, expect } from 'vitest'
import { scoreAttempt, RANK_OF } from '../src/api/ai/scoring.js'

describe('scoreAttempt', () => {
  it('verified + new key + perfect window scores 1', () => {
    expect(scoreAttempt({ verificationRank: 3, isNewSuccessKey: true, toolSuccessRate: 1 })).toBe(1)
  })

  it('failed attempt scores 0 regardless of novelty', () => {
    expect(scoreAttempt({ verificationRank: 0, isNewSuccessKey: true, toolSuccessRate: 1 })).toBeCloseTo(0.5, 5)
  })

  it('pins rank map to objectiveVerifier semantics', () => {
    expect(RANK_OF).toEqual({ failed: 0, not_run: 1, unavailable: 1, partially_verified: 2, verified: 3 })
  })

  it('clamps out-of-range inputs to 0..1', () => {
    expect(scoreAttempt({ verificationRank: 99, isNewSuccessKey: true, toolSuccessRate: 5 })).toBe(1)
    expect(scoreAttempt({ verificationRank: -4, isNewSuccessKey: false, toolSuccessRate: -2 })).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/scoring.test.mjs`
Expected: FAIL with "Failed to resolve import ../src/api/ai/scoring.js"

- [ ] **Step 3: Write minimal implementation**

```js
// src/api/ai/scoring.js — Fase 2 deterministic attempt scorer (pure, no I/O).
// Formula locked by spec: 0.5*(rank/3) + 0.3*isNewSuccessKey + 0.2*toolSuccessRate(window=5).
export const RANK_OF = Object.freeze({
  failed: 0,
  not_run: 1,
  unavailable: 1,
  partially_verified: 2,
  verified: 3
})

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function scoreAttempt({ verificationRank = 1, isNewSuccessKey = false, toolSuccessRate = 0 } = {}) {
  const rank = Number.isFinite(verificationRank) ? Math.min(3, Math.max(0, verificationRank)) : 1
  const novelty = isNewSuccessKey === true ? 1 : 0
  const rate = clamp01(toolSuccessRate)
  return clamp01(0.5 * (rank / 3) + 0.3 * novelty + 0.2 * rate)
}

export default { RANK_OF, scoreAttempt }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/scoring.test.mjs`
Expected: PASS (4 tests). Note Step-1 expectation `toBeCloseTo(0.5, 5)`: 0.5*(0/3)+0.3*1+0.2*1 = 0.5 exactly.

- [ ] **Step 5: Commit**

```bash
git add src/api/ai/scoring.js tests/scoring.test.mjs
git commit -m "feat(agent): Fase 2 deterministic attempt scorer"
```

---

### Task 2: `trajLineage.js` + pins

**Files:**
- Create: `src/api/ai/trajLineage.js`
- Test: `tests/trajLineage.test.mjs`

**Interfaces:**
- Consumes: `normalizeAttemptKey` shape (tool+target string keys built by caller; this module does NOT import the supervisor — caller passes `targetKey`).
- Produces: `createLineage({taskId, goal, objectiveKind})`, `appendAttempt(lineage, attempt)`, `bestAttempt(lineage)`, `stagnationScore(lineage)` used by Task 4/5.

- [ ] **Step 1: Write the failing test**

```js
// tests/trajLineage.test.mjs
import { describe, it, expect } from 'vitest'
import { createLineage, appendAttempt, bestAttempt, stagnationScore } from '../src/api/ai/trajLineage.js'

const att = (over = {}) => ({
  id: 1, strategy: 'DIRECT', tool: 'read-file', targetKey: 'read-file:src/a.js',
  success: true, verificationRank: 1, score: 0.4, ts: Date.now(), ...over
})

describe('trajLineage', () => {
  it('append + best picks max score, ties go to latest verified', () => {
    const lin = createLineage({ taskId: 't1', goal: 'g', objectiveKind: 'file' })
    appendAttempt(lin, att({ id: 1, score: 0.4, verificationRank: 1 }))
    appendAttempt(lin, att({ id: 2, score: 0.4, verificationRank: 3 }))
    expect(bestAttempt(lin).id).toBe(2)
  })

  it('caps sliding window at 25 attempts', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'code' })
    for (let i = 0; i < 30; i++) appendAttempt(lin, att({ id: i }))
    expect(lin.attempts.length).toBe(25)
    expect(lin.attempts[0].id).toBe(5)
  })

  it('stagnation is 0 on fresh lineage, rises when stale with unmoving verification', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'file' })
    expect(stagnationScore(lin)).toBe(0)
    appendAttempt(lin, att({ id: 1, targetKey: 'k1', verificationRank: 1 }))
    for (let i = 2; i <= 7; i++) appendAttempt(lin, att({ id: i, targetKey: 'k1', success: false, verificationRank: 1, score: 0.1 }))
    expect(stagnationScore(lin)).toBeGreaterThanOrEqual(0.6)
  })

  it('records failed and preferred keys without duplicates', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'file' })
    appendAttempt(lin, att({ id: 1, targetKey: 'k1' }))
    appendAttempt(lin, att({ id: 2, targetKey: 'k1' }))
    expect(lin.preferredKeys).toEqual(['k1'])
    lin.failedKeys.add('k1')
    expect([...lin.failedKeys]).toEqual(['k1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/trajLineage.test.mjs`
Expected: FAIL with "Failed to resolve import ../src/api/ai/trajLineage.js"

- [ ] **Step 3: Write minimal implementation**

```js
// trajLineage.js — Fase 2 per-session search memory (pure, no I/O).
// Caller builds targetKey via normalizeAttemptKey(tool, query) from trajectorySupervisor.js.
export const MAX_LINEAGE_ATTEMPTS = 25

export function createLineage({ taskId = '', goal = '', objectiveKind = 'general' } = {}) {
  return { taskId, goal, objectiveKind, attempts: [], bestAttemptId: null, failedKeys: new Set(), preferredKeys: [], stagnation: 0 }
}

export function appendAttempt(lineage, attempt = {}) {
  const entry = {
    id: attempt.id ?? lineage.attempts.length + 1,
    strategy: attempt.strategy ?? 'DIRECT',
    tool: attempt.tool ?? '',
    targetKey: attempt.targetKey ?? '',
    success: attempt.success === true,
    verificationRank: Number.isFinite(attempt.verificationRank) ? attempt.verificationRank : 1,
    score: Number.isFinite(attempt.score) ? attempt.score : 0,
    ts: attempt.ts ?? Date.now()
  }
  lineage.attempts.push(entry)
  if (lineage.attempts.length > MAX_LINEAGE_ATTEMPTS) {
    lineage.attempts = lineage.attempts.slice(-MAX_LINEAGE_ATTEMPTS)
  }
  if (entry.success && entry.targetKey && !lineage.preferredKeys.includes(entry.targetKey)) {
    lineage.preferredKeys.push(entry.targetKey)
  }
  const best = bestAttempt(lineage)
  lineage.bestAttemptId = best ? best.id : null
  lineage.stagnation = stagnationScore(lineage)
  return entry
}

export function bestAttempt(lineage) {
  let best = null
  for (const a of lineage.attempts) {
    if (!best || a.score > best.score || (a.score === best.score && a.verificationRank > best.verificationRank)) best = a
  }
  return best
}

export function stagnationScore(lineage) {
  const n = lineage.attempts.length
  if (n === 0) return 0
  const last = lineage.attempts[n - 1]
  let repeat = 0
  for (let i = n - 1; i >= 0 && lineage.attempts[i].targetKey === last.targetKey; i--) repeat++
  const verifyMoving = lineage.attempts.some((a) => a.verificationRank >= 2)
  if (verifyMoving) return 0
  return Math.min(1, Math.max(repeat / 5, n >= 6 ? (n - 1) / n : 0))
}

export default { MAX_LINEAGE_ATTEMPTS, createLineage, appendAttempt, bestAttempt, stagnationScore }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/trajLineage.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/ai/trajLineage.js tests/trajLineage.test.mjs
git commit -m "feat(agent): Fase 2 per-session trajectory lineage"
```

---

### Task 3: `strategyLib.js` + pins

**Files:**
- Create: `src/api/ai/strategyLib.js`
- Test: `tests/strategyLib.test.mjs`

**Interfaces:**
- Consumes: `{ failedKeys: string[], preferredKeys: string[], attemptedStrategies: string[], verificationRank: number, stagnation: number, hasProofTool: boolean }`.
- Produces: `STRATEGIES` frozen list + `rankNextStrategy(input) -> { strategy, reason }` used by Task 4 supervisor.

- [ ] **Step 1: Write the failing test**

```js
// tests/strategyLib.test.mjs
import { describe, it, expect } from 'vitest'
import { STRATEGIES, rankNextStrategy } from '../src/api/ai/strategyLib.js'

const base = { failedKeys: [], preferredKeys: [], attemptedStrategies: [], verificationRank: 1, stagnation: 0, hasProofTool: false }

describe('rankNextStrategy', () => {
  it('exposes exactly the 6 locked strategies', () => {
    expect([...STRATEGIES].sort()).toEqual(['BACKTRACK', 'DECOMPOSE', 'DIRECT', 'EXPLORE', 'RETRIEVE_MEMORY', 'VERIFY'].sort())
  })

  it('prefers RETRIEVE when a preferred key exists', () => {
    const r = rankNextStrategy({ ...base, preferredKeys: ['read-file:src/a.js'] })
    expect(r.strategy).toBe('RETRIEVE_MEMORY')
  })

  it('never returns a strategy whose key class failed', () => {
    const r = rankNextStrategy({ ...base, failedKeys: ['DIRECT'], attemptedStrategies: ['DIRECT'] })
    expect(r.strategy).not.toBe('DIRECT')
  })

  it('BACKTRACK when stagnation high', () => {
    const r = rankNextStrategy({ ...base, stagnation: 0.8 })
    expect(r.strategy).toBe('BACKTRACK')
  })

  it('VERIFY when rank is unverified and a proof tool exists', () => {
    const r = rankNextStrategy({ ...base, verificationRank: 1, hasProofTool: true })
    expect(r.strategy).toBe('VERIFY')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/strategyLib.test.mjs`
Expected: FAIL with "Failed to resolve import ../src/api/ai/strategyLib.js"

- [ ] **Step 3: Write minimal implementation**

```js
// strategyLib.js — Fase 2 closed strategy set + deterministic ranking (pure, no I/O).
export const STRATEGIES = Object.freeze(['DIRECT', 'DECOMPOSE', 'EXPLORE', 'VERIFY', 'BACKTRACK', 'RETRIEVE_MEMORY'])

export function rankNextStrategy({ failedKeys = [], preferredKeys = [], attemptedStrategies = [], verificationRank = 1, stagnation = 0, hasProofTool = false } = {}) {
  const failed = new Set(failedKeys)
  const attempted = new Set(attemptedStrategies)
  if (stagnation >= 0.6 && !failed.has('BACKTRACK')) return { strategy: 'BACKTRACK', reason: 'stagnation-high' }
  if (preferredKeys.length > 0 && !failed.has('RETRIEVE_MEMORY')) return { strategy: 'RETRIEVE_MEMORY', reason: 'adapt-prior-success' }
  if (verificationRank <= 1 && hasProofTool === true && !failed.has('VERIFY')) return { strategy: 'VERIFY', reason: 'proof-available' }
  const order = ['EXPLORE', 'DECOMPOSE', 'DIRECT', 'VERIFY', 'BACKTRACK', 'RETRIEVE_MEMORY']
  for (const s of order) {
    if (!failed.has(s) && !attempted.has(s)) return { strategy: s, reason: 'least-recently-attempted' }
  }
  for (const s of order) {
    if (!failed.has(s)) return { strategy: s, reason: 'retry-least-bad' }
  }
  return { strategy: 'DIRECT', reason: 'all-failed-fallback' }
}

export default { STRATEGIES, rankNextStrategy }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/strategyLib.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/ai/strategyLib.js tests/strategyLib.test.mjs
git commit -m "feat(agent): Fase 2 deterministic strategy library"
```

---

### Task 4: Supervisor Fase 1→2 (additive extend) + pins

**Files:**
- Modify: `src/api/ai/trajectorySupervisor.js` (additive only: new optional input fields, new output fields `nextStrategy` + `restoreHint`; all Fase 1 branches byte-identical when new fields absent)
- Test: `tests/trajSupervisorFase2.test.mjs` (do NOT touch `tests/trajectorySupervisor.test.mjs`)

**Interfaces:**
- Consumes: `rankNextStrategy` from `../strategyLib.js` (lazy import at module top — pure, no cycle: strategyLib imports nothing), `scoreAttempt` NOT imported here (executor scores; supervisor receives `score`).
- Produces: `update()` return gains `{ directive, hintText, nextStrategy, restoreHint }`; `snapshot()` gains `{ bestAttemptId, stagnation, nextStrategy }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/trajSupervisorFase2.test.mjs — Fase 2 additive outputs (Fase 1 pins live in trajectorySupervisor.test.mjs).
import { describe, it, expect } from 'vitest'
import { DIRECTIVE, createTrajectorySupervisor } from '../src/api/ai/trajectorySupervisor.js'

const base = { verificationState: 'not_run', stepsLeft: 20, verifyGateActive: false }

describe('supervisor Fase 2 outputs', () => {
  it('CONTINUE carries nextStrategy + null restoreHint', () => {
    const sup = createTrajectorySupervisor()
    const r = sup.update({ tool: 'read-file', query: 'src/a.js', success: true, ...base })
    expect(r.directive).toBe(DIRECTIVE.CONTINUE)
    expect(typeof r.nextStrategy).toBe('string')
    expect(r.restoreHint).toBeNull()
  })

  it('MODIFY on 3rd repeat carries nextStrategy != failed class + hint within cap', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base })
    sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base, strategy: 'DIRECT' })
    const third = sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base, strategy: 'DIRECT' })
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
    expect(typeof third.nextStrategy).toBe('string')
  })

  it('BACKTRACK surfaces restoreHint naming the best key when stagnation high', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'read-file', query: 'src/a.js', success: true, verificationRank: 1, score: 0.8, ...base })
    let r = null
    for (let i = 0; i < 6; i++) {
      r = sup.update({ tool: 'grep-search', query: 'zzz', success: false, stagnation: 0.9, bestKey: 'read-file "src/a.js"', ...base })
    }
    expect(['modify_strategy', 'abandon_strategy', 'escalate', 'continue']).toContain(r.directive)
    if (r.directive !== 'continue') expect(typeof r.nextStrategy).toBe('string')
  })

  it('omitted Fase 2 fields keep Fase 1 behavior identical', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'grep-search', query: 'pola auth', success: false, ...base })
    sup.update({ tool: 'grep-search', query: 'pola  auth', success: false, ...base })
    const third = sup.update({ tool: 'grep-search', query: '"Pola Auth"', success: false, ...base })
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/trajSupervisorFase2.test.mjs`
Expected: FAIL (assertions on `nextStrategy`/`restoreHint` receive `undefined`).

- [ ] **Step 3: Minimal additive implementation**

In `src/api/ai/trajectorySupervisor.js`:
1. Top: `import { rankNextStrategy } from './strategyLib.js'`.
2. State: add `let attemptedStrategies = []`, `let bestKey = null`, `let lastStagnation = 0`.
3. `update()`: destructure `strategy = null, score = null, stagnation = null` plus `bestKey: incomingBest = null` (do NOT rename existing fields); after `record(...)`, if `typeof stagnation === 'number'` set `lastStagnation = stagnation`, if `typeof strategy === 'string' && !attemptedStrategies.includes(strategy)` push it, if `typeof incomingBest === 'string'` set `bestKey = incomingBest`.
4. Every existing `return { directive, hintText }` becomes `return { directive, hintText, nextStrategy, restoreHint }` where `nextStrategy = rankNextStrategy({ failedKeys: [...failedStrategies], preferredKeys: successfulStrategies, attemptedStrategies, verificationRank: lastVerificationRank, stagnation: lastStagnation, hasProofTool: /read-file|read-document|run-shell|run-task|browser-read|os-read/i.test(key || '') }).strategy` computed once per call, and `restoreHint = directive === DIRECTIVE.ABANDON && bestKey ? bestKey : null`. No existing branch condition changes.
5. `snapshot()` STAYS byte-identical Fase 1 shape (amended 2026-09-11: extending it breaks the locked `toEqual` pin at `tests/trajectorySupervisor.test.mjs:211`, which this plan forbids touching; Fase 2 state is exposed via `update()` return only, and no Task 5-8 consumer reads `snapshot()`).
6. `reset()` clears the three new state vars.

- [ ] **Step 4: Run tests to verify nothing regresses**

Run: `bunx vitest run tests/trajectorySupervisor.test.mjs tests/trajSupervisorFase2.test.mjs tests/scoring.test.mjs tests/trajLineage.test.mjs tests/strategyLib.test.mjs`
Expected: PASS (all files; Fase 1 pins untouched).

- [ ] **Step 5: Commit**

```bash
git add src/api/ai/trajectorySupervisor.js tests/trajSupervisorFase2.test.mjs
git commit -m "feat(agent): supervisor Fase 2 — nextStrategy + restoreHint (additive)"
```

---

### Task 5: Thin wiring — main loop + sub-agent executor

**Files:**
- Modify: `src/hooks/agent/useAbelinkPlan.js` (~10 lines at supervisor section + update call site)
- Modify: `src/api/subagent/subagentExecutor.js` (~8 lines at its supervisor/verifier section)

**Interfaces:**
- Consumes: `createLineage/appendAttempt` (trajLineage), `scoreAttempt` (scoring), extended `supervisor.update` (Task 4).
- Produces: per-attempt lineage entries + staged `hintText` via the existing single-observation slot (no new UI).

- [ ] **Step 1: Write the wiring contract test (documents the call shape, runs offline)**

Append to `tests/trajSupervisorFase2.test.mjs` a case proving the executor-side scoring call shape (no file edit to executors needed for the test itself):

```js
it('executor call shape: score feeds supervisor without throwing', async () => {
  const { scoreAttempt } = await import('../src/api/ai/scoring.js')
  const { createLineage, appendAttempt } = await import('../src/api/ai/trajLineage.js')
  const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'file' })
  const s = scoreAttempt({ verificationRank: 2, isNewSuccessKey: true, toolSuccessRate: 0.8 })
  const e = appendAttempt(lin, { id: 1, strategy: 'DIRECT', tool: 'read-file', targetKey: 'read-file:src/a.js', success: true, verificationRank: 2, score: s })
  const sup = createTrajectorySupervisor()
  const r = sup.update({ tool: 'read-file', query: 'src/a.js', success: true, verificationState: 'partially_verified', stepsLeft: 20, verifyGateActive: false, strategy: 'DIRECT', verificationRank: 2, score: s, stagnation: 0, bestKey: e.targetKey })
  expect(r.directive).toBe(DIRECTIVE.CONTINUE)
})
```

- [ ] **Step 2: Run to verify the shape holds**

Run: `bunx vitest run tests/trajSupervisorFase2.test.mjs`
Expected: PASS.

- [ ] **Step 3: Wire `useAbelinkPlan.js` (minimal diff)**

At the supervisor instantiation (~line 613): create `const lineage = createLineage({ taskId: <existing session/task id var>, goal: userInput, objectiveKind })` beside `createTrajectorySupervisor()` (reuse the in-scope id variable, do not invent a new id scheme). At the existing `supervisor.update({...})` call site (~line 1650): compute `score` via `scoreAttempt` from the tool result + current `lastVerification`, `appendAttempt(lineage, {...})`, pass `{ strategy: <last planner strategy or 'DIRECT'>, verificationRank, score, stagnation: lineage.stagnation, bestKey: <bestAttempt targetKey or null> }` into `update()`. Inject returned `hintText` through the existing `pendingSupervisorHint` staged-observation path (no new message path). Imports: add `trajLineage` + `scoring` to the existing supervisor import block.

- [ ] **Step 4: Wire `subagentExecutor.js` (same shape, smaller)**

Mirror Step 3 with a per-sub-agent `createLineage({ taskId: subagent.id, ... })`; pass the same extended fields to its `supervisor.update` if present, else create one (follow the file's existing verifier-call pattern; do not restructure the loop).

- [ ] **Step 5: Run full unit suite + lint the touched files**

Run: `bunx vitest run tests/trajSupervisorFase2.test.mjs tests/trajectorySupervisor.test.mjs tests/objectiveVerifier.test.mjs` then `bunx eslint src/api/ai/trajLineage.js src/api/ai/scoring.js src/api/ai/strategyLib.js src/api/ai/trajectorySupervisor.js`
Expected: PASS + no lint errors (fix any import-order complaints inline).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/agent/useAbelinkPlan.js src/api/subagent/subagentExecutor.js tests/trajSupervisorFase2.test.mjs
git commit -m "feat(agent): wire Fase 2 lineage+scoring into main loop and sub-agents"
```

---

### Task 6: Real-activity eval tasks + world-state verifiers

**Files:**
- Create: `evaluation/tasks-student-corporate.mjs`
- Modify: `evaluation/terminal-bench.mjs` (`tb-git-01` verifier only)
- Modify: `evaluation/smoke.mjs` (additive cases)

**Interfaces:**
- Consumes: `runAbelinkAgent` (existing adapter), `akSentinel` (existing), per-run `workdir` passed by `run.mjs` (Task 7).
- Produces: `CORP_TASKS` registry `{ id: { prompt, verifier, requiredTools, maxTurns, effort } }`; verifier signature `(output, ctx) -> boolean` where `ctx = { sentinel, workdir, stepLog }`.

- [ ] **Step 1: Write smoke cases first (cheat-proof contract)**

Append to `evaluation/smoke.mjs` (follow its existing `assert` style):

```js
// Fase 2: world-state verifier contract — text without tool evidence MUST fail.
import { VERIFY_WORLD } from './tasks-student-corporate.mjs'
const fakeCtx = (over = {}) => ({ sentinel: 'S3N-test', workdir: '/tmp/abelinkbench-smoke', stepLog: [], ...over })
assert.equal(VERIFY_WORLD.corpReportTextOnly('laporan berisi S3N-test', fakeCtx()), false, 'text-only without write evidence fails')
assert.equal(VERIFY_WORLD.corpReportTextOnly('nope', fakeCtx({ stepLog: [{ toolCalls: [{ tool: 'write-file', success: true }] }] })), false, 'missing sentinel fails')
```

- [ ] **Step 2: Run smoke to verify it fails**

Run: `bun evaluation/smoke.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `evaluation/tasks-student-corporate.mjs`**

Registry with 8 tasks (`corp-report-01`, `corp-sheet-01`, `corp-docx-01`, `student-research-01`, `student-notes-01`, `code-fix-01`, `code-explain-01`, `tb-git-02`). Each entry: `prompt` (with `{{SENTINEL}}` + `{{WORKDIR}}` placeholders resolved by `run.mjs`), `requiredTools` array, `maxTurns`, `effort`, and `verifier(output, { sentinel, workdir, stepLog })` that (a) checks required tool evidence in `stepLog` via a shared `hasToolEvidence(stepLog, tools)` helper, (b) re-reads the artifact from `workdir` with `node:fs` and checks content predicates (sentinel present, headers/counts). `code-fix-01` verifier spawns `bunx vitest run` in the fixture dir via `node:child_process` `spawnSync` with a 120s timeout and passes only on exit 0. Export `VERIFY_WORLD` helper map for smoke tests. No LLM, no network in verifiers.

- [ ] **Step 4: Upgrade `tb-git-01` (terminal-bench.mjs, verifier only)**

Keep `prompt` + `maxTurns`; replace verifier body with: `(output, sentinel) => hasGitCommitWithMessage(fixtureRepo, sentinel)` where the helper runs `git -C <repo> log --oneline -5` via `spawnSync` and returns true only if a commit message contains the sentinel. `run.mjs` sets the fixture repo per run (Task 7). Do not change any other task.

- [ ] **Step 5: Run smoke + contract tests**

Run: `bun evaluation/smoke.mjs`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 6: Commit**

```bash
git add evaluation/tasks-student-corporate.mjs evaluation/terminal-bench.mjs evaluation/smoke.mjs
git commit -m "feat(eval): real-activity student/corporate tasks with world-state verifiers"
```

---

### Task 7: `--arch` axis + temp-dir fixtures + schema v3

**Files:**
- Modify: `evaluation/run.mjs` (`--arch` flag, per-run `tmp/abelinkbench-<runId>/`, placeholder resolution, `schemaVersion: 3`)
- Modify: `evaluation/matrix.mjs` (arch column entries)
- Modify: `evaluation/abelink-adapter.mjs` (arch-gated wiring toggle, env-driven)

**Interfaces:**
- Consumes: `TASKS` (terminal-bench) + `CORP_TASKS` (Task 6).
- Produces: reports with `{ schemaVersion: 3, arch, worldState: { workdir, sentinel } }` per run; `--compare` keeps working (compare same-arch reports).

- [ ] **Step 1: Extend smoke for report shape**

Add to `evaluation/smoke.mjs`:

```js
import { buildReportShell } from './run.mjs'
const shell = buildReportShell({ arch: 'avo', runId: 'smoke-1' })
assert.equal(shell.schemaVersion, 3, 'report shell is v3')
assert.equal(shell.arch, 'avo', 'arch recorded')
```

- [ ] **Step 2: Run smoke to verify it fails**

Run: `bun evaluation/smoke.mjs`
Expected: FAIL (`buildReportShell` not exported).

- [ ] **Step 3: Implement `run.mjs` changes**

Export `buildReportShell({ arch, runId })` returning `{ schemaVersion: 3, arch, runId, worldState: { workdir: 'tmp/abelinkbench-<runId>', sentinel: null }, results: [] }`. Parse `--arch vanilla|basic|avo` (default `basic` = current behavior so old reports stay comparable; reject unknown with exit 2). Per run: `mkdir tmp/abelinkbench-<runId>`, `sentinel = akSentinel()`, resolve `{{SENTINEL}}`/`{{WORKDIR}}` in prompt, set `ABELINK_BENCH_ARCH` env for the adapter, pass `{ sentinel, workdir, stepLog }` to verifiers, record `worldState` in the report. Set exit code 1 only on regression beyond threshold (existing rule).

- [ ] **Step 4: Adapter arch toggle (abelink-adapter.mjs)**

Read `ABELINK_BENCH_ARCH`: `vanilla` = skip supervisor + skip verify-gate replan; `basic` = current behavior; `avo` = Fase 2 extended fields (Task 5 wiring, already in code — adapter just sets an env/flag the executor reads; default `basic` when unset). No new processes, no new ports.

- [ ] **Step 5: matrix.mjs arch column**

Add `arch: ['vanilla', 'basic', 'avo']` + `reportSchema: 3` notes to the `terminal-bench-4.0` entry and a new `abelink-fase2-corp` entry (`status: 'implemented'`, `runner: 'evaluation/tasks-student-corporate.mjs'`, metrics `['task_success','steps','time','tool_calls','recovery_success_rate','verification_accuracy','premature_termination_rate']`).

- [ ] **Step 6: Run smoke + a dry single-task run**

Run: `bun evaluation/smoke.mjs` then `node evaluation/run.mjs --tasks tb-echo-01 --runs 1 --arch basic --out /tmp/abelinkbench-dry.json`
Expected: smoke PASS; dry run completes (needs provider — if no provider configured, record the exact error as the pilot blocker and stop; do not fake it).

- [ ] **Step 7: Commit**

```bash
git add evaluation/run.mjs evaluation/matrix.mjs evaluation/abelink-adapter.mjs evaluation/smoke.mjs
git commit -m "feat(eval): arch axis vanilla/basic/avo + per-run fixtures, schema v3"
```

---

### Task 8: Full gate + storage cleanup

**Files:** none (verification + hygiene).

- [ ] **Step 1: Run the unit suite**

Run: `bunx vitest run`
Expected: PASS, zero failures. Fix regressions before proceeding (never skip).

- [ ] **Step 2: Run smoke + verify script**

Run: `bun evaluation/smoke.mjs && bash scripts/verify.sh`
Expected: both green. `verify.sh` runs vitest + watermark harness + vite build + cargo check — allow its full time; on cargo failure, report the exact rustc error, do not bypass.

- [ ] **Step 3: Inspect disk usage (evidence before delete)**

Run: `df -h /media/abelion/Isaf && du -sh /tmp/abelinkbench-* tmp/abelinkbench-* evaluation/reports dist 2>/dev/null; ls ~/.local/share/abelink 2>/dev/null; du -sh ~/.local/share/abelink 2>/dev/null`
Expected: numbers on screen. Baseline known: partition 127G with 87G free (29% used) — NOT full; the 15G `src-tauri/target` is Rust build cache, NOT junk (deleting forces a full rebuild).

- [ ] **Step 4: Delete only proven junk (never build cache, never source)**

Run (each guarded, stop on first surprise):
```bash
rm -rf /tmp/abelinkbench-* tmp/abelinkbench-* /tmp/abelinkbench-dry.json
find . -maxdepth 2 -name "*.log" -not -path "./node_modules/*" -delete
rm -rf dist
```
Explicitly NOT deleted: `node_modules/`, `src-tauri/target/`, `dist-sidecar/`, `graphify-out/`, any `docs/`, any user data under `~/.local/share`. If the user wants the 15G back, that is a separate `cargo clean` decision (cost: full recompile) — ask first.

- [ ] **Step 5: Final status + commit if anything changed**

Run: `git status --short`
Expected: clean (all work committed per-task). If strays exist, stage only intended files and commit `chore: post-Fase2 hygiene`.

---

## Self-Review

**1. Spec coverage:** §4 lineage → Task 2+5. §5 scoring → Task 1+5. §6 strategy lib → Task 3+4. §7 supervisor → Task 4+5. §8.1 world verifiers → Task 6. §8.2 fixtures → Task 7. §8.3 forced tool-use → Task 6 (`requiredTools` + `hasToolEvidence`). §8.4 suite → Task 6 (8 tasks). §8.5 matrix + metrics → Task 7 (+ existing `abelink-eval.mjs` fns reused, no new metric code needed). §8.6 anti-gaming checklist → Tasks 6+7 (items 1-6 each mapped: 1=text-only-fail test, 2=sentinel-in-artifact, 3=per-run dirs, 4=separate verifier process, 5=stepLog, 6=smoke cheat cases). §9 safety/budgets → Tasks 4+5 (guards preserved) + Task 8. §10 rollout order → task order 1→8. §11 rejections respected (no per-model forks, no LLM judge, no multi-model).

**2. Placeholder scan:** no TBD/TODO/"similar to"/"appropriate handling" — every code step ships concrete code; `tb-git-02` vs upgraded `tb-git-01`: Task 6 names the new registry `tb-git-02` to avoid colliding with the upgraded `tb-git-01` in terminal-bench (both real-git; the `-02` variant lives in the corp module with `requiredTools`). Consistent.

**3. Type consistency:** `scoreAttempt({verificationRank, isNewSuccessKey, toolSuccessRate})` identical in Tasks 1/4/5. Lineage entry shape identical in Tasks 2/4/5. Supervisor output `{directive, hintText, nextStrategy, restoreHint}` identical in Tasks 4/5. Verifier `(output, {sentinel, workdir, stepLog})` identical in Tasks 6/7. `schemaVersion: 3` + `arch` + `worldState` identical in Task 7 steps. Fixed.
