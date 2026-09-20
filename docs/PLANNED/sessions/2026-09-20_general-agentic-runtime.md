# Session 2026-09-20 — General Agentic Runtime

## Scope

General-purpose agent runtime reliability for research/browser, OS automation, learning/study, long-horizon execution, and evidence-grounded trajectory learning. Coding-agent capability is not duplicated because Opencode and Hermes already cover that workflow.

## Decisions

- Keep the existing ReAct loop, objective verifier, trajectory supervisor, watchdog, budget, skills, and evaluation harness.
- Add deterministic progress evaluation instead of another independent planning loop.
- Treat prompt engineering as one layer of the stack; context engineering and runtime state remain first-class.
- Treat browser UI density as an observability/context problem to measure before attributing failures to model capability.
- Keep semantic page text ahead of interactive controls in browser observations.
- Treat trajectory learning as evidence extraction before LLM-based skill synthesis.
- Keep benchmark evaluation separate from the runtime completion oracle.

## Files changed

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANNED/2026-09-20_general-agentic-runtime.md`
- `src/api/ai/autonomyContract.js`
- `src/api/ai/progressEvaluator.js`
- `src/api/ai/trajectoryLearning.js`
- `src/api/ai/planning.js`
- `src/api/ai/trajectorySupervisor.js`
- `src/api/ai/skillSynthesizer.js`
- `src/hooks/agent/useAbelinkPlan.js`
- `sidecar/main/tools/browserTools.mjs`
- `extension/background.js`
- `extension/browser-observation.mjs`
- targeted Vitest coverage under `tests/`

## Verification status

Targeted tests were added but have not yet been executed in a local runtime from this chat session. Final PR status must remain non-final until CI or an equivalent reproducible test run reports the relevant suites green.

## Known limitations

- Typed cross-domain ToolObservation with explicit exitCode/signal/stdout/stderr/artifact deltas is Phase 2.
- Transactional worktree execution and rollback for filesystem mutations is Phase 2.
- Cross-session trajectory retrieval/ranking is Phase 2.
- Browser/source evidence lineage and extended weak-model stress matrix are Phase 2.
