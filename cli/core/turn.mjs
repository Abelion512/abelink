// cli/core/turn.mjs — siklus hidup satu turn TUI (abort per-turn, routing akhir).
// Dipindah dari bin/abelink-tui.mjs (M2b/B-9).

// Per-turn AbortController: Ctrl-C aborts the current turn only, session persists.
export function createTuiTurn() {
  const controller = new AbortController()
  return { controller, signal: controller.signal }
}

export function makeAbortedToolResult(toolName = '?') {
  return {
    ok: false,
    result: `[ABORTED] Tool "${toolName}" dibatalkan (Ctrl-C). Turn berhenti, sesi tetap jalan.`,
    error: { code: 'user_abort', message: 'Turn dibatalkan operator.' }
  }
}

export function checkTurnAborted(signal, toolName) {
  if (signal?.aborted) return makeAbortedToolResult(toolName)
  return null
}

// Turn-end routing: every terminal outcome returns to prompt, never exits.
// Exit happens only via /exit or EOF (Ctrl-D).
export function nextPromptAction(result = {}) {
  if (!result || typeof result !== 'object') return 'reprompt'
  return 'reprompt'
}
