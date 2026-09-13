// Abelink Architecture Benchmark — runner.
//
// This module does NOT drive the UI and does NOT require a CLI today.
// It expects a trajectory provider function that returns a structured
// trajectory for each task. When ABELINK gains an execution boundary, this
// runner becomes the place to plug that boundary in.
//
// Today it can still be used with manually captured trajectories.

import {
  makeReport,
  makeRunMeta,
  makeStep,
  makeTrajectory,
  makeTaskResult,
  aggregateTaskResults,
  compareReports,
} from './contract.mjs'
import { evaluateTask, inferStatus, countToolCalls, trajectoryText } from './evaluator.mjs'
import { findTask, ARCH_TASKS } from './tasks.mjs'

export { evaluateTask, inferStatus, countToolCalls, trajectoryText } from './evaluator.mjs'
export { findTask, ARCH_TASKS, listArchTasks } from './tasks.mjs'

// ---- Trajectory provider contract ----------------------------------------

/** A trajectory provider fetches a trajectory for a task id. */
export function createRun({
  tasks = ARCH_TASKS,
  provider,
  meta,
  config,
  effortResolver = null,
} = {}) {
  if (!provider) {
    throw new Error('Architecture benchmark runner requires a trajectory provider.')
  }

  const resolvedTasks = tasks.map((t) => findTask(t.taskId) || t)
  const runMeta = makeRunMeta(meta)

  const results = []

  for (const task of resolvedTasks) {
    const effort = resolveEffort(task, effortResolver)
    const traj = provider(task.taskId, { task, effort, meta: runMeta })
    if (!traj) {
      results.push(
        makeTaskResult({
          taskId: task.taskId,
          category: task.category,
          effort,
          status: 'no_trajectory',
          passed: false,
          notes: 'No trajectory returned by provider.',
          error: 'Missing trajectory.',
        })
      )
      continue
    }

    const outputPreview = trajectoryText(traj).slice(0, 300) || traj?.meta?.summary || ''
    const result = evaluateTask({ task, traj, effort, finishedAt: traj.finishedAt, outputPreview })
    results.push(result)
  }

  const taskMap = {}
  const grouped = new Map()
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

  const summary = {
    totalTasks: Object.keys(taskMap).length,
    totalRuns: Object.values(taskMap).reduce((a, t) => a + (t.runs || 0), 0),
    overallPassRate: Object.values(taskMap).reduce((a, t, _, arr) => {
      const runs = t.runs || 0
      const passed = t.passed || 0
      return a + (runs ? (passed / runs) : 0)
    }, 0),
  }
  summary.overallPassRate = summary.totalRuns ? +(summary.overallPassRate * 100).toFixed(3) : 0

  const durations = Object.values(taskMap).map((t) => t.avgDurationMs).filter((v) => v != null)
  const steps = Object.values(taskMap).map((t) => t.avgSteps).filter((v) => v != null)
  summary.avgDurationMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
  summary.avgSteps = steps.length ? +(steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(1) : null

  summary.byCategory = summarizeByCategory(taskMap)

  return makeReport({ meta: runMeta, config, tasks: taskMap, summary })
}

/** Resolve effort for a task using optional resolver. */
export function resolveEffort(task, effortResolver) {
  if (typeof effortResolver === 'function') {
    const r = effortResolver(task)
    if (r) return r
  }
  return task.effortHint || null
}

function summarizeByCategory(taskMap) {
  const map = new Map()
  for (const t of Object.values(taskMap)) {
    const cat = t.category ?? 'unknown'
    if (!map.has(cat)) map.set(cat, { category: cat, tasks: 0, runs: 0, passed: 0 })
    const entry = map.get(cat)
    entry.tasks += 1
    entry.runs += t.runs || 0
    entry.passed += t.passed || 0
  }
  return [...map.values()].map((e) => ({
    ...e,
    passRate: e.runs ? +((e.passed / e.runs) * 100).toFixed(3) : 0,
  }))
}

// ---- Manual run helper ---------------------------------------------------

/** Create a fake trajectory for local smoke testing. */
export function syntheticTrajectory({ taskId, steps, status = 'completed', error = null, meta = null } = {}) {
  return makeTrajectory({
    runId: taskId,
    status,
    error,
    meta,
    steps: steps || [
      makeStep({ step: 1, kind: 'decision', label: 'start', observation: 'Tugas dimulai.', result: 'Mengambil instruksi.' }),
      makeStep({ step: 2, kind: 'tool', label: 'write', tool: 'fs.write', query: 'file=test.txt content=hello', result: 'ok', observation: 'File ditulis.' }),
      makeStep({ step: 3, kind: 'verify', label: 'read', tool: 'fs.read', query: 'file=test.txt', result: 'hello', observation: 'Konfirmasi baca.' }),
      makeStep({ step: 4, kind: 'answer', label: 'done', result: 'Selesai.', observation: 'Tugas selesai.' }),
    ],
  })
}

/** Run a single synthetic task for smoke testing. */
export async function runSyntheticTask(taskId, overrides = {}) {
  const task = findTask(taskId)
  if (!task) throw new Error('Unknown synthetic task: ' + taskId)
  const traj = syntheticTrajectory({
    taskId,
    status: overrides.status || 'completed',
    meta: { effort: overrides.effort || null, summary: 'synthetic' },
    ...overrides,
  })
  return evaluateTask({ task, traj, effort: task.effortHint || null })
}
