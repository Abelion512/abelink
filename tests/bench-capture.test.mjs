import { describe, it, expect } from 'vitest'

import {
  makeRawStep,
  makeRunRequest,
  makeFinalStatus,
  normalizeStep,
  buildTrajectory,
  isCompleted,
  isFailed,
  EXECUTION_BOUNDARY_API,
  createStubBoundary,
} from '../evaluation/bench/capture.mjs'

import {
  runBenchmark,
  runStubBenchmark,
  compareBenchmarkRuns,
  wrapBoundary,
  boundaryDescription,
  evaluateTask,
  findTask,
  ARCH_TASKS,
} from '../evaluation/bench/runner-stub.mjs'

import {
  makeReport,
  makeStep,
  STEP_KIND,
} from '../evaluation/bench/contract.mjs'

// ---- Capture contract ---------------------------------------------------

describe('capture contract', () => {
  it('makeRawStep defaults', () => {
    const r = makeRawStep({ index: 1 })
    expect(r.index).toBe(1)
    expect(r.kind).toBe('decision')
    expect(r.tool).toBeNull()
    expect(r.query).toBeNull()
    expect(r.result).toBeNull()
  })

  it('makeRunRequest requires taskId and prompt', () => {
    expect(() => makeRunRequest({})).toThrow(/requires taskId and prompt/)
    expect(makeRunRequest({ taskId: 't', prompt: 'p' })).toMatchObject({ taskId: 't', prompt: 'p' })
  })

  it('makeFinalStatus shape', () => {
    const s = makeFinalStatus({ runId: 'r', status: 'completed', completed: true })
    expect(s.status).toBe('completed')
    expect(s.completed).toBe(true)
    expect(s.error).toBeNull()
  })

  it('normalizeStep maps raw to benchmark step', () => {
    const raw = makeRawStep({
      index: 2,
      kind: 'tool',
      tool: 'fs.write',
      query: 'file=test.txt',
      result: 'ok',
      observation: 'ditulis',
      text: 'ditulis',
    })
    const s = normalizeStep(raw)
    expect(s.step).toBe(2)
    expect(s.kind).toBe('tool')
    expect(s.tool).toBe('fs.write')
    expect(s.result).toBe('ok')
    expect(s.observation).toBe('ditulis')
  })

  it('normalizeStep uses text fallback for detail', () => {
    const s = normalizeStep({ index: 1, text: 'halo' })
    expect(s.detail).toEqual({ text: 'halo' })
  })

  it('isCompleted true for completed status', () => {
    expect(isCompleted({ status: 'completed', completed: true })).toBe(true)
    expect(isCompleted({ status: 'unknown', notes: 'selesai' })).toBe(true)
    expect(isCompleted({ status: 'unknown', notes: 'done' })).toBe(true)
  })

  it('isCompleted false for missing status', () => {
    expect(isCompleted(null)).toBe(false)
    expect(isCompleted({ status: 'unknown', notes: '' })).toBe(false)
  })

  it('isFailed true for error/abort/status-failed', () => {
    expect(isFailed({ error: 'boom' })).toBe(true)
    expect(isFailed({ status: 'failed' })).toBe(true)
    expect(isFailed({ status: 'aborted' })).toBe(true)
    expect(isFailed({ status: 'unknown', notes: 'gagal' })).toBe(true)
  })

  it('EXECUTION_BOUNDARY_API documents interface', () => {
    expect(typeof EXECUTION_BOUNDARY_API.startRun).toBe('string')
    expect(typeof EXECUTION_BOUNDARY_API.sendPrompt).toBe('string')
    expect(typeof EXECUTION_BOUNDARY_API.stepStream).toBe('string')
    expect(typeof EXECUTION_BOUNDARY_API.endRun).toBe('string')
    expect(typeof EXECUTION_BOUNDARY_API.abortRun).toBe('string')
  })

  it('stub boundary supports run lifecycle', async () => {
    const stub = createStubBoundary()
    const ctx = await stub.startRun(makeRunRequest({ taskId: 't', prompt: 'halo' }))
    expect(ctx.runId).toBe('t')

    const steps = []
    for await (const raw of stub.sendPrompt(ctx, 'halo')) {
      steps.push(raw)
    }
    expect(steps.length).toBeGreaterThan(0)

    const finalStatus = await stub.endRun(ctx)
    expect(finalStatus.status).toBe('completed')
    expect(finalStatus.completed).toBe(true)
  })

  it('stub buildTrajectory produces benchmark trajectory', async () => {
    const stub = createStubBoundary()
    const ctx = await stub.startRun(makeRunRequest({ taskId: 't', prompt: 'halo' }))
    const rawSteps = []
    for await (const raw of stub.sendPrompt(ctx, 'halo')) {
      rawSteps.push(raw)
    }
    const finalStatus = await stub.endRun(ctx)
    const traj = await buildTrajectory({ runId: 't', rawSteps, finalStatus })
    expect(traj.runId).toBe('t')
    expect(Array.isArray(traj.steps)).toBe(true)
    expect(traj.status).toBe('completed')
  })
})

