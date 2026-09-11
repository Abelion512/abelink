// strategyLib.js — Fase 2 closed strategy set + deterministic ranking (pure, no I/O).
export const STRATEGIES = Object.freeze(['DIRECT', 'DECOMPOSE', 'EXPLORE', 'VERIFY', 'BACKTRACK', 'RETRIEVE_MEMORY'])

export function rankNextStrategy({ failedKeys = [], preferredKeys = [], attemptedStrategies = [], verificationRank = 1, stagnation = 0, hasProofTool = false } = {}) {
  const failed = new Set(failedKeys)
  const attempted = new Set(attemptedStrategies)
  if (stagnation >= 0.6 && !failed.has('BACKTRACK')) return { strategy: 'BACKTRACK', reason: 'stagnation-high' }
  if (preferredKeys.length > 0 && !failed.has('RETRIEVE_MEMORY')) return { strategy: 'RETRIEVE_MEMORY', reason: 'adapt-prior-success' }
  if (verificationRank <= 1 && hasProofTool === true && !failed.has('VERIFY')) return { strategy: 'VERIFY', reason: 'proof-available' }
  const order = ['EXPLORE', 'DECOMPOSE', 'DIRECT', 'VERIFY', 'BACKTRACK', 'RETRIEVE_MEMORY']
  for (const s of order) {
    if (!failed.has(s) && !attempted.has(s)) return { strategy: s, reason: 'least-recently-attempted' }
  }
  for (const s of order) {
    if (!failed.has(s)) return { strategy: s, reason: 'retry-least-bad' }
  }
  return { strategy: 'DIRECT', reason: 'all-failed-fallback' }
}

export default { STRATEGIES, rankNextStrategy }
