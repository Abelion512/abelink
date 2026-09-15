# Abelink CLI Direction

Status: Proposed implementation direction
Owner: Founder / Abelion Lavv
Target: Abelink engine

## 1. Purpose

Abelink should expose its existing agent engine through a first-class CLI, similar in role to a headless agent client, without creating a second execution engine.

The CLI is a client of the Abelink engine. The engine remains the single source of truth for task execution, tools, memory, permissions, verification, and lifecycle state.

## 2. Architecture

```text
                 +----------------+
                 | Abelink Engine |
                 +-------+--------+
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
     Abelink CLI    Tauri GUI      Future API
```

### Engine owns

- agent/task execution
- planning and orchestration
- tool dispatch
- MCP integration
- memory/state
- permissions and approval boundaries
- verification
- task/session lifecycle
- durable execution state

### CLI owns

- command-line interaction
- argument parsing
- stdin/stdout handling
- human-readable presentation
- machine-readable output modes
- exit codes
- attaching/following existing engine tasks

The CLI must not duplicate business logic already owned by the engine.

## 3. Design Principles

### 3.1 Engine-first

CLI commands call engine capabilities. They do not implement a parallel agent loop.

### 3.2 Headless by design

The CLI must work without the graphical Tauri window.

### 3.3 Scriptable

The CLI should support Unix-style composition where practical:

```bash
abelink run "..."
abelink status <task-id>
abelink logs <task-id>
abelink wait <task-id>
```

Machine-readable output should be available for automation.

### 3.4 Interactive and non-interactive modes

Support both:

```text
interactive terminal usage
CI/script/pipe usage
```

Do not make the interactive UI the only interface.

### 3.5 Task identity is first-class

Long-running work must have a stable task/session identifier so the user can inspect status, retrieve results, and resume or wait without replaying the original request.

### 3.6 JSON/JSONL compatibility

Because the existing Abelink engine already uses JSON-lines RPC internally, the CLI should preserve structured event semantics at the boundary rather than parse human prose as protocol.

Human-readable rendering belongs in the CLI presentation layer.

### 3.7 Approval remains an engine concern

The CLI may display and relay approval requests, but must not bypass engine-level approval policy.

### 3.8 Unix composability

Prefer stdout for result data and stderr for diagnostics/progress where this does not conflict with the existing engine protocol.

### 3.9 No duplicate runtime

Invoking the CLI must not start a second independent copy of the complete agent architecture when an existing engine instance can be reused.

## 4. Initial Command Surface

Keep the first CLI intentionally small.

```text
abelink run <objective>
abelink status <task-id>
abelink wait <task-id>
abelink result <task-id>
abelink logs <task-id>
abelink cancel <task-id>
abelink version
abelink doctor
```

These names are a proposed surface, not a commitment to exact syntax until the existing engine/task APIs are inspected.

Do not implement every existing GUI capability as a CLI command in the first version.

## 5. Output Contract

Default output should be readable by humans.

Machine-readable mode should provide structured records, for example:

```json
{"event":"task.created","task_id":"..."}
{"event":"task.status","task_id":"...","status":"running"}
{"event":"task.completed","task_id":"..."}
```

Exact event schema must be derived from the actual engine implementation rather than invented independently by the CLI.

## 6. Exit Codes

The CLI should eventually distinguish at least:

```text
0 = success
1 = task/application failure
2 = invalid CLI usage
3 = approval required / unresolved interaction
4 = task not found
5 = engine unavailable
6 = cancellation requested/failed
```

Final numeric mapping must be confirmed during implementation and covered by tests.

## 7. Lifecycle

The desired lifecycle is:

```text
CLI request
    |
    v
Engine task created
    |
    v
CLI receives task ID
    |
    +--> status / logs / wait / result
    |
    v
Engine completes task
    |
    v
CLI exits with result + exit code
```

The CLI should also support attaching to work already running in the engine where the engine exposes the required state.

## 8. Security

The CLI must inherit the engine's permission model.

It must not:

- bypass approval gates
- expose secrets in normal output
- print private environment variables
- write outside approved workspace boundaries
- create a second unrestricted tool path around the engine

Sensitive values must be redacted before presentation.

## 9. Integration With Hermes

The CLI should be designed so that Abelink can participate in a Hermes x Abelink architecture later.

Conceptually:

```text
Hermes
   |
   v
Abelink CLI / Engine Interface
   |
   v
Abelink Engine
```

However, Hermes integration is explicitly out of scope for the first CLI implementation.

The CLI must first prove that Abelink can operate as a useful headless engine by itself.

## 10. Non-Goals

The first CLI implementation must not:

- rewrite the Abelink engine
- replace the Tauri GUI
- create a second agent runtime
- introduce a new memory system
- introduce a new scheduler
- introduce a new permission system
- duplicate existing task orchestration
- turn every GUI feature into a command
- require a full Rust rewrite

## 11. Implementation Sequence

1. Inspect existing engine entrypoint and JSON-lines RPC contract.
2. Identify whether the engine can run headlessly without Tauri.
3. Identify existing task/session/status primitives.
4. Define the smallest stable engine-facing CLI adapter.
5. Implement `run`.
6. Implement `status`, `wait`, and `result`.
7. Implement `logs` if the existing event/log model supports it cleanly.
8. Implement `doctor` and `version`.
9. Add machine-readable output.
10. Add regression/smoke coverage.
11. Only then consider cancellation and advanced Unix streaming.

## 12. Acceptance Criteria

The CLI MVP is successful when:

- Abelink can execute an objective without opening the GUI.
- The command returns a stable task identifier.
- A second command can inspect that task.
- A completed task can return its result without replaying the objective.
- Human-readable output works in a terminal.
- Machine-readable output can be consumed by another process.
- Engine approval boundaries remain enforced.
- Existing GUI execution continues to work.
- Existing verification gates pass.
- No second agent runtime or duplicated business logic is introduced.

## 13. Verification

Follow the repository's existing verification gates before claiming completion:

```bash
bunx vitest run
bun evaluation/smoke.mjs
bun run sync-version --check
cargo check --manifest-path src-tauri/Cargo.toml
```

The CLI implementation must additionally test:

- successful task execution
- invalid arguments
- engine unavailable
- unknown task ID
- task failure
- approval-required state
- structured output validity
- non-zero exit codes

## 14. Open Questions

These must be answered from the current code before implementation:

1. Can `sidecar/engine.mjs` run as a standalone headless process?
2. What is the current stable JSON-lines request/response schema?
3. Which task/session state is already durable?
4. How does an external client authenticate/authorize against the engine, if at all?
5. How are approval requests represented outside the GUI?
6. Can a CLI attach to an already-running engine instance?
7. What cancellation primitive already exists?
8. Which existing logs/events are safe and useful to expose?

No answer should be invented in the CLI layer.

## 15. Architectural Rule

> Abelink CLI is a client, not another brain.

The engine remains the brain/execution authority. GUI, CLI, and future external clients are interchangeable interfaces over the same execution model.
