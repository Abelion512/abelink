// headlessCli.js — pure helpers for the headless CLI (Stream 3).
// No I/O at import time; filesystem reads are explicit async fns.
// Contracts pinned by tests/cliHeadless.test.mjs.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MAX_SUBAGENT_DEPTH = 2
export const MAX_SUBAGENTS_PER_TASK = 3
export const SUBAGENT_MAX_TURNS = 8
export const SUBAGENT_REPLY_CAP = 2000

// Query format: name||role||goal||initial_message||tools(comma-separated).
export function parseSpawnQuery(query = '') {
  const parts = String(query ?? '').split('||').map((s) => s.trim())
  const goal = parts[2] || parts[0] || 'Sub-task'
  return {
    name: parts[0] || 'Worker-Agent',
    role: parts[1] || 'Technical Specialist',
    goal,
    initialMessage: parts[3] || goal,
    tools: parts[4] ? parts[4].split(',').map((t) => t.trim()).filter(Boolean) : ['*']
  }
}

export function checkSubagentBudget({ depth = 0, spawnCount = 0 } = {}) {
  if (Number(depth) >= MAX_SUBAGENT_DEPTH) {
    return { allowed: false, reason: `Subagent depth cap tercapai (${MAX_SUBAGENT_DEPTH}) — spawn ditolak (fail-closed).` }
  }
  if (Number(spawnCount) >= MAX_SUBAGENTS_PER_TASK) {
    return { allowed: false, reason: `Batas ${MAX_SUBAGENTS_PER_TASK} subagent per task tercapai — spawn ditolak.` }
  }
  return { allowed: true, reason: null }
}

// Anthropic pattern: subagent returns a condensed 1-2k summary, not raw trace.
export function condenseSubagentResult({ parsed = {}, result = {} } = {}) {
  const reply = String(result.reply || '')
  const body = reply.length > SUBAGENT_REPLY_CAP
    ? reply.slice(0, SUBAGENT_REPLY_CAP) + '\n...[dipotong]'
    : reply
  return `[SUBAGENT ${parsed.name || '?'} (${result.outcome || '?'})]: ${body}`
}

// Approval relay — DEFAULT AUTO (keputusan owner 2026-09-22).
//   mode auto (default)  -> proceed + logged (supervisor/verifier/audit tetap jalan)
//   mode manual           -> fail-closed klasik, butuh --approve-all per aksi
//   --deny-all / dont-ask -> deny (untuk CI)
//   hardline              -> tidak pernah relay, semua mode
export function resolveApprovalDecision(secCheck = {}, { approveAll = false, denyAll = false, mode = 'auto' } = {}) {
  if (denyAll === true) return { proceed: false, reason: 'denied by --deny-all (dont-ask mode)' }
  if (secCheck?.category === 'hardline') return { proceed: false, reason: 'hardline denial never relayed' }
  if (mode === 'manual' && approveAll !== true) return { proceed: false, reason: 'manual mode: explicit --approve-all required' }
  if (approveAll === true) return { proceed: true, reason: 'operator --approve-all (logged)' }
  return { proceed: true, reason: 'auto default (logged, supervised)' }
}

// Snapshot config GUI (~/.config/abelink/shared.json, ditulis channel
// sync-config) -> bentuk yang dimengerti CLI/TUI. Provider yang hanya hidup
// di GUI (gemini-web, butuh sesi browser Google) TIDAK dipaksakan: kembalikan
// null agar CLI jatuh ke default jujur, bukan gagal senyap.
// lm-studio dipetakan ke `custom` + customEndpoint karena keduanya endpoint
// OpenAI-compatible yang sama di sisi ai-bridge.
export function sharedConfigToCliConfig(shared = {}) {
  const provider = String(shared?.aiProvider || '').trim().toLowerCase()
  const meta = { _source: 'gui-shared', _updatedAt: shared?.updatedAt || null }
  if (provider === 'custom') {
    return {
      ...meta,
      provider: 'custom',
      model: shared.customModel || null,
      customModel: shared.customModel || null,
      apiKey: shared.customApiKey || null,
      customEndpoint: shared.customEndpoint || null
    }
  }
  if (provider === 'groq') {
    return {
      ...meta,
      provider: 'groq',
      model: shared.groqModel || null,
      groqModel: shared.groqModel || null,
      apiKey: shared.groqApiKey || null
    }
  }
  if (provider === 'lm-studio') {
    return {
      ...meta,
      provider: 'custom',
      model: shared.customModel || null,
      customModel: shared.customModel || null,
      customEndpoint: shared.customEndpoint || null
    }
  }
  return { ...meta, provider: null, model: null, apiKey: null }
}

