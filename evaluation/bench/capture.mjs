// Abelink Architecture Benchmark — trajectory capture contract.
//
// This module defines the interface a ABELINK execution boundary must satisfy
// for the architecture benchmark to become fully automatable.
//
// It does NOT drive the UI and does NOT require a CLI today.
// It specifies what the execution side must provide, and how raw output is
// normalized into the benchmark trajectory schema.

import {
  makeTrajectory,
  makeStep,
  STEP_KIND,
  nowISO,
} from './contract.mjs'

// ---- Execution boundary contract -----------------------------------------

/** Shape of a single ABELINK execution step as exposed by the capture adapter. */
export function makeRawStep({
  index = 0,
  kind = 'decision',
  label = '',
  tool = null,
  query = null,
  result = null,
  observation = '',
  text = '',
  durationMs = null,
  detail = null,
} = {}) {
  return {
    index,
    kind,
    label,
    tool,
    query,
    result,
    observation,
    text,
    durationMs,
    detail: detail ?? null,
  }
}

/** Minimal controller interface a ABELINK harness/CLI/IPC boundary can implement. */
export const EXECUTION_BOUNDARY_API = {
  /** Start a benchmark run and return a run context. */
  startRun: 'function(request) -> runContext',

  /** Send one prompt or continuation to the agent. */
  sendPrompt: 'function(runContext, prompt, options?) -> stepStream',

  /** Stream of normalized steps while the agent executes. */
  stepStream: 'async iterable of makeRawStep',

  /** End the run and return final status. */
  endRun: 'function(runContext) -> finalStatus',

  /** Optional: cancel/abort a runaway run. */
  abortRun: 'function(runContext) -> boolean',
}

/** Expected inputs for starting a benchmark run. */
export function makeRunRequest({
  runId,
  taskId,
  category,
  prompt,
  effort = null,
  maxSteps = null,
  meta = null,
} = {}) {
  if (!taskId || !prompt) {
    throw new Error('makeRunRequest requires taskId and prompt')
  }
  return {
    runId: runId || null,
    taskId,
    category,
    prompt,
    effort,
    maxSteps,
    meta: meta ?? null,
    created: nowISO(),
  }
}

/** Final status shape from the execution boundary. */
export function makeFinalStatus({
  runId,
  status = 'unknown',
  completed = false,
  error = null,
  finishedAt = nowISO(),
  notes = '',
} = {}) {
  return {
    runId,
    status,
    completed,
    error,
    finishedAt,
    notes,
  }
}

// ---- Normalization --------------------------------------------------------

/** Normalize a raw step into the benchmark trajectory step shape. */
export function normalizeStep(raw) {
  const text = raw.text || raw.observation || raw.result || ''
  return makeStep({
    step: raw.index != null ? raw.index : 0,
    kind: raw.kind || 'decision',
    label: raw.label || '',
    tool: raw.tool || null,
    query: raw.query != null ? raw.query : null,
    result: raw.result != null ? raw.result : null,
    observation: raw.observation || text,
    detail: raw.detail != null ? raw.detail : text ? { text } : null,
  })
}

/** Build a benchmark trajectory from a raw step stream. */
export async function buildTrajectory({ runId, startedAt, rawSteps, finalStatus, meta = null } = {}) {
  const steps = []
  let index = 0
  for (const raw of rawSteps) {
    steps.push(normalizeStep({ ...raw, index: raw.index != null ? raw.index : index++ }))
  }

  const status = finalStatus?.status || 'unknown'
  const error = finalStatus?.error ?? null
  const finishedAt = finalStatus?.finishedAt || nowISO()

  return makeTrajectory({
    runId,
    startedAt: startedAt || nowISO(),
    finishedAt,
    steps,
    status,
    error,
    meta,
  })
}

/** Helper to read a final completion signal from a status object. */
export function isCompleted(status) {
  if (!status) return false
  if (status.completed) return true
  if (status.status === 'completed') return true
  return /completed|selesai|finish|done/i.test(status.notes + ' ' + (status.status || ''))
}

