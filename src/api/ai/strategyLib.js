// strategyLib.js — Adaptive Stagnation Ladder S0..S8 & Strategy Selection.
//
// Pure, deterministic strategy escalation across attempts.
// Maps trajectory stagnation depth and execution progress into a clear 9-stage ladder:
//   S0_INITIAL     (0): Normal execution
//   S1_OBSERVE     (1): Transition / single-turn reasoning
//   S2_PERSIST     (2): Thoughtful persistence with reasoning
//   S3_MODIFY      (3): Threshold repeat -> modify tool/query/parameters
//   S4_EXPLORE     (4): Repeated failure after modify -> explore alternate paths
//   S5_ABANDON     (5): Dead-end circuit breaker -> abandon failed approach
//   S6_RETRIEVE    (6): Historical pattern retrieval from prior successes
//   S7_ESCALATE    (7): High-friction stagnation -> escalate to user intervention
//   S8_STOP        (8): Terminal stagnation -> fail-closed graceful stop

export const STRATEGY_LADDER = Object.freeze({
  S0_INITIAL: 'S0_INITIAL',
  S1_OBSERVE: 'S1_OBSERVE',
  S2_PERSIST: 'S2_PERSIST',
  S3_MODIFY: 'S3_MODIFY',
  S4_EXPLORE: 'S4_EXPLORE',
  S5_ABANDON: 'S5_ABANDON',
  S6_RETRIEVE: 'S6_RETRIEVE',
  S7_ESCALATE: 'S7_ESCALATE',
  S8_STOP: 'S8_STOP'
})

export const LADDER_STAGES = Object.freeze([
  { rung: 0, stage: STRATEGY_LADDER.S0_INITIAL, strategy: 'DIRECT', action: 'continue' },
  { rung: 1, stage: STRATEGY_LADDER.S1_OBSERVE, strategy: 'MODIFY', action: 'continue' },
  { rung: 2, stage: STRATEGY_LADDER.S2_PERSIST, strategy: 'DIRECT', action: 'continue' },
  { rung: 3, stage: STRATEGY_LADDER.S3_MODIFY, strategy: 'MODIFY', action: 'modify_strategy' },
  { rung: 4, stage: STRATEGY_LADDER.S4_EXPLORE, strategy: 'EXPLORE', action: 'explore_alternatives' },
  { rung: 5, stage: STRATEGY_LADDER.S5_ABANDON, strategy: 'STOP', action: 'abandon_strategy' },
  { rung: 6, stage: STRATEGY_LADDER.S6_RETRIEVE, strategy: 'RETRIEVE', action: 'retrieve_pattern' },
  { rung: 7, stage: STRATEGY_LADDER.S7_ESCALATE, strategy: 'ESCALATE', action: 'ask_user' },
  { rung: 8, stage: STRATEGY_LADDER.S8_STOP, strategy: 'STOP', action: 'terminate' }
])

/**
 * Pure resolver mapping stagnation metrics into S0..S8 ladder rungs.
 */
export function resolveStagnationRung({
  repeat = 0,
  stagnantStreak = 0,
  noActionStreak = 0,
  verificationBlocked = false,
  hasPriorSuccess = false
} = {}) {
  const maxRepeat = Math.max(repeat, stagnantStreak)

  if (maxRepeat >= 8 || noActionStreak >= 12) {
    return { rung: 8, stage: STRATEGY_LADDER.S8_STOP, strategy: 'STOP', reason: 'terminal-stagnation' }
  }
  if (maxRepeat >= 7 || noActionStreak >= 7) {
    return { rung: 7, stage: STRATEGY_LADDER.S7_ESCALATE, strategy: 'ESCALATE', reason: 'persistent-stagnation' }
  }
  if (maxRepeat >= 6 || noActionStreak >= 6) {
    return { rung: 6, stage: STRATEGY_LADDER.S6_RETRIEVE, strategy: hasPriorSuccess ? 'RETRIEVE' : 'EXPLORE', reason: 'pattern-retrieval' }
  }
  if (maxRepeat >= 5 || noActionStreak >= 5) {
    return { rung: 5, stage: STRATEGY_LADDER.S5_ABANDON, strategy: 'STOP', reason: 'nothing-works' }
  }
  if (maxRepeat >= 4 || noActionStreak >= 4) {
    return { rung: 4, stage: STRATEGY_LADDER.S4_EXPLORE, strategy: 'EXPLORE', reason: 'explore-alternative' }
  }
  if (verificationBlocked) {
    return { rung: 3, stage: STRATEGY_LADDER.S3_MODIFY, strategy: hasPriorSuccess ? 'RETRIEVE' : 'VERIFY', reason: 'verification-blocked' }
  }
  if (maxRepeat >= 3 || noActionStreak >= 3) {
    return { rung: 3, stage: STRATEGY_LADDER.S3_MODIFY, strategy: hasPriorSuccess ? 'RETRIEVE' : 'EXPLORE', reason: 'no-progress-after-modify' }
  }
  if (maxRepeat >= 2 || noActionStreak >= 2) {
    return { rung: 2, stage: STRATEGY_LADDER.S2_PERSIST, strategy: 'DIRECT', reason: 'persist-reasoning' }
  }
  if (maxRepeat >= 1 || noActionStreak >= 1) {
    return { rung: 1, stage: STRATEGY_LADDER.S1_OBSERVE, strategy: 'MODIFY', reason: 'repeat-same-approach' }
  }
  return { rung: 0, stage: STRATEGY_LADDER.S0_INITIAL, strategy: 'DIRECT', reason: 'initial' }
}

/**
 * Standard strategy entry point, preserving backward-compatibility
 * with tests while adding ladder rung metadata.
 */
export function getNextStrategy(
  current,
  { repeat = 0, verificationBlocked = false, hasPriorSuccess = false, stagnantStreak = 0, _noActionStreak = 0 } = {}
) {
  if (repeat >= 5) return { strategy: 'STOP', reason: 'nothing-works', rung: 5, stage: STRATEGY_LADDER.S5_ABANDON }
  if (verificationBlocked) {
    return {
      strategy: hasPriorSuccess ? 'RETRIEVE' : 'VERIFY',
      reason: 'verification-blocked',
      rung: 3,
      stage: STRATEGY_LADDER.S3_MODIFY
    }
  }
  if (repeat >= 3 || stagnantStreak >= 3) {
    return {
      strategy: hasPriorSuccess ? 'RETRIEVE' : 'EXPLORE',
      reason: 'no-progress-after-modify',
      rung: 3,
      stage: STRATEGY_LADDER.S3_MODIFY
    }
  }
  if (repeat >= 1 || stagnantStreak >= 1) {
    return { strategy: 'MODIFY', reason: 'repeat-same-approach', rung: 1, stage: STRATEGY_LADDER.S1_OBSERVE }
  }
  return { strategy: current || 'MODIFY', reason: 'initial', rung: 0, stage: STRATEGY_LADDER.S0_INITIAL }
}

export default {
  STRATEGY_LADDER,
  LADDER_STAGES,
  resolveStagnationRung,
  getNextStrategy
}
