# Session 2026-09-21 — Benchmark + Standards Adaptation

## Scope

Refine the next step after PR #45 and document the important decisions from the session. Focus areas:

- benchmark what Abelink runtime actually improves;
- distinguish runtime benchmarks from model benchmarks;
- inventory existing benchmark coverage before adding another suite;
- refresh model-reference thinking for 2026-09-21;
- define how to adapt externally proven standards to Abelink's many from-scratch components without rewriting everything.

## Current PR state

PR #45 (feat/general-agentic-runtime) remains open and unmerged.

Current head after documentation updates:

91b9d8f8abeac7786df7ad4eded52253c443c26d

The GitHub connector currently returned no individual commit statuses, so CI-green status is not claimed here.

## Key decisions

### 1. PR sequencing

Do not open PR #46 yet.

PR #45 remains the implementation PR for the general agentic runtime. After PR #45 is reviewed and merged, create PR #46 from main.

PR #46 should be measurement-first.

### 2. What Abelink must benchmark

Primary question:

> Does the Abelink runtime become more reliable, verifiable, recoverable, and efficient after the architecture change?

Measure runtime behavior, not generic model intelligence.

Core metrics:

- objective/task success
- independently verified success
- turns/steps
- tool calls
- retries/repeated actions
- stagnation events
- recovery events
- elapsed time
- token/context cost when available
- human intervention
- evidence/provenance quality
- termination correctness

Do not reduce the result to a single opaque aggregate score.

### 3. Existing benchmark coverage

The repository already contains:

- 11 architecture probes under evaluation/bench/;
- 8 terminal-style tasks in evaluation/terminal-bench.mjs;
- 8 student/corporate world-state tasks;
- a 6-rung long-horizon ladder: 8/16/32/64/96/128 artifacts;
- deterministic architecture metrics in evaluation/abelink-eval.mjs.

PR #46 must not duplicate these blindly.

### 4. PR #46 target matrix

Proposed new measurement set:

- Research/evidence: 6
- Browser/web-use: 5
- OS automation: 5
- Study/learning: 5
- Failure recovery: 5
- Cross-session reuse: 4

Total: 30 deterministic fixtures.

Paired experiments:

- main vs PR #45 with all variables held fixed except runtime architecture;
- browser raw/existing representation vs semantic-first representation;
- optional cross-model compatibility matrix with exact resolved model identifiers.

### 5. Standards adaptation strategy

Important architectural conclusion:

> Abelink should adopt proven standards as contracts/invariants, not copy external architectures wholesale.

Many Abelink subsystems were created from scratch. Therefore:

- do not assume from-scratch means wrong;
- identify the standard/invariant the subsystem should satisfy;
- adapt the local implementation;
- wrap existing data before creating new stores;
- replace a subsystem only when evidence shows a concrete gain worth the migration cost.

Adoption modes:

- Adopt: implementation already satisfies the invariant.
- Adapt: preserve component, change contract/representation.
- Wrap: add a thin compatibility/evidence boundary.
- Replace: exceptional, evidence-driven.

Default is Adapt, then Wrap.

### 6. External references

Anthropic, OpenAI, Hermes, NVIDIA AVO, UI-TARS, DeepSeek, Kimi, Qwen, Grok, and Tesla are treated as reference families for patterns, invariants, failure modes, and evaluation methodology.

They are not treated as templates that Abelink must copy.

Vendor/model benchmark numbers are not Abelink runtime results.

## Documentation added

- docs/PLANNED/2026-09-21_agent-benchmark-matrix.md
  - current benchmark inventory
  - PR #46 measurement contract
  - fixture matrix
  - paired experiments
  - regression/anti-cheat rules

- docs/PLANNED/2026-09-21_runtime-standards-adaptation.md
  - adoption modes
  - reference-to-Abelink mapping
  - customization rules
  - explicit no-rewrite-by-prestige policy

- docs/PLANNED/sessions/2026-09-21_benchmark-standards-adaptation.md

A PR #45 conversation comment was also added pointing reviewers to the benchmark contract and sequencing.

## Verification status

No repository code was modified in this session. Documentation changes were committed to the PR #45 branch.

PR #45 CI status is currently not claimed as green because the connector returned no individual commit status entries.

> Correction (2026-09-21, later session): PR #45 check status *is* available and the
> `Frontend test + build (vitest, vite)` job was in fact failing on the skill-promotion gate.
> The connector did not surface it at the time. See
> [2026-09-21_pr45-mini-eval-gate-alignment.md](2026-09-21_pr45-mini-eval-gate-alignment.md)
> for the audited check results and the fix.

## Next gate

Review PR #45 and resolve any CI/review issues.

After merge:

1. branch from main;
2. implement PR #46 measurement/evidence plane;
3. add the documented 30-fixture matrix without duplicating existing benchmark registries;
4. run baseline-vs-PR45 and browser representation ablations;
5. use results to decide which standards adaptations should proceed, change, or be abandoned.

## Non-goals

- no new universal loop;
- no provider lock-in;
- no full runtime rewrite;
- no second coding agent;
- no leaderboard chasing;
- no architecture changes justified only by similarity to another company's system.