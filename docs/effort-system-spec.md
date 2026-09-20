# Abelink-Linux Adaptive Reasoning, Effort, Workflow, Policy, Budget, and Test Specification

## 1. Objective

Implement a provider-agnostic Reasoning/Effort System for Abelink-Linux with these user-facing levels:

```text
LOW
MEDIUM
HIGH
xHIGH
MAX
ULTRA
AUTO
```

The system MUST separate:

1. model reasoning effort
2. planning depth
3. tool execution
4. verification
5. reflection
6. retries and recovery
7. workflow/orchestration

Critical semantic rule:

```text
ULTRA = MAX + Workflow/Orchestration
```

ULTRA MUST NOT mean only "MAX with more tokens".

AUTO is a dynamic policy-selection mode, not a fixed seventh cognitive level.

---

## 2. Effort Level Type

Use a strongly typed enum or equivalent:

```python
from enum import Enum

class EffortLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    XHIGH = "xhigh"
    MAX = "max"
    ULTRA = "ultra"
    AUTO = "auto"
```

Required values:

```python
assert EffortLevel.LOW.value == "low"
assert EffortLevel.MEDIUM.value == "medium"
assert EffortLevel.HIGH.value == "high"
assert EffortLevel.XHIGH.value == "xhigh"
assert EffortLevel.MAX.value == "max"
assert EffortLevel.ULTRA.value == "ultra"
assert EffortLevel.AUTO.value == "auto"
```

---

## 3. Typed Effort Policy Schema

Create an explicit typed internal policy.

```python
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class EffortPolicy:
    level: EffortLevel

    reasoning_score: float
    planning_score: float
    verification_score: float
    reflection_score: float
    workflow_score: float

    execution_step_budget: int
    tool_call_budget: int
    retry_budget: int
    reflection_budget: int
    verification_budget: int
    critic_budget: int

    workflow_node_budget: int
    subtask_budget: int
    workflow_depth_budget: int
    parallel_worker_budget: int

    planning_enabled: bool
    verification_enabled: bool
    reflection_enabled: bool
    workflow_enabled: bool
    decomposition_enabled: bool
    critic_enabled: bool
    recovery_enabled: bool
    adaptive_escalation: bool
    parallel_execution: bool

    planning_mode: Literal[
        "none",
        "light",
        "explicit",
        "deep",
        "full",
        "adaptive",
    ]

    reasoning_mode: Literal[
        "minimal",
        "moderate",
        "deep",
        "very_deep",
        "maximum",
    ]
```

Do not use one untyped dictionary as the canonical representation.

---

## 4. Runtime Budget State

Policy MUST be immutable.

Mutable consumption MUST live in separate runtime state.

```python
@dataclass
class BudgetState:
    execution_steps_used: int = 0
    tool_calls_used: int = 0
    retries_used: int = 0
    reflections_used: int = 0
    verifications_used: int = 0
    critics_used: int = 0

    workflow_nodes_used: int = 0
    subtasks_used: int = 0
    workflow_depth_used: int = 0
    parallel_workers_peak: int = 0
```

Do not mutate `EffortPolicy` during execution.

---

## 5. Budget Snapshot Type

Expose a read-only budget snapshot.

```python
@dataclass(frozen=True)
class BudgetSnapshot:
    execution_steps_used: int
    execution_steps_remaining: int

    tool_calls_used: int
    tool_calls_remaining: int

    retries_used: int
    retries_remaining: int

    reflections_used: int
    reflections_remaining: int

    verifications_used: int
    verifications_remaining: int

    critics_used: int
    critics_remaining: int

    workflow_nodes_used: int
    workflow_nodes_remaining: int

    subtasks_used: int
    subtasks_remaining: int

    workflow_depth_used: int
    workflow_depth_remaining: int

    parallel_workers_peak: int
    parallel_workers_remaining: int
```

Remaining values MUST never be negative.

---

## 6. Policy Resolution Result

Use typed resolution metadata.

```python
@dataclass(frozen=True)
class EscalationEvent:
    from_level: EffortLevel
    to_level: EffortLevel
    reason: str
    step: int
```

```python
@dataclass(frozen=True)
class ResolvedEffort:
    requested_level: EffortLevel
    initial_level: EffortLevel
    effective_level: EffortLevel

    policy: EffortPolicy

    resolution_reason: str

    escalations: tuple[EscalationEvent, ...]
```

This MUST distinguish:

```text
requested effort
initial effort
effective effort
```

---

## 7. Canonical Effort Semantics

```text
LOW
    minimal cognitive effort

MEDIUM
    moderate cognitive effort + lightweight planning

HIGH
    deep cognitive effort + planning + verification

xHIGH
    very deep cognitive effort + reflection + iteration

MAX
    maximum single-agent cognitive/execution capability

ULTRA
    MAX + workflow/orchestration capability
```

`AUTO` is handled separately in Section 14.

---

## 8. LOW Policy

Workflow:

```text
Understand
→ Answer / Execute
```

Required values:

