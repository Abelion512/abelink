#!/usr/bin/env bun
// bin/abelink-tui.mjs — Fase 2 interactive TUI host (plan §3).
// Owns ONLY this file. Reuses bin/abelink.mjs shapes (sidecar client, auth
// chain, security preflight, NATIVE_TOOLS dispatch, memory loader) without
// touching the engine. Stdlib node:readline only, no new dependency.
//
// Fase-1 contract (loadCliSession/saveCliSession/listCliSessions +
// options.initialHistory) SUDAH mendarat di headlessCli.js/agentRunner.js.
// loadFase1Store + blockedOn dipertahankan sebagai fallback jujur bila impor
// gagal. Streaming is a flag flip (TUI_STREAM_ENABLED, GAP-STREAM).

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import 'fake-indexeddb/auto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SIDECAR_ENTRY = path.join(ROOT, 'sidecar', 'engine.mjs')
const BUN_BIN = process.env.BUN_BIN || 'bun'

// Versi TIDAK hardcoded: dari package.json (di-sync sync-version.mjs dari
// src-tauri/tauri.conf.json) agar bump alpha-6 otomatis ikut.
export const TUI_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'dev'
  } catch {
    return 'dev'
  }
})()
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto'])
export const DEFAULT_TUI_MODEL = 'oc/muse-spark-1.3-contributor-free'
export const SESSION_MESSAGE_CAP = 50

// GAP-STREAM: sidecar ai:fetch streaming frames are unconfirmed. Flip to true
// once the sidecar honors `stream` + emits token frames; buildAiFetchBody is
// the single place that threads the flag into the RPC payload.
export const TUI_STREAM_ENABLED = false

export function buildAiFetchBody({ messages, config, isSmallTask = false, jsonSchema = null } = {}) {
  const body = { messages, config, isSmallTask: Boolean(isSmallTask), jsonSchema: jsonSchema || null }
  if (TUI_STREAM_ENABLED) body.stream = true
  return body
}

export const TUI_HELP = `Perintah slash (tak dikirim sebagai prompt):
  /models [filter]   Picker model interaktif (tanpa arg) — default HANYA model yang pernah kamu pakai + alias;
                     /models --all = muat katalog penuh (1300+); /models <filter> = cari di katalog
  /model [alias|id]  Ganti model; TANPA arg = picker interaktif (↑↓ pilih, Enter pakai, ketik untuk filter)
                     Alias: zen, zen-free, spark, qwen, mimo, nara, xkiro, tokenrouter, free, free-mimo
  /effort [level]    Lihat/ganti effort: low | medium | high | xhigh | max | ultra | auto
  /sessions          Dialog sesi tersimpan, Enter = lanjut (alias: /resume)
  /commands          Command palette (alias ctrl+p)
  /continue <id>     Lanjut sesi tersimpan
  /new               Mulai sesi baru (alias: /clear)
  /compact           Ringkas histori sesi berjalan (alias: /summarize)
  /thinking          Tampilkan/sembunyikan blok thinking
  /details           Tampilkan/sembunyikan detail eksekusi tool
  /editor            Tulis prompt panjang di $EDITOR
  /init              Buat/perbarui AGENTS.md dari struktur workspace
  /help              Tampilkan bantuan ini
  /exit              Keluar (alias: /quit, /q; Ctrl-D juga bisa)
File: @path/ke/file = lampirkan isi file ke prompt. !perintah = shell cepat (tak masuk histori).
Catatan: /undo ditunda (tanpa primitif). Ctrl-C membatalkan turn saja, sesi tetap jalan.`

// Slash parser: lines starting with ^/ never reach the model as prompt.
// Alias mengikuti opencode: /quit /q, /clear, /resume, /summarize.
export function parseSlashCommand(line = '') {
  const raw = String(line ?? '')
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return { kind: 'prompt', text: raw }
  const [head, ...rest] = trimmed.slice(1).split(/\s+/)
  const name = String(head || '').toLowerCase()
  const arg = rest.join(' ').trim()
  switch (name) {
    case 'model': return { kind: 'model', arg: arg || null }
    case 'models': return { kind: 'models', arg: arg || null }
    case 'effort': return { kind: 'effort', arg: arg || null }
    case 'sessions':
    case 'resume': return { kind: 'sessions', arg: arg || null }
    case 'commands': return { kind: 'commands', arg: arg || null }
    case 'continue': return { kind: 'continue', arg: arg || null }
    case 'new':
    case 'clear': return { kind: 'new', arg: null }
    case 'compact':
    case 'summarize': return { kind: 'compact', arg: null }
    case 'thinking': return { kind: 'thinking', arg: null }
    case 'details': return { kind: 'details', arg: null }
    case 'editor': return { kind: 'editor', arg: null }
    case 'init': return { kind: 'init', arg: arg || null }
    case 'help': return { kind: 'help', arg: null }
    case 'exit':
    case 'quit':
    case 'q': return { kind: 'exit', arg: null }
    case 'undo': return { kind: 'unsupported', name, reason: '/undo ditunda: tanpa primitif undo di engine.' }
    default: return { kind: 'unknown', name, arg: arg || null }
  }
}

