// Abelink Architecture Benchmark — live ABELINK execution boundary.
//
// Thin wrapper over evaluation/abelink-adapter.mjs (sidecar RPC, the same
// engine the terminal-bench track uses). Satisfies boundary-spec.mjs via the
// existing adapter: no new transport, no CLI, no UI.
//
// Design notes:
//   - sendPrompt runs the agent loop once (inside runAbelinkAgent) then yields
//     the recorded trace as raw steps. Batch yield, not per-turn streaming.
//   - Bench catalog tasks declare no requiredTools, but their prompts demand
//     file I/O. The boundary supplies a default toolset + scratch workdir so
//     probes are answerable; scratch lives in os.tmpdir (never the repo).
//   - abortRun is best-effort: the adapter exposes no cancel handle, so abort
//     only marks pending contexts. Runs always terminate (bounded maxTurns).

import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

import { makeRawStep, makeRunRequest, makeFinalStatus } from './capture.mjs'
import { runAbelinkAgent } from '../abelink-adapter.mjs'

export { makeRunRequest, makeFinalStatus }

const DEFAULT_TOOLS = ['write-file', 'read-file', 'run-shell', 'list-dir']

function scratchDir(taskId, runId) {
  const safe = String(taskId || 'task').replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(os.tmpdir(), 'abelink-bench', `${safe}-${runId || 'run'}`)
}

/** Translate one adapter trace entry into one or more raw bench steps. */
function* traceToRaw(trace, baseIndex = 0) {
  let index = baseIndex
  for (const entry of trace || []) {
    if (entry.kind === 'tool' && Array.isArray(entry.toolCalls) && entry.toolCalls.length) {
      for (const call of entry.toolCalls) {
        yield makeRawStep({
          index: index++,
          kind: 'tool',
          label: call.tool || '',
          tool: call.tool || null,
          query: call.query != null ? String(call.query) : null,
          result: call.result != null ? String(call.result).slice(0, 4000) : null,
          observation: entry.observation || call.result || '',
          text: entry.observation || '',
        })
      }
    } else {
      // ponytail: response text unbounded, clamp to 4k so bridge clamp (~20k) never trips on long traces
      const text = String(entry.response || entry.observation || '').slice(0, 4000)
      yield makeRawStep({
        index: index++,
        kind: 'decision',
        label: `step-${entry.step ?? index}`,
        observation: text,
        text,
      })
    }
  }
  return index
}

export function createAbelinkBoundary({ model, provider, effort = null, runFn = runAbelinkAgent } = {}) {
  const pending = new Map() // runId -> ctx

  return {
    async startRun(request) {
      const runId = request.runId || request.taskId
      const workdir = scratchDir(request.taskId, runId)
      mkdirSync(workdir, { recursive: true })
      const ctx = { runId, request, workdir, aborted: false, result: null }
      pending.set(runId, ctx)
      return ctx
    },

    async *sendPrompt(ctx, prompt, options = {}) {
      const known = pending.get(ctx.runId)
      if (!known) throw new Error('Unknown run context')
      if (known.aborted) return

      const task = {
        taskId: known.request.taskId,
        prompt,
        effort: known.request.effort ?? effort ?? undefined,
        requiredTools: DEFAULT_TOOLS,
        workdir: known.workdir,
        maxTurns: known.request.maxSteps ?? undefined,
      }
      const out = await runFn(task, model, provider, { effort: effort ?? undefined })
      known.result = out

      let next = 0
      next = yield* traceToRaw(out?.trajectory?.trace || out?.trace, next)

      const answer = String(out?.response || '').slice(0, 4000)
      if (answer && options.waitForCompletion !== false) {
        yield makeRawStep({
          index: next++,
          kind: 'answer',
          label: 'final_answer',
          observation: answer,
          text: answer,
          detail: { summary: 'live agent final response' },
        })
      }
    },

    async endRun(ctx) {
      const known = pending.get(ctx.runId)
      if (!known) throw new Error('Unknown run context')
      pending.delete(ctx.runId)
      const done = Boolean(known.result && String(known.result.response || '').trim())
      return makeFinalStatus({
        runId: ctx.runId,
        status: known.aborted ? 'aborted' : done ? 'completed' : 'failed',
        completed: done && !known.aborted,
        error: done ? null : 'empty agent response',
        notes: known.aborted ? 'aborted before completion' : 'live abelink boundary',
      })
    },

    async abortRun(ctx) {
      const known = pending.get(ctx.runId)
      if (!known) return false
      known.aborted = true
      pending.delete(ctx.runId)
      return true
    },
  }
}
