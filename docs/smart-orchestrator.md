# ABELINK Smart Orchestrator Architecture Design Document

Owner: ABELINK Linux agent architecture
Relevance: lower-tier model capability through system architecture, not raw model strength
Scope: local file automation, web browsing, terminal execution, bounded reasoning, session safety
Source: extracted from docs/sessions/2026-09-07.md conversation (2026-09-07 session), saved as file during take-over.

## 1. Purpose

This document describes an orchestrator architecture that lets a weaker local model behave more reliably by moving responsibility into system components: memory routing, task decomposition, tool gateway, verification, and bounded execution.

The goal is not to make the model answer more beautifully. The goal is to make the system:
- stop thinking and start acting at the right time,
- avoid overloading context,
- reduce degenerate loops,
- isolate risky execution,
- and recover from parsing or tool failures without corrupting the session.

## 2. Design Principles

1. Model output is untrusted by default.
2. System behavior is observable through trajectory, not only final text.
3. Context is supplied selectively, not exhaustively.
4. Work is decomposed before it is executed.
5. Execution is bounded, gated, and auditable.
6. Failure is reported clearly and recovered within limits.

## 3. High-Level Architecture

Core flow:

User command / input
-> Orchestration layer
-> Memory router
-> Task decomposition and scheduling
-> Tool gateway / execution boundary
-> Verifier and recovery layer
-> Final response and session update

The orchestrator is responsible for control, not for knowing everything. The model is one component inside the loop.

## 4. ReAct Loop Design

A strict ReAct loop should expose only a small number of stable states:

1. plan_or_reason
2. propose_action
3. execute_action
4. observe_result
5. verify_result
6. continue OR stop

Rules:

- The model may reason, but it must emit an explicit action shape when it wants to do something.
- The system parses the action. If parsing fails, the system does not retry forever; it applies bounded recovery.
- After action execution, the system inserts an observation into the loop.
- After one or more actions, the system may require verification before completion.
- Loop stop conditions are explicit:
  - task complete,
  - verification passed,
  - retry budget exhausted,
  - step budget exhausted,
  - abort requested,
  - repeated failure detected.

This makes the model know when to stop reasoning and start acting: the system only accepts a small number of structured next steps, and it forces an observe/verify segment after action.

## 5. Hierarchical Memory Layer

Use three practical tiers:

1. Project / workspace memory
   - files, repo structure, workspace RAG,
   - recent local context relevant to the current task.

2. Session memory
   - current conversation state,
   - in-progress plan,
   - current subtask status,
   - active constraints and effort/behavior settings.

3. Global / long-term memory
   - user preferences,
   - reusable facts,
   - learned skills or patterns,
   - long-lived indexes if applicable.

Router behavior:

- Each turn, the router decides which tier contributes to context.
- It should prefer:
  - current session state,
  - directly relevant project memory,
  - only a small number of global memories when they are clearly useful.
- It should avoid dumping entire stores into context.
- It should expose what it included, so the system can be evaluated later.

This directly prevents context overload and makes smaller models more effective because they see a curated working set instead of a giant pile of information.

## 6. Task Decomposition Layer

When a task is too large for one reasoning cycle, the orchestrator should split it:

- Define subtask graph with dependencies.
- Independent subtasks may run in parallel where safe.
- Dependent subtasks wait for prerequisites.
- Each subtask has:
  - id,
  - description,
  - dependencies,
  - status,
  - result,
  - failure count,
  - verification state.

Scheduler rules:

- Do not start dependent nodes before prerequisites complete.
- Limit parallel work to a configured bound.
- Track depth and node count for budget enforcement.
- Require a synthesis step for multi-part work.

This is the practical version of a dynamic DAG. It also makes behavior measurable: number of nodes, dependency correctness, parallelism, and synthesis behavior.

## 7. IPC Bridge and Tool Gateway

The system should separate three concerns:

1. User/UI channel
2. Orchestration/core channel
3. Execution/tool channel

Recommended properties:

- Communication uses structured messages, for example JSON over stdio, IPC, or RPC.
- The tool gateway sits between the model and actual execution.
- The model never calls tools directly in an unsafe way.
- Tool calls are validated, bounded, and logged.
- Destructive or sensitive actions require approval or are blocked.
- Tool results are normalized into a stable observation shape.

For ABELINK, this maps to the existing split:
- Tauri IPC for renderer and Rust shell,
- sidecar bridge for engine-level services,
- approval-gated native tool execution,
- and trajectory/observation capture around tool use.

## 8. Isolated Execution Approach

A full WASM/MicroVM sandbox is one possible design, but not the only one. For a local agent, isolation can be pragmatic:

- Workspace-contained file access.
- Approval-gated shell execution.
- Restrictions on destructive operations.
- Timeouts and budget limits.
- Bounded retries.
- Separate execution context from orchestration state.
- Clear error propagation without session corruption.

If stronger isolation is needed later, sandboxing can be added underneath the tool gateway. The important architectural point is that the model should not be able to wander freely through the system just because it asked to.

## 9. Error Handling Framework

The system should handle these failure classes explicitly:

1. Parse/exception errors
   - model output cannot be interpreted as a valid action.
   - Response: bounded retry, fallback action, or ask for clarification.
   - Do not let one bad parse stall the session.

2. Tool execution errors
   - tool fails, times out, or is denied.
   - Response: capture error, update observation, decide whether to retry, alternate path, or abort.

3. Misbehavior loops
   - repeated similar actions with no progress.
   - Response: detect repetition, interrupt, replan, or stop.

4. Verification failure
   - action done but result does not satisfy success criteria.
   - Response: revise, replan, or escalate within budget.

5. Session safety
   - If the session becomes unstable, preserve state, log it, and avoid making it worse.

A good framework does not treat every failure as "call the model again." It treats failure as a system event with policy attached.

## 10. Observability and Benchmarking

Every run should expose:

- requested effort or behavior mode,
- effective behavior mode if it changed,
- plan steps,
- tool calls,
- memory retrieval evidence,
- verification steps,
- retry and recovery events,
- loop repetition signals,
- completion or failure status,
- timing and budget consumption.

This is what makes the system testable. It also supports the architecture benchmark approach: judge behavior and control signals first, then judge outcome second.

## 11. Mapping to ABELINK

ABELINK already has parts of this architecture. The main upgrade is to make them explicit and coordinated:

- Memory routing: align vector memory, Orama, Dexie, session state, and workspace RAG under a clearer per-turn selection policy.
- ReAct discipline: make the agent loop emit explicit actions/observations and enforce stop/repeat/verify rules.
- Sub-tasks: keep sub-agent and task-step mechanisms, but add explicit dependency tracking and synthesis.
- Tool gateway: keep approval-gated native tools, but strengthen contracts and error observability.
- Error handling: add bounded recovery for parse/tool/verification failures.
- Observability: keep trajectory capture and evaluation so behavior can be benchmarked.

## 12. Suggested Implementation Order

1. Define explicit action/observation/stop contract for the agent loop.
2. Add bounded loop and repetition detection.
3. Add a memory router that selects context per turn.
4. Strengthen tool result and error observability.
5. Make verification a required or optional loop stage depending on task type.
6. Add dependency-aware subtask scheduling where useful.
7. Turn the above into benchmark probes so improvements are measurable.

## 13. Success Criteria

The architecture is successful if:

- the system completes more tasks with fewer degenerate loops,
- context is used more selectively,
- tool execution is safer and more observable,
- failures are handled without session corruption,
- and behavior improves in a measurable way under a system-focused benchmark.

That is the realistic target: not "make the model smarter," but "make the system make a smaller model behave far more capable."
