# Abelink Recursive Improvement & Reusable Agent Eval Protocol

**Document ID:** ABELINK-RI-EVAL-001  
**Version:** 0.1  
**Date:** 2026-09-14  
**Scope:** Abelink core agent reliability and capability growth  
**Status:** Design / immediate-use protocol

## 1. Executive conclusion

Yes. The results of the five existing test prompts can be reused for Abelink development, but raw outputs are not enough. Each run must be converted into structured evidence that can drive the next engineering decision.

The five tests should therefore become a reusable evaluation suite rather than one-off prompts.

The intended loop is:

`Task -> Trial -> Trace -> Grade -> Diagnose -> Improvement Candidate -> Patch -> Regression -> Re-run -> Promote/Reject -> Repeat`

This is the practical form of a recursive improvement loop. It does **not** mean letting Abelink rewrite itself without control. Engineering changes remain reviewable, reversible, test-gated, and bounded.

Anthropic currently describes recursive self-improvement as a frontier capability involving models writing code and running experiments that produce successors. Separately, Anthropic's agent-evaluation guidance recommends treating evals as living artifacts, inspecting transcripts, and using eval-driven development over the lifetime of an agent. This document applies those principles at the smaller product-engineering level relevant to Abelink. [Sources: Anthropic Institute; Demystifying evals for AI agents]

## 2. What should change from the previous five prompts

The old five prompts are useful smoke/regression scenarios. They are not yet a self-improvement system because they mainly answer: "Did Abelink succeed?"

The reusable system must answer six questions:

1. What capability was tested?
2. What evidence proves success or failure?
3. Where in the trajectory did Abelink lose quality?
4. Was the failure in the model, planner, tool use, verification, recovery, or task state?
5. What smallest change could improve the result?
6. Did that change improve the target case without causing regressions elsewhere?

Do not replace every prompt after every run. Keep stable benchmark tasks and rotate **parameters, environments, constraints, and task instances**. Otherwise the agent can simply become tuned to the benchmark wording.

## 3. The five reusable benchmark families

| ID | Capability | Primary signal | Reuse method |
|---|---|---|---|
| RI-01 | Browser research / extraction | factual extraction + source coverage | rotate topics, sites, counts, evidence fields |
| RI-02 | Cross-tool state consistency | browser -> file -> read-back integrity | rotate file formats, sections, tool order |
| RI-03 | Failure recovery | recovery quality after ordinary tool failure | inject bounded failures, rotate failure point |
| RI-04 | Long-horizon execution | completion quality across many steps | rotate task length and dependencies |
| RI-05 | Verification robustness | correct completion gate | rotate wording, content shape, read/write mix |

### RI-01 Browser research / extraction

**Capability under test:** browsing, extraction, source selection, structured synthesis, truthful completion.

**Success:** target entities are present, required fields are populated, evidence is traceable, and the final answer does not claim work that was not completed.

**Failure classes:** false verifier negative, source omission, extraction corruption, premature completion, unsupported claim.

**Rotation dimensions:** topic, entity count, source diversity, source failure, required fields, output location.

### RI-02 Cross-tool state consistency

**Capability under test:** maintaining a consistent state across browser, filesystem, and later read-back.

**Success:** final artifact contains the required content and a subsequent observation can confirm it.

**Failure classes:** file-created-is-treated-as-done, stale content, partial write, missing read-back, criteria drift.

**Rotation dimensions:** Markdown/JSON/TXT, section count, exact-vs-semantic criteria, browser/file order.

### RI-03 Failure recovery

**Capability under test:** continue useful work after ordinary non-safety failures.

**Success:** Abelink recognizes the failure, changes strategy, preserves already-acquired evidence, and still reaches the best attainable result.

**Failure classes:** infinite retry, premature abort, evidence loss, poor alternative selection, unverifiable recovery.

**Rotation dimensions:** failed source/tool step, retry count, alternative source availability, partial progress.

### RI-04 Long-horizon execution

**Capability under test:** planning, state persistence, multi-step execution, verification, and continuation.

**Success:** all required terminal conditions are met without user micromanagement; intermediate failures do not erase valid progress.

**Failure classes:** context/state drift, budget waste, premature completion, missing dependency, terminal pause when resumable.

**Rotation dimensions:** number of steps, dependency depth, file count, source count, required verification passes.

### RI-05 Verification robustness

**Capability under test:** objective verification correctly distinguishes meaningful completion from superficial evidence.

**Success:** genuine read/extract results can pass without interaction-confirmation vocabulary, while interaction tasks retain stronger confirmation requirements.