```text
reasoning_score = 0.20
planning_score = 0.00
verification_score = 0.00
reflection_score = 0.00
workflow_score = 0.00

execution_step_budget = 8
tool_call_budget = 4
retry_budget = 0
reflection_budget = 0
verification_budget = 0
critic_budget = 0

workflow_node_budget = 0
subtask_budget = 0
workflow_depth_budget = 0
parallel_worker_budget = 1
```

No explicit planning, reflection, verification, retries, or workflow orchestration.

---

## 9. MEDIUM Policy

Workflow:

```text
Understand
→ Mini Plan
→ Execute
→ Answer
```

Required values:

```text
reasoning_score = 0.40
planning_score = 0.20
verification_score = 0.20
reflection_score = 0.00
workflow_score = 0.00

execution_step_budget = 24
tool_call_budget = 12
retry_budget = 1
reflection_budget = 0
verification_budget = 1
critic_budget = 0

workflow_node_budget = 0
subtask_budget = 0
workflow_depth_budget = 0
parallel_worker_budget = 1
```

---

## 10. HIGH Policy

Workflow:

```text
Understand
→ Plan
→ Execute
→ Observe
→ Verify
→ Answer
```

Required values:

```text
reasoning_score = 0.60
planning_score = 0.40
verification_score = 0.50
reflection_score = 0.25
workflow_score = 0.00

execution_step_budget = 48
tool_call_budget = 24
retry_budget = 2
reflection_budget = 1
verification_budget = 2
critic_budget = 0

workflow_node_budget = 0
subtask_budget = 0
workflow_depth_budget = 0
parallel_worker_budget = 1
```

---

## 11. xHIGH Policy

Workflow:

```text
Deep Think
→ Deep Plan
→ Execute
→ Observe
→ Reflect
→ Verify
→ Retry / Recover
```

Required values:

```text
reasoning_score = 0.80
planning_score = 0.70
verification_score = 0.75
reflection_score = 0.65
workflow_score = 0.00

execution_step_budget = 64
tool_call_budget = 32
retry_budget = 3
reflection_budget = 2
verification_budget = 3
critic_budget = 0

workflow_node_budget = 0
subtask_budget = 0
workflow_depth_budget = 0
parallel_worker_budget = 1
```

xHIGH remains a single-agent mode.

---

## 12. MAX Policy

MAX is the maximum single-agent mode.

Workflow:

```text
Maximum Reasoning
→ Full Planning
→ Tool Execution
→ Observation
→ Reflection
→ Verification
→ Recovery / Retry
```

Required values:

```text
reasoning_score = 1.00
planning_score = 1.00
verification_score = 1.00
reflection_score = 1.00
workflow_score = 0.00

execution_step_budget = 128
tool_call_budget = 64
retry_budget = 4
reflection_budget = 4
verification_budget = 4
critic_budget = 1

workflow_node_budget = 0
subtask_budget = 0
workflow_depth_budget = 0
parallel_worker_budget = 1
```

MAX MUST NOT require workflow orchestration.

---

## 13. ULTRA Policy

ULTRA inherits MAX cognitive behavior and adds explicit orchestration.

Required values:

```text
reasoning_score = 1.00
planning_score = 1.00
verification_score = 1.00
reflection_score = 1.00
workflow_score = 1.00

execution_step_budget = 256
tool_call_budget = 128
retry_budget = 6
reflection_budget = 6
verification_budget = 8
critic_budget = 4

workflow_node_budget = 32
subtask_budget = 16
workflow_depth_budget = 8
parallel_worker_budget = 4
```

Capabilities:

```text
planning_enabled = true
verification_enabled = true
reflection_enabled = true
workflow_enabled = true
decomposition_enabled = true
critic_enabled = true
recovery_enabled = true
adaptive_escalation = true
parallel_execution = true
```

Critical invariant:

```text
ULTRA = MAX cognitive/execution capability
        + workflow orchestration
```

---

## 14. AUTO Policy Semantics

`AUTO` MUST be a dynamic resolver mode, not a fixed effort policy.

Conceptually:

```text
AUTO
→ classify task
→ choose initial level
→ execute
→ observe signals
→ optionally escalate
→ finish
```

`AUTO` MUST NOT be passed to a model provider as if it were a provider-native reasoning level.

The resolver MUST produce:

```text
requested_level = AUTO
initial_level = one of LOW...ULTRA
effective_level = current active level
```

### 14.1 Default Initial Level

Baseline:

```text
AUTO initial level = MEDIUM
```

unless a deterministic classifier selects another level.

### 14.2 Classification Inputs

The classifier MAY consider:

```text
task complexity
tool requirement
expected steps
uncertainty
verification requirement
dependency count
task horizon
failure sensitivity
repository scope
workflow requirement
```

It MUST NOT inspect private model chain-of-thought.

### 14.3 Classification Output

The classifier MUST return one of:

```text
LOW
MEDIUM
HIGH
xHIGH
MAX
ULTRA
```

It MUST NOT return AUTO.

Example:

```python
@dataclass(frozen=True)
class AutoDecision:
    selected_level: EffortLevel
    confidence: float
    reasons: tuple[str, ...]
```

Required:

```python
assert decision.selected_level != EffortLevel.AUTO
assert 0.0 <= decision.confidence <= 1.0
```

### 14.4 AUTO Escalation

Allowed baseline sequence:

```text
LOW → MEDIUM
MEDIUM → HIGH
HIGH → xHIGH
xHIGH → MAX
MAX → ULTRA
```

Baseline implementation MUST NOT skip levels.

Escalation requires a trigger:

```text
verification_failure
repeated_tool_failure
retry_threshold
planning_failure
task_horizon_exceeded
workflow_complexity
dependency_complexity
```

### 14.5 AUTO Downgrade

AUTO MUST NOT downgrade during an active root task by default.

Once escalated, the higher level remains active for that root execution unless a future explicit resource-recovery policy is introduced.

### 14.6 AUTO and Hard Limits

AUTO obeys all hard limits.

### 14.7 AUTO and Explicit User Selection

If the user explicitly specifies a level, AUTO classification is bypassed.

For example:

```text
requested_level = MAX
initial_level = MAX
```

### 14.8 AUTO Resolution Metadata

Example:

```json
{
  "requested_effort": "auto",
  "initial_effort": "medium",
  "effective_effort": "high",
  "resolution_reason": "verification_failure",
  "escalations": [
    {
      "from": "medium",
      "to": "high",
      "reason": "verification_failure",
      "step": 7
    }
  ]
}
```

---

## 15. Capability Matrix

| Level | Planning | Verification | Reflection | Workflow | Decomposition | Critic | Parallel |
|---|---|---|---|---|---|---|---|
| LOW | no | no | no | no | no | no | no |
| MEDIUM | light | basic | no | no | no | no | no |
| HIGH | yes | yes | yes | no | no | no | no |
| xHIGH | deep | strong | yes | no | no | no | no |
| MAX | full | strong | deep | no | no | optional | no |
| ULTRA | full | strong | deep | yes | yes | yes | yes |

AUTO dynamically resolves to one of these fixed policies.

---

## 16. Numeric Score Bounds

All normalized score fields MUST satisfy:

```text
0.0 <= score <= 1.0
```

This applies to:

```text
reasoning_score
planning_score
verification_score
reflection_score
workflow_score
```

Values outside the range MUST be rejected.

---

## 17. Runtime Hard Bounds

Hard maximums:

```text
execution_step_budget <= 512
tool_call_budget <= 256
workflow_node_budget <= 64
subtask_budget <= 32
workflow_depth_budget <= 8
parallel_worker_budget <= 8
```

Normal user configuration MUST NOT bypass these ceilings.

---

## 18. Execution-Step Budgets

Canonical defaults:

```text
LOW     = 8
MEDIUM  = 24
HIGH    = 48
xHIGH   = 64
MAX     = 128
ULTRA   = 256
```

A step is one major runtime action:

```text
model invocation
tool invocation
verification action
reflection action
critic action
workflow transition
```

Nested operations MUST NOT accidentally double-count the same logical event.

---

## 19. Tool-Call Budgets

Canonical defaults:

```text
LOW     = 4
MEDIUM  = 12
HIGH    = 24
xHIGH   = 32
MAX     = 64
ULTRA   = 128
```

One tool call consumes:

```text
tool_calls_used += 1
execution_steps_used += 1
```

---

## 20. Retry Budgets

Canonical defaults:

```text
LOW     = 0
MEDIUM  = 1
HIGH    = 2
xHIGH   = 3
MAX     = 4
ULTRA   = 6
```

The initial attempt does not consume retry budget.

Therefore:

```text
MAX   = 5 maximum attempts
ULTRA = 7 maximum attempts
```

---

## 21. Reflection Budgets

Canonical:

```text
LOW     = 0
MEDIUM  = 0
HIGH    = 1
xHIGH   = 2
MAX     = 4
ULTRA   = 6
```

Each reflection consumes one reflection unit and one execution step.

---

## 22. Verification Budgets

Canonical:

```text
LOW     = 0
MEDIUM  = 1
HIGH    = 2
xHIGH   = 3
MAX     = 4
ULTRA   = 8
```

Each explicit verification consumes one verification unit and one execution step.

---

## 23. Critic Budgets

Canonical:

```text
LOW     = 0
MEDIUM  = 0
HIGH    = 0
xHIGH   = 0
MAX     = 1
ULTRA   = 4
```

MAX may use one final critic-style validation.

ULTRA supports a dedicated critic workflow.

---

## 24. Workflow Budget

Workflow budget is separate from execution budget.

Canonical:

```text
LOW     = 0
MEDIUM  = 0
HIGH    = 0
xHIGH   = 0
MAX     = 0
ULTRA   = 32
```

Only explicit workflow nodes consume `workflow_node_budget`.

Normal single-agent execution steps do not.

Therefore:

```python
for level in [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
]:
    policy = resolve_effort(level)
    assert policy.workflow_node_budget == 0
    assert policy.workflow_enabled is False
```

