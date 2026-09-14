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

// Linux-native: XDG data dir
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
// Daftar mencakup keyword era Windows (taskkill, Set-ExecutionPolicy, ...) agar
// perintah warisan upstream tetap tertangkap, PLUS keyword destruktif khas Linux.
export const DANGEROUS_KEYWORDS = [
  'Remove-Item',
  'rm ',
  'rm -rf',
  'del ',
  'rmdir',
  'Format-',
  'Clear-Disk',
  'Stop-Process',
  'kill ',
  'killall',
  'taskkill',
  'Set-ExecutionPolicy',
  'Restart-Computer',
  'shutdown',
  'reboot',
  'poweroff',
  'halt',
  'init 0',
  'reg delete',
  'mkfs',
  'dd if=',
  'fdisk',
  'chmod 777',
  'chown'
]
export const isDangerousCommand = (cmd) =>
  DANGEROUS_KEYWORDS.some((k) => cmd.toLowerCase().includes(k.toLowerCase()))

// Browser session state