// ---- Runner stub --------------------------------------------------------

describe('runner stub', () => {
  it('runStubBenchmark produces an architecture report', async () => {
    const report = await runStubBenchmark({
      tasks: [findTask('brain-01-memory-injection-and-recall')],
      meta: { runId: 'stub-1' },
    })
    expect(report.kind).toBe('abelink-arch-benchmark-report')
    expect(report.tasks['brain-01-memory-injection-and-recall']).toBeDefined()
  })

  it('runBenchmark requires a boundary', async () => {
    await expect(runBenchmark({})).rejects.toThrow(/requires an execution boundary/)
  })

  it('runBenchmark evaluates stub boundary results', async () => {
    const boundary = createStubBoundary()
    const report = await runBenchmark({
      tasks: [findTask('logic-01-conditional-file-action')],
      boundary,
      meta: { runId: 'run-1' },
    })
    expect(report.tasks['logic-01-conditional-file-action']).toBeDefined()
  })

  it('runBenchmark supports step callback', async () => {
    const boundary = createStubBoundary()
    const steps = []
    await runBenchmark({
      tasks: [findTask('io-01-read-modify-write')],
      boundary,
      meta: { runId: 'run-2' },
      onStep: ({ rawStep }) => steps.push(rawStep),
    })
    expect(steps.length).toBeGreaterThan(0)
  })

  it('compareBenchmarkRuns delegates to compareReports', async () => {
    const prev = makeReport({ tasks: { t: { taskId: 't', category: 'logic', runs: 1, passed: 1, passRate: 100, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cur = makeReport({ tasks: { t: { taskId: 't', category: 'logic', runs: 1, passed: 0, passRate: 0, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cmp = await compareBenchmarkRuns(cur, prev, { thresholdPct: 5 })
    expect(cmp.regressions.length).toBeGreaterThan(0)
  })

  it('stub task uses stub completion signal', async () => {
    const r = await runStubBenchmark({
      tasks: [findTask('body-02-io-latancy-signal')],
      meta: { runId: 'stub-2' },
    })
    const taskResult = r.tasks['body-02-io-latancy-signal']
    expect(taskResult).toBeDefined()
    expect(taskResult.runs).toBe(1)
  })

  it('boundaryDescription accepts stub boundary', () => {
    const stub = createStubBoundary()
    const d = boundaryDescription(stub)
    expect(d.compliant).toBe(true)
    expect(d.label).toBe('complete')
  })

  it('boundaryDescription rejects incomplete boundary', () => {
    const bad = { startRun: () => {} }
    const d = boundaryDescription(bad)
    expect(d.compliant).toBe(false)
    expect(d.reason).toBe('missing sendPrompt')
  })

  it('wrapBoundary accepts compliant stub', () => {
    const wrapped = wrapBoundary(createStubBoundary())
    expect(typeof wrapped.startRun).toBe('function')
    expect(wrapped._description.compliant).toBe(true)
    expect(Array.isArray(wrapped.requirements)).toBe(true)
  })

  it('wrapBoundary rejects incomplete boundary', () => {
    expect(() => wrapBoundary({ startRun: () => {} })).toThrow(/not compliant/)
  })

  it('full pipeline runs through stub boundary and produces report', async () => {
    const boundary = wrapBoundary(createStubBoundary())
    const tasks = [findTask('brain-01-memory-injection-and-recall')]
    const before = await runStubBenchmark({ tasks, meta: { runId: 'before' } })
    const after = await runBenchmark({ tasks, boundary, meta: { runId: 'after' } })
    expect(after.kind).toBe('abelink-arch-benchmark-report')
    expect(after.tasks['brain-01-memory-injection-and-recall']).toBeDefined()
    const cmp = await compareBenchmarkRuns(after, before, { thresholdPct: 5 })
    expect(Array.isArray(cmp.diffs)).toBe(true)
  })

  it('full pipeline reports step callbacks', async () => {
    const boundary = wrapBoundary(createStubBoundary())
    const steps = []
    await runBenchmark({
      tasks: [findTask('logic-01-conditional-file-action')],
      boundary,
      meta: { runId: 'cb-run' },
      onStep: ({ rawStep }) => steps.push(rawStep),
    })
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[0]).toHaveProperty('kind')
  })
})
