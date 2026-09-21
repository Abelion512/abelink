// headlessSecurity.js — Headless preflight security adapter.
//
// NOT an authoritative replacement for Rust native security (cmd_node_bridge.rs,
// hardline.rs, approval_policy.rs). In headless mode where no interactive
// main-thread approval dialog (rfd) exists, this layer ensures destructive,
// sensitive, or interactive-only actions FAIL CLOSED without user interruption
// or silent bypass.
//
// Core rule: "classifyCommand() is NOT a capability sandbox." Shell commands
// are governed by an explicit read-only capability whitelist with argv inspection,
// not blacklist substring matching.

import path from 'node:path'
import {
  isHardlineCommand,
  isDangerousCommand,
  SENSITIVE_TARGET_MARKERS
} from '../../../sidecar/main/tools/_shared.mjs'

// Actions requiring interactive approval in GUI (APPROVAL_ACTIONS from cmd_node_bridge.rs)
export const HEADLESS_BLOCKED_TOOLS = Object.freeze(new Set([
  'git-commit',
  'git-revert',
  'run-task',
  'task-kill',
  'delete-file',
  'delegate_coding',
  'skills:save',
  'skills:delete',
  'skills:save-file',
  'skills:create-item',
  'skills:delete-item',
  'skills:rename-item',
  'skills:install',
  'plugin:create',
  'plugin:delete',
  'plugin:execute',
  'plugin:install-git',
  'tg:start',
  'tg:stop',
  'google:connect',
  'google:disconnect',
  'capabilities:authorize',
  'capabilities:revoke',
  'os-click',
  'os-type',
  'os-key',
  'os-scroll',
  'os-open',
  'os-double-click'
]))

// Interactive tools that demand direct human intervention in GUI
export const HEADLESS_INTERACTIVE_TOOLS = Object.freeze(new Set([
  'ask-user',
  'user-ask',
  'browser-ask',
  'browser-ask-user',
  'os-ask',
  'os-ask-user',
  'ask-choice',
  'user-choice'
]))

// Explicit read-only command whitelist for headless run-shell / run-bash
export const ALLOWED_SHELL_BINARIES = Object.freeze(new Set([
  'ls',
  'pwd',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'diff',
  'git',
  'which',
  'echo',
  'true',
  'node',
  'bun',
  'cargo'
]))

// Allowed subcommands for git in headless shell (read-only only)
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'status',
  'diff',
  'log',
  'branch',
  'show',
  'rev-parse'
])

// Safe flags for runtimes (version/help check only, no arbitrary code evaluation)
const VERSION_HELP_FLAGS = new Set([
  '-v',
  '--version',
  '-V',
  '-h',
  '--help'
])

/**
 * Validate shell command against headless capability whitelist.
 * Rejects pipes, redirects, shell carriers, and unauthorized executables.
 */