// Alias resolve: MODEL_ALIASES shape from headlessCli.js; unknown id passes through.
export function resolveTuiModel(input, aliases = {}) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, error: 'Pakai: /model [alias|id].' }
  const table = aliases && typeof aliases === 'object' ? aliases : {}
  const id = table[raw] || raw
  return { ok: true, model: id, alias: table[raw] ? raw : null }
}

export function parseEffortLevel(input) {
  const v = String(input ?? '').trim().toLowerCase()
  if (EFFORT_LEVELS.includes(v)) return { ok: true, effort: v }
  return { ok: false, error: `Effort harus salah satu: ${EFFORT_LEVELS.join(' | ')}.` }
}

// Line renderers for onThought/onStep.
export function renderThoughtLine(thought) {
  if (!thought) return null
  return `[THOUGHT]: ${thought}`
}

export function renderStepLine(stepRecord = {}) {
  if (stepRecord.kind === 'decision') {
    const dec = stepRecord.decision
    if (!dec?.action) return null
    const acts = Array.isArray(dec.action) ? dec.action : [dec.action]
    const parts = acts.filter((a) => a?.tool).map((a) => `${a.tool}${a.query ? ` (${String(a.query).slice(0, 100)})` : ''}`)
    return parts.length ? `[ACTION]: ${parts.join(' | ')}` : null
  }
  if (stepRecord.kind === 'tool') {
    const status = stepRecord.ok ? 'OK' : 'FAIL'
    return `[TOOL RESULT ${stepRecord.tool}]: [${status}] ${String(stepRecord.result || '').slice(0, 150)}...`
  }
  return null
}

// @file reference (ala opencode): @path/ke/file dilampirkan isinya ke prompt.
// Batas jujur: max 5 file, 50KB per file, dalam workspace. Di luar itu tolak
// dengan pesan (bukan diam). Pure + testable.
export const TUI_FILE_REF_MAX_FILES = 5
export const TUI_FILE_REF_MAX_BYTES = 50 * 1024
export function extractFileRefs(text = '') {
  const refs = []
  const re = /(^|\s)@([^\s]+)/g
  let m
  while ((m = re.exec(String(text ?? '')))) refs.push(m[2])
  return refs
}
export function resolveFileRefs(text = '', { workspace = process.cwd(), fsMod = null } = {}) {
  const fsUse = fsMod || fsSyncShim()
  const refs = extractFileRefs(text)
  if (!refs.length) return { ok: true, text, attached: [] }
  if (refs.length > TUI_FILE_REF_MAX_FILES) {
    return { ok: false, error: `Terlalu banyak @file (${refs.length}, maks ${TUI_FILE_REF_MAX_FILES}).` }
  }
  const root = path.resolve(workspace)
  const attached = []
  let out = String(text)
  for (const ref of refs) {
    const abs = path.resolve(root, ref)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      return { ok: false, error: `@${ref} di luar workspace — tolak.` }
    }
    let content
    try {
      const stat = fsUse.statSync(abs)
      if (!stat.isFile()) return { ok: false, error: `@${ref} bukan file.` }
      if (stat.size > TUI_FILE_REF_MAX_BYTES) {
        return { ok: false, error: `@${ref} terlalu besar (${stat.size}B, maks ${TUI_FILE_REF_MAX_BYTES}B).` }
      }
      content = fsUse.readFileSync(abs, 'utf8')
    } catch {
      return { ok: false, error: `@${ref} tak terbaca.` }
    }
    attached.push({ ref, bytes: content.length })
    out = out.replaceAll(`@${ref}`, `\n[FILE @${ref}]\n${content}\n[/FILE]\n`)
  }
  return { ok: true, text: out, attached }
}
// fs shim agar testable tanpa I/O nyata (inject fsMod).
function fsSyncShim() {
  return {
    statSync: (p) => {
      const st = fs.statSync(p)
      return st
    },
    readFileSync: (p, enc) => fs.readFileSync(p, enc)
  }
}