/** Helper to read an error/abort signal. */
export function isFailed(status) {
  if (!status) return false
  if (status.error) return true
  if (status.status === 'failed' || status.status === 'aborted') return true
  return /gagal|error|failed|aborted|timed out/i.test(status.notes + ' ' + (status.status || ''))
}

// ---- ABELINK execution boundary specification ------------------------------

/**
 * A ABELINK execution boundary is the only part of this benchmark that depends
 * on ABELINK itself.
 *
 * Full specification for the ABELINK-side implementation:
 *   evaluation/bench/boundary-spec.mjs It must expose the following operations in whatever
 * transport ABELINK supports: CLI, IPC, RPC, harness API, or a future Tauri
 * invoke channel.
 *
 * Required operations:
 *   1. startRun(request) -> runContext
 *      - receive a benchmark run request,
 *      - return a run context identifier.
 *   2. sendPrompt(runContext, prompt, options?) -> async iterable of raw steps
 *      - inject the prompt into the agent,
 *      - stream normalized execution steps as they occur.
 *   3. endRun(runContext) -> final status
 *      - end the run,
 *      - return final status and completion signal.
 *   4. abortRun(runContext) -> boolean  (recommended)
 *      - cancel a runaway or stuck run,
 *      - return true if cancellation succeeded.
 *
 * The boundary MUST NOT depend on UI automation. It MUST be callable from
 * a script/harness/process without human interaction.
 *
 * The benchmark remains fully automatable once any implementation of this
 * interface exists and can be invoked programmatically.
 */

/** Minimal runtime checklist for a compliant ABELINK execution boundary. */
export const BOUNDARY_REQUIREMENTS = [
  'startRun accepts makeRunRequest shape',
  'sendPrompt returns an async iterable of raw steps',
  'raw steps can be normalized via normalizeStep',
  'endRun returns makeFinalStatus shape',
  'abortRun is available if the agent supports cancellation',
]

/** Diagnostic helper: describe whether a boundary looks compliant. */
export function describeBoundary(boundary) {
  if (!boundary) return { compliant: false, reason: 'boundary is null/undefined' }
  if (typeof boundary.startRun !== 'function') return { compliant: false, reason: 'missing startRun' }
  if (typeof boundary.sendPrompt !== 'function') return { compliant: false, reason: 'missing sendPrompt' }
  if (typeof boundary.endRun !== 'function') return { compliant: false, reason: 'missing endRun' }
  const hasAbort = typeof boundary.abortRun === 'function'
  return {
    compliant: true,
    hasAbort,
    label: hasAbort ? 'complete' : 'minimal',
  }
}

// ---- Stub adapter for testing --------------------------------------------

/** A no-op stub adapter used for contract tests only. */
export function createStubBoundary() {
  const pending = new Map()

  return {
    async startRun(request) {
      const ctx = { runId: request.runId || request.taskId, request }
      pending.set(ctx.runId, ctx)
      return ctx
    },

    async *sendPrompt(ctx, prompt, options = {}) {
      if (!pending.has(ctx.runId)) {
        throw new Error('Unknown run context')
      }
      yield makeRawStep({
        index: 0,
        kind: 'decision',
        label: 'prompt_received',
        observation: `Menerima prompt: ${prompt.slice(0, 80)}`,
        text: `Menerima prompt: ${prompt.slice(0, 80)}`,
      })

      if (options.waitForCompletion !== false) {
        yield makeRawStep({
          index: 1,
          kind: 'answer',
          label: 'completed',
          observation: 'Selesai.',
          text: 'Selesai.',
          detail: { summary: 'stub completion' },
        })
      }
    },

    async endRun(ctx) {
      if (!pending.has(ctx.runId)) {
        throw new Error('Unknown run context')
      }
      pending.delete(ctx.runId)
      return makeFinalStatus({
        runId: ctx.runId,
        status: 'completed',
        completed: true,
        notes: 'stub ended',
      })
    },

    async abortRun(ctx) {
      if (!pending.has(ctx.runId)) {
        return false
      }
      pending.delete(ctx.runId)
      return true
    },
  }
}