**Failure classes:** false negative, false positive, wrong verification lens, criteria discarded during escalation, trivial-result acceptance.

**Rotation dimensions:** wording, action mix, empty result, navigation-only, mixed interaction/read sequence.

## 4. Required result artifact for every trial

Every test run should produce a machine-readable result, not just a chat transcript.

Suggested schema:

```json
{
  "eval_id": "RI-01",
  "trial_id": "2026-09-14T07:30Z-ri01-001",
  "task_variant": "ai-agent-research-v3",
  "environment": {
    "os": "linux",
    "build": "<git-sha>",
    "model_route": "<provider/model>",
    "toolset": ["browser", "filesystem"]
  },
  "objective": {
    "required": [],
    "forbidden": [],
    "terminal_conditions": []
  },
  "outcome": {
    "status": "passed|partial|failed|blocked|not_run",
    "score": 0,
    "criteria_passed": 0,
    "criteria_total": 0,
    "recovery_count": 0,
    "verification_count": 0
  },
  "trace": {
    "steps": 0,
    "tool_calls": 0,
    "replans": 0,
    "last_observation_type": "<type>",
    "final_observation": "<summary>"
  },
  "diagnosis": {
    "failure_class": "<taxonomy-id>",
    "root_layer": "core.verifier|core.execution|core.state|model|tool|environment",
    "evidence": []
  },
  "improvement": {
    "candidate": "<smallest proposed fix>",
    "expected_gain": "<metric>",
    "regression_risk": "low|medium|high"
  },
  "provenance": {
    "artifact_paths": [],
    "commit": "<git-sha>"
  }
}
```

The schema is intentionally small. Do not build a second agent runtime merely to collect telemetry.

## 5. Grading model

Use multiple graders because one binary pass/fail hides useful failure structure.

### Deterministic graders

Use deterministic checks where possible:

- required file exists
- required fields exist
- entity count is correct
- output is non-empty
- expected sections exist
- terminal file can be re-read
- no required criterion is missing
- verifier returns the expected state for known fixtures

### Semantic grader

Use an LLM grader only where deterministic assertions cannot judge quality reliably, for example factual usefulness or whether recovery preserved the user's actual objective.

The semantic grader should score each criterion separately and explain the failed criterion, not merely emit a single overall number.

### Human review

Human review is reserved for:

- grader disagreement
- unexpected successful strategies
- suspiciously perfect benchmark adaptation
- changes that could affect autonomy or security

## 6. Scorecard

Recommended normalized score:

`Total = 0.25*TaskSuccess + 0.20*Verification + 0.15*Recovery + 0.15*StateIntegrity + 0.10*Efficiency + 0.10*EvidenceQuality + 0.05*UserFriction`

Each component is 0..1.

Do not optimize only for total score. A patch that improves completion while increasing false-positive verification is a regression even when the aggregate score increases.

Track at minimum:

- success rate
- partial-success rate
- false-positive verification rate
- false-negative verification rate
- premature completion rate
- recovery success rate
- criteria coverage
- user interventions per task
- tool-call efficiency
- regression count

## 7. Failure taxonomy

| ID | Failure | Meaning |
|---|---|---|
| VFN | Verification false negative | task succeeded but verifier rejected it |
| VFP | Verification false positive | verifier accepted weak/invalid evidence |
| CREEP | Criteria drift | later logic silently changes or drops the original objective |
| PREM | Premature completion | agent stops before terminal conditions |
| REC0 | Recovery failure | ordinary failure causes avoidable abort |
| RECL | Recovery loop | repeated retries without strategy change |
| STATE | State inconsistency | durable state does not reflect reality |
| EVID | Evidence loss | useful prior observation is discarded |
| TOOL | Tool failure | tool itself fails or returns unusable data |
| MODEL | Reasoning/model error | model chooses an incorrect strategy |
| ENV | Environment noise | external infrastructure causes non-agent failure |
| SAFETY | Safety/approval boundary | action correctly blocked or requires approval |

The taxonomy should remain small. Add a category only when the new failure has materially different remediation.

## 8. Recursive improvement loop

### Stage A: Run

Run a stable benchmark variant under a known build and record the complete trajectory.

### Stage B: Grade

Apply deterministic graders, then semantic graders where needed.

### Stage C: Diagnose

Identify the earliest meaningful failure, not merely the final symptom.

Example:

`browser extract succeeded -> observation contained useful data -> verifier demanded interaction vocabulary -> task replanned -> task failed`

Root failure = `VFN`, layer = verifier.

