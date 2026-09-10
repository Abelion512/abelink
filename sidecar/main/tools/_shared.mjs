import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec, spawn } from 'child_process'
import util from 'util'

// rtk always-on (pola rtk-ai/rtk): kompres output tool yang gemuk SEBELUM
// masuk konteks LLM. Helper ini dipakai handler git/find/grep/read; jika
// binary `rtk` tidak terpasang di PATH, fallback = output asli (no-op
// senyap, tanpa error) — fitur degrades gracefully, tidak pernah gagalkan
// tool. Toggle: config.rtkCompress !== false (default ON).
export const rtkFilter = (data, kind, config) => {
  if (config?.rtkCompress === false) return Promise.resolve(data)
  if (typeof data !== 'string' || data.length < 2000) return Promise.resolve(data)
  return new Promise((resolve) => {
    // rtk baca stdin, tulis hasil kompresi ke stdout (kontrak `rtk log`).
    const child = spawn('rtk', [kind], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = ''
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      done(data)
    }, 10000)
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', () => done(data)) // rtk tidak terpasang (ENOENT) -> no-op
    child.on('close', (code) => {
      const trimmed = out.trim()
      done(code === 0 && trimmed && trimmed.length < data.length ? trimmed : data)
    })
    try {
      child.stdin.write(data)
      child.stdin.end()
    } catch {
      done(data)
    }
  })
}

export const _rtkFilterForTest = rtkFilter


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
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdgData, 'mark', 'workspace')
}

export const getSkillsDir = () => {
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdgData, 'mark', 'skills')
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