// Config file chain (SATU sumber setting GUI + CLI):
//   1. GUI shared.json (~/.config/abelink/shared.json) = lapis DASAR (adopsi GUI)
//   2. home cli.json (~/.config/abelink/cli.json)      = override eksplisit CLI
//   3. repo-local .abelink/cli.json                    = override paling spesifik
// Missing files -> {}. Never throws.
export function loadCliFileConfig({ cwd = process.cwd(), homeDir = os.homedir() } = {}) {
  const out = {}
  // Lapis 1: snapshot GUI -> bentuk CLI.
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(homeDir, '.config', 'abelink', 'shared.json'), 'utf8'))
    const norm = sharedConfigToCliConfig(parsed)
    for (const [key, value] of Object.entries(norm)) {
      if (key === '_source' || key === '_updatedAt') continue
      if (value !== null && value !== undefined && value !== '') out[key] = value
    }
  } catch { /* belum ada snapshot GUI -> skip */ }
  // Lapis 2 & 3: override eksplisit CLI.
  for (const file of [
    path.join(homeDir, '.config', 'abelink', 'cli.json'),
    path.join(cwd, '.abelink', 'cli.json')
  ]) {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') Object.assign(out, parsed)
    } catch { /* missing/corrupt -> skip */ }
  }
  return out
}

// Model alias 9Router — HANYA ID terverifikasi POST 200 (2026-09-26).
// Aturan: tiap entri lolos live probe (tanpa itu = jangan daftar).
// oc/ = namespace combo-member (combo `abelink`): TIDAK muncul di GET
// /v1/models, tapi diterima POST. Jangan validasi via katalog untuk oc/*.
// jev = decisions model (BUKAN chat): tak ada alias chat untuknya.
// ID terlarang: claude-work (training-data) TIDAK BOLEH dipakai
// (model/alias/default/fallback). Gagal = pesan jujur, bukan fallback.
export const MODEL_ALIASES = Object.freeze({
  // Harian: zen-free (POST 200, combo 9Router, gratis).
  'zen': 'oc/muse-spark-1.3-contributor-free',
  'zen-free': 'oc/muse-spark-1.3-contributor-free',
  'spark': 'oc/muse-spark-1.3-contributor-free',
  // Combo pendek 9Router (router gratis; probe flaky-timeout = server lambat,
  // bukan verdict mati — tetap terdaftar sebagai combo, bukan model bayar).
  'qwen': 'qwen',
  'mimo': 'mimo',
  'nara': 'nara',
  'xkiro': 'xkiro',
  'tokenrouter': 'tokenrouter',
  // Free terverifikasi POST 200 (2026-09-26).
  'free': 'bor/mimo-v2.5:free',
  'free-mimo': 'bor/mimo-v2.5:free',
})

// Keputusan owner 2026-09-26: ID di sini TIDAK BOLEH dipakai sebagai model,
// alias, default, maupun fallback (provider melatih pada datanya). Ini SATU
// sumber kebenaran: dipakai resolveCliAuth + seluruh entry CLI/TUI.
export const FORBIDDEN_MODELS = Object.freeze(['claude-work'])

export function isForbiddenModel(model = '') {
  const low = String(model ?? '').trim().toLowerCase()
  return FORBIDDEN_MODELS.some((f) => low === String(f).toLowerCase())
}

export function forbiddenModelError(model = '') {
  return `Model "${String(model ?? '')}" dilarang (training-data). Pakai /model atau -m ke ID gratis yang layak (mis. zen).`
}

export const DEFAULT_CLI_MODEL = 'oc/muse-spark-1.3-contributor-free'

// Auth fallback: flags > env > config file > 9Router DB > default. Never throws.
//
// Headless default = 'custom' (9Router OpenAI-compatible di localhost:20128),
// BUKAN 'gemini-web': gemini-web butuh sesi browser Google yang hanya ada di
// GUI. Model default = zen-free 9Router (live, reasoning, gratis).
export function resolveCliAuth({ flags = {}, env = process.env, fileConfig = {} } = {}) {
  const provider = flags.provider || env.ABELINK_PROVIDER || fileConfig.provider || 'custom'
  const rawModel = flags.model || env.ABELINK_MODEL || fileConfig.model || DEFAULT_CLI_MODEL
  const model = MODEL_ALIASES[rawModel] || rawModel
  const modelVersion = flags.modelVersion || env.ABELINK_MODEL_VERSION || fileConfig.modelVersion || 'v1'
  const apiKey =
    flags.apiKey || env.ABELINK_API_KEY || env.CUSTOM_API_KEY || env.OPENAI_API_KEY ||
    fileConfig.apiKey || fileConfig.customApiKey || null
  // Endpoint: ikut lapis yang sama (flag > env > file/GUI). Diadopsi dari GUI
  // supaya TUI menembak endpoint yang sama (mis. 9Router di 20128), bukan
  // hardcode terpisah.
  const customEndpoint =
    flags.endpoint || env.ABELINK_ENDPOINT || env.CUSTOM_ENDPOINT || env.OPENAI_BASE_URL ||
    fileConfig.customEndpoint || null
  // `forbidden` = sinyal untuk caller; resolveCliAuth tetap never-throws dan
  // tidak diam-diam menukar model (tanpa fallback, keputusan owner).
  return { provider, model, modelVersion, apiKey, customEndpoint, forbidden: isForbiddenModel(model) }
}

