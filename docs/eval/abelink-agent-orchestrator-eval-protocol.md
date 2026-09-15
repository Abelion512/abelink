# Abelink Agent Orchestrator & Recursive Improvement Eval Protocol
Version: 1.1
Date: 2026-09-14

## 1. Scope

Abelink is NOT the coding agent for the current phase.

Abelink's current role is:

- Head Manager / Orchestrator
- Research Agent
- Documentation / self-review agent
- Cross-agent coordinator
- Task router
- Result verifier
- Persistent task-state manager
- Human-facing control layer

External coding agents remain responsible for implementation work:

- OpenCode
- Claude Code
- Codex
- Hermes
- Other compatible coding agents

Abelink should control, coordinate, compare, monitor, and verify these agents through one interface rather than replacing them.

## 2. Current Product Thesis

User gives Abelink a goal.

Abelink determines:

1. what needs to be researched,
2. what information or documentation is needed,
3. which agent/tool should perform each part,
4. what context should be passed,
5. what output is expected,
6. how results should be verified,
7. what remains incomplete,
8. whether another agent should continue the work.

For coding tasks, Abelink should delegate implementation instead of implementing the code itself.

Target flow:

User intent
→ Abelink understands task
→ research / inspect / gather context
→ create execution brief
→ delegate to best external coding agent
→ monitor result
→ inspect output / tests / diff / status
→ ask another agent to fix when appropriate
→ verify outcome
→ summarize result
→ persist useful evidence

## 3. What the Five Existing Tests Become

The five tests remain useful, but they are now interpreted as reusable capability families.

### RI-01: Research Quality

Measures:

- information retrieval
- source diversity
- factual grounding
- coverage
- synthesis
- uncertainty handling
- avoiding premature completion

Output becomes reusable research evidence and a benchmark fixture.

### RI-02: Cross-Tool State Consistency

Measures:

- browser → file
- research → documentation
- write → read-back
- state persistence
- output verification
- context handoff

This is highly relevant to Abelink as a coordinator.

### RI-03: Recovery & Delegation

Measures:

- recognizes failure
- changes strategy
- retries appropriately
- switches tools/agents
- preserves task state
- does not restart from zero unnecessarily
- reports unresolved blockers accurately

This becomes especially important for multi-agent orchestration.

### RI-04: Long-Horizon Management

Measures:

- task decomposition
- persistent state
- continuation
- progress tracking
- intermediate verification
- context preservation
- stopping only after objectives are satisfied

### RI-05: Verification Robustness

Measures:

- evidence-based completion
- resistance to false positives
- resistance to false negatives
- distinction between "action happened" and "objective is satisfied"
- meaningful read-back validation

## 4. New Primary Capability Families

The old five tests are insufficient for the actual Abelink direction. Add these reusable families.

### RI-06: Agent Routing

Given a task, determine whether it should be:

- handled directly by Abelink
- delegated to OpenCode
- delegated to Claude Code
- delegated to Codex
- delegated to Hermes
- split across multiple agents

Do not hard-code "best agent" based only on model name. Judge based on task requirements, available capabilities, current context, cost, latency, reliability, and permissions.

### RI-07: Agent Handoff Quality

Test:

- execution brief quality
- context completeness
- constraints preservation
- acceptance criteria preservation
- artifact paths
- requested verification
- return format

A coding agent should be able to start with Abelink's handoff without requiring the user to repeat the entire task.

### RI-08: Multi-Agent Collaboration

Example:

Abelink researches and defines acceptance criteria.
→ OpenCode implements.
→ Codex reviews.
→ Claude Code investigates a difficult failure.
→ Abelink synthesizes the final state.

Measure whether collaboration improves outcome without unnecessary parallelism.

### RI-09: Agent Result Verification

Abelink must distinguish:

- agent says "done"
- files changed
- tests passed
- requested behavior exists
- acceptance criteria actually satisfied

The external agent's claim is evidence, not ground truth.

### RI-10: Self-Documentation Review

Abelink can be asked:

"Review your own current architecture/documentation. Identify contradictions, stale assumptions, missing capabilities, and high-impact improvements."

Abelink must produce findings, not edit its own code in the current phase.

Expected output:

- finding
- evidence
- impact
- suspected root cause
- suggested change
- affected component
- validation method
- priority

Those findings can then be handed to a coding agent.

## 5. Recursive Improvement Loop

The loop is not autonomous source-code self-modification.

Current safe implementation:

