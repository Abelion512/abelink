# General Agentic Runtime — Long-Horizon + Cross-Domain Plan

Date: 2026-09-20
Branch: feat/general-agentic-runtime

## User intent

Abelink is not being turned into another coding CLI. Software engineering can already be delegated to Opencode and Hermes. This work focuses on the general agent runtime around the model:

- research and browse_use
- OS automation
- solving exercises and self-directed study
- long-horizon execution
- recovery from weak model behavior and tool failures
- learning from verified trajectories
- cross-session reuse of successful procedures

The engineering target is stronger agentic autonomy from the surrounding system, not a claim that architecture alone makes a model AGI.

## Stress-tested design

### AVO is a transferable pattern, not the whole architecture

Use the reusable loop: propose -> execute -> observe -> evaluate -> revise -> continue. Do not create a standalone AVO mode that duplicates Abelink's existing planner/supervisor.

### Abelink already has a ReAct loop and completion verifier

Current runtime already contains `useAbelinkPlan.js`, `objectiveVerifier.js`, `trajectorySupervisor.js`, browser watchdog/handshake handling, progressive skill disclosure, context compaction, and the evaluation harness.

The next bottlenecks are:

1. progress quality
2. state continuity
3. evidence quality
4. context quality
5. trajectory learning quality

### Prompt engineering remains part of the runtime contract

Prompt engineering is still necessary because the model needs a stable behavioral protocol. Context engineering becomes more important as tasks become longer and multi-turn.

Recommended stack:

1. Harness engineering: execution, safety, approvals, persistence.
2. Loop engineering: continuation, recovery, budget, termination.
3. Context engineering: objective, state, evidence, history, tools.
4. Prompt/protocol engineering: concise model-facing behavioral contract.
5. Evaluation engineering: deterministic measurement and regression detection.

Anthropic's context-engineering guidance emphasizes managing the full evolving context, including tools, external data, message history, and just-in-time retrieval, rather than treating the system prompt as the entire solution.

### Browse_use failure is not automatically a prompt failure

Potential classes:

- no handshake / stale token / timeout
- wrong or stale tab identity
- UI-heavy observation with too little semantic text
- empty extraction
- action succeeds but page state does not change
- search returns no results versus provider failure
- context loss across browser turns
- semantic stagnation across different tools
- premature final answer

## Browser perception principle

Web agents should receive a representation optimized for reasoning, not a raw dump of every visible UI control.

Preferred observation hierarchy:

1. page identity: URL, title, tab/session identity
2. main semantic text: headings, article/problem text, labels, confirmation messages
3. relevant structured data: tables, forms, links, selected controls
4. only task-relevant interactive elements with stable IDs
5. screenshot/visual evidence on demand when text or DOM is insufficient

The runtime must not assume that a low-capability model can infer page semantics from a large control-heavy DOM. This should be measured as an observability/representation problem before blaming the model.

## Proposed runtime architecture

USER OBJECTIVE
  -> objective / criteria ledger
  -> micro-planner
  -> policy / approval / budget
  -> atomic tool execution
  -> typed observation
  -> objective verifier + progress evaluator
  -> trajectory supervisor
      -> continue
      -> modify
      -> explore
      -> retrieve prior success
      -> revert / stop
  -> persist trajectory
  -> evidence-grounded learning
  -> future context retrieval

Memory and skills remain orthogonal:

Memory -> facts and episodic context
Skills -> procedures, references, scripts
Trajectory learning -> verified reusable strategies

## Runtime invariants

1. Model output is a proposal, not proof.
2. Tool success is not objective success.
3. Different actions do not automatically imply progress.
4. Failed evidence cannot be rewritten into success.
5. Reusable learning must be grounded in observed evidence.
6. Context compaction preserves objective, unresolved criteria, decisive observations, and next action.
7. Safety and approval remain outside model authority.
8. Benchmark evaluation remains independent from task completion proof.

## Phase 1

### Progress-aware supervision

Add deterministic progress signals to complement existing repeat-key detection. Different tools can still be semantically stagnant when they produce no new evidence or verified state change.

### General agentic contract

Provide domain guidance for research, browser, OS automation, learning, and generic tasks while keeping one common runtime protocol.

### Evidence-grounded trajectory learning

Normalize raw trajectory data before the model-based skill synthesizer sees it. Successful observations become candidate procedural evidence; failures remain diagnostic context; final answers remain claims rather than proof.

### Browser representation

Add an explicit semantic-first observation contract so main content is separated from UI controls. Text, structured page state, and task-relevant controls should be prioritized over full DOM/UI dumps.

## Phase 2

1. typed `ToolObservation`: exitCode, signal, stdout, stderr, timeout, artifact deltas
2. transactional workspace / isolated worktree execution for file-changing tasks
3. cross-session trajectory retrieval and prior-success ranking
4. source/evidence lineage for browser and research tasks
5. runtime evaluator plugins per domain
6. weak-model stress matrix at 10/25/50+ turns
7. context-compaction stress tests
8. evaluator-tampering and reward-hacking probes

## Acceptance criteria

- Existing objective verification remains authoritative.
- Progress supervision cannot bypass approval, watchdog, or budget guards.
- Semantic stagnation is detectable even when tool/query strings differ.
- Browser UI-heavy observations do not crowd out semantic page content by default.
- Trajectory learning input is bounded and inspectable.
- Model-only final claims are never treated as learning proof.
- No coding-agent capability is duplicated from Opencode/Hermes.
- No new model/provider dependency is introduced.
- Existing smoke and targeted Vitest tests stay green.

## Non-goals

- claiming Abelink is AGI
- replacing the planner with an unconditional one-action loop
- replacing domain verifiers with an LLM judge
- rewriting the Rust security/approval layer
- building another coding agent