---

## 25. Subtask Budget

Canonical:

```text
LOW     = 0
MEDIUM  = 0
HIGH    = 0
xHIGH   = 0
MAX     = 0
ULTRA   = 16
```

A root task is not counted as a subtask.

---

## 26. Workflow Depth Budget

Canonical:

```text
LOW     = 0
MEDIUM  = 0
HIGH    = 0
xHIGH   = 0
MAX     = 0
ULTRA   = 8
```

Depth means the longest dependency chain.

---

## 27. Parallel Worker Budget

Canonical:

```text
LOW     = 1
MEDIUM  = 1
HIGH    = 1
xHIGH   = 1
MAX     = 1
ULTRA   = 4
```

Only ULTRA may use parallel workflow execution by default.

Hard ceiling:

```text
parallel_workers <= 8
```

Dependency constraints always override parallelization.

---

## 28. Policy Monotonicity

Required:

```python
assert low.reasoning_score < medium.reasoning_score
assert medium.reasoning_score < high.reasoning_score
assert high.reasoning_score < xhigh.reasoning_score
assert xhigh.reasoning_score < max.reasoning_score
assert max.reasoning_score == ultra.reasoning_score
```

And:

```python
assert low.tool_call_budget < medium.tool_call_budget
assert medium.tool_call_budget < high.tool_call_budget
assert high.tool_call_budget < xhigh.tool_call_budget
assert xhigh.tool_call_budget < max.tool_call_budget
assert max.tool_call_budget < ultra.tool_call_budget
```

And:

```python
assert low.retry_budget <= medium.retry_budget
assert medium.retry_budget <= high.retry_budget
assert high.retry_budget <= xhigh.retry_budget
assert xhigh.retry_budget <= max.retry_budget
assert max.retry_budget <= ultra.retry_budget
```

---

## 29. ULTRA Inheritance Invariant

Required:

```python
assert ultra.reasoning_score == max.reasoning_score
assert ultra.planning_score == max.planning_score
assert ultra.verification_score == max.verification_score
assert ultra.reflection_score == max.reflection_score
```

And:

```python
assert ultra.workflow_score > max.workflow_score
assert ultra.workflow_enabled is True
assert ultra.decomposition_enabled is True
assert ultra.subtask_budget > 0
assert ultra.workflow_node_budget > 0
```

---

## 30. Provider Adapter Architecture

Core runtime MUST be provider-independent.

```text
Abelink EffortPolicy
        ↓
Provider Adapter
        ↓
Provider Request
```

Example:

```python
class ModelProviderAdapter:
    def apply_effort(self, request, effort_policy):
        ...
```

Provider-specific reasoning parameters MUST NOT leak into `EffortPolicy`.

---

## 31. Provider Capability Fallback

When a provider lacks native reasoning controls, approximate the policy using available mechanisms:

```text
native reasoning API
OR
token budget
OR
prompt-level planning
OR
execution-loop depth
OR
verification/retry behavior
```

The canonical Abelink policy remains unchanged.

---

## 32. Canonical Policy vs Effective Policy

The runtime MUST preserve:

```text
canonical_policy
effective_policy
```

Example:

```python
canonical = resolve_effort(EffortLevel.ULTRA)

effective = apply_limits(
    canonical,
    runtime_limits,
    provider_limits,
    system_limits,
)
```

Canonical policy MUST NOT be mutated.

---

## 33. Budget Accounting

Each budget has its own counter:

```text
execution steps
tool calls
retries
reflections
verifications
critics
workflow nodes
subtasks
workflow depth
parallel workers
```

One logical operation may consume multiple dimensions where explicitly defined.

Example:

```text
tool call:
    +1 execution step
    +1 tool call
```

---

## 34. Budget Reservation

Before consuming a bounded resource:

```text
CHECK
→ RESERVE
→ EXECUTE
→ COMMIT
```

Under concurrent ULTRA execution, reservation MUST be atomic.

The runtime MUST NOT allow concurrent branches to exceed the same shared root budget.

---

## 35. Root Budget Propagation

Budgets belong to the root task.

Child subtasks MUST share the parent's remaining resources.

Incorrect:

```text
A gets 128
B gets 128
C gets 128
```

Correct:

```text
Root = 128

A uses 10
B uses 20
C uses 15

Remaining = 83
```

A child MUST NOT reset parent budgets.

---

## 36. Budget Exhaustion

When a budget reaches zero, the corresponding resource MUST stop.

Example:

```python
if budget.tool_calls_remaining == 0:
    raise BudgetExhausted("tool_call_budget")
```

The runtime MAY perform finalization that does not consume the exhausted resource.

No exhausted budget may silently reset during the same root execution.

---

## 37. Budget Precedence

Highest priority first:

```text
1. System safety / hard limits
2. Global runtime hard limits
3. Provider capabilities / provider limits
4. User explicit effort selection
5. AUTO selection
6. Adaptive escalation
7. Canonical effort defaults
8. Provider/model recommended defaults
```

