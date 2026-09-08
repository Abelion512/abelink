// Mark Architecture Benchmark — trajectory evaluator.
//
// Input: a trajectory (from MARK or a harness adapter) + a task catalog entry.
// Output: rubric results, flags, pass/fail signals, and notes.
//
// Design note:
//  - Pure functions where possible.
//  - Encoding-sensitive text extraction is isolated so the rest of the
//    evaluator can be tested deterministically.

import {
  makeTrajectory,
  makeStep,
  makeRubricResult,
  STEP_KIND,
  BEHAVIOR_FLAG,
} from './contract.mjs'

// ---- Text extraction -----------------------------------------------------

/** Flatten a step into searchable text. */
export function stepText(step) {
  if (!step) return ''
  const parts = []
  if (step.observation) parts.push(step.observation)
  if (step.result) parts.push(step.result)
  if (step.query) parts.push(step.query)
  if (step.label) parts.push(step.label)
  if (step.detail && typeof step.detail === 'object') {
    if (step.detail.text) parts.push(step.detail.text)
    if (step.detail.summary) parts.push(step.detail.summary)
    if (step.detail.reason) parts.push(step.detail.reason)
    if (step.detail.content) parts.push(step.detail.content)
  } else if (typeof step.detail === 'string') {
    parts.push(step.detail)
  }
  return parts.map((p) => String(p)).join('\n')
}

/** Flatten full trajectory into searchable text. */
export function trajectoryText(traj) {
  if (!traj) return ''
  return (traj.steps || []).map(stepText).join('\n')
}

/** Extract metadata if trajectory carries it. */
export function trajectoryMeta(traj) {
  if (!traj) return null
  return traj.meta || null
}

// ---- Rubric evaluation ---------------------------------------------------

/** Evaluate a single rubric item against a trajectory. */
export function evaluateRubric(item, traj, stepIndex) {
  const step = stepIndex != null && traj?.steps?.[stepIndex] ? traj.steps[stepIndex] : null
  const passed = typeof item.passes === 'function' ? item.passes(step, traj) : false
  return makeRubricResult({
    rubricId: item.id,
    kind: item.kind,
    passed,
    note: item.note || '',
    detail: { stepIndex, text: stepText(step) },
  })
}

/** Run all rubric items for a task over the full trajectory. */
export function evaluateTaskRubric(task, traj) {
  const results = []
  const steps = traj?.steps || []
  for (const item of task.rubric) {
    results.push(evaluateRubric(item, traj, null))
  }
  return results
}

// ---- Flag extraction ----------------------------------------------------

export function extractFlags(task, traj) {
  const flags = []
  const text = trajectoryText(traj)
  const steps = traj?.steps || []
  const lastStep = steps.length ? steps[steps.length - 1] : null

  if (hasPlanningFlag(task, traj, steps)) flags.push(BEHAVIOR_FLAG.PLANNED)
  if (hasNoLoopFlag(traj, steps)) flags.push(BEHAVIOR_FLAG.NO_LOOP)
  if (hasMemoryFlag(task, traj, text)) flags.push(BEHAVIOR_FLAG.USED_MEMORY)
  if (hasVerificationFlag(traj, steps)) flags.push(BEHAVIOR_FLAG.VERIFIED)
  if (hasCleanFinishFlag(traj, lastStep)) flags.push(BEHAVIOR_FLAG.CLEAN_FINISH)
  if (hasFailedSafelyFlag(traj, lastStep, text)) flags.push(BEHAVIOR_FLAG.FAILED_SAFELY)
  if (hasPersonaShiftFlag(task, traj, text)) flags.push(BEHAVIOR_FLAG.PERSONA_SHIFT)

  return flags
}

function hasPlanningFlag(task, traj, steps) {
  const planRubric = task.rubric?.find((r) => r.id === 'planned')
  if (planRubric && typeof planRubric.passes === 'function') {
    return planRubric.passes(null, traj)
  }
  // fallback heuristic
  const t = trajectoryText(traj)
  return /(rencana|langkah|plan|step|lakukan.*berikut|urut)/i.test(t)
}

