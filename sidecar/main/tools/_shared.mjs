import path from 'path'
import { exec, spawn } from 'child_process'
import util from 'util'
import { brandDir } from '../utils/dataHome.mjs'

export const DANGEROUS_KEY_COMBOS = [
  'alt+f4',
  'ctrl+shift+del',
  'win+l',
  'ctrl+alt+del',
  'alt+shift+del',
  'ctrl+shift+esc'
]
export const isDangerousKeyCombo = (combo = '') => {
  const normalized = combo.toLowerCase().replace(/\s+/g, '')
  return DANGEROUS_KEY_COMBOS.some((bad) => normalized.includes(bad.replace(/\s+/g, '')))
}

export const execPromise = util.promisify(exec)

// Linux-native: data-home terpusat (hormati ABELINK_DATA_HOME dev/prod).
export const getWorkspaceDir = () => {
  return path.join(brandDir(), 'workspace')
}

export const getSkillsDir = () => {
  return path.join(brandDir(), 'skills')
}

export const parsePagination = (str) => {
  let start = 0,
    end = 10
  if (!str) return { start, end, fetchCount: end }
  const s = String(str).trim()
  if (s.includes('-')) {
    const p = s.split('-')
    start = parseInt(p[0], 10) || 0
    end = parseInt(p[1], 10) || 10
  } else {
    end = parseInt(s, 10) || 10
  }
  if (start < 0) start = 0
  if (end <= start) end = start + 10
  // Hard cap to prevent Google API maxResults limits (usually 500)
  const fetchCount = end > 500 ? 500 : end
  return { start, end, fetchCount }
}

// Helper: Cek apakah command shell berbahaya (bash/zsh, Linux Debian/Ubuntu).
// Linux-only: keyword era Windows (Remove-Item/taskkill/del/dsb) DIBUANG —
// alias kompat `run-powershell` tetap hidup sebagai alias di node-tools.js.
export const DANGEROUS_KEYWORDS = [
  'rm ',
  'rm -rf',
  'rmdir',
  'kill ',
  'killall',
  'shutdown',
  'reboot',
  'poweroff',
  'halt',
  'init 0',
  'mkfs',
  'dd if=',
  'fdisk',
  'chmod 777',
  'chown'
]
export const isDangerousCommand = (cmd) =>
  DANGEROUS_KEYWORDS.some((k) => cmd.toLowerCase().includes(k.toLowerCase()))

// Browser session state
