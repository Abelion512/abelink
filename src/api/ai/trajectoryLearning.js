// trajectoryLearning.js — deterministic evidence pack for self-learning.
// It reduces raw execution traces before the model-based skill synthesizer sees them.
// Failed actions are diagnostic context, never reusable proof.

const MAX_SUCCESS_STEPS = 12
const MAX_FAILURE_STEPS = 6
const MAX_TEXT_CHARS = 800
const FAILURE_RE = /^\s*\[(?:ERROR|DITOLAK|DIBATALKAN|SEARCH-ERROR|CIRCUIT-OPEN|SPIRAL-STOP|REPEAT-CACHE|NO-RESULTS)\]/i
const FAILURE_STATUS = new Set(['failed', 'blocked', 'not-executed', 'cancelled', 'aborted'])

const textOf = (step = {}) => String(
  step?.fullResult ?? step?.resultString ?? step?.result ?? step?.observation ?? ''
).trim()

const compact = (value = '', limit = MAX_TEXT_CHARS) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)

const successful = (step = {}) => {
  if (FAILURE_STATUS.has(String(step?.status || '').toLowerCase()) || step?.is_error === true) return false
  return !FAILURE_RE.test(textOf(step))
}

export function buildTrajectoryLearningPack({
  objective = '',
  executedTools = [],
  finalAnswer = '',
  verificationState = 'not_run',
  outcome = 'unknown'
} = {}) {
  const source = Array.isArray(executedTools) ? executedTools : []
  const successSteps = source.filter(successful).slice(-MAX_SUCCESS_STEPS).map((step, index) => ({
    index: index + 1,
    tool: compact(step?.tool || step?.task || 'unknown', 120),
    query: compact(step?.query || '', 300),
    observation: compact(textOf(step)),
    status: String(step?.status || 'done')
  }))
  const failureSteps = source.filter((step) => !successful(step)).slice(-MAX_FAILURE_STEPS).map((step, index) => ({
    index: index + 1,
    tool: compact(step?.tool || step?.task || 'unknown', 120),
    query: compact(step?.query || '', 300),
    observation: compact(textOf(step))
  }))

  return {
    source: 'runtime-trajectory',
    objective: compact(objective, 1200),
    outcome: String(outcome || 'unknown'),
    verificationState: String(verificationState || 'not_run'),
    successfulSteps: successSteps,
    recentFailures: failureSteps,
    finalAnswer: compact(finalAnswer, 1200),
    learningRule:
      'Only grounded observations from successful steps may become reusable procedure. Model-only claims and unverified failures are not proof.'
  }
}

export function formatTrajectoryLearningPack(pack = {}) {
  const p = pack || {}
  const successes = Array.isArray(p.successfulSteps) ? p.successfulSteps : []
  const failures = Array.isArray(p.recentFailures) ? p.recentFailures : []
  return [
    '[GROUNDED TRAJECTORY EVIDENCE]',
    `Verification state: ${p.verificationState || 'not_run'}`,
    `Outcome: ${p.outcome || 'unknown'}`,
    `Objective: ${p.objective || ''}`,
    '',
    'Successful observed steps:',
    ...(successes.length ? successes.map((s) =>
      `${s.index}. tool=${s.tool} query=${JSON.stringify(s.query)} observation=${JSON.stringify(s.observation)}`
    ) : ['(none)']),
    '',
    'Recent failed steps (diagnostic context only):',
    ...(failures.length ? failures.map((s) =>
      `${s.index}. tool=${s.tool} query=${JSON.stringify(s.query)} observation=${JSON.stringify(s.observation)}`
    ) : ['(none)']),
    '',
    `Final answer (claim only): ${String(p.finalAnswer || '').slice(0, 1200)}`,
    p.learningRule || ''
  ].join('\n')
}

export default { buildTrajectoryLearningPack, formatTrajectoryLearningPack }