Eval
→ Trace
→ Grade
→ Diagnose
→ Improvement proposal
→ Human/coding-agent implementation
→ Regression
→ Unseen variant
→ Promote or reject
→ Repeat

Abelink owns the evaluation, diagnosis, orchestration, and evidence.

Coding agents own code modification.

## 6. Improvement Record

Every meaningful trial should produce an Improvement Record:

- trial_id
- capability
- task_prompt
- agents_used
- tools_used
- model/provider
- trace/reference
- expected_outcome
- actual_outcome
- score
- failure_class
- earliest_failure
- root_cause_hypothesis
- proposed_improvement
- implementation_owner
- regression_tests
- before_score
- after_score
- unseen_variant_score
- decision
- notes

## 7. Promotion Gate

A change should be promoted only when:

1. the original failure is fixed,
2. existing regression cases do not degrade,
3. at least one variant succeeds,
4. verification still works,
5. the change does not introduce unnecessary coupling,
6. safety/permission behavior remains intact,
7. the improvement is attributable to an identifiable change.

No "it feels smarter" promotion.

## 8. Prompt Design Rule

Do NOT ask Abelink:

"Fix the code."

Ask Abelink:

"Inspect, research, diagnose, plan, delegate, monitor, verify, and report."

For implementation:

"Prepare an execution brief for the appropriate coding agent."

Then delegate.

## 9. Reusable Master Eval Prompt

Use this as the base prompt for repeated Abelink testing:

You are testing Abelink as an agent orchestrator and research/review system.

Your job is NOT to modify Abelink source code.

For this task:

1. Understand the user's actual objective.
2. Determine what information, tools, files, web research, or external coding agents are required.
3. Research or inspect the available evidence.
4. Decompose the objective into concrete sub-tasks.
5. For implementation-related work, prepare a precise execution brief and delegate it to the appropriate external coding agent rather than coding yourself.
6. Track what has actually been completed.
7. Verify outputs against explicit acceptance criteria.
8. Distinguish agent claims from independently verified evidence.
9. Recover from ordinary failures without abandoning the whole task.
10. Preserve useful context and task state.
11. Review the result for missing work, contradictions, weak evidence, stale assumptions, and premature completion.
12. At the end, report:
   - objective
   - work completed
   - agents/tools used
   - evidence collected
   - verification performed
   - unresolved issues
   - detected failure patterns
   - one to three highest-impact improvement proposals for Abelink

Do not claim success merely because an agent returned a successful-looking message.
Do not write or modify Abelink source code during this evaluation.
Do not invent evidence.
Do not hide failures.
Prefer the smallest useful next action over unnecessary architectural expansion.

## 10. Reusable Self-Review Prompt

Review Abelink's current documentation, architecture descriptions, and known behavior.

Do not modify code.

Find contradictions, stale assumptions, missing orchestration capabilities, weak verification semantics, poor handoffs, unnecessary user micromanagement, and places where Abelink could coordinate external coding agents more effectively.

For every finding return:

- severity
- evidence
- why it matters
- likely root cause
- proposed improvement
- component/document affected
- verification method

Prioritize improvements that increase real-world task completion, reliability, delegation quality, verification quality, and ease of use.

Do not propose new features merely because they are interesting.

## 11. Example Rotation

Run variants of:

A. Research-only task
B. Research + document task
C. Research + external coding-agent delegation
D. Failed-agent recovery
E. Multi-agent handoff
F. Self-documentation review
G. Long-running delegated task
H. Verification without confirmation keywords
I. Same task with a different external agent
J. Same task with deliberately incomplete context

The prompt wording should rotate while the capability contract remains stable.

## 12. Long-Term Direction

Abelink becomes the layer above coding agents, not another coding agent.

Conceptually:

User
  ↓
Abelink Head Manager
  ├── Research
  ├── Browser / Web
  ├── Files / Documents
  ├── Memory / Task State
  ├── Verification
  └── Agent Orchestrator
       ├── OpenCode
       ├── Claude Code
       ├── Codex
       ├── Hermes
       └── future agents

This enables a future "one command / one voice" workflow:

User states intent
→ Abelink understands
→ Abelink researches
→ Abelink prepares context
→ Abelink delegates
→ agents execute
→ Abelink monitors
→ Abelink verifies
→ Abelink recovers or redirects
→ Abelink reports

The system becomes smarter by accumulating reliable evidence about what works, what fails, which agent is effective for which task, how handoffs fail, and which improvements survive regression.

That is the practical foundation for recursive improvement.
