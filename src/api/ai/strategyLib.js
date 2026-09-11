// strategyLib.js — thin strategy variation (pure, no I/O).
//
// Simplification of the Fase 2 closed 6-taxonomy set. The taxonomy was
// premature: no benchmark evidence that DIRECT/DECOMPOSE/EXPLORE/VERIFY/
// BACKTRACK/RETRIEVE_MEMORY as a formal ontology improves outcomes.
// What the loop actually needs is a 4-rung ladder:
//
//   repeat same approach  -> modify
//   no progress after modify -> explore
//   verification blocked  -> retrieve / inspect prior success
//   nothing works         -> stop / ask user
//
// `getNextStrategy` is the only entry point.

export function getNextStrategy(current, { repeat = 0, verificationBlocked = false, hasPriorSuccess = false } = {}) {
  if (repeat >= 5) return { strategy: 'STOP', reason: 'nothing-works' }
  if (verificationBlocked) return { strategy: hasPriorSuccess ? 'RETRIEVE' : 'VERIFY', reason: 'verification-blocked' }
  if (repeat >= 3) return { strategy: hasPriorSuccess ? 'RETRIEVE' : 'EXPLORE', reason: 'no-progress-after-modify' }
  if (repeat >= 1) return { strategy: 'MODIFY', reason: 'repeat-same-approach' }
  return { strategy: current || 'MODIFY', reason: 'initial' }
}

export default { getNextStrategy }
