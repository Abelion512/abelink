// Abelink Architecture Benchmark — end-to-end runner stub.
//
// This stub exists to show the intended automation wiring once ABELINK exposes
// an execution boundary. It does NOT execute ABELINK directly and does NOT rely
// on UI automation.
//
// Wiring order:
//  1. select benchmark task set,
//  2. start run via execution boundary,
//  3. send prompt via execution boundary,
//  4. collect normalized steps via capture adapter,
//  5. build trajectory,
//  6. evaluate with benchmark evaluator,
//  7. aggregate into architecture benchmark report,
//  8. compare with previous run if available.

import {
  makeReport,
  makeRunMeta,
  makeTaskResult,
  aggregateTaskResults,
  compareReports,
} from './contract.ts'
import { evaluateTask } from './evaluator.ts'
import { findTask, ARCH_TASKS } from './tasks.ts'
import {
  buildTrajectory,
  isCompleted,
  isFailed,
  createStubBoundary,
  makeRunRequest,
  makeFinalStatus,
  EXECUTION_BOUNDARY_API,
  describeBoundary,
  BOUNDARY_REQUIREMENTS,
} from './capture.ts'

export {
  buildTrajectory,
  isCompleted,
  isFailed,
  createStubBoundary,
  makeRunRequest,
  makeFinalStatus,
  EXECUTION_BOUNDARY_API,
} from './capture.ts'

export { evaluateTask } from './evaluator.ts'
export { findTask, ARCH_TASKS, listArchTasks } from './tasks.ts'

// ---- Pipeline ------------------------------------------------------------

/** Run the architecture benchmark through an injectable execution boundary. */
export async function runBenchmark({
  tasks = ARCH_TASKS,
  boundary,
  meta,
  config,
  effortResolver = null,
  onStep = null,
}: any = {}) {
  if (!boundary) {
    throw new Error('runBenchmark requires an execution boundary.')
  }

  const runMeta = makeRunMeta(meta)
  const resolvedTasks = tasks.map((t: any) => findTask(t.taskId) || t)
  const results: any[] = []

  for (const task of resolvedTasks) {
    const effort = resolveEffort(task, effortResolver)
    const request = makeRunRequest({
      runId: runMeta.runId,
      taskId: task.taskId,
      category: task.category,
      prompt: task.prompt,
      effort,
      maxSteps: task.maxSteps,
      meta: runMeta,
    })

    const ctx = await boundary.startRun(request)
    const rawSteps = []
    let finalStatus = null

    try {
      for await (const raw of boundary.sendPrompt(ctx, task.prompt, { waitForCompletion: true })) {
        rawSteps.push(raw)
        if (onStep) onStep({ taskId: task.taskId, rawStep: raw })
      }
    } catch (err) {
      finalStatus = makeFinalStatus({
        runId: request.runId,
        status: 'aborted',
        completed: false,
        error: err instanceof Error ? err.message : String(err),
        notes: 'boundary error',
      })
    }

    if (!finalStatus) {
      finalStatus = await boundary.endRun(ctx)
    }

    const traj = await buildTrajectory({
      runId: task.taskId,
      rawSteps,
      finalStatus,
      meta: runMeta,
    })

    const outputPreview = traj.steps.map((s: any) => s.observation || s.result || s.text || '').join(' ').slice(0, 300)
    const result = evaluateTask({ task, traj, effort, finishedAt: traj.finishedAt, outputPreview })
    results.push(result)
  }

  const taskMap: Record<string, any> = {}
  const grouped: any = new Map()
  for (const r of results) {
    const key = r.taskId
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(r)
  }

  for (const [taskId, runs] of grouped) {
    const task = findTask(taskId) || { category: runs[0]?.category ?? null }
    taskMap[taskId] = aggregateTaskResults(runs, runs[0]?.effort ?? null)
    taskMap[taskId].category = task.category ?? taskMap[taskId].category
  }

  const durations = Object.values(taskMap).map((t: any) => t.avgDurationMs).filter((v: any) => v != null)
  const steps = Object.values(taskMap).map((t: any) => t.avgSteps).filter((v: any) => v != null)
  const summary: any = {
    totalTasks: Object.keys(taskMap).length,
    totalRuns: Object.values(taskMap).reduce((a: any, t: any) => a + (t.runs || 0), 0),
    overallPassRate: Object.values(taskMap).reduce((a: any, t: any) => a + (t.passed || 0), 0),
  }
  summary.overallPassRate = summary.totalRuns ? Number((+(summary.overallPassRate / summary.totalRuns) * 100).toFixed(3)) : 0
  summary.avgDurationMs = durations.length ? Math.round(durations.reduce((a: any, b: any) => a + b, 0) / durations.length) : null
  summary.avgSteps = steps.length ? Number((steps.reduce((a: any, b: any) => a + b, 0) / steps.length).toFixed(1)) : null
  summary.byCategory = summarizeByCategory(taskMap)

  return makeReport({ meta: runMeta, config, tasks: taskMap, summary })
}

function resolveEffort(task: any, effortResolver: any) {
  if (typeof effortResolver === 'function') {
    const r = effortResolver(task)
    if (r) return r
  }
  return task.effortHint || null
}

function summarizeByCategory(taskMap: any) {
  const map: any = new Map()
  for (const t of Object.values(taskMap) as any) {
    const cat = t.category ?? 'unknown'
    if (!map.has(cat)) map.set(cat, { category: cat, tasks: 0, runs: 0, passed: 0 })
    const entry = map.get(cat)
    entry.tasks += 1
    entry.runs += t.runs || 0
    entry.passed += t.passed || 0
  }
  return [...map.values()].map((e: any) => ({
    ...e,
    passRate: e.runs ? Number((+(e.passed / e.runs) * 100).toFixed(3)) : 0,
  }))
}

// ---- Stub execution -------------------------------------------------------

/** Run a benchmark using the stub boundary for local testing only. */
export async function runStubBenchmark({ tasks, meta, config, effortResolver = null }: any = {}) {
  return runBenchmark({ tasks, boundary: createStubBoundary(), meta, config, effortResolver })
}

// ---- Boundary wrapper ---------------------------------------------------

/** Wrap any compliant boundary for use in the benchmark pipeline. */
export function wrapBoundary(boundary: any) {
  const description = describeBoundary(boundary)
  if (!description.compliant) {
    throw new Error(`Boundary not compliant: ${description.reason}`)
  }
  return {
    ...boundary,
    _description: description,
    requirements: BOUNDARY_REQUIREMENTS,
  }
}

/** Return the current boundary capability description. */
export function boundaryDescription(boundary: any) {
  return describeBoundary(boundary)
}

// ---- Comparison helper ---------------------------------------------------
export async function compareBenchmarkRuns(current: any, prev: any, options = {}) {
  return compareReports(current, prev, options)
}