// !shell mode (ala opencode): `!perintah` jalan lokal tanpa model turn,
// output TIDAK masuk histori (konteks bersih). Pure parser + testable.
export function parseShellLine(line = '') {
  const trimmed = String(line ?? '').trim()
  if (!trimmed.startsWith('!') || trimmed === '!') return null
  return trimmed.slice(1).trim()
}

// /init generator (ala opencode /init): hasilkan draf AGENTS.md dari
// struktur workspace. Pure + testable (inject listDir). Tidak menulis file
// sendiri — handler yang menulis setelah konfirmasi implisit via perintah.
export function buildAgentsMd({ workspace = '', entries = [] } = {}) {
  const names = entries.map((e) => String(e?.name || e)).filter(Boolean).slice(0, 40)
  const has = (...keys) => names.filter((n) => keys.some((k) => n.toLowerCase().includes(k)))
  const lines = [
    '# AGENTS.md',
    '',
    `Workspace: ${workspace || '.'}`,
    '',
    '## Build & Test',
  ]
  const pkg = has('package.json')
  if (pkg.length) lines.push('- Bun/Node project (`package.json` terdeteksi). Tambahkan perintah build/test/lint yang benar di sini.')
  else lines.push('- Tambahkan perintah build/test/lint proyek ini di sini.')
  lines.push('', '## Struktur')
  if (names.length) {
    for (const n of names.slice(0, 20)) lines.push(`- \`${n}\``)
  } else {
    lines.push('- (workspace kosong atau tak terbaca — isi manual)')
  }
  lines.push('', '## Konvensi', '- Tambahkan konvensi kode proyek ini di sini.', '')
  return lines.join('\n')
}

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

// Fase-1 session store adapter: loadCliSession/saveCliSession/listCliSessions
// (kontrak §2, sudah mendarat di headlessCli.js) + options.initialHistory.
// Upstream store SYNC — `await` di sini membuatnya toleran dua bentuk.
export async function loadFase1Store() {
  try {
    const mod = await import('../src/api/ai/headlessCli.js')
    const { loadCliSession = null, saveCliSession = null, listCliSessions = null } = mod
    if (typeof loadCliSession !== 'function' || typeof saveCliSession !== 'function') return null
    return { loadCliSession, saveCliSession, listCliSessions }
  } catch {
    return null
  }
}