### Stage D: Propose the smallest fix

The improvement candidate must name:

- exact layer
- exact files or module boundary
- hypothesis
- expected metric movement
- regression cases

Avoid architecture expansion when a local fix explains the evidence.

### Stage E: Implement

Use the coding agent in a bounded change set. The implementation agent must read the current repo state before editing.

### Stage F: Regression

Run the target case plus the untouched neighboring cases. A patch is not promoted because the original failure disappears.

### Stage G: Promote

Promote only when:

- target metric improves
- no critical regression appears
- tests are reproducible
- diff is explainable
- behavior remains inside safety/approval constraints

### Stage H: Mutate the benchmark

Only after a capability becomes stable, generate new variants of the same capability. This prevents benchmark overfitting.

## 9. How the five existing prompts become a perpetual test wheel

Do not keep five static prompts forever. Treat them as **benchmark generators**.

Each cycle changes 2-4 dimensions while preserving the capability contract.

Example:

`RI-01 / topic=AI agents / count=5 / output=md`

becomes:

`RI-01 / topic=Linux automation / count=3 / output=md`

then:

`RI-01 / topic=open-source browser agents / count=7 / output=json`

The task wording can change, but the capability contract must remain stable.

### Rotation policy

- 70% stable capability variants
- 20% new combinations of known capabilities
- 10% exploratory or adversarial-but-safe tasks

The objective is to grow coverage without turning the benchmark into an obstacle course that only measures prompt memorization.

## 10. Reusable master prompt for Abelink testing

Use this as the outer evaluator instruction, while injecting one benchmark task at a time:

```text
You are testing the current Abelink build, not redesigning it.

Execute the assigned benchmark task as a real user would expect:
- work independently within existing permissions
- use available tools when useful
- preserve valid progress across failures
- verify the actual terminal state before claiming completion
- do not create placeholder output just to satisfy a superficial check
- do not ask the user to micromanage ordinary execution
- respect safety, approval, and provider constraints

Benchmark ID: <RI-ID>
Task variant: <VARIANT>
Required outcome: <OUTCOME>
Required evidence: <EVIDENCE>
Recovery condition: <RECOVERY>
Verification condition: <VERIFICATION>

When finished, produce:
1. the actual task result
2. the final verification result
3. a concise execution summary
4. any failure/recovery points
5. what evidence proves each required criterion

Do not optimize your behavior for this exact wording. Optimize for the capability contract.
```

## 11. Prompt generator templates

### RI-01 Browser research

```text
Research <N> <TOPIC> using available browser/search tools.
For each item collect: <FIELDS>.
Save the result to <FILE>.
Read the file back before finishing.
Verify that exactly <N> items are present and every item contains all required fields.
If a source fails, continue with an alternative source without discarding valid work.
Do not claim completion until the saved artifact contains real, inspectable data.
```

### RI-02 Mixed tool state

```text
Use the browser to collect <DATASET>.
Write the result to <FILE> with sections <SECTIONS>.
Read the file back and verify every required section.
If the artifact is incomplete, repair it before finishing.
The existence of the file alone is not completion.
```

### RI-03 Recovery

```text
Complete <TASK> using normal available tools.
If a tool or source fails, diagnose the failure, preserve useful progress, choose a reasonable alternative, and continue.
Do not retry the same failed path indefinitely.
Before finishing, verify the best attainable result against <CRITERIA>.
```

### RI-04 Long horizon

```text
Complete <LONG_TASK> end-to-end.
Do not require step-by-step user supervision.
Maintain durable state, verify intermediate dependencies, recover from ordinary failures, and verify the final terminal conditions.
Do not stop merely because one sub-step succeeded.
```

### RI-05 Verification

```text
Perform <TASK> and then verify the terminal result.
The verifier must distinguish meaningful read/extract evidence from empty or trivial evidence.
For interaction actions, retain the stronger confirmation semantics.
For read-only/navigation/extraction actions, verify from substantive returned evidence rather than requiring interaction-confirmation vocabulary.
Preserve the original objective criteria throughout escalation or replanning.
```

## 12. What to save from every run

Minimum artifacts:

- raw transcript / trajectory
- structured result JSON
- grader output
- failure classification
- proposed fix
- code diff or commit reference when a fix is implemented
- before/after score
- regression result

Recommended directory structure:

```text
benchmarks/
  RI-01-browser-research/
    cases/
    trials/
    graders/
  RI-02-cross-tool-state/
  RI-03-recovery/
  RI-04-long-horizon/
  RI-05-verification/
reports/
  score-history.jsonl
  improvement-log.md
  regression-matrix.md
```

