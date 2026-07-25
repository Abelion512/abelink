// Guard gate — pre-flight checks, circuit breaker, degraded mode trigger
// Prevents cascading failures when tools or LLM calls fail repeatedly.

const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' }

const DEFAULTS = {
  failureThreshold: 3,
  recoveryTimeout: 60000,
  toolTimeout: 60000,
  maxTrimmedLength: 12000
}

export function createGuardGate(config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  let state = STATE.CLOSED
  let failureCount = 0
  let lastFailureTime = 0
  let consecutiveToolTimeouts = 0

  function getStatus() {
    return { state, failureCount, consecutiveToolTimeouts }
  }

  function reset() {
    state = STATE.CLOSED
    failureCount = 0
    consecutiveToolTimeouts = 0
  }

  function trip() {
    state = STATE.OPEN
    lastFailureTime = Date.now()
  }

  function preFlightCheck(tool, query) {
    if (state === STATE.OPEN) {
      const elapsed = Date.now() - lastFailureTime
      if (elapsed > cfg.recoveryTimeout) {
        state = STATE.HALF_OPEN
        failureCount = 0
      } else {
        return { allowed: false, degrade: true, reason: `Circuit breaker OPEN (${Math.round(elapsed / 1000)}s since trip)` }
      }
    }

    if (state === STATE.HALF_OPEN) {
      state = STATE.CLOSED
      failureCount = 0
    }

    if (!tool || typeof tool !== 'string') {
      return { allowed: false, degrade: false, reason: `Invalid tool name: ${tool}` }
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return { allowed: false, degrade: false, reason: `Empty query for tool ${tool}` }
    }

    return { allowed: true, degrade: false, reason: null }
  }

  function postFlightCheck(tool, resultString, durationMs) {
    const isError = resultString && (resultString.startsWith('[ERROR]') || resultString.startsWith('[DITOLAK]'))
    const isTimeout = durationMs > cfg.toolTimeout

    if (isTimeout) consecutiveToolTimeouts++
    else consecutiveToolTimeouts = Math.max(0, consecutiveToolTimeouts - 1)

    if (isError || isTimeout) {
      failureCount++
      if (failureCount >= cfg.failureThreshold) trip()
    } else {
      failureCount = Math.max(0, failureCount - 1)
    }

    return { failureCount, isDegraded: state !== STATE.CLOSED }
  }

  return { preFlightCheck, postFlightCheck, getStatus, reset, getConfig: () => cfg }
}