export async function loadTuiSession(id, store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.loadCliSession !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'loadCliSession belum tersedia (helper store tak termuat).' }
  }
  try {
    const session = await s.loadCliSession(id)
    if (!session) return { ok: false, error: `Sesi "${id}" tidak ditemukan.` }
    return { ok: true, session }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export async function saveTuiSession(session, store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.saveCliSession !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'saveCliSession belum tersedia (helper store tak termuat).' }
  }
  try {
    const capped = Array.isArray(session?.messages) ? session.messages.slice(-SESSION_MESSAGE_CAP) : []
    const res = await s.saveCliSession({ ...session, messages: capped })
    if (res && res.ok === false) return { ok: false, error: 'saveCliSession menolak sesi (id tak valid?).' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

export async function listTuiSessions(store = null) {
  const s = store || await loadFase1Store()
  if (!s || typeof s.listCliSessions !== 'function') {
    return { ok: false, blockedOn: 'fase-1', reason: 'listCliSessions belum tersedia (helper store tak termuat).' }
  }
  try {
    const sessions = await s.listCliSessions()
    return { ok: true, sessions: Array.isArray(sessions) ? sessions : [] }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// Passed as options.initialHistory per §2 contract (runAgentLoop seeds
// loopMessages with it). Filter mirrors the §2 rule: only user/assistant
// string-content messages, capped at 50.
export function sessionToInitialHistory(session = {}) {
  const msgs = Array.isArray(session.messages) ? session.messages : []
  return msgs
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-SESSION_MESSAGE_CAP)
}

// createSidecarClient-equivalent (same shape as bin/abelink.mjs).
export function createSidecarClient() {
  const child = spawn(BUN_BIN, [SIDECAR_ENTRY], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  let reqIdCounter = 1
  const pending = new Map()
  let buf = ''

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        if (msg && msg.id != null && pending.has(msg.id)) {
          const p = pending.get(msg.id)
          pending.delete(msg.id)
          clearTimeout(p.timer)
          p.resolve(msg)
        }
      } catch {}
    }
  })

  child.stderr.on('data', (chunk) => {
    if (process.env.ABELINK_DEBUG_SIDECAR) {
      process.stderr.write(`[sidecar:err] ${chunk.toString()}`)
    }
  })

  const rpc = (action, payload) =>
    new Promise((resolve, reject) => {
      const id = reqIdCounter++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Sidecar RPC timeout (action=${action}, id=${id})`))
      }, 120000)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(JSON.stringify({ id, action, payload }) + '\n')
    })

  const dispose = () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar process terminated.'))
    }
    pending.clear()
    try {
      child.stdin.end()
    } catch {}
    child.kill('SIGTERM')
  }

  // Jaring pengaman anti-orphan: kalau pemanggil lupa dispose, proses exit
  // normal tetap membunuh sidecar. Child ber-stdio pipe menahan event loop
  // parent, jadi tanpa ini TUI bisa menggantung + meninggalkan proses hidup.
  process.once('exit', () => {
    try {
      child.kill('SIGTERM')
    } catch {}
  })

  child.once('error', (err) => {
    for (const [, p] of pending) p.reject(err)
  })

  return { rpc, dispose }
}

export function parseTuiArgs(argv) {
  const args = argv.slice(2)
  const options = {
    provider: 'custom',
    model: DEFAULT_TUI_MODEL,
    effort: 'low',
    maxTurns: 15,
    workspace: process.cwd(),
    // true hanya bila user set flag eksplisit: supaya config GUI (shared.json)
    // diadopsi saat flag absen, tapi flag eksplisit tetap menang.
    providerExplicit: false,
    modelExplicit: false,
    effortExplicit: false
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--provider') { options.provider = args[++i]; options.providerExplicit = true }
    else if (arg === '--model' || arg === '-m') { options.model = args[++i]; options.modelExplicit = true }
    else if (arg === '--effort') { options.effort = args[++i]; options.effortExplicit = true }
    else if (arg === '--max-turns') options.maxTurns = Math.max(1, parseInt(args[++i], 10) || 15)
    else if (arg === '--workspace') options.workspace = path.resolve(args[++i])
    else if (arg === '-h' || arg === '--help') {
      console.log(`abelink-tui v${TUI_VERSION} — sesi interaktif.\n\nFlags: --provider --model/-m --effort --max-turns --workspace\n${TUI_HELP}`)
      process.exit(0)
    } else {
      console.error(`[ERROR]: Flag tidak dikenal "${arg}".`)
      process.exit(3)
    }
  }
  return options
}

async function main() {
  const cliOptions = parseTuiArgs(process.argv)
  // ponytail: auto-mkdir workspace; tanpa ini --workspace ke dir hilang = /init ENOENT + shell cwd gagal.
  try { fs.mkdirSync(cliOptions.workspace, { recursive: true }) } catch {}

  // Piped-input race: kumpulkan stdin non-TTY sejak awal startup;
  // dikuras FIFO setelah loop siap (lihat bawah).
  const earlyChunks = []
  let earlyEnded = false
  const earlyCollector = (chunk) => {
    earlyChunks.push(String(chunk ?? ''))
  }
  const earlyEnd = () => {
    earlyEnded = true
  }
  if (!process.stdin.isTTY) {
    try {
      process.stdin.on('data', earlyCollector)
      process.stdin.on('end', earlyEnd)
      process.stdin.resume()
    } catch {}
  }

  const { runAgentLoop } = await import('../src/api/ai/agentRunner.js')
  const { evaluateHeadlessSecurity } = await import('../src/api/ai/headlessSecurity.js')
  const { NATIVE_TOOLS } = await import('../sidecar/main/node-tools.js')
  const headless = await import('../src/api/ai/headlessCli.js').catch(() => ({}))
  const {
    resolveApprovalDecision = null,
    loadCliFileConfig = null,
    resolveCliAuth = null,
    loadNineRouterKey = null,
    loadHeadlessMemories = null,
    MODEL_ALIASES = null,
    DEFAULT_CLI_MODEL = null,
    isForbiddenModel = null,
    forbiddenModelError = null
  } = headless
  const aliases = MODEL_ALIASES || {}

  // Lazy sidecar: JANGAN spawn saat startup. Sidecar child menahan event
  // loop (pipe stdin) sehingga proses tak pernah mencapai prompt/loop —
  // terutama saat stdin pipe (E2E/script). Spawn on first model turn.
  let sidecar = null
  const getSidecar = () => {
    if (!sidecar) sidecar = createSidecarClient()
    return sidecar
  }

  let fileConfig = {}
  try {
    if (typeof loadCliFileConfig === 'function') fileConfig = loadCliFileConfig({ cwd: cliOptions.workspace }) || {}
  } catch { fileConfig = {} }
  const auth = typeof resolveCliAuth === 'function'
    ? resolveCliAuth({
      flags: { provider: cliOptions.provider, model: cliOptions.model, modelVersion: null, apiKey: null },
      env: process.env,
      fileConfig
    })
    : { provider: cliOptions.provider, model: cliOptions.model, modelVersion: null, apiKey: null }
  if (!auth.apiKey && typeof loadNineRouterKey === 'function') {
    try {
      auth.apiKey = await loadNineRouterKey()
    } catch {}
  }

  // Keputusan owner: ID terlarang ditolak di entry, bukan diam-diam dipakai.
  const initialModel = auth.model || cliOptions.model || DEFAULT_CLI_MODEL || DEFAULT_TUI_MODEL
  const banned = typeof isForbiddenModel === 'function'
    ? isForbiddenModel(initialModel)
    : /^claude-work$/i.test(String(initialModel || ''))
  if (banned) {
    console.error(typeof forbiddenModelError === 'function'
      ? `[TUI] ${forbiddenModelError(initialModel)}`
      : `[TUI] Model "${initialModel}" dilarang (training-data).`)
    process.exit(2)
  }

  let headlessMemories = []
  try {
    if (typeof loadHeadlessMemories === 'function') {
      headlessMemories = await loadHeadlessMemories({ workspaceRoot: cliOptions.workspace })
    }
  } catch { headlessMemories = [] }

  const state = {
    provider: auth.provider || cliOptions.provider,
    model: initialModel,
    effort: cliOptions.effort,
    workspace: cliOptions.workspace,
    sessionId: `session-${Date.now()}`,
    history: [],
    showThinking: true,
    showDetails: false
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'abelink> ' })
  let currentTurn = null
  rl.on('SIGINT', () => {
    if (currentTurn) {
      currentTurn.controller.abort()
      console.log('\n[Turn dibatalkan (Ctrl-C). Sesi tetap jalan — ketik prompt berikutnya.]')
    } else {
      rl.prompt(true)
    }
  })

  const buildEnvironment = (signal) => ({
    fetchAI: async (...callArgs) => {
      let messages, config, isSmallTask, jsonSchema
      if (callArgs.length === 1 && callArgs[0] && typeof callArgs[0] === 'object' && Array.isArray(callArgs[0].messages)) {
        ;({ messages, config, isSmallTask, jsonSchema } = callArgs[0])
      } else {
        ;[messages, config, isSmallTask, jsonSchema] = callArgs
      }
      const combinedConfig = {
        aiProvider: state.provider,
        geminiWebModel: state.model,
        customModel: state.model,
        groqModel: state.model,
        customEndpoint: process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
        customApiKey: auth.apiKey || process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
        groqApiKey: process.env.GROQ_API_KEY || '',
        temperature: 0,
        effortLevel: state.effort,
        ...(config || {})
      }
      const body = buildAiFetchBody({ messages, config: combinedConfig, isSmallTask, jsonSchema })
      const resp = await getSidecar().rpc('ai:fetch', [body])
      if (!resp || !resp.success) {
        const msg = String(resp?.error?.message || resp?.error || 'AI fetch gagal di sidecar.')
        // Tanpa fallback model (keputusan user): gagal = pesan jujur.
        throw new Error(msg)
      }
      return resp.data
    },

    executeTool: async (toolName, query, ctx = {}) => {
      const aborted = checkTurnAborted(signal, toolName)
      if (aborted) return aborted
      const secCheck = evaluateHeadlessSecurity(toolName, query, { workspaceRoot: state.workspace })
      if (!secCheck.allowed) {
        const decision = typeof resolveApprovalDecision === 'function'
          ? resolveApprovalDecision(secCheck, { approveAll: false, denyAll: false, mode: 'auto' })
          : { proceed: true, reason: 'auto default (logged, supervised)' }
        console.error(`[HEADLESS APPROVAL] tool=${toolName} proceed=${decision.proceed} (${decision.reason})`)
        if (!decision.proceed) {
          const errMsg = `[BLOCKED] Tool "${toolName}" ditolak oleh kebijakan keamanan headless: ${secCheck.message}`
          console.error(errMsg)
          return {
            ok: false,
            result: errMsg,
            error: { code: secCheck.code || 'unavailable-in-headless-mode', category: secCheck.category || 'security-denied', message: secCheck.message }
          }
        }
      }
      const toolDef = NATIVE_TOOLS[toolName]
      if (!toolDef || typeof toolDef.handler !== 'function') {
        const resp = await getSidecar().rpc('native-tool:execute', [toolName, query, { workspaceRoot: state.workspace, turn: ctx.step }])
        if (!resp || !resp.success) {
          return { ok: false, result: `[ERROR] Eksekusi tool ${toolName} gagal: ${resp?.error || 'Unknown error'}`, error: { code: 'tool-error', message: resp?.error } }
        }
        return { ok: true, result: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data) }
      }
      try {
        const res = await toolDef.handler(query, { workspaceRoot: state.workspace, turn: ctx.step })
        const isSuccess = res && res.success !== false
        const output = isSuccess
          ? (res.output || res.data || res.content || res.message || JSON.stringify(res))
          : (res.error || res.message || 'Tool gagal tanpa rincian.')
        return { ok: isSuccess, result: isSuccess ? String(output) : `[ERROR] ${output}`, error: isSuccess ? null : { code: 'tool-error', message: output } }
      } catch (err) {
        return { ok: false, result: `[ERROR] Tool melempar pengecualian: ${err.message}`, error: { code: 'execution-exception', message: err.message } }
      }
    },

    onThought: (thought) => {
      if (state.showThinking === false) return
      const line = renderThoughtLine(thought)
      if (line) console.log(line)
    },

    onStep: (stepRecord) => {
      if (state.showDetails === false && stepRecord?.kind === 'tool') return
      const line = renderStepLine(stepRecord)
      if (line) console.log(line)
    }
  })

  async function runTurn(prompt) {
    const turn = createTuiTurn()
    currentTurn = turn
    try {
      const result = await runAgentLoop({
        prompt,
        options: {
          provider: state.provider,
          model: state.model,
          modelVersion: null,
          effort: state.effort,
          maxTurns: cliOptions.maxTurns,
          workspace: state.workspace,
          sessionId: state.sessionId,
          signal: turn.signal,
          initialHistory: state.history, // Fase-1: runAgentLoop seed loopMessages
          stream: TUI_STREAM_ENABLED // GAP-STREAM: flag flip; engine transport decides
        },
        environment: buildEnvironment(turn.signal)
      })
      if (result.reply) console.log(`\n${result.reply}\n`)
      console.log(`-- ${result.outcome} (${result.terminalReason}) | steps ${result.stepCount} | tools ${result.toolCallsCount} | sesi ${state.sessionId} --`)
      if (result.outcome === 'needs_user' && result.reply) {
        console.log('[TUI] Butuh input manusia — jawab langsung sebagai prompt berikutnya (sesi tetap jalan).')
      }
      state.history.push({ role: 'user', content: prompt })
      if (result.reply) state.history.push({ role: 'assistant', content: result.reply })
      // Persist sesi via Fase-1 store (best-effort, never fatal).
      const saved = await saveTuiSession({
        v: 1,
        id: state.sessionId,
        workspace: state.workspace,
        provider: state.provider,
        model: state.model,
        modelVersion: null,
        effort: state.effort,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prompt,
        outcome: result.outcome,
        terminalReason: result.terminalReason,
        messages: state.history
      })
      if (saved.blockedOn) console.error(`[TUI] Persist sesi dilewati (${saved.blockedOn}): ${saved.reason}`)
      nextPromptAction(result) // always reprompt; never exits on turn end
    } catch (err) {
      console.error(`[TUI ERROR]: ${err?.message || err}`)
    } finally {
      currentTurn = null
    }
  }

  // Eksekutor !shell (ala opencode): tanpa model turn, tanpa histori.
  // Batas jujur: read-only aman + tolak pola berbahaya; BUKAN sandbox.
  async function runShellLine(command) {
    const { validateHeadlessShellCommand } = await import('../src/api/ai/headlessSecurity.js').catch(() => ({}))
    if (typeof validateHeadlessShellCommand === 'function') {
      const check = validateHeadlessShellCommand(command)
      if (!check.allowed) {
        console.error(`[SHELL DITOLAK]: ${check.message}`)
        return
      }
    }
    await new Promise((resolve) => {
      execFile('/bin/sh', ['-c', command], { cwd: state.workspace, timeout: 30000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout.endsWith('\n') ? stdout : stdout + '\n')
        if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : stderr + '\n')
        if (err?.code) console.error(`[! exited ${err.code}]`)
        resolve()
      })
    })
  }

  async function handleSlash(cmd) {
    switch (cmd.kind) {
      case 'models': {
        const q = String(cmd.arg || '').toLowerCase()
        const rows = Object.entries(aliases).filter(([k]) => !q || k.includes(q))
        if (!rows.length) {
          console.log('Tak ada alias cocok. /model <ID-penuh> tetap bisa dipakai langsung.')
          return
        }
        for (const [k, v] of rows) console.log(`${k.padEnd(16)} -> ${v}`)
        console.log(`\nModel aktif: ${state.model}`)
        return
      }
      case 'model': {
        if (!cmd.arg) {
          console.log(`Model aktif: ${state.model}`)
          return
        }
        const r = resolveTuiModel(cmd.arg, aliases)
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.model = r.model
        console.log(r.alias ? `Model: ${r.alias} -> ${r.model}` : `Model: ${r.model} (ID langsung)`)
        return
      }
      case 'effort': {
        if (!cmd.arg) {
          console.log(`Effort aktif: ${state.effort}`)
          return
        }
        const r = parseEffortLevel(cmd.arg)
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.effort = r.effort
        console.log(`Effort: ${state.effort}`)
        return
      }
      case 'sessions': {
        const r = await listTuiSessions()
        if (r.blockedOn) {
          console.error(`[TUI] /sessions dilewati (${r.blockedOn}): ${r.reason}`)
          return
        }
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        if (!r.sessions.length) {
          console.log('Belum ada sesi tersimpan.')
          return
        }
        for (const s of r.sessions) console.log(`- ${s.id} | ${s.outcome || '?'} | ${s.updatedAt || ''}`)
        return
      }
      case 'continue': {
        if (!cmd.arg) {
          console.error('[ERROR]: Pakai: /continue <id> (lihat /sessions).')
          return
        }
        const r = await loadTuiSession(cmd.arg)
        if (r.blockedOn) {
          console.error(`[TUI] /continue dilewati (${r.blockedOn}): ${r.reason}`)
          return
        }
        if (!r.ok) {
          console.error(`[ERROR]: ${r.error}`)
          return
        }
        state.sessionId = r.session.id || cmd.arg
        state.history = sessionToInitialHistory(r.session)
        if (r.session.model) state.model = r.session.model
        if (r.session.effort) state.effort = r.session.effort
        console.log(`Lanjut sesi ${state.sessionId} (${state.history.length} pesan histori).`)
        return
      }
      case 'new': {
        state.sessionId = `session-${Date.now()}`
        state.history = []
        console.log(`Sesi baru: ${state.sessionId}`)
        return
      }
      case 'compact': {
        if (!state.history.length) {
          console.log('Histori kosong — tak ada yang diringkas.')
          return
        }
        const keep = 10
        const drop = Math.max(0, state.history.length - keep)
        state.history = state.history.slice(-keep)
        console.log(`[TUI] Histori dipadatkan: buang ${drop} pesan lama, simpan ${state.history.length} terakhir. (Ringkasan LLM menyusul; kini potong ekor.)`)
        return
      }
      case 'thinking': {
        state.showThinking = !state.showThinking
        console.log(`[TUI] Blok thinking: ${state.showThinking ? 'TAMPIL' : 'SEMBUNYI'} (tampilan saja; kemampuan reasoning model tak berubah).`)
        return
      }
      case 'editor': {
        const { spawnSync } = await import('node:child_process')
        const editor = process.env.EDITOR || 'nano'
        const tmpFile = path.join(os.tmpdir(), `abelink-tui-${Date.now()}.md`)
        try {
          fs.writeFileSync(tmpFile, '', 'utf8')
          const r = spawnSync(editor, [tmpFile], { stdio: 'inherit' })
          if ((r.status ?? 0) !== 0) {
            console.error(`[ERROR]: Editor keluar dengan kode ${r.status}.`)
            return
          }
          const text = fs.readFileSync(tmpFile, 'utf8').trim()
          if (!text) {
            console.log('[TUI] Editor kosong — batal.')
            return
          }
          console.log('[TUI] Teks editor dikirim sebagai prompt.')
          await runTurn(text)
        } catch (err) {
          console.error(`[ERROR]: ${err?.message || err}`)
        } finally {
          try { fs.unlinkSync(tmpFile) } catch {}
        }
        return
      }
      case 'help': console.log(TUI_HELP); return
      case 'details': {
        state.showDetails = !state.showDetails
        console.log(`[TUI] Detail eksekusi tool: ${state.showDetails ? 'TAMPIL' : 'SEMBUNYI'} (ringkas ala opencode /details).`)
        return
      }
      case 'init': {
        let entries = []
        try {
          const fsMod = await import('node:fs')
          entries = fsMod.readdirSync(state.workspace, { withFileTypes: true }).map((e) => e.name)
        } catch {
          entries = []
        }
        const draft = buildAgentsMd({ workspace: state.workspace, entries })
        const target = (cmd.arg && !cmd.arg.startsWith('-') ? cmd.arg : 'AGENTS.md')
        const abs = path.resolve(state.workspace, target)
        const root = path.resolve(state.workspace)
        if (abs !== root && !abs.startsWith(root + path.sep)) {
          console.error(`[ERROR]: Target ${target} di luar workspace — tolak.`)
          return
        }
        try {
          fs.writeFileSync(abs, draft + '\n', 'utf8')
          console.log(`[TUI] Draf AGENTS.md ditulis ke ${abs} — sunting manual sebelum dipakai.`)
        } catch (err) {
          console.error(`[ERROR]: ${err?.message || err}`)
        }
        return
      }
      case 'exit': rl.close(); return
      case 'unsupported': console.error(`[TUI] ${cmd.reason}`); return
      default: console.error(`[ERROR]: Perintah "${cmd.name || '?'}" tak dikenal. Ketik /help.`)
    }
  }

  // Banner opencode-style: model | effort | workspace | sesi + slash ringkas.
  console.log(`Abelink TUI v${TUI_VERSION}`)
  console.log(`  model    : ${state.model}`)
  console.log(`  effort   : ${state.effort}`)
  console.log(`  workspace: ${state.workspace}`)
  console.log(`  sesi     : ${state.sessionId}`)
  console.log(`\n${TUI_HELP}\n`)
  rl.prompt()
  let busy = false
  async function handleLine(line) {
    // !shell dulu (ala opencode): tanpa model turn, tanpa histori.
    const shellCmd = parseShellLine(line)
    if (shellCmd !== null) {
      await runShellLine(shellCmd)
      if (!rl.closed) rl.prompt()
      return
    }
    const cmd = parseSlashCommand(line)
    if (cmd.kind === 'prompt') {
      if (!cmd.text.trim()) {
        rl.prompt()
        return
      }
      if (busy) {
        console.error('[TUI] Turn masih jalan — Ctrl-C untuk batalkan dulu.')
        if (!rl.closed) rl.prompt()
        return
      }
      busy = true
      try {
        // @file reference: lampirkan isi file ke prompt sebelum kirim.
        const resolved = resolveFileRefs(cmd.text, { workspace: state.workspace })
        if (!resolved.ok) {
          console.error(`[ERROR]: ${resolved.error}`)
          return
        }
        if (resolved.attached.length) {
          console.log(`[TUI] Lampirkan ${resolved.attached.length} file: ${resolved.attached.map((a) => `${a.ref} (${a.bytes}B)`).join(', ')}`)
        }
        await runTurn(resolved.text)
      } finally {
        busy = false
        if (!rl.closed) rl.prompt()
      }
      return
    }
    await handleSlash(cmd)
    if (!rl.closed) rl.prompt()
  }
  // Close handler DULU sebelum replay: /exit di dalam replay menutup rl —
  // tanpa listener ini proses hang (sidecar menahan event loop) sampai timeout.
  rl.on('close', () => {
    console.log(`\n[TUI] Sesi ${state.sessionId} selesai.`)
    try {
      sidecar?.dispose()
    } catch {}
    process.exit(0)
  })
  // Replay stdin yang tiba selama startup (piped-input race), FIFO.
  // Listener 'data' awal dilepas agar readline menerima data berikutnya.
  try {
    process.stdin.removeListener('data', earlyCollector)
    process.stdin.removeListener('end', earlyEnd)
  } catch {}
  const earlyText = earlyChunks.join('')
  const earlyQueue = earlyText.split('\n')
  // Baris terakhir tanpa newline = prompt parsial (mis. EOF langsung);
  // tetap proses bila tak kosong.
  rl.on('line', handleLine)
  for (const early of earlyQueue) {
    if (rl.closed) break
    const text = String(early ?? '')
    if (!text.trim()) continue
    await handleLine(text)
    if (rl.closed) break
  }
  // EOF langsung (printf tanpa interaksi): tutup agar proses keluar,
  // bukan hang menunggu stdin yang sudah habis.
  if (earlyEnded && earlyQueue.every((t) => !String(t ?? '').trim())) {
    rl.close()
    return
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