## 13. Improvement ledger

Use one row per proposed change.

| Field | Meaning |
|---|---|
| Change ID | unique patch reference |
| Trigger trial | benchmark trial that revealed issue |
| Root cause | earliest meaningful failure |
| Hypothesis | why the patch should help |
| Scope | exact component touched |
| Target metric | metric expected to improve |
| Regression suite | tests that must stay green |
| Result | improved / neutral / regressed |
| Decision | promote / revert / investigate |

This creates institutional memory for Abelink without requiring another planner, another runtime, or another AI brain bolted onto the first AI brain like a software centipede.

## 14. Promotion gates

A change can move from experimental to stable only when:

### Gate 1: Correctness

Target capability improves on at least 3 independent variants.

### Gate 2: Regression

Existing critical fixtures remain green.

### Gate 3: Generalization

The improvement appears on unseen wording or task parameters.

### Gate 4: Stability

Results remain acceptable across multiple trials, not one lucky run.

### Gate 5: Safety

No expansion of authority or bypass of approval boundaries is introduced as a side effect.

### Gate 6: Simplicity

The change fixes the evidenced failure without adding unnecessary runtime architecture.

## 15. What this means for the current Abelink development sequence

The immediate sequence should stay incremental:

1. Finish and validate the current browser-verification fix.
2. Run RI-05 first because it directly tests the changed verifier semantics.
3. Run RI-02 to ensure mixed browser/file execution still preserves criteria.
4. Run RI-03 and RI-04 for recovery and long-horizon behavior.
5. Only then move to the previously identified sub-agent evidence mismatch.
6. After that, investigate durable-task budget/resumability.
7. Keep Personal Growth as a later interpretation/evidence layer rather than making it another execution runtime.

This ordering follows the existing architecture boundary: the core gets better at completing tasks; a later Personal Growth layer interprets what happened for goals, learning, evidence, and human capability.

## 16. What not to do

Do not:

- let benchmark prompts rewrite production code automatically without a gated review path
- treat passing one benchmark as proof of intelligence
- optimize only for one aggregate score
- use the exact same prompt forever
- discard failed traces after the patch succeeds
- add a second planner or runtime just to implement evaluation
- let the evaluation harness share mutable state between trials without explicit control
- use success words such as "done" or "success" as the sole completion signal

## 17. Relationship to recursive self-improvement

For Abelink, use the term **recursive improvement loop** for the engineering mechanism and reserve **recursive self-improvement** for a broader future capability claim.

The practical loop here is:

`Abelink task -> evidence -> eval -> diagnosis -> code/tool/prompt improvement -> regression -> stronger Abelink`

This is meaningful self-improvement only in the engineering sense that the system participates in discovering and validating changes to improve future performance. It should not be described as autonomous AGI/ASI or unrestricted self-modification.

Anthropic's current public material supports three closely related ideas: living agent evals, transcript-based diagnosis, and self-improving agents that update skills from feedback. These provide useful reference patterns, but they do not establish that Abelink or any benchmark has achieved AGI, ASI, or unrestricted recursive self-improvement.

## 18. Immediate next run order

Run these in order against the current build:

**1. RI-05:** verification regression with real browser read/extract data, empty/trivial read guard, navigate-only, and mixed interaction/read cases.

**2. RI-02:** research -> write -> read-back -> repair incomplete artifact.

**3. RI-03:** introduce an ordinary source/tool failure and measure whether useful work is preserved.

**4. RI-04:** longer multi-step task with dependencies and final read-back verification.

Store the complete trace and result JSON for each. Do not patch after every individual run. Batch closely related failures into a diagnosis pass so one symptom does not create five unnecessary commits.

## 19. Definition of done for this protocol

The protocol is working when a new Abelink build can be compared against prior builds using the same capability contracts, each failure produces an actionable diagnosis, improvements are validated on unseen variants, and regressions remain visible over time.

At that point, the tests are no longer disposable prompts. They become Abelink's **capability memory**.

---

### Sources

- Anthropic, *Demystifying evals for AI agents* (2026-01-09): tasks, trials, graders, transcripts, isolated environments, transcript inspection, living eval suites, and eval-driven development.
- Anthropic Institute, *When AI builds itself*: current public framing of recursive self-improvement.
- Anthropic, *Writing effective tools for AI agents - using AI agents* (2025-09-11): building evaluations and using agents to improve tools.
- Anthropic, *Trustworthy agents in practice* (2026-04-09): self-directed agent loops and governance principles.
