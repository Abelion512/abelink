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
//
// Model 3-tier ala Hermes guardian (approval_detection.py):
// - HARDLINE: tidak bisa di-approve, auto-deny selalu (wipe root/home,
//   mkfs, dd ke block device, fork bomb, matikan mesin, bunuh init).
// - DANGEROUS: butuh approval (hapus, kill, chmod 777, chown, fdisk).
// - SELF: tulis/hapus di direktori Abelink sendiri (data home, workspace,
//   skills, .abelink) = butuh approval — agen tidak boleh merusak
//   dirinya sendiri diam-diam.
// Quote-masking ala Hermes: teks dalam quote BUKAN perintah (mis. echo "rm -rf /"
// tidak memicu); shell carrier (sh|bash|eval|source) dipindai mentah.
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

// Hardline: pola yang TIDAK PERNAH boleh jalan, approval pun tidak.
// (Hermes HARDLINE_PATTERNS — hanya yang tanpa-jalan-pulih.)
const HARDLINE_PATTERNS = [
  // rm -rf ke direktori sistem / home / root (terminator termasuk quote —
  // perintah nyata sering terbungkus quote: bash -c 'rm -rf /').
  /rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+[^;|&]*?(\/|\/home|\/root|\/etc|\/usr|\/var|\/bin|\/sbin|\/boot|\/lib|~|\$HOME)(\s|\/|$|['"])/i,
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s*$/i,
  // mkfs apa pun
  /\bmkfs(\.|[\s])/i,
  // dd ke block device
  /\bdd\b[^;|&]*?\bof=\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)/i,
  // redirect ke block device
  />\s*\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)/i,
  // fork bomb
  /:\(\)\s*\{\s*:\|\s*:&\s*\}\s*;?\s*:/,
  // bunuh init / matikan mesin
  /\bkill\s+-9?\s+1\b/,
  /\b(systemctl\s+(poweroff|reboot|halt|kexec)|shutdown|reboot|poweroff|halt|init\s+[06]|telinit\s+[06])\b/i
]

// Direktori diri sendiri (agen tidak boleh merusak dirinya diam-diam).
// Dicocokkan sebagai write/delete target, bukan substring bebas.
const SELF_DIR_MARKERS = [
  '/abelink',
  'abelink-dev',
  '$ABELINK_DATA_HOME',
  '.abelink/',
  '/skills/',
  '/workspace/',
  '~/.local/share'
]

// Shell carrier: isi quote ADALAH kode -> pindai mentah (ala Hermes).
const SHELL_CARRIERS_RE = /\b(sh|bash|zsh|dash|eval|source|\.)\s+(-c\s+)?['"]/i

// Hapus teks dalam quote tunggal/ganda (bukan untuk shell carrier).
const maskQuoted = (cmd) => String(cmd || '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""')

const hasSelfTarget = (cmd = '') => {
  const c = String(cmd || '')
  // Pola tulis/hapus dengan target direktori sendiri.
  if (!/(rm|rmdir|mv\s+\S+\s+|cp\s+\S+\s+|install\s+|>+|tee\s+|chmod|chown|dd\s+[^;|&]*of=)/i.test(c)) return false
  return SELF_DIR_MARKERS.some((m) => c.includes(m))
}

export const isHardlineCommand = (cmd = '') => {
  const raw = String(cmd || '')
  if (!raw.trim()) return false
  // Shell carrier -> pindai mentah; selain itu mask quote dulu.
  const scan = SHELL_CARRIERS_RE.test(raw) ? raw : maskQuoted(raw)
  return HARDLINE_PATTERNS.some((re) => re.test(scan))
}

export const isDangerousCommand = (cmd) => {
  const raw = String(cmd || '')
  if (!raw.trim()) return false
  if (isHardlineCommand(raw)) return true
  const scan = SHELL_CARRIERS_RE.test(raw) ? raw : maskQuoted(raw)
  if (DANGEROUS_KEYWORDS.some((k) => scan.toLowerCase().includes(k.toLowerCase()))) return true
  return hasSelfTarget(raw)
}

// Klasifikasi 3-tier untuk pesan approval yang tepat:
// 'hardline' (auto-deny) | 'dangerous' (approval) | 'safe'.
export const classifyCommand = (cmd = '') => {
  if (isHardlineCommand(cmd)) return 'hardline'
  if (isDangerousCommand(cmd)) return 'dangerous'
  return 'safe'
}

// Browser session state
