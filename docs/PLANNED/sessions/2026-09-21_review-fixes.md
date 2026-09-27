# Session: Self-Review Fixes (2026-09-21)

4 parallel reviewers (code-review skill) over 48 files / 4 waves.
2 Critical + 8 Warning confirmed against source, all fixed this session.

## Fixed
1. **Ceiling stall** (Critical): `renewBudgetWindow(512)` returned 512 → infinite renew loop. Fix: no-growth detection (`budgetGrewThisTurn`), falls to honest-stop; fallback +16 clamped to 512 hard ceiling (was unbounded). `useAbelinkPlan.js:932-1019`.
2. **Depth dead** (Critical): `createEnvironment: () => environment` dropped depth; `agentRunner` ctx lacked depth. Fix: `(d) => ({...environment, depth: d})` + `depth` in executeTool ctx (`agentRunner.js:388-395`); nested-spawn regression test.
3. **Queue-add false success** (Critical): id-less `enqueueTrack`/`pending:` stored nothing playable yet claimed success. Fix: resolve title→ID via searchMusic BEFORE enqueue; honest failure when unresolved. `useAbelinkMusic.js:70-109` + `tests/musicQueueAdd.test.mjs` (2).
4. **Compaction retry-every-turn**: counter reset only on success. Fix: backoff on attempt. **Dead prune**: length-compare never true (1:1 map). Fix: char-size compare.
5. **Breaker over-broad**: human-denial + NO-RESULTS tripped malfunction streak (violates breaker's own contract). Fix: `isMalfunction` narrow (`progressEvaluator.js`), breaker-only; supervisor/harness stay broad. Pinned in `progressEvaluator.test.mjs`.

## Deferred (reviewer suggestions, not this session)
- trajectoryLearning local FAILURE_RE vs shared isFailure (diverged classifier).
- Diagnose START-tanpa-END false-positives on live sessions (needs hasTerminal gating).
- Curried tx() crash on unknown keys; sidebar/STT labels unlocalized; Knowledge delete Orama stale; plugin EN/ID mix + edit half-write; raw 11-char ID hijack ("Unstoppable"); oneLimit not persisted; hot-loop dynamic imports; approve-all JSON audit; help text sync; agentRunner +16 vs GUI +48 divergence doc.

## Verification
- Full: 136 files, 1432/1432. Lint touched: exit 0, 0 errors. Build: OK.
