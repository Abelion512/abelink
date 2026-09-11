// trajLineage.js — Fase 2 per-session search memory (pure, no I/O).
// Caller builds targetKey via normalizeAttemptKey(tool, query) from trajectorySupervisor.js.
export const MAX_LINEAGE_ATTEMPTS = 25

export function createLineage({ taskId = '', goal = '', objectiveKind = 'general', maxAttempts = MAX_LINEAGE_ATTEMPTS } = {}) {
  const cap = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : MAX_LINEAGE_ATTEMPTS
  return { taskId, goal, objectiveKind, maxAttempts: cap, attempts: [], bestAttemptId: null, failedKeys: new Set(), preferredKeys: [], stagnation: 0 }
}

export function appendAttempt(lineage, attempt = {}) {
  const entry = {
    id: attempt.id ?? lineage.attempts.length + 1,
    strategy: attempt.strategy ?? 'DIRECT',
    tool: attempt.tool ?? '',
    targetKey: attempt.targetKey ?? '',
    success: attempt.success === true,
    verificationRank: Number.isFinite(attempt.verificationRank) ? attempt.verificationRank : 1,
    score: Number.isFinite(attempt.score) ? attempt.score : 0,
    ts: attempt.ts ?? Date.now()
  }
  lineage.attempts.push(entry)
  const limit = Number.isFinite(lineage?.maxAttempts) && lineage.maxAttempts > 0 ? lineage.maxAttempts : MAX_LINEAGE_ATTEMPTS
  if (lineage.attempts.length > limit) {
    lineage.attempts = lineage.attempts.slice(-limit)
  }
  if (entry.success && entry.targetKey && !lineage.preferredKeys.includes(entry.targetKey)) {
    lineage.preferredKeys.push(entry.targetKey)
  }
  const best = bestAttempt(lineage)
  lineage.bestAttemptId = best ? best.id : null
  lineage.stagnation = stagnationScore(lineage)
  return entry
}

export function bestAttempt(lineage) {
  let best = null
  for (const a of lineage.attempts) {
    if (!best || a.score > best.score || (a.score === best.score && a.verificationRank > best.verificationRank)) best = a
  }
  return best
}

export function stagnationScore(lineage) {
  const n = lineage.attempts.length
  if (n === 0) return 0
  const last = lineage.attempts[n - 1]
  let repeat = 0
  for (let i = n - 1; i >= 0 && lineage.attempts[i].targetKey === last.targetKey; i--) repeat++
  const verifyMoving = lineage.attempts.some((a) => a.verificationRank >= 2)
  if (verifyMoving) return 0
  return Math.min(1, Math.max(repeat / 5, n >= 6 ? (n - 1) / n : 0))
}

export default { MAX_LINEAGE_ATTEMPTS, createLineage, appendAttempt, bestAttempt, stagnationScore }
