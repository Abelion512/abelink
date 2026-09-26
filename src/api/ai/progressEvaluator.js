// progressEvaluator.js — deterministic progress signals for long-horizon agents.
//
// This module does not judge semantic correctness with an LLM. It only compares
// structured execution evidence already observed by the runtime. The result is
// a progress signal for trajectory supervision, not a task-completion verdict.

export const PROGRESS_OUTCOME = Object.freeze({
  PROGRESS: 'progress',
  NEUTRAL: 'neutral',
  STAGNANT: 'stagnant',
  REGRESSED: 'regressed'
})

const VERIFICATION_RANK = Object.freeze({
  failed: 0,
  not_run: 1,
  unavailable: 1,
  partially_verified: 2,
  verified: 3
})

const normalize = (value = '') =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 4000)

const digest = (value = '') => {
  let h = 2166136261
  for (const ch of normalize(value)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

// Shared text-based failure classifier (superset of trajectoryLearning's
// FAILURE_RE): denial/cancel/blocked markers all mean "no forward progress"
// for governance feeds (supervisor, breaker-adjacent predicates, harness ok).
// Pure, no I/O, no imports — safe to import from hooks and sidecar-adjacent code.
const FAILURE_RE = /^\s*\[(?:ERROR|DITOLAK[^\]]*|DIBATALKAN|FORMAT SALAH|BLOCKED|SEARCH-ERROR|CIRCUIT-OPEN|SPIRAL-STOP|REPEAT-CACHE|NO-RESULTS)\]/i

export const isFailure = (resultString = '') =>
  FAILURE_RE.test(String(resultString ?? ''))

// Narrower: true MALFUNCTION for the circuit breaker. Human decisions
// ([DITOLAK-*], [DIBATALKAN], [BLOCKED]) and benign empty results
// ([NO-RESULTS]) are zero-progress but NOT malfunction — the breaker contract
// (circuitBreaker.js) says a refusal is a decision, not a malfunction.
// Supervisor/harness keep the broad isFailure; only breaker.record narrows.
const MALFUNCTION_RE = /^\s*\[(?:ERROR|FORMAT SALAH|SEARCH-ERROR|CIRCUIT-OPEN|SPIRAL-STOP|REPEAT-CACHE)\]/i

export const isMalfunction = (resultString = '') =>
  MALFUNCTION_RE.test(String(resultString ?? ''))

export const normalizeProgressKey = (tool = '', query = '') =>
  normalize(tool).slice(0, 80) + ':' + normalize(query).slice(0, 240)

export const observationFingerprint = (observation = '') => digest(observation)

const verificationRank = (state = 'not_run') =>
  VERIFICATION_RANK[String(state || 'not_run')] ?? VERIFICATION_RANK.not_run

/**
 * Compare the current execution against the immediately previous evidence.
 *
 * Signals:
 * - verification improves => progress
 * - a new successful strategy key + new evidence => progress
 * - same strategy + same observation => stagnant
 * - failed execution with no new evidence => regressed
 * - otherwise => neutral
 */
export function evaluateProgress({ previous = null, current = null } = {}) {
  const prev = previous || {}
  const cur = current || {}

  const prevVerification = verificationRank(prev.verificationState)
  const currentVerification = verificationRank(cur.verificationState)
  const verificationImproved = currentVerification > prevVerification

  const currentKey = normalizeProgressKey(cur.tool, cur.query)
  const previousKey = normalizeProgressKey(prev.tool, prev.query)
  const newStrategy = Boolean(currentKey) && currentKey !== previousKey

  const currentFingerprint = observationFingerprint(cur.observation || cur.result || '')
  const previousFingerprint = observationFingerprint(prev.observation || prev.result || '')
  const newEvidence = Boolean(cur.observation || cur.result) && currentFingerprint !== previousFingerprint

  const currentSuccess = cur.success === true
  const sameEvidence = Boolean(currentFingerprint) && currentFingerprint === previousFingerprint
  const repeatedStrategy = Boolean(currentKey) && currentKey === previousKey

  if (verificationImproved || (currentSuccess && newStrategy && newEvidence)) {
    return { outcome: PROGRESS_OUTCOME.PROGRESS, verificationImproved, newStrategy, newEvidence, sameEvidence, repeatedStrategy, currentKey, currentFingerprint }
  }

  if (repeatedStrategy && sameEvidence) {
    return { outcome: PROGRESS_OUTCOME.STAGNANT, verificationImproved, newStrategy, newEvidence, sameEvidence, repeatedStrategy, currentKey, currentFingerprint }
  }

  if (currentSuccess && newEvidence) {
    return { outcome: PROGRESS_OUTCOME.PROGRESS, verificationImproved, newStrategy, newEvidence, sameEvidence, repeatedStrategy, currentKey, currentFingerprint }
  }

  if (cur.success === false && !newEvidence && (previousKey || previousFingerprint)) {
    return { outcome: PROGRESS_OUTCOME.REGRESSED, verificationImproved, newStrategy, newEvidence, sameEvidence, repeatedStrategy, currentKey, currentFingerprint }
  }

  return { outcome: PROGRESS_OUTCOME.NEUTRAL, verificationImproved, newStrategy, newEvidence, sameEvidence, repeatedStrategy, currentKey, currentFingerprint }
}

export default { PROGRESS_OUTCOME, isFailure, isMalfunction, normalizeProgressKey, observationFingerprint, evaluateProgress }