function hasNoLoopFlag(traj, steps) {
  const seen = new Map()
  let repeats = 0
  for (const s of steps) {
    const key = JSON.stringify([(s.tool || ''), (s.query || ''), stepText(s), (s.result || '')])
    if (seen.has(key)) {
      repeats++
      if (repeats > 1) return false
    }
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  return true
}

function hasMemoryFlag(task, traj, text) {
  const memRubric = task.rubric?.find((r) => r.id === 'used_memory')
  if (memRubric && typeof memRubric.passes === 'function') {
    return memRubric.passes(null, traj)
  }
  return /(kode rahasia|OMEGA|rahasia|ingat|ingat kembali|retrieve|recall|ambil dari memori|memori)/i.test(text)
}

function hasVerificationFlag(traj, steps) {
  const verifyRubric = traj?.meta?.item?.find ? null : null
  const t = trajectoryText(traj)
  return /(cek|verifikasi|konfirmasi|baca kembali|read back|check|verify|sesuai|cocok|assert)/i.test(t)
}

function hasCleanFinishFlag(traj, lastStep) {
  if (!lastStep) return false
  const t = stepText(lastStep)
  if (traj.status === 'completed') return true
  return /(selesai|selesai|tercomplete|done|finish|berhasil|konfirmasi|summary|ringkasan)/i.test(t)
}

function hasFailedSafelyFlag(traj, lastStep, text) {
  if (!lastStep) return false
  const combined = stepText(lastStep) + '\n' + text
  const failed = /(gagal|error|failed|tidak bisa|tidak dapat|permission|tidak punya akses|not permitted)/i.test(combined)
  if (!failed) return false
  const panic = /(tidak kembali|membiarkan|berhenti tanpa pesan|undefined behavior)/i.test(combined)
  return !panic
}

function hasPersonaShiftFlag(task, traj, text) {
  const shiftRubric = task.rubric?.find((r) => r.id === 'persona_shift')
  if (shiftRubric && typeof shiftRubric.passes === 'function') {
    return shiftRubric.passes(null, traj)
  }
  const pressure = /(kecewa|buruk|hebat|bagus sekali|sangat|tekanan|waktu|segera|cepat|marah|pujian)/i.test(text)
  const shift = /(eh|waduh|ya sudha|oke sola|ga masalah|santai|serius|ngga|gue|lu|aku|kamu|anda|saya)/i.test(text)
  return pressure && shift
}

// ---- Task-level evaluation ----------------------------------------------

/** Evaluate one task from its trajectory and return a result. */
export function evaluateTask({ task, traj, effort = null, finishedAt = null, outputPreview = '' }) {
  const steps = traj?.steps || []
  const text = trajectoryText(traj)
  const status = inferStatus(traj, text)
  const rubricResults = evaluateTaskRubric(task, traj)
  const rubricPassCount = rubricResults.filter((r) => r.passed).length
  const flags = extractFlags(task, traj)

  const passed = status === 'completed' && rubricPassCount > 0 && flags.includes(BEHAVIOR_FLAG.CLEAN_FINISH)
  const memoryHit = flags.includes(BEHAVIOR_FLAG.USED_MEMORY)
  const verified = flags.includes(BEHAVIOR_FLAG.VERIFIED)

  return {
    taskId: task.taskId,
    category: task.category,
    effort,
    status,
    passed,
    rubricResults,
    stepCount: steps.length,
    toolCallCount: countToolCalls(steps),
    memoryHit,
    verified,
    durationMs: traj?.durationMs ?? 0,
    finishedAt,
    flags,
    notes: buildNotes(task, rubricResults, flags, status),
    outputPreview,
    error: traj?.error ?? null,
  }
}

/** Count tool-like steps. */
export function countToolCalls(steps) {
  return steps.filter((s) => s.kind === STEP_KIND.TOOL).length
}

/** Infer status from trajectory signals. */
export function inferStatus(traj, text) {
  if (!traj) return 'unknown'
  if (traj.status && ['completed', 'failed', 'aborted', 'budget_exhausted'].includes(traj.status)) {
    return traj.status
  }
  if (/gagal|error|failed|tidak bisa|tidak dapat|permission|not permitted/i.test(text)) {
    return 'failed'
  }
  if (/selesai|done|finish|berhasil|konfirmasi|summary|ringkasan/i.test(text)) {
    return 'completed'
  }
  return 'unknown'
}

function buildNotes(task, rubricResults, flags, status) {
  const lines = []
  const failedRubric = rubricResults.filter((r) => !r.passed)
  if (failedRubric.length) {
    lines.push(`Item perilaku gagal: ${failedRubric.map((r) => r.rubricId).join(', ')}`)
  }
  if (flags.length) {
    lines.push(`Flag perilaku: ${flags.join(', ')}`)
  } else {
    lines.push('Tidak ada flag perilaku yang terekstrak.')
  }
  if (status === 'unknown') {
    lines.push('Status tidak bisa disimpulkan dari teks trajectory.')
  }
  return lines.join(' | ')
}

// ---- Batch evaluation ---------------------------------------------------

export function evaluateBatch(taskResults) {
  return taskResults.map((tr) => evaluateTask(tr))
}
