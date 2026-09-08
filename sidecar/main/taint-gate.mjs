// taint-gate.mjs: Taint Gate Security ala JARVIS (ethanplusai/jarvis)
// Mencegah eksploitasi prompt injection dari web mengeksekusi aksi sistem di turn yang sama.

export const TAINTING_TOOLS = new Set([
  'browser-navigate',
  'browser-read',
  'browser-extract',
  'browser-click',
  'browser-type',
  'browser-scroll',
  'browser-script'
])

export const STATE_CHANGING_TOOLS = new Set([
  'run-shell',
  'run-bash',
  'run-powershell',
  'write-file',
  'replace-content',
  'replace-lines',
  'delete-file',
  'os-open',
  'git-commit',
  'git-revert',
  'tg-send'
])

let currentTurnTainted = false
let currentTurnId = null

export function setTurnId(turnId) {
  if (turnId && turnId !== currentTurnId) {
    currentTurnId = turnId
    currentTurnTainted = false
  }
}

export function isTurnTainted() {
  return currentTurnTainted
}

export function markTurnTainted(source = 'web') {
  currentTurnTainted = true
}

export function resetTurnTaint() {
  currentTurnTainted = false
  currentTurnId = null
}

export function isTaintingTool(toolName) {
  return TAINTING_TOOLS.has(String(toolName || '').trim().toLowerCase())
}

export function isStateChangingTool(toolName) {
  return STATE_CHANGING_TOOLS.has(String(toolName || '').trim().toLowerCase())
}

export function checkTaintGate(toolName) {
  const norm = String(toolName || '').trim().toLowerCase()
  if (currentTurnTainted && isStateChangingTool(norm)) {
    return {
      blocked: true,
      error: `[TAINT GATE BLOCKED] Tool '${toolName}' ditolak demi keamanan karena giliran ini telah membaca konten eksternal yang belum terverifikasi. Sampaikan hasil temuan ke pengguna dan minta konfirmasi langsung di pesan berikutnya sebelum mengeksekusi aksi sistem.`,
      is_tainted: true
    }
  }
  return { blocked: false }
}