export function validateHeadlessShellCommand(command = '') {
  const raw = String(command || '').trim()
  if (!raw) {
    return {
      allowed: false,
      code: 'tool-error',
      category: 'execution',
      message: 'Perintah shell kosong.'
    }
  }

  // 1. Hardline check (system wipe, dd block dev, fork bomb, reboot, etc.)
  if (isHardlineCommand(raw)) {
    return {
      allowed: false,
      code: 'policy-denied',
      category: 'hardline',
      message: 'DITOLAK OTOMATIS (hardline): perintah merusak sistem tanpa jalan pulih.'
    }
  }

  // 2. Dangerous keyword / sensitive write check
  if (isDangerousCommand(raw)) {
    return {
      allowed: false,
      code: 'unavailable-in-headless-mode',
      category: 'approval-required',
      message: 'Perintah shell terdeteksi berbahaya atau memutasi berkas sensitif, butuh approval interaktif yang tidak tersedia di mode headless.'
    }
  }

  // 3. Reject shell carriers, pipelines, redirects, background jobs, subshells
  // (Classification is NOT a sandbox — carriers like `python -c` or `bash -c` can hide arbitrary code)
  const FORBIDDEN_SHELL_PATTERNS = [
    /\|/,              // pipe
    />/,               // stdout redirect
    /</,               // stdin redirect
    /&/,               // background job or boolean AND
    /;/,               // command chaining
    /`/,               // backtick command substitution
    /\$\(/,            // subshell substitution
    /\b(sh|bash|zsh|dash|eval|source|\.)\s+(-c\s+)?['"]/i, // shell carrier
    /\b(python|python3|perl|ruby|php|awk|sed\s+-[^\s]*i|curl|wget)\b/i // arbitrary interpreters / network carriers
  ]

  for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
    if (pattern.test(raw)) {
      return {
        allowed: false,
        code: 'unavailable-in-headless-mode',
        category: 'approval-required',
        message: 'Perintah shell memuat pipeline, redirect, command substitution, atau carrier eksekusi arbitrer yang tidak diizinkan di mode headless.'
      }
    }
  }

  // 4. Tokenize and inspect executable binary
  const tokens = raw.split(/\s+/).filter(Boolean)
  const binary = path.basename(tokens[0] || '').toLowerCase()

  if (!ALLOWED_SHELL_BINARIES.has(binary)) {
    return {
      allowed: false,
      code: 'unavailable-in-headless-mode',
      category: 'approval-required',
      message: `Executable "${binary}" tidak terdaftar dalam whitelist perintah aman headless.`
    }
  }

  // Special constraint: git subcommands
  if (binary === 'git') {
    const sub = tokens[1]?.toLowerCase()
    if (!sub || !ALLOWED_GIT_SUBCOMMANDS.has(sub)) {
      return {
        allowed: false,
        code: 'unavailable-in-headless-mode',
        category: 'approval-required',
        message: `Subcommand git "${sub || 'unknown'}" memutasi state atau butuh persetujuan interaktif.`
      }
    }
  }

  // Special constraint: node / bun / cargo (only version / help checks allowed)
  if (binary === 'node' || binary === 'bun' || binary === 'cargo') {
    const args = tokens.slice(1)
    const isVersionCheck = args.length === 1 && VERSION_HELP_FLAGS.has(args[0])
    if (!isVersionCheck) {
      return {
        allowed: false,
        code: 'unavailable-in-headless-mode',
        category: 'approval-required',
        message: `Menjalankan skrip via ${binary} di mode headless tidak diizinkan (hanya pemeriksaan versi yang diizinkan).`
      }
    }
  }

  return { allowed: true }
}

/**
 * Validate filesystem mutating tool path containment and sensitive targets.
 */
export function validateHeadlessPath(filePath = '', workspaceRoot = null) {
  const p = String(filePath || '').trim()
  if (!p) {
    return {
      allowed: false,
      code: 'tool-error',
      category: 'execution',
      message: 'Path berkas tidak boleh kosong.'
    }
  }

  // 1. Containment check if workspaceRoot provided (must be checked first)
  const resolvedPath = workspaceRoot ? path.resolve(workspaceRoot, p) : path.resolve(p)
  if (workspaceRoot) {
    const resolvedRoot = path.resolve(workspaceRoot)
    const isContained = resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep)
    if (!isContained) {
      return {
        allowed: false,
        code: 'unavailable-in-headless-mode',
        category: 'containment',
        message: `Aksi di luar batas workspace (${p}) tidak diizinkan di mode headless.`
      }
    }
  }

  // 2. Check sensitive target markers (.env, .ssh, .bashrc, credentials, system files)
  const filename = path.basename(resolvedPath).toLowerCase()
  const lowerResolved = resolvedPath.toLowerCase()
  const lowerOriginal = p.toLowerCase()

  // Markers that should match filenames or paths
  const isSensitive = SENSITIVE_TARGET_MARKERS.some((marker) => {
    const m = marker.toLowerCase()
    if (m === '/abelink') {
      // Direct repo / app root marker should only match exact path segments, not substrings like /tmp/abelink-test
      return lowerResolved.includes('/abelink/') || lowerResolved.endsWith('/abelink')
    }
    return (
      filename === m ||
      filename.startsWith(m) ||
      lowerResolved.includes(m) ||
      lowerOriginal.includes(m)
    )
  })

  if (isSensitive) {
    return {
      allowed: false,
      code: 'unavailable-in-headless-mode',
      category: 'approval-required',
      message: `Aksi memutasi berkas sensitif (${p}) membutuhkan persetujuan interaktif yang tidak tersedia di mode headless.`
    }
  }

  return { allowed: true }
}

/**
 * Preflight evaluation of a tool call in headless environment.
 */
export function evaluateHeadlessSecurity(tool, query, { workspaceRoot = null } = {}) {
  const toolName = String(tool || '').trim()

  // 1. Interactive tools fail closed
  if (HEADLESS_INTERACTIVE_TOOLS.has(toolName)) {
    return {
      allowed: false,
      code: 'unavailable-in-headless-mode',
      category: 'interactive-capability',
      tool: toolName,
      message: `Tool "${toolName}" membutuhkan interaksi manusia (dialog/pertanyaan) yang tidak tersedia di mode headless.`
    }
  }

  // 2. Gated destructive actions fail closed
  if (HEADLESS_BLOCKED_TOOLS.has(toolName)) {
    return {
      allowed: false,
      code: 'unavailable-in-headless-mode',
      category: 'approval-required',
      tool: toolName,
      message: `Aksi "${toolName}" membutuhkan persetujuan pengguna (approval) yang tidak tersedia di mode headless.`
    }
  }

  // 3. Shell execution whitelist inspection
  if (toolName === 'run-shell' || toolName === 'run-bash' || toolName === 'run-powershell') {
    const shellCheck = validateHeadlessShellCommand(query)
    if (!shellCheck.allowed) {
      return {
        ...shellCheck,
        tool: toolName
      }
    }
  }

  // 4. Filesystem mutations check
  if (
    toolName === 'write-file' ||
    toolName === 'replace-content' ||
    toolName === 'replace-lines'
  ) {
    const targetPath = String(query || '').split('||')[0]?.trim()
    const pathCheck = validateHeadlessPath(targetPath, workspaceRoot)
    if (!pathCheck.allowed) {
      return {
        ...pathCheck,
        tool: toolName
      }
    }
  }

  return { allowed: true }
}

export default {
  HEADLESS_BLOCKED_TOOLS,
  HEADLESS_INTERACTIVE_TOOLS,
  ALLOWED_SHELL_BINARIES,
  validateHeadlessShellCommand,
  validateHeadlessPath,
  evaluateHeadlessSecurity
}