Lower-priority rules MUST NOT override higher-priority rules.

---

## 38. Effective Budget Calculation

Use the minimum applicable bound:

```python
effective_budget = min(
    canonical_budget,
    runtime_limit,
    provider_limit,
    system_hard_limit,
)
```

For layers without a limit, treat that layer as unbounded for that resource.

Canonical policy MUST remain unchanged after clamping.

---

## 39. Configuration Precedence

```text
system defaults
    ↓
application defaults
    ↓
user configuration
    ↓
task-level explicit override
    ↓
AUTO / adaptive adjustment
    ↓
hard-limit clamp
```

Adaptive adjustment changes active state, not original user configuration.

---

## 40. Adaptive Escalation

Allowed baseline sequence:

```text
LOW → MEDIUM
MEDIUM → HIGH
HIGH → xHIGH
xHIGH → MAX
MAX → ULTRA
```

Escalation triggers:

```text
verification_failure
repeated_tool_failure
retry_threshold
planning_failure
task_horizon_exceeded
workflow_complexity
dependency_complexity
```

No trigger means no escalation.

---

## 41. Workflow Engine

ULTRA MUST provide an explicit workflow abstraction.

Recommended concepts:

```text
Workflow
WorkflowNode
WorkflowEdge
Task
Subtask
ExecutionState
Checkpoint
```

Supported operations:

```text
sequential
conditional branch
retry
loop
parallel
dependency tracking
checkpoint
recovery
dynamic replanning
```

---

## 42. Task Decomposition

ULTRA MUST support:

```text
root task
    ↓
subtask A
subtask B
subtask C
    ↓
final synthesis
```

Each subtask MUST contain:

```text
id
description
dependencies
status
result
failure_count
verification_state
```

Independent tasks MAY execute concurrently.

Dependent tasks MUST wait for prerequisites.

---

## 43. Verification

Verification is a first-class operation.

Examples:

```text
code       → run tests
file edit  → inspect file state
shell task → inspect resulting state
automation → verify expected state
research   → cross-check important output
workflow   → validate subtask result
```

A second model call alone is not automatically verification.

---

## 44. Critic

ULTRA MUST support a bounded critic phase.

Possible outcomes:

```text
PASS
REVISE
REPLAN
FAIL
```

Critic results MUST affect execution.

A `REVISE` result MUST trigger revision.

A `REPLAN` result MUST trigger replanning.

Critic recursion MUST be bounded.

---

## 45. Recovery

Recovery flow:

```text
EXECUTION_FAILED
→ DIAGNOSE
→ RETRY
→ VERIFY
```

Repeated failure may lead to:

```text
RETRY
→ REPLAN
→ ESCALATE
```

No recovery loop may be infinite.

---

## 46. Observability

Every run MUST expose metadata including:

```text
requested_effort
initial_effort
effective_effort
resolution_reason
escalation_count
reasoning_budget
planning_depth
tool_call_count
verification_count
reflection_count
retry_count
workflow_node_count
subtask_count
critic_count
recovery_count
final_status
```

Do not expose private chain-of-thought.

---

## 47. Exact Fixture Infrastructure

All fixtures MUST use isolated temporary directories.

Recommended layout:

```text
<test-temp-root>/
└── abelink-effort-fixtures/
    ├── fixture-01-trivial/
    ├── fixture-02-rename/
    ├── fixture-03-repair/
    ├── fixture-04-flaky/
    ├── fixture-05-permanent-failure/
    ├── fixture-06-independent/
    ├── fixture-07-dependency/
    ├── fixture-08-critic/
    ├── fixture-09-auto-escalation/
    └── fixture-10-max-ultra/
```

Each test gets a unique directory.

Tests MUST NOT share mutable fixture state.

---

## 48. Fixture Lifecycle and Cleanup

Every fixture MUST execute:

```text
SETUP
→ ASSERT INITIAL STATE
→ RUN
→ ASSERT RESULT
→ CLEANUP
→ ASSERT CLEANUP
```

Use native test-framework temporary directories or context managers.

Cleanup MUST execute even when assertions fail.

Cleanup MUST only remove resources created by that fixture.

---

## 49. Exact Fixture 1: Trivial Answer

Input:

```text
What is 2 + 2?
```

Expected:

```text
4
```

Assertions:

```python
assert result.status == "success"
assert result.effective_effort == "low"
assert result.workflow_node_count == 0
assert result.subtask_count == 0
assert result.critic_count == 0
assert result.reflection_count == 0
assert result.retry_count == 0
```

No filesystem resources required.

---

## 50. Exact Fixture 2: Simple Tool Execution

Setup:

```text
fixture-02-rename/
└── hello.txt
```

Contents:

```text
hello
```

Input:

```text
Rename hello.txt to renamed.txt.
```

Expected:

```text
hello.txt    absent
renamed.txt  present
```

Assertions:

```python
assert result.status == "success"
assert not (root / "hello.txt").exists()
assert (root / "renamed.txt").exists()
assert (root / "renamed.txt").read_text() == "hello"
assert result.workflow_node_count == 0
```