// 9Router local key autodetect (best-effort, never throws).
// 9Router menyimpan API key per-client di ~/.9router/db/data.sqlite
// (tabel apiKeys). CLI memakai key pertama yang ada sebagai fallback
// terakhir — user tetap bisa override via --api-key / env / cli.json.
// bun:sqlite hanya ada di runtime bun; di node (vitest) jatuh ke CLI
// sqlite3; keduanya gagal -> null (caller beri pesan jujur).
export async function loadNineRouterKey({ dbPath = null } = {}) {
  const home = os.homedir?.() || process.env.HOME || ''
  // ABELINK_HOME sengaja TIDAK menggeser path ini (data milik 9Router, bukan
  // app); untuk test/E2E hermetic sediakan override eksplisit.
  const file = dbPath || process.env.ABELINK_9ROUTER_DB || path.join(home, '.9router', 'db', 'data.sqlite')
  try {
    const { Database } = await import('bun:sqlite')
    const db = new Database(file, { readonly: true })
    const row = db.query('SELECT key FROM apiKeys LIMIT 1').get()
    db.close()
    const key = row?.key || row?.['key']
    return typeof key === 'string' && key ? key : null
  } catch {}
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync('sqlite3', [file, 'SELECT key FROM apiKeys LIMIT 1;'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    const key = String(out || '').trim().split('\n')[0]?.trim()
    return key || null
  } catch {}
  return null
}

// Setup wizard non-interaktif: tulis ~/.config/abelink/cli.json dari
// flag/env (abelink setup --provider custom --model gemini --api-key ...).
// Tanpa argumen = cek status (tampilkan sumber aktif tiap field).
// Never throws; return { ok, message }.
export async function writeCliSetup({ argv = [], homeDir = os.homedir?.() || process.env.HOME || '' } = {}) {
  const file = path.join(homeDir, '.config', 'abelink', 'cli.json')
  let current = {}
  try {
    current = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!current || typeof current !== 'object') current = {}
  } catch {}
  const next = { ...current }
  const take = (flag) => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] && !String(argv[i + 1]).startsWith('-') ? argv[i + 1] : null
  }
  const provider = take('--provider')
  const model = take('--model') || take('-m')
  const apiKey = take('--api-key')
  if (provider) next.provider = provider
  if (model) next.model = MODEL_ALIASES[model] ? model : model
  if (apiKey) next.apiKey = apiKey
  if (provider || model || apiKey) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    return { ok: true, message: `Setup tersimpan: ${file}\n${JSON.stringify({ ...next, apiKey: next.apiKey ? '***' : undefined }, null, 2)}` }
  }
  const src = []
  if (process.env.ABELINK_PROVIDER || process.env.ABELINK_MODEL || process.env.ABELINK_API_KEY) src.push('env')
  if (current.provider || current.model || current.apiKey) src.push(`file:${file}`)
  src.push('9Router DB (autodetect)')
  src.push('default: custom / oc/muse-spark-1.3-contributor-free')
  return { ok: true, message: `Belum ada yang diubah. Sumber aktif: ${src.join(' > ')}\nTulis: abelink setup --provider custom --model gemini --api-key <key>` }
}

// Memory: file-backed working memory (`.abelink/working-memory.json`) —
// best-effort, never throws, [] on failure. (Dexie/IndexedDB shim is fragile
// headless; the workspace file is the stable contract — same file the GUI
// auto-save writes via saveWorkspaceWorkingMemory.)
/**
 * Memori kerja (working memory) workspace untuk seed prompt headless.
 * @param {{ workspaceRoot?: string | null }} [opts]
 * @returns {Promise<Array<unknown>>}
 */
export async function loadHeadlessMemories({ workspaceRoot = null } = {}) {
  try {
    if (!workspaceRoot) return []
    const file = path.join(workspaceRoot, '.abelink', 'working-memory.json')
    const raw = await fs.promises.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    const out = []
    if (parsed?.notes) out.push({ type: 'working-memory', memory: String(parsed.notes) })
    if (parsed?.activeObjective) out.push({ type: 'working-memory', memory: `Active objective: ${parsed.activeObjective}` })
    return out
  } catch {
    return []
  }
}

