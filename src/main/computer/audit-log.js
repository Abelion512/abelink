import fs from 'fs'
import path from 'path'
import os from 'os'

const AUDIT_DIR = path.join(os.homedir(), '.mark', 'audit')
const MAX_BYTES = 2 * 1024 * 1024 // 2MB per file before rotation

function ensureDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true })
  }
}

function appendJsonl(filename, data) {
  ensureDir()
  const filePath = path.join(AUDIT_DIR, filename)
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...data,
  })
  try {
    fs.appendFileSync(filePath, line + '\n')
    // Rotate if too large
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_BYTES) {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n').filter(Boolean)
      const kept = lines.slice(-500)
      fs.writeFileSync(filePath, kept.join('\n') + '\n')
    }
  } catch (e) {
    console.warn('[AuditLog] write failed:', e.message)
  }
}

/**
 * Log an action (tool invocation, file op, etc.)
 * @param {{ tool: string, action: string, params?: object, result?: string, risk?: string }} action
 */
export function logAction(action) {
  appendJsonl('actions.jsonl', { type: 'action', ...action })
}

/**
 * Log a human approval (granted or denied).
 * @param {{ tool: string, action: string, path?: string, approved: boolean, approver?: string }} approval
 */
export function logApproval(approval) {
  appendJsonl('approvals.jsonl', { type: 'approval', ...approval })
}

/**
 * Log a security event (blocked, quarantine, suspicious).
 * @param {{ event: string, details?: object, severity?: string }} event
 */
export function logSecurityEvent(event) {
  appendJsonl('security-events.jsonl', { type: 'security', ...event })
}

/**
 * Read last N lines from a log file.
 * @param {'actions'|'approvals'|'security-events'} logType
 * @param {number} limit
 * @returns {object[]}
 */
export function readLog(logType, limit = 50) {
  const filePath = path.join(AUDIT_DIR, `${logType}.jsonl`)
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n').filter(Boolean)
  return lines.slice(-limit).map((l) => {
    try { return JSON.parse(l) }
    catch { return { raw: l } }
  })
}