Cleanup must remove the fixture root and assert removal.

---

## 51. Exact Fixture 3: Broken Code Repair

Setup:

```text
fixture-03-repair/
├── app.py
└── test_app.py
```

`app.py`:

```python
def add(a, b):
    return a - b
```

`test_app.py`:

```python
from app import add

def test_add():
    assert add(2, 3) == 5
```

Input:

```text
Fix app.py so the tests pass.
```

Expected implementation:

```python
return a + b
```

Assertions:

```python
assert result.status == "success"
assert run_tests(root).passed
assert "a + b" in (root / "app.py").read_text()
assert result.verification_count >= 1
```

For xHIGH:

```python
assert result.reflection_count >= 1
assert result.workflow_node_count == 0
```

---

## 52. Exact Fixture 4: Deterministic Retry

Create:

```text
fixture-04-flaky/flaky_tool.py
```

Behavior:

```text
attempt 1 → exit 1
attempt 2 → exit 0
```

Initial state:

```json
{
  "attempts": 0
}
```

Input:

```text
Run flaky_tool and finish only after successful execution.
```

Assertions:

```python
assert result.status == "success"
assert result.retry_count == 1
assert read_attempt_count(root) == 2
assert result.retry_count <= result.policy.retry_budget
```

Cleanup resets mock/tool state and removes the fixture directory.

---

## 53. Exact Fixture 5: Permanent Failure

Create:

```text
fixture-05-permanent-failure/always_fail.py
```

Every invocation exits with failure.

Input:

```text
Execute always_fail until it succeeds.
```

Assertions:

```python
assert result.status in {
    "failed",
    "aborted",
    "budget_exhausted",
}
assert result.retry_count <= result.policy.retry_budget
assert result.execution_steps <= result.policy.execution_step_budget
assert result.terminated is True
assert result.execution_steps < 512
```

All child processes MUST be terminated during cleanup.

---

## 54. Exact Fixture 6: Three Independent Subtasks

Setup:

```text
fixture-06-independent/
├── module_a.py
├── module_b.py
└── module_c.py
```

Contents:

```python
# module_a.py
def value():
    return 10
```

```python
# module_b.py
def value():
    return 20
```

```python
# module_c.py
def value():
    return 30
```

Input:

```text
Inspect module_a.py, module_b.py, and module_c.py independently,
then calculate the total.
```

Expected:

```text
60
```

MAX:

```python
max_result = run_task(TASK, effort="max")

assert max_result.status == "success"
assert max_result.final_answer_contains("60")
assert max_result.workflow_node_count == 0
assert max_result.subtask_count == 0
```

ULTRA:

```python
ultra_result = run_task(TASK, effort="ultra")

assert ultra_result.status == "success"
assert ultra_result.final_answer_contains("60")
assert ultra_result.workflow_node_count >= 4
assert ultra_result.subtask_count >= 3
assert ultra_result.decomposition_count >= 1
```

Required logical nodes:

```text
inspect A
inspect B
inspect C
synthesis
```

---

## 55. Exact Fixture 7: Dependency Chain

Setup:

```text
fixture-07-dependency/
└── input.txt
```

Contents:

```text
ABELINK_TEST
```

Required workflow:

```text
A = read input
B = transform to lowercase
C = verify "abelink_test"
```

Graph:

```text
A → B → C
```

Assertions:

```python
assert node("B").status == "blocked"
assert node("C").status == "blocked"
```

After A:

```python
assert node("A").status == "completed"
assert node("B").status in {"ready", "running"}
assert node("C").status == "blocked"
```

After B:

```python
assert node("B").status == "completed"
assert node("C").status in {"ready", "running"}
```

After C:

```python
assert node("C").status == "completed"
assert result.status == "success"
```

---

## 56. Exact Fixture 8: Critic Rejects Result

Use a deterministic fake backend.

First proposal:

```text
41
```

Critic:

```text
REVISE
```

Second proposal:

```text
42
```

Critic:

```text
PASS
```

Assertions:

```python
assert result.status == "success"
assert result.final_answer_contains("42")
assert result.critic_count >= 2
assert result.revision_count >= 1
assert result.final_answer_contains("41") is False
```

The first result MUST NOT be accepted after critic rejection.

---

## 57. Exact Fixture 9: AUTO Escalation

Use a deterministic mock backend:

```text
LOW:
    verification fails

MEDIUM:
    verification fails

HIGH:
    verification succeeds
```

Run:

```python
result = run_task(
    TASK,
    effort="auto",
)
```

Required:

```python
assert result.requested_effort == "auto"
assert result.initial_effort == "medium"
assert result.effective_effort == "high"
```

For a test specifically forcing LOW as the initial classifier result:

```python
assert result.escalation_path == [
    "low",
    "medium",
    "high",
]
```

Every escalation MUST include a reason.

---

## 58. Exact Fixture 10: MAX to ULTRA Escalation

Create a deterministic task requiring:

```text
3 independent analyses
+
1 synthesis
+
1 critic
```

Initial mode:

```text
MAX
```

MAX cannot orchestrate.

ULTRA can orchestrate.

Required:

```python
assert result.initial_effort == "max"
assert result.effective_effort == "ultra"
assert result.escalations >= 1
assert result.escalations[-1].reason == "workflow_complexity"
assert result.workflow_node_count >= 5
assert result.subtask_count >= 3
assert result.critic_count >= 1
assert result.status == "success"
```

---

## 59. Policy Invariant Tests

Required:

```python
assert low.workflow_enabled is False
assert medium.workflow_enabled is False
assert high.workflow_enabled is False
assert xhigh.workflow_enabled is False
assert max.workflow_enabled is False
assert ultra.workflow_enabled is True
```

And:

```python
assert low.workflow_node_budget == 0
assert medium.workflow_node_budget == 0
assert high.workflow_node_budget == 0
assert xhigh.workflow_node_budget == 0
assert max.workflow_node_budget == 0
assert ultra.workflow_node_budget == 32
```

---

## 60. MAX vs ULTRA Golden Test

Run identical task:

```python
max_result = run_task(TASK, effort="max")
ultra_result = run_task(TASK, effort="ultra")
```

Required:

```python
assert max_result.workflow_node_count == 0
assert max_result.subtask_count == 0

assert ultra_result.workflow_node_count >= 4
assert ultra_result.subtask_count >= 3
```

This is the mandatory proof that:

```text
ULTRA = MAX + Workflow
```

rather than:

```text
ULTRA = MAX + larger token budget
```

---

## 61. Resource Exhaustion Tests

Create deterministic tests for:

```text
tool budget
execution step budget
retry budget
reflection budget
verification budget
critic budget
workflow node budget
subtask budget
workflow depth
parallel worker limit
```

Each MUST terminate gracefully:

```python
assert result.terminated is True
assert result.status in {
    "failed",
    "aborted",
    "budget_exhausted",
}
```

---

## 62. AUTO Policy Tests

### AUTO is not a fixed policy

```python
resolved = resolve_effort("auto")
assert resolved.initial_level != EffortLevel.AUTO
assert resolved.effective_level != EffortLevel.AUTO
```

### Explicit level bypasses AUTO

```python
resolved = resolve_effort(
    requested_level="max",
    auto_classifier="low",
)
assert resolved.initial_level == EffortLevel.MAX
```

### AUTO can escalate

```python
result = run_task(
    AUTO_ESCALATION_FIXTURE,
    effort="auto",
)
assert result.initial_effort != "ultra"
assert result.effective_effort in {
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
}
```

### AUTO respects hard limits

```python
effective = resolve_effective_policy(
    requested_effort="auto",
    runtime_limits=...,
    provider_limits=...,
    system_limits=...,
)

assert effective.execution_step_budget <= 512
assert effective.workflow_node_budget <= 64
assert effective.subtask_budget <= 32
assert effective.parallel_worker_budget <= 8
```

---

## 63. Fixture Cleanup Acceptance Tests

After every fixture:

```python
assert not fixture_root.exists()
```

Also verify:

```python
assert no_fixture_child_processes_remain()
assert no_fixture_threads_remain()
assert no_fixture_temp_files_remain()
assert no_global_mock_state_remains()
```

Tests MUST NOT delete unrelated files.

Repository mutation tests MUST use a copied temporary repository.

---

## 64. Provider Adapter Tests

For every adapter:

```python
policy = resolve_effort("max")
original = policy

provider_request = adapter.apply_effort(
    request,
    policy,
)

assert policy == original
```

Provider limitations belong to the effective provider request and observability metadata, not the canonical policy.

---

## 65. Budget Accounting Tests

Test:

```text
single model call
single tool call
retry
reflection
verification
critic
workflow node
subtask
parallel branch
budget exhaustion
```

Example:

```python
state = BudgetState()

consume_model_call(state)
assert state.execution_steps_used == 1
assert state.tool_calls_used == 0
```

Tool:

```python
consume_tool_call(state)
assert state.execution_steps_used == 2
assert state.tool_calls_used == 1
```

Retry:

```python
consume_retry(state)
assert state.retries_used == 1
assert state.execution_steps_used == 3
```

No counter may become negative or exceed effective budget.

---

## 66. Precedence Tests

User explicit selection:

```python
result = run_task(
    TASK,
    requested_effort="max",
    auto_classifier="low",
)
assert result.initial_effort == "max"
```

Runtime limit:

```python
policy = resolve_effective_policy(
    effort="ultra",
    runtime_limits={
        "tool_call_budget": 10,
    },
)
assert policy.tool_call_budget == 10
```

Provider limit:

```python
effective = apply_limits(
    ultra_policy,
    provider_limits={
        "tool_call_budget": 6,
    },
)
assert effective.tool_call_budget == 6
```

Hard limit:

```python
effective = apply_limits(
    ultra_policy,
    runtime_limits={
        "tool_call_budget": 100,
    },
    system_limits={
        "tool_call_budget": 4,
    },
)
assert effective.tool_call_budget == 4
```

