// Guard gate — pre-flight checks, circuit breaker, degraded mode trigger
// Prevents cascading failures when tools or LLM calls fail repeatedly.
// Module-level singleton — survives React remounts.

const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' }

const DEFAULTS = {
  failureThreshold: 3,
  recoveryTimeout: 60000,
  toolTimeout: 60000,
  maxTrimmedLength: 12000
}

// Tools that legitimately take no query (no-arg tools like music-next, list-dir)
const NO_QUERY_TOOLS = new Set([
  'music-next', 'music-prev', 'music-toggle', 'browser-read', 'browser-close',
  'list-windows', 'screenshot', 'finish', 'stop', 'done'
])

function createGuardGate(config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  let state = STATE.CLOSED
  let failureCount = 0
  let lastFailureTime = 0
  let consecutiveToolTimeouts = 0
  let consecutiveInvalidJson = 0

  function getStatus() {
    return { state, failureCount, consecutiveToolTimeouts, consecutiveInvalidJson }
  }

  function reset() {
    state = STATE.CLOSED
    failureCount = 0
    consecutiveToolTimeouts = 0
    consecutiveInvalidJson = 0
  }

  function recordInvalidJson() { consecutiveInvalidJson++ }
  function resetInvalidJson() { consecutiveInvalidJson = 0 }

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

    // Allow tools that don't require a query (no-arg tools)
    if (NO_QUERY_TOOLS.has(tool)) {
      return { allowed: true, degrade: false, reason: null }
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

  return { preFlightCheck, postFlightCheck, getStatus, reset, getConfig: () => cfg, recordInvalidJson, resetInvalidJson }
}

// Module-level singleton — survives React remounts
let _instance = null
export function getGuardGate(config) {
  if (!_instance) _instance = createGuardGate(config)
  return _instance
}
// ponytail: migrate singleton to main process + IPC proxy when guard state needs cross-window persistence
export { createGuardGate, STATE }