// Fase 1 — CLI session store (refs: opencode run -c/-s; Hermes session-storage).
// File store berdiri sendiri sebagai pengganti SQLite: tanpa FTS, tanpa
// lineage/kompresi, tanpa sync-GUI (ceiling tercatat, bukan roadmap tersembunyi).
// Pure + dir-injected (mirip loadCliFileConfig) + never-throw:
// hilang -> null, list -> [].
export const CLI_SESSION_VERSION = 1
export const CLI_SESSION_MAX_MESSAGES = 50

export function defaultCliSessionDir({ homeDir = os.homedir?.() || process.env.HOME || '' } = {}) {
  return path.join(homeDir, '.config', 'abelink', 'cli-sessions')
}

export function newCliSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Id aman untuk nama file: tolak path traversal / separator.
export function sanitizeCliSessionId(id) {
  const s = String(id ?? '')
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s) ? s : null
}

function isCliSessionShape(s) {
  return Boolean(s && typeof s === 'object' && typeof s.id === 'string' && Array.isArray(s.messages))
}

export function saveCliSession(session, { dir = null } = {}) {
  try {
    const id = sanitizeCliSessionId(session?.id)
    if (!id) return { ok: false, file: null }
    const base = dir || defaultCliSessionDir({})
    const now = new Date().toISOString()
    const messages = Array.isArray(session.messages)
      ? session.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-CLI_SESSION_MAX_MESSAGES)
      : []
    const doc = {
      v: CLI_SESSION_VERSION,
      id,
      workspace: session.workspace || null,
      provider: session.provider || null,
      model: session.model || null,
      modelVersion: session.modelVersion || null,
      effort: session.effort || null,
      createdAt: session.createdAt || now,
      updatedAt: session.updatedAt || now,
      prompt: typeof session.prompt === 'string' ? session.prompt : '',
      outcome: session.outcome || null,
      terminalReason: session.terminalReason || null,
      messages
    }
    fs.mkdirSync(base, { recursive: true, mode: 0o700 })
    const file = path.join(base, `${id}.json`)
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 })
    return { ok: true, file }
  } catch {
    return { ok: false, file: null }
  }
}

export function loadCliSession(id, { dir = null } = {}) {
  try {
    const safe = sanitizeCliSessionId(id)
    if (!safe) return null
    const raw = fs.readFileSync(path.join(dir || defaultCliSessionDir({}), `${safe}.json`), 'utf8')
    const parsed = JSON.parse(raw)
    return isCliSessionShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function listCliSessions({ dir = null } = {}) {
  try {
    const base = dir || defaultCliSessionDir({})
    const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'))
    const out = []
    for (const f of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'))
        if (isCliSessionShape(parsed)) out.push(parsed)
      } catch { /* corrupt -> skip */ }
    }
    out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    return out
  } catch {
    return []
  }
}

// Sequential subagent run (depth-capped, budget-capped, fail-closed).
// runLoop/createEnvironment injected (testable, engine stays pure).
export async function runHeadlessSubagent({ query = '', depth = 0, state = null, runLoop, createEnvironment, baseOptions = {} } = {}) {
  const st = state || { spawnCount: 0 }
  const budget = checkSubagentBudget({ depth, spawnCount: st.spawnCount })
  if (!budget.allowed) return { ok: false, result: budget.reason }
  if (typeof runLoop !== 'function') return { ok: false, result: 'runLoop tidak tersedia.' }
  const parsed = parseSpawnQuery(query)
  const subTurns = Math.min(Number(baseOptions.maxTurns) || SUBAGENT_MAX_TURNS, SUBAGENT_MAX_TURNS)
  const result = await runLoop({
    prompt: `${parsed.initialMessage}\n\n[SUBAGENT CONTEXT] name=${parsed.name} role=${parsed.role} goal=${parsed.goal}`,
    options: { ...baseOptions, maxTurns: subTurns },
    environment: typeof createEnvironment === 'function' ? createEnvironment(depth + 1) : {}
  })
  st.spawnCount += 1
  return { ok: result?.success === true, result: condenseSubagentResult({ parsed, result: result || {} }) }
}

// Fase 4 recursion guard (kontrak §5 plan 2026-09-22_cli-engine-4fase):
// di bawah ABELINK_CRON=1 (child hasil fire cron), tolak tool `cron_*`
// dengan error eksplisit — cron job tak boleh menjadwalkan cron baru.
// Wiring: panggil di awal executeTool bin/abelink.mjs (milik Fase 1).
export function checkCronRecursionGuard(toolName = '', env = process.env) {
  if (env?.ABELINK_CRON === '1' && String(toolName).startsWith('cron_')) {
    return { denied: true, reason: `[CRON GUARD] Tool "${toolName}" ditolak di dalam cron run (ABELINK_CRON=1): cron job dilarang memanggil cron_* (anti-rekursi).` }
  }
  return { denied: false, reason: null }
}