---

## 67. No Fake Feature Criterion

Invalid if a capability is only represented by configuration without executable runtime behavior.

Invalid examples:

```python
workflow_enabled = True
```

with no workflow engine, or:

```python
effort = "ultra"
max_tokens *= 2
```

with no orchestration, or:

```python
critic_enabled = True
```

with no critic execution.

Every enabled capability MUST have:

```text
executable code path
fixture/test
observable behavior
bounded budget
```

---

## 68. Backward Compatibility

Existing Abelink configuration MUST continue working without specifying effort.

Required:

```text
existing config
→ application starts
→ existing basic task succeeds
```

No provider integration may regress solely because the effort system exists.

---

## 69. Configuration

Support:

```yaml
reasoning:
  effort: low
```

```yaml
reasoning:
  effort: medium
```

```yaml
reasoning:
  effort: high
```

```yaml
reasoning:
  effort: xhigh
```

```yaml
reasoning:
  effort: max
```

```yaml
reasoning:
  effort: ultra
```

```yaml
reasoning:
  effort: auto
```

Invalid values MUST produce a clear validation error.

---

## 70. Required Test Matrix

| Fixture | LOW | MEDIUM | HIGH | xHIGH | MAX | ULTRA | AUTO |
|---|---:|---:|---:|---:|---:|---:|---:|
| Trivial answer | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Simple tool | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Repair code | OPTIONAL | PASS | PASS | PASS | PASS | PASS | PASS |
| Deterministic retry | NO RETRY | PASS | PASS | PASS | PASS | PASS | PASS |
| Permanent failure | STOP | STOP | STOP | STOP | STOP | STOP | STOP |
| Independent subtasks | LIMITED | LIMITED | PASS | PASS | PASS | PASS | PASS |
| Dependency graph | NO | NO | PASS | PASS | PASS | PASS | PASS |
| Critic | NO | NO | NO | NO | OPTIONAL | PASS | PASS |
| AUTO escalation | N/A | N/A | N/A | N/A | N/A | N/A | PASS |
| MAX → ULTRA | N/A | N/A | N/A | N/A | PASS | PASS | PASS |

---

## 71. Final Definition of Done

The implementation is complete only when:

```text
[ ] LOW exists
[ ] MEDIUM exists
[ ] HIGH exists
[ ] xHIGH exists
[ ] MAX exists
[ ] ULTRA exists
[ ] AUTO exists
[ ] typed policy schema exists
[ ] typed runtime budget state exists
[ ] AUTO semantics are explicit
[ ] AUTO resolves to a real fixed level
[ ] AUTO escalation works
[ ] LOW behavior is distinct
[ ] MEDIUM behavior is distinct
[ ] HIGH behavior is distinct
[ ] xHIGH behavior is distinct
[ ] MAX behavior is distinct
[ ] ULTRA behavior is distinct
[ ] MAX is maximum single-agent mode
[ ] ULTRA adds workflow orchestration
[ ] workflow_node_budget = 0 for LOW-MAX
[ ] workflow_node_budget = 32 for ULTRA
[ ] execution budget is separate from workflow budget
[ ] exact numeric bounds are validated
[ ] budget accounting is implemented
[ ] budget precedence is implemented
[ ] provider adapters are isolated
[ ] provider fallback works
[ ] adaptive escalation works
[ ] workflow decomposition works
[ ] dependency handling works
[ ] parallel execution is bounded
[ ] verification works
[ ] critic works
[ ] recovery works
[ ] infinite loops are impossible
[ ] fixture setup is isolated
[ ] fixture cleanup is guaranteed
[ ] MAX vs ULTRA golden test passes
[ ] AUTO tests pass
[ ] resource exhaustion tests pass
[ ] backward compatibility passes
[ ] unit tests pass
[ ] integration tests pass
```

The coding agent MUST NOT report completion while any mandatory criterion is failing or unverified.

---

## 72. Final Machine-Readable Test Report

The agent MUST finish with:

```json
{
  "effort_levels": {
    "low": "passed",
    "medium": "passed",
    "high": "passed",
    "xhigh": "passed",
    "max": "passed",
    "ultra": "passed",
    "auto": "passed"
  },
  "policy_tests": {
    "passed": 0,
    "failed": 0
  },
  "fixture_tests": {
    "passed": 0,
    "failed": 0
  },
  "cleanup_tests": {
    "passed": 0,
    "failed": 0
  },
  "budget_tests": {
    "passed": 0,
    "failed": 0
  },
  "precedence_tests": {
    "passed": 0,
    "failed": 0
  },
  "provider_adapter_tests": {
    "passed": 0,
    "failed": 0
  },
  "max_vs_ultra": {
    "passed": false
  },
  "auto_tests": {
    "passed": 0,
    "failed": 0
  },
  "resource_limit_tests": {
    "passed": 0,
    "failed": 0
  },
  "incomplete": []
}
```

The final report MUST distinguish:

```text
passed
failed
skipped
unverified
```

Do not convert `unverified` into `passed`.
