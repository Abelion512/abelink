import { describe, it, expect } from 'vitest'

import {
  makeRunMeta,
  makeStep,
  makeTrajectory,
  makeTask,
  makeRubricItem,
  makeTaskResult,
  makeReport,
  aggregateTaskResults,
  summarizeRubric,
  makeReport as makeReportAlias,
  makeDiffEntry,
  compareReports,
  flagsDiff,
  rubricDiff,
  summarizeByCategory,
  nowISO,
  makeRunId,
  makeRubricResult,
  makeStep as makeStepAlias,
} from '../evaluation/bench/contract.mjs'

import {
  evaluateTask,
  evaluateTaskRubric,
  evaluateRubric,
  stepText,
  trajectoryText,
  extractFlags,
  countToolCalls,
  inferStatus,
} from '../evaluation/bench/evaluator.mjs'

import {
  createRun,
  syntheticTrajectory,
  resolveEffort,
  runSyntheticTask,
} from '../evaluation/bench/runner.mjs'

import {
  summarizeComparison,
} from '../evaluation/bench/compare.mjs'

import { findTask, ARCH_TASKS, listArchTasks } from '../evaluation/bench/tasks.mjs'

// ---- Contract helpers ----------------------------------------------------

describe('contract', () => {
  it('makeRunMeta produces stable shape', () => {
    const m = makeRunMeta({ runId: 'r-1', model: 'm', provider: 'p' })
    expect(m).toEqual({
      runId: 'r-1',
      model: 'm',
      provider: 'p',
      archVersion: null,
      benchmarkVersion: '1.0',
      toolConfig: 'core+groups',
      created: expect.any(String),
    })
  })

  it('makeStep normalizes fields', () => {
    const s = makeStep({ step: 1, kind: 'tool', label: 'l', tool: 't', query: 'q', result: 'r', observation: 'o' })
    expect(s).toEqual({
      step: 1,
      kind: 'tool',
      label: 'l',
      tool: 't',
      query: 'q',
      result: 'r',
      observation: 'o',
      detail: null,
    })
  })

  it('makeTrajectory computes durationMs', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    const end = new Date('2026-01-01T00:00:03.500Z')
    const t = makeTrajectory({
      runId: 't1',
      startedAt: start.toISOString(),
      finishedAt: end.toISOString(),
      status: 'completed',
    })
    expect(t.durationMs).toBe(3500)
    expect(t.status).toBe('completed')
  })

  it('makeReport aggregates summary', () => {
    const tasks = {
      a: { taskId: 'a', category: 'brain', effort: 'low', runs: 2, passed: 2, passRate: 1, avgDurationMs: 10, avgSteps: 1, flags: [], rubricSummary: [] },
      b: { taskId: 'b', category: 'logic', effort: 'low', runs: 2, passed: 1, passRate: 0.5, avgDurationMs: 20, avgSteps: 2, flags: [], rubricSummary: [] },
    }
    const r = makeReportAlias({ tasks })
    expect(r.kind).toBe('abelink-arch-benchmark-report')
    expect(r.summary.totalTasks).toBe(2)
    expect(r.summary.totalRuns).toBe(4)
    expect(r.summary.overallPassRate).toBe(75)
    expect(r.summary.byCategory.length).toBe(2)
  })

  it('summarizeByCategory groups runs', () => {
    const taskMap = {
      a: { taskId: 'a', category: 'brain', runs: 1, passed: 1, passRate: 1 },
      b: { taskId: 'b', category: 'brain', runs: 1, passed: 0, passRate: 0 },
    }
    const byCat = summarizeByCategory(taskMap)
    expect(byCat).toEqual([
      { category: 'brain', tasks: 2, runs: 2, passed: 1, passRate: 50 },
    ])
  })

  it('aggregateTaskResults computes flags set', () => {
    const results = [
      makeTaskResult({ taskId: 't', category: 'brain', flags: ['planned'], passed: true, rubricResults: [] }),
      makeTaskResult({ taskId: 't', category: 'brain', flags: ['clean_finish'], passed: true, rubricResults: [] }),
    ]
    const agg = aggregateTaskResults(results, 'low')
    expect(agg.flags).toEqual(expect.arrayContaining(['planned', 'clean_finish']))
    expect(new Set(agg.flags).size).toBe(2)
  })

  it('summarizeRubric collapses by rubricId', () => {
    const results = [
      makeTaskResult({ taskId: 't', rubricResults: [makeRubricResult({ rubricId: 'planned', kind: 'planned', passed: true }), makeRubricResult({ rubricId: 'planned', kind: 'planned', passed: false })] }),
    ]
    const s = summarizeRubric(results)
    expect(s).toEqual([{ rubricId: 'planned', kind: 'planned', passed: 1, failed: 1, passRate: 0.5, note: '' }])
  })

  it('compareReports detects regression', () => {
    const prev = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', effort: 'low', runs: 1, passed: 1, passRate: 100, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cur = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', effort: 'low', runs: 1, passed: 0, passRate: 0, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cmp = compareReports(cur, prev, { thresholdPct: 5 })
    const regressed = cmp.regressions.filter((d) => d.taskId === 't')
    expect(regressed.length).toBe(1)
    expect(regressed[0].taskId).toBe('t')
    expect(regressed[0].deltaPct).toBe(-100)
  })

  it('compareReports detects new task', () => {
    const prev = makeReportAlias({ tasks: {} })
    const cur = makeReportAlias({ tasks: { t: { taskId: 't', category: 'brain', effort: 'low', runs: 1, passed: 1, passRate: 100, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cmp = compareReports(cur, prev, { thresholdPct: 5 })
    expect(cmp.diffs.length).toBe(1)
    expect(cmp.diffs[0].taskId).toBe('t')
    expect(cmp.diffs[0].rubricChanged).toContain('missing-in-baseline')
  })

  it('flagsDiff reports added/removed', () => {
    const d = flagsDiff(['planned'], ['planned', 'clean_finish'])
    expect(d.added).toEqual(['clean_finish'])
    expect(d.removed).toEqual([])
  })

  it('rubricDiff computes delta', () => {
    const d = rubricDiff([{ rubricId: 'planned', kind: 'planned', passRate: 1 }], [{ rubricId: 'planned', kind: 'planned', passRate: 0.5 }])
    expect(d[0].deltaPct).toBe(-0.5)
  })

  it('makeDiffEntry full shape', () => {
    const d = makeDiffEntry({
      taskId: 't',
      category: 'brain',
      effort: 'low',
      beforePassRate: 1,
      afterPassRate: 0,
      deltaPct: -100,
      beforeSteps: 2,
      afterSteps: 3,
      beforeDuration: 10,
      afterDuration: 20,
      flagsChanged: { added: ['clean_finish'], removed: [] },
      rubricChanged: [{ rubricId: 'planned', kind: 'planned', before: 1, after: 0.5, deltaPct: -0.5 }],
    })
    expect(d.taskId).toBe('t')
    expect(d.beforePassRate).toBe(1)
    expect(d.afterPassRate).toBe(0)
    expect(d.flagsChanged.added).toContain('clean_finish')
  })

  it('summarizeComparison groups results', () => {
    const prev = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', effort: 'low', runs: 1, passed: 1, passRate: 100, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cur = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', effort: 'low', runs: 1, passed: 0, passRate: 0, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cmp = compareReports(cur, prev, { thresholdPct: 5 })
    const s = summarizeComparison(cmp, { minPassDelta: -5, maxPassDelta: 5 })
    expect(s.totalCompared).toBeGreaterThanOrEqual(1)
    expect(s.regressions.length).toBeGreaterThanOrEqual(1)
  })
})

// ---- Evaluator -----------------------------------------------------------

describe('evaluator', () => {
  it('stepText flattens fields', () => {
    expect(stepText({ observation: 'o', result: 'r', query: 'q' })).toBe('o\nr\nq')
  })

  it('trajectoryText joins all steps', () => {
    const traj = makeTrajectory({ runId: 't', steps: [makeStep({ step: 1, observation: 'one' }), makeStep({ step: 2, observation: 'two' })] })
    expect(trajectoryText(traj)).toContain('one')
    expect(trajectoryText(traj)).toContain('two')
  })

  it('inferStatus lexically detects completion/failure', () => {
    expect(inferStatus({ status: 'completed' }, '')).toBe('completed')
    expect(inferStatus({ status: 'failed' }, '')).toBe('failed')
    expect(inferStatus({ status: 'unknown' }, 'Selesai.')).toBe('completed')
    expect(inferStatus({ status: 'unknown' }, 'Gagal karena permission.')).toBe('failed')
  })

  it('countToolCalls counts tool steps', () => {
    const steps = [
      makeStep({ kind: 'decision' }),
      makeStep({ kind: 'tool', tool: 'fs.write' }),
      makeStep({ kind: 'tool', tool: 'fs.read' }),
    ]
    expect(countToolCalls(steps)).toBe(2)
  })

  it('evaluateTask uses trajectory and rubric', () => {
    const task = makeTask({
      taskId: 't',
      category: 'brain',
      prompt: 'test',
      rubric: [
        makeRubricItem({ id: 'planned', kind: 'planned', passes: () => true }),
        makeRubricItem({ id: 'clean_finish', kind: 'clean_finish', passes: () => false }),
      ],
    })
    const traj = makeTrajectory({
      runId: 't',
      status: 'completed',
      steps: [
        makeStep({ step: 1, kind: 'decision', observation: 'rencana: 1. buat' }),
        makeStep({ step: 2, kind: 'answer', observation: 'Selesai.' }),
      ],
    })
    const r = evaluateTask({ task, traj, effort: 'low' })
    expect(r.taskId).toBe('t')
    expect(r.category).toBe('brain')
    expect(r.status).toBe('completed')
    expect(r.flags).toContain('planned')
    expect(r.flags).toContain('clean_finish')
    expect(r.rubricResults.length).toBe(2)
  })

  it('extractFlags returns set of behavior flags', () => {
    const task = makeTask({
      taskId: 't',
      category: 'brain',
      prompt: 'test',
      rubric: [],
    })
    const traj = makeTrajectory({
      runId: 't',
      status: 'completed',
      steps: [makeStep({ step: 1, observation: 'rencana dibuat. Selesai.' })],
    })
    const flags = extractFlags(task, traj)
    expect(flags).toContain('planned')
    expect(flags).toContain('clean_finish')
  })

  it('evaluateTaskRubric runs all rubric items', () => {
    const task = makeTask({
      taskId: 't',
      category: 'brain',
      prompt: 'test',
      rubric: [
        makeRubricItem({ id: 'a', kind: 'a', passes: () => true }),
        makeRubricItem({ id: 'b', kind: 'b', passes: () => false }),
      ],
    })
    const traj = makeTrajectory({ runId: 't', steps: [] })
    const results = evaluateTaskRubric(task, traj)
    expect(results.map((r) => r.rubricId)).toEqual(['a', 'b'])
    expect(results[0].passed).toBe(true)
    expect(results[1].passed).toBe(false)
  })

  it('evaluateRubric binds stepIndex and text', () => {
    const item = makeRubricItem({ id: 'x', kind: 'x', passes: (step, traj) => !!step && !!stepText(step) })
    const traj = makeTrajectory({ runId: 't', steps: [makeStep({ step: 1, observation: 'hello' })] })
    const r = evaluateRubric(item, traj, 0)
    expect(r.passed).toBe(true)
    expect(r.detail.stepIndex).toBe(0)
    expect(r.detail.text).toBe('hello')
  })
})

// ---- Tasks catalog -------------------------------------------------------

describe('tasks catalog', () => {
  it('ARCH_TASKS is non-empty and categorized', () => {
    expect(ARCH_TASKS.length).toBeGreaterThan(0)
    const cats = new Set(ARCH_TASKS.map((t) => t.category))
    expect(cats.has('brain')).toBe(true)
    expect(cats.has('logic')).toBe(true)
    expect(cats.has('body')).toBe(true)
    expect(cats.has('soul')).toBe(true)
  })

  it('listArchTasks exposes summary', () => {
    const list = listArchTasks()
    expect(list.length).toBe(ARCH_TASKS.length)
    expect(list[0]).toHaveProperty('taskId')
    expect(list[0]).toHaveProperty('category')
  })

  it('findTask returns null for unknown', () => {
    expect(findTask('nope')).toBeNull()
  })

  it('findTask returns match', () => {
    const t = findTask('brain-01-memory-injection-and-recall')
    expect(t).not.toBeNull()
    expect(t.taskId).toBe('brain-01-memory-injection-and-recall')
  })
})

// ---- Runner --------------------------------------------------------------

describe('runner', () => {
  it('syntheticTrajectory produces valid shape', () => {
    const t = syntheticTrajectory({ taskId: 't' })
    expect(t.runId).toBe('t')
    expect(Array.isArray(t.steps)).toBe(true)
    expect(t.status).toBe('completed')
  })

  it('runSyntheticTask evaluates and returns result', async () => {
    const r = await runSyntheticTask('brain-01-memory-injection-and-recall', { status: 'completed' })
    expect(r.taskId).toBe('brain-01-memory-injection-and-recall')
    expect(r.status).toBe('completed')
  })

  it('resolveEffort uses task hint', () => {
    const task = { taskId: 't', effortHint: 'high' }
    expect(resolveEffort(task, null)).toBe('high')
  })

  it('resolveEffort falls back to resolver', () => {
    const task = { taskId: 't', effortHint: null }
    expect(resolveEffort(task, () => 'ultra')).toBe('ultra')
  })

  it('createRun requires provider', () => {
    expect(() => createRun({})).toThrow(/requires a trajectory provider/)
  })

  it('createRun evaluates provider results', async () => {
    const traj = syntheticTrajectory({ taskId: 'brain-01-memory-injection-and-recall', status: 'completed' })
    const provider = async (_taskId, ctx) => traj
    const report = await createRun({
      tasks: [{ taskId: 'brain-01-memory-injection-and-recall', category: 'brain', prompt: 'x', rubric: [] }],
      provider,
      meta: { runId: 'run-1' },
    })
    expect(report.kind).toBe('abelink-arch-benchmark-report')
    expect(report.tasks['brain-01-memory-injection-and-recall']).toBeDefined()
  })
})

// ---- Compare -------------------------------------------------------------

describe('compare', () => {
  it('summarizeComparison exposes counts', () => {
    const prev = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', runs: 1, passed: 1, passRate: 100, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cur = makeReportAlias({ tasks: { t: { taskId: 't', category: 'logic', runs: 1, passed: 0, passRate: 0, avgDurationMs: 10, avgSteps: 2, flags: [], rubricSummary: [] } } })
    const cmp = compareReports(cur, prev, { thresholdPct: 5 })
    const s = summarizeComparison(cmp)
    const regressed = s.regressions.filter((r) => r.taskId === 't')
    expect(regressed.length).toBeGreaterThanOrEqual(1)
    expect(s.totalCompared).toBeGreaterThanOrEqual(1)
  })
})
