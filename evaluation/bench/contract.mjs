// Mark Architecture Benchmark — shared contract.
//
// This module defines the schema and pure helpers used by the architecture
// benchmark pipeline: task catalog, evaluator, runner, comparator, and report.
//
// Design goal: the benchmark system is automatable once MARK exposes an
// execution boundary. It does not depend on UI scraping or manual recall.
// It does depend on a structured trajectory artifact from the run.

/** Visible effort/label tokens used by architecture benchmark tasks. */
export const ARCH_EFFORT_LABELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto']

/** Simple run identifier generator for local harnesses. */
export function makeRunId(prefix = 'mab') {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${t}-${r}`
}

/** ISO timestamp helper. */
export function nowISO() {
  return new Date().toISOString()
}

// ---- Run metadata -------------------------------------------------------

/** Shape attached to every architecture benchmark run. */
export function makeRunMeta({
  runId,
  model = null,
  provider = null,
  archVersion = null,
  benchmarkVersion = '1.0',
  toolConfig = 'core+groups',
  created = nowISO(),
} = {}) {
  return {
    runId: runId || makeRunId(),
    model,
    provider,
    archVersion,
    benchmarkVersion,
    toolConfig,
    created,
  }
}

// ---- Trajectory schema --------------------------------------------------

/** Normalized step kind used by architecture benchmark evaluators. */
export const STEP_KIND = {
  DECISION: 'decision',
  TOOL: 'tool',
  MEMORY: 'memory',
  VERIFY: 'verify',
  PLANNING: 'planning',
  ANSWER: 'answer',
  ERROR: 'error',
  ABORT: 'abort',
}

/** Single normalized step inside an architecture benchmark trajectory. */
export function makeStep({
  step,
  kind,
  label = '',
  tool = null,
  query = null,
  result = null,
  observation = '',
  detail = null,
} = {}) {
  return {
    step: step == null ? 0 : step,
    kind,
    label,
    tool,
    query,
    result,
    observation,
    detail: detail ?? null,
  }
}

/** Trajectory emitted by an architecture benchmark run. */
export function makeTrajectory({
  runId,
  startedAt = nowISO(),
  finishedAt = nowISO(),
  steps = [],
  durationMs = null,
  status = 'unknown',
  error = null,
  meta = null,
} = {}) {
  const start = new Date(startedAt)
  const end = new Date(finishedAt)
  return {
    runId,
    startedAt,
    finishedAt,
    durationMs: durationMs ?? Math.max(0, Math.round((end.getTime() - start.getTime()) || 0)),
    status,
    error,
    steps,
    meta: meta ?? null,
  }
}

// ---- Architecture benchmark task catalog --------------------------------

/** Architecture benchmark probe categories. */
export const PROBE_CATEGORY = {
  BRAIN: 'brain',
  LOGIC: 'logic',
  BODY: 'body',
  SOUL: 'soul',
  PLANNING: 'planning',
  I_O: 'io',
  MEMORY: 'memory',
}

/** Required behavioral flags that architecture benchmark tasks can assert. */
export const BEHAVIOR_FLAG = {
  PLANNED: 'planned',
  NO_LOOP: 'no_loop',
  USED_MEMORY: 'used_memory',
  VERIFIED: 'verified',
  CLEAN_FINISH: 'clean_finish',
  FAILED_SAFELY: 'failed_safely',
  PERSONA_SHIFT: 'persona_shift',
  OBSERVED_EFFORT: 'observed_effort',
}

/** One architecture benchmark task. */
export function makeTask({
  taskId,
  category,
  label,
  prompt,
  rubric = [],
  maxSteps = null,
  effortHint = null,
  continuation = null,
} = {}) {
  if (!taskId || !category || !prompt) {
    throw new Error('makeTask requires taskId, category, and prompt')
  }
  return {
    taskId,
    category,
    label: label || taskId,
    prompt,
    rubric,
    maxSteps,
    effortHint,
    continuation,
  }
}

/** Rubric item attached to a task. */
export function makeRubricItem({
  id,
  kind,
  passes = (step, traj) => false,
  note = '',
} = {}) {
  if (!id || !kind) {
    throw new Error('makeRubricItem requires id and kind')
  }
  return { id, kind, passes, note }
}

// ---- Architecture benchmark result --------------------------------------

/** Single task result after evaluation. */
export function makeTaskResult({
  taskId,
  category,
  effort = null,
  status = 'unknown',
  passed = false,
  rubricResults = [],
  stepCount = 0,
  toolCallCount = 0,
  memoryHit = false,
  verified = false,
  durationMs = 0,
  finishedAt = null,
  continuation = null,
  flags = [],
  notes = '',
  outputPreview = '',
  error = null,
} = {}) {
  return {
    taskId,
    category,
    effort,
    status,
    passed,
    rubricResults,
    stepCount,
    toolCallCount,
    memoryHit,
    verified,
    durationMs,
    finishedAt,
    continuation,
    flags,
    notes,
    outputPreview,
    error,
  }
}

/** One rubric evaluation outcome. */
export function makeRubricResult({
  rubricId,
  kind,
  passed,
  note = '',
  detail = null,
} = {}) {
  return { rubricId, kind, passed, note, detail }
}

// ---- Architecture benchmark report --------------------------------------

/** Per-task aggregation entry in an architecture benchmark report. */
export function aggregateTaskResults(results, effort) {
  const base = results.filter((r) => r.taskId === results[0]?.taskId)
  const passedCount = results.filter((r) => r.passed).length
  const totalCount = results.length
  const durations = results.map((r) => Number.isFinite(r.durationMs) ? r.durationMs : NaN).filter((v) => !Number.isNaN(v))
  const steps = results.map((r) => Number.isFinite(r.stepCount) ? r.stepCount : NaN).filter((v) => !Number.isNaN(v))
  const tools = results.map((r) => Number.isFinite(r.toolCallCount) ? r.toolCallCount : NaN).filter((v) => !Number.isNaN(v))

  const flags = new Set()
  for (const r of results) {
    for (const f of (r.flags || [])) flags.add(f)
  }

  return {
    taskId: results[0]?.taskId ?? null,
    category: results[0]?.category ?? null,
    effort,
    runs: totalCount,
    passed: passedCount,
    passRate: totalCount ? Number((((passedCount / totalCount) * 100).toFixed(3))) : 0,
    avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    avgSteps: steps.length ? Number((steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(1)) : null,
    avgToolCalls: tools.length ? Number((tools.reduce((a, b) => a + b, 0) / tools.length).toFixed(1)) : null,
    flags: [...flags],
    rubricSummary: summarizeRubric(results),
  }
}

/** Collapse rubric results across repeated runs. */
export function summarizeRubric(results) {
  const map = new Map()
  for (const r of results) {
    for (const item of (r.rubricResults || [])) {
      const key = item.rubricId
      if (!map.has(key)) {
        map.set(key, { rubricId: item.rubricId, kind: item.kind, passed: 0, failed: 0, note: item.note || '' })
      }
      const entry = map.get(key)
      if (item.passed) entry.passed += 1
      else entry.failed += 1
    }
  }
  return [...map.values()].map((e) => ({
    ...e,
    passRate: e.failed + e.passed ? +(e.passed / (e.passed + e.failed)).toFixed(3) : 0,
  }))
}

/** Full architecture benchmark report. */
export function makeReport({
  meta,
  config,
  tasks = {},
  summary = null,
  generatedAt = nowISO(),
} = {}) {
  const runs = Object.values(tasks).reduce((acc, t) => acc + (Number.isFinite(t.runs) ? t.runs : 0), 0)
  const passed = Object.values(tasks).reduce((acc, t) => acc + (Number.isFinite(t.passed) ? t.passed : 0), 0)
  const durations = Object.values(tasks).map((t) => t.avgDurationMs).filter((v) => v != null)
  const steps = Object.values(tasks).map((t) => t.avgSteps).filter((v) => v != null)

  const normalizedTasks = {}
  for (const [key, t] of Object.entries(tasks)) {
    normalizedTasks[key] = t
    if (t.taskId == null) normalizedTasks[key].taskId = key
  }

  return {
    kind: 'mark-arch-benchmark-report',
    generatedAt,
    meta: meta ?? null,
    config: config ?? null,
    tasks: normalizedTasks,
    summary: summary ?? {
      totalTasks: Object.keys(normalizedTasks).length,
      totalRuns: runs,
      overallPassRate: runs ? +((passed / runs) * 100).toFixed(3) : 0,
      avgDurationMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      avgSteps: steps.length ? +(steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(1) : null,
      byCategory: summarizeByCategory(normalizedTasks),
    },
  }
}

/** Group summary by category. */
export function summarizeByCategory(tasks) {
  const map = new Map()
  for (const t of Object.values(tasks)) {
    const cat = t.category ?? 'unknown'
    if (!map.has(cat)) {
      map.set(cat, { category: cat, tasks: 0, runs: 0, passed: 0 })
    }
    const entry = map.get(cat)
    entry.tasks += 1
    entry.runs += Number.isFinite(t.runs) ? t.runs : 0
    entry.passed += Number.isFinite(t.passed) ? t.passed : 0
  }
  return [...map.values()].map((e) => ({
    ...e,
    passRate: e.runs ? +((e.passed / e.runs) * 100).toFixed(3) : 0,
  }))
}

// ---- Comparison ---------------------------------------------------------

/** Difference entry for before/after comparison. */
export function makeDiffEntry({
  taskId,
  category,
  effort,
  beforePassRate,
  afterPassRate,
  deltaPct,
  beforeSteps,
  afterSteps,
  beforeDuration,
  afterDuration,
  flagsChanged,
  rubricChanged,
} = {}) {
  return {
    taskId,
    category,
    effort,
    beforePassRate,
    afterPassRate,
    deltaPct,
    beforeSteps,
    afterSteps,
    beforeDuration,
    afterDuration,
    flagsChanged,
    rubricChanged,
  }
}

/** Compare two architecture benchmark reports. */
export function compareReports(current, prev, { thresholdPct = 5, ignoreEffortMismatch = false } = {}) {
  const prevTasks = prev?.tasks || {}
  const diffs = []
  for (const [key, cur] of Object.entries(current?.tasks || {})) {
    const curTaskId = cur.taskId ?? key
    const prevTask = prevTasks[key] || prevTasks[curTaskId]
    if (!prevTask) {
      diffs.push(makeDiffEntry({
        taskId: cur.taskId,
        category: cur.category,
        effort: cur.effort,
        beforePassRate: null,
        afterPassRate: cur.passRate,
        deltaPct: null,
        flagsChanged: { added: [], removed: [] },
        rubricChanged: ['missing-in-baseline'],
      }))
      continue
    }

    const prevRate = Number.isFinite(prevTask.passRate) ? prevTask.passRate : null
    const curRate = Number.isFinite(cur.passRate) ? cur.passRate : null
    const deltaPct = prevRate != null && curRate != null ? +(curRate - prevRate).toFixed(3) : null
    const flagsChanged = flagsDiff(prevTask.flags || [], cur.flags || [])
    const rubricChanged = rubricDiff(prevTask.rubricSummary || [], cur.rubricSummary || [])

    diffs.push(makeDiffEntry({
      taskId: curTaskId,
      category: cur.category ?? prevTask.category ?? null,
      effort: cur.effort ?? prevTask.effort ?? null,
      beforePassRate: prevTask.passRate,
      afterPassRate: cur.passRate,
      deltaPct,
      beforeSteps: prevTask.avgSteps,
      afterSteps: cur.avgSteps,
      beforeDuration: prevTask.avgDurationMs,
      afterDuration: cur.avgDurationMs,
      flagsChanged,
      rubricChanged,
    }))
  }

  const regressions = diffs.filter((d) => d.deltaPct != null && d.deltaPct <= -thresholdPct)
  const improvements = diffs.filter((d) => d.deltaPct != null && d.deltaPct >= thresholdPct)
  const changed = diffs.filter(
    (d) => (Array.isArray(d.flagsChanged) ? d.flagsChanged.length : 0) || (Array.isArray(d.rubricChanged) ? d.rubricChanged.length : 0)
  )

  return {
    diffs,
    regressions,
    improvements,
    changed,
    thresholdPct,
  }
}

export function flagsDiff(before, after) {
  const b = new Set(before)
  const a = new Set(after)
  const added = [...a].filter((f) => !b.has(f))
  const removed = [...b].filter((f) => !a.has(f))
  return { added, removed }
}

export function rubricDiff(before, after) {
  const map = new Map()

  for (const item of (before || [])) {
    const existing = map.get(item.rubricId) || { rubricId: item.rubricId, kind: item.kind, before: null, after: null }
    existing.before = item.passRate
    map.set(item.rubricId, existing)
  }

  for (const item of (after || [])) {
    const existing = map.get(item.rubricId) || { rubricId: item.rubricId, kind: item.kind, before: null, after: null }
    existing.after = item.passRate
    map.set(item.rubricId, existing)
  }

  return [...map.values()].map((e) => ({
    ...e,
    deltaPct: e.before == null || e.after == null ? null : +((e.after - e.before)).toFixed(3),
  }))
}
