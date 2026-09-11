// src/api/ai/scoring.js — Fase 2 deterministic attempt scorer (pure, no I/O).
// Formula locked by spec: 0.5*(rank/3) + 0.3*isNewSuccessKey + 0.2*toolSuccessRate(window=5).
export const RANK_OF = Object.freeze({
  failed: 0,
  not_run: 1,
  unavailable: 1,
  partially_verified: 2,
  verified: 3
})

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

export function scoreAttempt({ verificationRank = 1, isNewSuccessKey = false, toolSuccessRate = 0 } = {}) {
  const rank = Number.isFinite(verificationRank) ? Math.min(3, Math.max(0, verificationRank)) : 1
  const novelty = isNewSuccessKey === true ? 1 : 0
  const rate = clamp01(toolSuccessRate)
  return clamp01(0.5 * (rank / 3) + 0.3 * novelty + 0.2 * rate)
}

export default { RANK_OF, scoreAttempt }
