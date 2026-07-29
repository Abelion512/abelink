// Approval Modes
// Based on: Claude Code 6 permission modes
// Source: https://code.claude.com/docs/en/agent-sdk/permissions
//
// Modes:
// - strict: ask for everything (safe but slow)
// - selective: auto for read/search, ask for write/delete/browser
// - auto: model classifier decides (risk-based)
// - bypass: run everything + audit (dev mode)
// - plan: read-only, no modifications

const RISK_LEVELS = {
  'read-file': 'low',
  'list-dir': 'low',
  'grep-search': 'low',
  'memory-search': 'low',
  'browser-read': 'low',
  'browser-scroll': 'low',
  'native-notify': 'low',
  'yt-search': 'low',
  'yt-summary': 'low',
  'music-next': 'low',
  'music-prev': 'low',
  'music-toggle': 'low',
  'music-search': 'low',

  'write-file': 'medium',
  'replace-lines': 'medium',
  'browser-navigate': 'medium',
  'browser-click': 'medium',
  'browser-type': 'medium',
  'music-play': 'medium',
  'speak': 'medium',
  'camera-look': 'medium',
  'run-cli': 'medium',
  'analyze-screen': 'medium',

  'delete-file': 'high',
  'run-shell': 'high',
  'browser-ask-user': 'high',
  'browser-close': 'high',
  'wa-send': 'high',
  'screenshot-to-wa': 'high',
}

const PLAN_DENY = new Set(['write-file', 'delete-file', 'replace-lines', 'run-shell', 'run-cli', 'browser-ask-user', 'wa-send', 'screenshot-to-wa'])

export function checkApprovalByMode(mode, tool, isAutonomous = false) {
  const risk = RISK_LEVELS[tool] || 'medium'

  switch (mode) {
    case 'strict':
      // Ask for everything
      return { needsApproval: true, reason: `strict mode: "${tool}" requires approval` }

    case 'selective':
      // Auto for low risk, ask for medium/high
      if (risk === 'low') return { needsApproval: false, reason: 'low-risk tool' }
      if (risk === 'medium' && isAutonomous) return { needsApproval: true, reason: `autonomous: "${tool}" requires approval` }
      if (risk === 'high') return { needsApproval: true, reason: `high-risk tool: "${tool}"` }
      return { needsApproval: false, reason: 'medium risk, user-initiated' }

    case 'auto':
      // Model classifier: auto for low, ask for medium, block high
      if (risk === 'low') return { needsApproval: false, reason: 'auto mode: low risk' }
      if (risk === 'medium') return { needsApproval: true, reason: `auto mode: "${tool}" needs review` }
      return { needsApproval: true, reason: `auto mode: high-risk tool "${tool}" requires approval` }

    case 'bypass':
      // Run everything, audit only
      return { needsApproval: false, reason: 'bypass mode' }

    case 'plan':
      // Read-only mode
      if (PLAN_DENY.has(tool)) {
        return { needsApproval: true, reason: `plan mode: "${tool}" is not allowed`, blocked: true }
      }
      return { needsApproval: false, reason: 'plan mode: read-only allowed' }

    default:
      return { needsApproval: risk !== 'low', reason: `default: "${tool}" risk=${risk}` }
  }
}
