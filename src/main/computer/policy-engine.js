import path from 'path'
import os from 'os'

const HOME = os.homedir()
const MARK_ROOT = path.join(HOME, '.mark')

// --- Tool Risk Registry ---
// GREEN  = auto-execute, no prompt
// YELLOW = auto-execute, log silently
// ORANGE = approval required before execution
// RED    = hard block, never execute

const TOOL_RISK = {
  // GREEN — read-only, safe
  'computer.list-windows': 'GREEN',
  'computer.get-active-window': 'GREEN',
  'computer.list-processes': 'GREEN',
  'computer.screenshot': 'GREEN',

  // YELLOW — low-risk actions, log only
  'computer.open': 'YELLOW',
  'computer.focus-window': 'YELLOW',
  'computer.click': 'YELLOW',
  'computer.type': 'YELLOW',
  'computer.key': 'YELLOW',
  'computer.read-folder': 'YELLOW',
  'computer.read-file': 'YELLOW',

  // ORANGE — needs human approval
  'computer.close-window': 'ORANGE',
  'computer.run-command': 'ORANGE',
  'computer.delete-file': 'ORANGE',
  'computer.send-email': 'ORANGE',
  'computer.purchase': 'ORANGE',

  // RED — hard blocked
  'computer.sudo': 'RED',
  'computer.shutdown': 'RED',
  'computer.extract-password': 'RED',
  'computer.disable-security': 'RED',
}

/**
 * Get risk level for a tool.
 * @param {string} toolName
 * @returns {'GREEN'|'YELLOW'|'ORANGE'|'RED'}
 */
export function getToolRisk(toolName) {
  return TOOL_RISK[toolName] ?? 'ORANGE' // unknown tools default to approval-required
}

// --- Path Risk Assessment ---

const PATH_RISK_PATTERNS = [
  {
    category: 'reinstallable',
    risk: 'LOW',
    match: (p) =>
      /node_modules[\\/]/.test(p) ||
      /[\\/]\.cache[\\/]/.test(p) ||
      /[\\/](build|dist|\.next|__pycache__)[\\/]/.test(p) ||
      /[\\/](vendor)[\\/]/.test(p),
  },
  {
    category: 'generated',
    risk: 'LOW',
    match: (p) =>
      /\.(log|tmp|bak|swp|swo)$/.test(p) ||
      /\.env\.local$/.test(p) ||
      p.startsWith('/tmp/'),
  },
  {
    category: 'user-content',
    risk: 'HIGH',
    match: (p) =>
      /[\\/](docs|notes|diary|Documents|Pictures|Downloads)[\\/]/i.test(p) ||
      /\.(md|txt|pdf|docx|jpg|png|gif)$/i.test(p),
  },
  {
    category: 'source-code',
    risk: 'CRITICAL',
    match: (p) =>
      /[\\/](src|lib|app)[\\/]/.test(p) ||
      /\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|rb)$/i.test(p),
  },
  {
    category: 'config',
    risk: 'CRITICAL',
    match: (p) => {
      const base = path.basename(p)
      return [
        'package.json', 'tsconfig.json', 'tsconfig.*.json',
        '.gitconfig', '.eslintrc', '.prettierrc', 'Makefile',
        'Dockerfile', 'docker-compose.yml', 'Cargo.toml',
      ].some((n) => base === n || (n.includes('*') && base.startsWith(n.split('*')[0])))
    },
  },
  {
    category: 'system',
    risk: 'MAX',
    match: (p) =>
      p.startsWith('/etc/') ||
      p.startsWith('/usr/') ||
      p.startsWith('/var/') ||
      p.startsWith('/boot/') ||
      p.startsWith('/sbin/') ||
      p.startsWith('/bin/') && !p.includes('node_modules'),
  },
  {
    category: 'self',
    risk: 'MAX',
    match: (p) => {
      const resolved = path.resolve(p)
      return (
        resolved.startsWith(MARK_ROOT) ||
        resolved.startsWith(path.join(HOME, '.mark'))
      )
    },
  },
]

// User-content paths in project contexts are source-code, not just user-content
// e.g. /home/user/myproject/docs/README.md → source-code (project docs)
function isInsideProject(p) {
  // Heuristic: contains a package.json, .git, or similar project marker in ancestors
  // For fast check: looks for common project directories
  return /[\\/](src|lib|app|packages)[\\/]/.test(p)
}

/**
 * Assess risk category for a file path.
 * @param {string} filePath
 * @returns {{ category: string, risk: string, canDelete: boolean }}
 */
export function assessPathRisk(filePath) {
  const resolved = path.resolve(filePath)

  // Self-preservation is absolute
  if (resolved.startsWith(MARK_ROOT)) {
    return { category: 'self', risk: 'MAX', canDelete: false }
  }

  for (const pattern of PATH_RISK_PATTERNS) {
    if (pattern.match(resolved)) {
      return {
        category: pattern.category,
        risk: pattern.risk,
        canDelete: pattern.risk === 'LOW',
      }
    }
  }

  // Default: treat unknown paths as user-content
  return { category: 'user-content', risk: 'HIGH', canDelete: false }
}

// --- Permission Resolution ---

/**
 * Check whether an action on a path is allowed given current scope.
 * Returns: 'allow' | 'deny' | 'approve' (needs human approval)
 *
 * @param {string} action - 'read' | 'write' | 'delete' | 'execute'
 * @param {string} filePath - target path
 * @param {{ scope?: string, toolRisk?: string }} scope
 */
export function checkPermission(action, filePath, scope = {}) {
  const pathRisk = assessPathRisk(filePath)

  // Self-preservation: ALWAYS deny
  if (pathRisk.category === 'self') {
    return 'deny'
  }

  // System paths: ALWAYS deny
  if (pathRisk.risk === 'MAX') {
    return 'deny'
  }

  // RED tools: always deny
  if (scope.toolRisk === 'RED') {
    return 'deny'
  }

  // ORANGE tools: always need approval
  if (scope.toolRisk === 'ORANGE') {
    return 'approve'
  }

  // Read actions on low-risk paths: auto-allow
  if (action === 'read' && pathRisk.risk === 'LOW') {
    return 'allow'
  }

  // Write/delete on reinstallable/generated: allow
  if (['write', 'delete'].includes(action) && pathRisk.canDelete) {
    return 'allow'
  }

  // Write/delete on HIGH risk: approve
  if (['write', 'delete'].includes(action) && pathRisk.risk === 'HIGH') {
    return 'approve'
  }

  // Write/delete on CRITICAL risk: approve (never auto-allow)
  if (['write', 'delete'].includes(action) && pathRisk.risk === 'CRITICAL') {
    return 'approve'
  }

  // Default: approve (safe side)
  return 'approve'
}

// --- Dangerous Command Enhancement ---

const EXTRA_DANGEROUS = [
  'rm -rf /',
  'mkfs',
  'fdisk',
  'dd of=',
  'kill -9 1',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  'mv / ',
  'rm -r /',
  '> /dev/sd',
  'chmod -R 000 /',
  'wget ', // auto-download
  'curl | sh',
  'curl | bash',
]

/**
 * Enhanced dangerous command check. Extends native-tools.js isDangerousCommand.
 * @param {string} cmd
 * @returns {boolean}
 */
export function isDangerousCommand(cmd) {
  const lower = cmd.toLowerCase()
  return EXTRA_DANGEROUS.some((k) => lower.includes(k))
}
