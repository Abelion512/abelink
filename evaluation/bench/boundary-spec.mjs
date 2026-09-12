// ABELINK Architecture Benchmark — execution boundary specification (ABELINK side).
//
// This document defines what the ABELINK execution boundary MUST implement for
// the architecture benchmark to become fully automatable.
//
// It is the counterpart to evaluation/bench/capture.mjs, which defines the
// harness side. The two must stay in sync.
//
// Purpose:
//   - remove ambiguity about what “automated benchmark execution” means,
//   - make the missing ABELINK side concrete and testable,
//   - keep the boundary independent of UI automation.

// ---- 1. Scope ------------------------------------------------------------

// The boundary covers one benchmark run at a time and must support:
//   1. starting a run,
//   2. injecting a prompt,
//   3. streaming execution steps,
//   4. ending the run with a final status,
//   5. optionally aborting a runaway run.

// The boundary MUST NOT depend on:
//   - UI automation,
//   - manual copy/paste,
//   - any human in the loop during execution,
//   - undocumented side effects outside the run contract.

// ---- 2. Transport options -----------------------------------------------

// Any of the following is acceptable, as long as the interface is callable
// programmatically from a script/harness/process:
//
//   - CLI entrypoint that accepts JSON input and emits JSON output,
//   - IPC/RPC channel with request/response + streaming steps,
//   - harness API in the same process or a worker,
//   - future Tauri invoke channel with structured response.
//
// The benchmark harness does not care which transport is used. It only cares
// that the boundary satisfies the runtime contract defined below.

// ---- 3. Required operations ---------------------------------------------

// 3.1 startRun(request) -> runContext
//
//   request shape: see makeRunRequest() in evaluation/bench/capture.mjs
//
//   returns: a runContext identifier or object that can be used in later calls.
//
//   required fields in request:
//     - taskId
//     - prompt
//
//   optional fields in request:
//     - runId
//     - category
//     - effort
//     - maxSteps
//     - meta
//
//   the boundary may enrich the request internally, but must preserve the
//   original taskId and prompt for benchmark traceability.

// 3.2 sendPrompt(runContext, prompt, options?) -> async iterable of raw steps
//
//   prompt: the agent prompt or continuation to execute.
//
//   options: optional control flags, for example:
//     - waitForCompletion: boolean
//     - timeoutMs: number
//     - maxSteps: number
//
//   returns: an async iterable of raw steps conforming to makeRawStep() in
//   evaluation/bench/capture.mjs.
//
//   each raw step MUST include enough information to be normalized, at minimum:
//     - index or equivalent ordering,
//     - kind,
//     - observation or text,
//     - optional tool/query/result.
//
//   the stream SHOULD preserve temporal order and SHOULD NOT invent steps that
//   did not occur during execution.

// 3.3 endRun(runContext) -> finalStatus
//
//   returns: final status shape as defined in makeFinalStatus() in
//   evaluation/bench/capture.mjs.
//
//   required outcomes:
//     - status
//     - completed flag
//     - runId
//
//   recommended fields:
//     - error
//     - finishedAt
//     - notes

// 3.4 abortRun(runContext) -> boolean  (recommended, not strictly required)
//
//   returns: true if the run was aborted or canceled, false otherwise.
//
//   useful for:
//     - runaway loops,
//     - stuck tool execution,
//     - timeout enforcement.

// ---- 4. Raw step schema -----------------------------------------------

// The boundary must be able to emit raw steps that can be normalized into the
// benchmark trajectory schema. The minimal raw step contract is:
//
//   index: number
//   kind: string, one of:
//     decision, tool, memory, verify, planning, answer, error, abort
//   label: string, optional
//   tool: string | null
//   query: string | null
//   result: any | null
//   observation: string
//   text: string
//   durationMs: number | null
//   detail: object | null
//
// The harness normalizes raw steps via normalizeStep() in capture.mjs, so the
// boundary does not need to emit the final benchmark step schema directly. It
// only needs to emit enough information for normalization.

// ---- 5. Final status schema ---------------------------------------------

// makeFinalStatus() in capture.mjs defines the required final status shape:
//
//   runId: string
//   status: 'unknown' | 'completed' | 'failed' | 'aborted' | 'budget_exhausted' | ...
//   completed: boolean
//   error: string | null
//   finishedAt: ISO timestamp
//   notes: string
//
// The boundary MUST set completed to true only when the run actually finished.
// The boundary MUST set error when the run failed, aborted, or reached a
// terminal error state.

// ---- 6. Error and abort handling ----------------------------------------

// The boundary should handle:
//   - tool failures without crashing the whole run,
//   - timeouts,
//   - aborts,
//   - budget or step limits if the agent exposes them.
//
// If the boundary cannot recover from a failure, it MUST signal failure in
// final status and MUST NOT pretend the run succeeded.

// ---- 7. Observability ---------------------------------------------------

// The boundary SHOULD emit enough information for the benchmark evaluator to
// detect:
//   - planning behavior,
//   - tool usage,
//   - memory retrieval/usage,
//   - verification/read-back,
//   - completion or failure signals,
//   - loop or repetition patterns.
//
// The boundary SHOULD NOT expose private chain-of-thought or other protected
// internal state outside the defined raw step contract.

// ---- 8. Minimal implementation checklist ------------------------------------

// A compliant boundary should be able to answer yes to all of these:
//
//   [ ] startRun accepts makeRunRequest and returns a runContext,
//   [ ] sendPrompt accepts a prompt and returns an async iterable of raw steps,
//   [ ] endRun returns makeFinalStatus,
//   [ ] raw steps can be normalized by normalizeStep(),
//   [ ] abortRun is available if the agent supports cancellation,
//   [ ] the boundary can be invoked programmatically without UI interaction,
//   [ ] the boundary can be tested with wrapBoundary() and describeBoundary().

// ---- 9. Verification ----------------------------------------------------

// The harness side can verify boundary compliance using:
//   - describeBoundary(boundary) from evaluation/bench/capture.mjs
//   - wrapBoundary(boundary) from evaluation/bench/runner-stub.mjs
//   - the full pipeline smoke tests in tests/bench-capture.test.mjs
//
// If wrapBoundary() accepts the boundary, the harness considers it compliant
// for benchmark execution.

// ---- 10. Out of scope for this spec --------------------------------------

// This spec does not define:
//   - the internal agent loop implementation,
//   - the model provider layer,
//   - the effort system itself,
//   - UI behavior,
//   - storage or persistence beyond what the run contract requires.
//
// It only defines the execution boundary that the benchmark requires.

export {
  // This module is specification-only. The runtime contract lives in:
  //   - evaluation/bench/capture.mjs
  //   - evaluation/bench/runner-stub.mjs
}
