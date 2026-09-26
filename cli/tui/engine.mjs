// cli/tui/engine.mjs — TUI-v2 engine: state + submit routing + runTurn.
// Reuse (import, bukan copy): parseSlashCommand/parseShellLine/resolveFileRefs/
// buildAgentsMd + session store dari cli/core (M2b — dulu dari bin/abelink-tui.mjs);
// auth + MODEL_ALIASES dari src/api/ai/headlessCli.js; runAgentLoop dari
// src/api/ai/agentRunner.js.
// UI (App.tsx) presentational: engine memiliku messages, App render via props.
// Environment (fetchAI/executeTool) injectable agar test stub tanpa network.

import {
  parseSlashCommand,
  parseEffortLevel,
  renderThoughtLine,
  renderStepLine,
  createTuiTurn,
  checkTurnAborted,
  parseShellLine,
  resolveFileRefs,
  buildAgentsMd,
  loadTuiSession,
  saveTuiSession,
  listTuiSessions,
  sessionToInitialHistory,
  SESSION_MESSAGE_CAP,
} from '../core/index.mjs'

export { parseSlashCommand, parseShellLine, resolveFileRefs, buildAgentsMd }
export { SESSION_MESSAGE_CAP }

export function createTuiState(overrides = {}) {
  return {
    provider: 'custom',
    model: 'oc/muse-spark-1.3-contributor-free',
    effort: 'low',
    workspace: process.cwd(),
    sessionId: `session-${Date.now()}`,
    history: [],
    messages: [],
    showThinking: true,
    showDetails: false,
    busy: false,
    ...overrides,
  }
}

// Baca katalog dari cache disk saja (tanpa network). Dipakai jalur /model dan
// /models tanpa filter supaya tidak memicu GET /v1/models yang lambat
// (5-26 dtk) hanya untuk menampilkan daftar.
export async function readCachedCatalog(deps = {}) {
  const { readCatalogCache } = await import('./modelCatalog.mjs')
  const osMod = await import('node:os')
  const fsMod = deps.fsMod || await import('node:fs')
  const home = deps.homeDir || osMod.homedir?.() || process.env.HOME || ''
  const cached = readCatalogCache({ fsMod, homeDir: home })
  return { models: cached.ok ? cached.models : [], stale: cached.stale === true, error: null }
}

// `state.onPush` = hook repaint (dipasang entry TUI). Tanpa ini pesan baru
// (termasuk prompt user sendiri) baru terlihat saat event berikutnya tiba —
// TUI tampak beku selama turn panjang (terukur PTY 2026-09-26).
export function pushMessage(state, role, text) {
  state.messages.push({ role, text: String(text ?? '') })
  try { state.onPush?.() } catch { /* repaint opsional, jangan gagalkan pesan */ }
  return state.messages.length
}

// S1: katalog model (stale-while-revalidate, pola opencode models-dev).
// Cache fresh -> pakai langsung. Stale/kosong -> coba live (timeout pendek);
// live gagal -> cache stale + error jujur; tanpa cache -> alias statis saja.
export async function loadModelCatalog(state, deps = {}, forceRefresh = false) {
  const { readCatalogCache, writeCatalogCache, fetchLiveCatalog } = await import('./modelCatalog.mjs')
  const os = await import('node:os')
  const fsMod = deps.fsMod || await import('node:fs')
  const pathMod = deps.pathMod || await import('node:path')
  const homeDir = deps.homeDir || null
  const home = homeDir || os.homedir?.() || process.env.HOME || ''
  const cached = readCatalogCache({ fsMod, homeDir: home })
  if (cached.ok && cached.stale === false && !forceRefresh) {
    return { models: cached.models, stale: false, error: null }
  }
  const fetchFn = deps.fetchFn || null
  const live = await fetchLiveCatalog({
    fetchFn,
    endpoint: deps.modelsEndpoint || process.env.ABELINK_MODELS_ENDPOINT || 'http://127.0.0.1:20128/v1',
  })
  if (live.ok && live.models.length) {
    writeCatalogCache(live.models, { fsMod, pathMod, homeDir: home })
    return { models: live.models, stale: false, error: null }
  }
  if (cached.ok && cached.models.length) {
    return { models: cached.models, stale: true, error: live.error ? `Discovery gagal (${live.error}); pakai cache.` : null }
  }
  return { models: [], stale: true, error: live.error ? `Discovery gagal (${live.error}); pakai alias statis.` : 'Katalog kosong; pakai alias statis.' }
}

// Baris picker model (presentasi; recent tetap milik engine).
// DEFAULT = HANYA model yang user pernah pakai (Aktif -> Recent -> Favorit ->
// Alias). Katalog 1300+ model TIDAK dimuat otomatis: cukup yang pernah
// dimasukkan user, sisanya opt-in (`/models --all` via deps.loadCatalog).
// Katalog dari CACHE disk boleh disertakan tanpa network (murah); fetch live
// hanya saat deps.loadCatalog true. Recent tak difilter katalog: ID combo
// 9Router (mis. oc/muse-spark-1.3-contributor-free) TIDAK muncul di GET
// /v1/models tapi sah dipakai — menyembunyikannya justru bikin bingung.
export async function modelPickerRows(state, deps = {}, query = '') {
  const { curatePicker, readCatalogCache } = await import('./modelCatalog.mjs')
  const q = String(query || '').trim().toLowerCase()
  const match = (id) => !q || String(id || '').toLowerCase().includes(q)
  const rows = []
  if (state.model && !q) rows.push({ id: state.model, section: 'Aktif', label: state.model })
  for (const id of (state.recentModels || deps.cliConfig?.recentModels || [])) {
    if (match(id) && id !== state.model) rows.push({ id, section: 'Recent', label: id })
  }
  for (const id of (deps.cliConfig?.favModels || [])) {
    if (match(id) && id !== state.model) rows.push({ id, section: 'Favorit', label: id })
  }
  for (const [k, v] of Object.entries(deps.aliases || {})) {
    if (!q || k.toLowerCase().includes(q)) rows.push({ id: k, section: 'Alias', label: `${k} -> ${v}` })
  }
  // Katalog: opt-in (/models --all) => live; selain itu cache disk saja
  // (tanpa network). Tanpa keduanya: tak ada section Katalog + hint.
  let catalogModels = []
  let catalogStale = false
  let catalogTotal = 0
  let catalogError = null
  let catalogLoaded = false
  if (deps.loadCatalog === true) {
    const catalog = await loadModelCatalog(state, deps)
    catalogModels = catalog.models
    catalogStale = catalog.stale === true
    catalogError = catalog.error || null
    catalogLoaded = true
  } else {
    // Baca cache disk saja (tanpa network) — murah, dan membuat filter picker
    // berguna bila katalog pernah dimuat tanpa memaksa fetch tiap buka.
    const osMod = await import('node:os')
    const fsMod = deps.fsMod || await import('node:fs')
    const home = deps.homeDir || osMod.homedir?.() || process.env.HOME || ''
    const cached = readCatalogCache({ fsMod, homeDir: home })
    if (cached.ok && cached.models.length) {
      catalogModels = cached.models
      catalogStale = cached.stale === true
      catalogLoaded = true
    }
  }
  const picked = curatePicker({ models: catalogModels, query: q, perSection: 40 })
  for (const id of picked.models) rows.push({ id, section: 'Katalog', label: id })
  const hint = !catalogLoaded && !q
    ? 'Katalog penuh: /models --all'
    : null
  return {
    rows,
    total: picked.total,
    stale: catalogStale,
    error: catalogError,
    hint,
  }
}

// Recent models -> cli.json (merge, 0600). Best-effort, never throws.
export async function saveRecentModels(recent = [], { homeDir = null } = {}) {
  try {
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs')
    const home = homeDir || os.homedir?.() || process.env.HOME || ''
    const file = path.join(home, '.config', 'abelink', 'cli.json')
    let current = {}
    try {
      current = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!current || typeof current !== 'object') current = {}
    } catch {}
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, JSON.stringify({ ...current, recentModels: recent }, null, 2) + '\n', { mode: 0o600 })
    try { fs.chmodSync(file, 0o600) } catch {}
    return { ok: true, path: file }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// Routing satu baris submit (dipakai TTY submit + pipe E2E):
// -> { kind:'exit' } | { kind:'message', role, text } (sudah push ke state)
// Tidak melempar; error jadi pesan role 'error'.
export async function submitLine(state, line, deps = {}) {
  const text = String(line ?? '')
  const shellCmd = parseShellLine(text)
  if (shellCmd !== null) {
    const out = await runShell(deps, state, shellCmd)
    pushMessage(state, 'shell', out)
    return { kind: 'message', role: 'shell' }
  }
  const cmd = parseSlashCommand(text)
  if (cmd.kind === 'prompt') {
    if (!text.trim()) return { kind: 'noop' }
    return runPrompt(state, text, deps)
  }
  return runSlash(state, cmd, deps)
}

// Guard ID terlarang (FORBIDDEN_MODELS) di choke point prompt: model bisa
// datang dari cli.json lama, env ABELINK_MODEL, atau flag — bukan cuma /model.
async function assertModelAllowed(state) {
  if (!state?.model) return null
  const headless = await import('../../src/api/ai/headlessCli.js').catch(() => ({}))
  const banned = typeof headless.isForbiddenModel === 'function'
    ? headless.isForbiddenModel(state.model)
    : /^claude-work$/i.test(String(state.model))
  if (!banned) return null
  return typeof headless.forbiddenModelError === 'function'
    ? headless.forbiddenModelError(state.model)
    : `Model "${state.model}" dilarang (training-data).`
}

async function runPrompt(state, text, deps) {
  const banned = await assertModelAllowed(state)
  if (banned) {
    pushMessage(state, 'error', banned)
    return { kind: 'message', role: 'error' }
  }
  const resolveRefs = deps.resolveFileRefs || resolveFileRefs
  const resolved = resolveRefs(text, { workspace: state.workspace })
  if (!resolved.ok) {
    pushMessage(state, 'error', resolved.error)
    return { kind: 'message', role: 'error' }
  }
  if (resolved.attached?.length) {
    pushMessage(state, 'info', `Lampirkan ${resolved.attached.length} file.`)
  }
  pushMessage(state, 'user', text)
  const runTurn = deps.runTurn || defaultRunTurn
  const result = await runTurn(state, resolved.text, deps)
  if (result?.reply) pushMessage(state, 'assistant', result.reply)
  pushMessage(
    state, 'meta',
    `${result?.outcome || '?'} (${result?.terminalReason || '?'}) | steps ${result?.stepCount ?? 0} | tools ${result?.toolCallsCount ?? 0}`,
  )
  return { kind: 'message', role: 'assistant' }
}

async function runSlash(state, cmd, deps) {
  switch (cmd.kind) {
    case 'exit': return { kind: 'exit' }
    case 'help':
      pushMessage(state, 'info', deps.helpText || 'Ketik /help di TUI untuk daftar perintah.')
      return { kind: 'message', role: 'info' }
    case 'unsupported':
      pushMessage(state, 'error', cmd.reason)
      return { kind: 'message', role: 'error' }
    case 'model': {
      if (!cmd.arg) {
        const { modelSourceLabel } = await import('./modelEffort.mjs')
        pushMessage(state, 'info', `Model aktif: ${modelSourceLabel(state.model, state.provider)}`)
        return { kind: 'message', role: 'info' }
      }
      const { resolveCatalogModel, pushRecent } = await import('./modelCatalog.mjs')
      const { cacheSwitchWarning, persistCliField } = await import('./modelEffort.mjs')
      const headless = await import('../../src/api/ai/headlessCli.js').catch(() => ({}))
      // Live hanya bila katalog sudah di-opt-in; selain itu cache disk saja
      // (alias/passthrough tetap jalan tanpa jaringan).
      const catalog = deps.loadCatalog === true
        ? await loadModelCatalog(state, deps)
        : await readCachedCatalog(deps)
      const r = resolveCatalogModel(cmd.arg, {
        models: catalog.models,
        aliases: deps.aliases || {},
        // Satu sumber kebenaran, bukan daftar lokal di modelCatalog.
        forbidden: headless.FORBIDDEN_MODELS || ['claude-work'],
      })
      if (!r.ok) {
        pushMessage(state, 'error', r.error)
        return { kind: 'message', role: 'error' }
      }
      state.model = r.id
      state.modelCapabilities = catalog.models.find((m) => m.id === r.id) || null
      const recent = pushRecent(deps.cliConfig?.recentModels || state.recentModels || [], r.id)
      state.recentModels = recent
      const warn = cacheSwitchWarning(state.history)
      const saved = await persistCliField('model', r.via === 'alias' ? cmd.arg : r.id, { homeDir: deps.homeDir || null })
      await saveRecentModels(recent, { homeDir: deps.homeDir || null })
      const bits = [`Model: ${r.label}${catalog.stale ? ' (katalog stale)' : ''}`]
      if (warn) bits.push(warn)
      bits.push(saved.ok ? `Tersimpan permanen (${saved.path}).` : `Persist gagal: ${saved.error} (sesi ini tetap pakai ${r.id}).`)
      pushMessage(state, 'info', bits.join('\n'))
      return { kind: 'message', role: 'info' }
    }
    case 'models': {
      const { curatePicker } = await import('./modelCatalog.mjs')
      // Default: hanya model yang pernah dipakai + alias. Katalog penuh = opt-in
      // (`/models --all`) atau saat user mencari dengan filter eksplisit.
      const flagAll = cmd.arg === '--refresh' || cmd.arg === '--all'
      const q = flagAll ? '' : String(cmd.arg || '')
      const wantCatalog = flagAll || Boolean(q)
      const catalog = wantCatalog
        ? await loadModelCatalog(state, deps, cmd.arg === '--refresh')
        : await readCachedCatalog(deps)
      const picked = curatePicker({
        models: catalog.models,
        favorites: deps.cliConfig?.favModels || [],
        recent: state.recentModels || deps.cliConfig?.recentModels || [],
        aliases: deps.aliases || {},
        query: q,
      })
      const out = []
      if (picked.favorites.length) out.push('Favorites:\n' + picked.favorites.map((id) => `  ${id}`).join('\n'))
      if (picked.recent.length) out.push('Recent:\n' + picked.recent.map((id) => `  ${id}`).join('\n'))
      const aliasRows = Object.entries(deps.aliases || {}).filter(([k]) => !q || k.toLowerCase().includes(q.toLowerCase()))
      if (aliasRows.length) out.push('Alias:\n' + aliasRows.map(([k, v]) => `  ${k} -> ${v}`).join('\n'))
      if (picked.models.length) out.push(`Katalog (${picked.total} model${catalog.stale ? ', stale' : ''}):\n` + picked.models.map((id) => `  ${id}`).join('\n'))
      if (!wantCatalog && !catalog.models.length) {
        out.push('Katalog: belum dimuat. Default kini HANYA model yang pernah kamu pakai. Gunakan /models --all (atau /models <filter>) untuk memuat katalog penuh.')
      }
      out.push(`Model aktif: ${state.model}`)
      if (catalog.error) out.push(`Catatan: ${catalog.error}`)
      pushMessage(state, 'info', out.join('\n'))
      return { kind: 'message', role: 'info' }
    }
    case 'effort': {
      if (!cmd.arg) {
        pushMessage(state, 'info', `Effort aktif: ${state.effort}`)
        return { kind: 'message', role: 'info' }
      }
      const r = parseEffortLevel(cmd.arg)
      if (!r.ok) {
        pushMessage(state, 'error', r.error)
        return { kind: 'message', role: 'error' }
      }
      const { effortForWire, resolveAutoEffort, maxTokensFor, cacheSwitchWarning, persistCliField } = await import('./modelEffort.mjs')
      const map = effortForWire(r.effort)
      const resolved = map.needsResolve ? resolveAutoEffort(state.history.map((m) => m.content).join(' ')) : r.effort
      state.effort = r.effort
      state.effortResolved = resolved
      state.ultraLocal = map.ultraLocal === true
      const warn = cacheSwitchWarning(state.history)
      const saved = await persistCliField('effort', r.effort, { homeDir: deps.homeDir || null })
      const bits = [`Effort: ${r.effort}${map.needsResolve ? ` (auto -> ${resolved} sesi ini)` : ''} | wire: ${map.wire || resolved} | max_tokens: ${maxTokensFor(r.effort)}`]
      if (map.ultraLocal) bits.push('ultra = flag orkestrasi lokal (provider terima xhigh + budget max).')
      if (warn) bits.push(warn)
      bits.push(saved.ok ? `Tersimpan permanen (${saved.path}).` : `Persist gagal: ${saved.error} (sesi ini tetap pakai ${r.effort}).`)
      pushMessage(state, 'info', bits.join('\n'))
      return { kind: 'message', role: 'info' }
    }
    case 'commands': {
      // Mode pipe/teks (tanpa overlay): tampilkan daftar perintah sebagai teks.
      const { TUI_COMMANDS } = await import('./theme.mjs')
      pushMessage(state, 'info', TUI_COMMANDS.map((c) => `${c.name}  —  ${c.desc}`).join('\n'))
      return { kind: 'message', role: 'info' }
    }
    case 'sessions': {
      const r = await listTuiSessions(deps.store || null)
      if (r.blockedOn || !r.ok) {
        pushMessage(state, 'error', r.reason || r.error)
        return { kind: 'message', role: 'error' }
      }
      pushMessage(state, 'info', r.sessions.length
        ? r.sessions.map((s) => `- ${s.id} | ${s.outcome || '?'} | ${s.updatedAt || ''}`).join('\n')
        : 'Belum ada sesi tersimpan.')
      return { kind: 'message', role: 'info' }
    }
    case 'continue': {
      if (!cmd.arg) {
        pushMessage(state, 'error', 'Pakai: /continue <id> (lihat /sessions).')
        return { kind: 'message', role: 'error' }
      }
      const r = await loadTuiSession(cmd.arg, deps.store || null)
      if (r.blockedOn || !r.ok) {
        pushMessage(state, 'error', r.reason || r.error)
        return { kind: 'message', role: 'error' }
      }
      state.sessionId = r.session.id || cmd.arg
      state.history = sessionToInitialHistory(r.session)
      if (r.session.model) state.model = r.session.model
      if (r.session.effort) state.effort = r.session.effort
      pushMessage(state, 'info', `Lanjut sesi ${state.sessionId} (${state.history.length} pesan histori).`)
      return { kind: 'message', role: 'info' }
    }
    case 'new':
      state.sessionId = `session-${Date.now()}`
      state.history = []
      pushMessage(state, 'info', `Sesi baru: ${state.sessionId}`)
      return { kind: 'message', role: 'info' }
    case 'compact': {
      if (!state.history.length) {
        pushMessage(state, 'info', 'Histori kosong — tak ada yang diringkas.')
        return { kind: 'message', role: 'info' }
      }
      const drop = Math.max(0, state.history.length - 10)
      state.history = state.history.slice(-10)
      pushMessage(state, 'info', `Histori dipadatkan: buang ${drop} pesan lama.`)
      return { kind: 'message', role: 'info' }
    }
    case 'thinking':
      state.showThinking = !state.showThinking
      pushMessage(state, 'info', `Blok thinking: ${state.showThinking ? 'TAMPIL' : 'SEMBUNYI'}.`)
      return { kind: 'message', role: 'info' }
    case 'details':
      state.showDetails = !state.showDetails
      pushMessage(state, 'info', `Detail tool: ${state.showDetails ? 'TAMPIL' : 'SEMBUNYI'}.`)
      return { kind: 'message', role: 'info' }
    case 'editor': {
      const runEditor = deps.runEditor || defaultRunEditor
      const text = await runEditor()
      if (!text) {
        pushMessage(state, 'info', 'Editor kosong — batal.')
        return { kind: 'message', role: 'info' }
      }
      return runPrompt(state, text, deps)
    }
    case 'init': {
      const draft = buildAgentsMd({ workspace: state.workspace, entries: deps.listDir ? deps.listDir(state.workspace) : [] })
      const target = (cmd.arg && !cmd.arg.startsWith('-') ? cmd.arg : 'AGENTS.md')
      const res = await (deps.writeFile
        ? deps.writeFile(state.workspace, target, draft)
        : defaultWriteFile(state.workspace, target, draft))
      pushMessage(state, res.ok ? 'info' : 'error', res.ok ? `Draf AGENTS.md ditulis ke ${res.path}.` : res.error)
      return { kind: 'message', role: res.ok ? 'info' : 'error' }
    }
    case 'usage': {
      const { summarizeDir, renderUsage } = await import('./usageStats.mjs')
      const os = await import('node:os')
      const path = await import('node:path')
      const fsMod = deps.fsMod || await import('node:fs')
      const base = deps.harnessRoot
        || process.env.ABELINK_DATA_HOME
        || process.env.XDG_DATA_HOME
        || path.join(os.homedir?.() || process.env.HOME || '', '.local', 'share')
      const root = path.join(base, 'abelink', 'harness')
      const arg = String(cmd.arg || '').toLowerCase()
      const days = ['weekly', 'w', '7d', 'week'].includes(arg) ? 7 : 1
      const perSession = {}
      const today = new Date()
      for (let i = 0; i < days; i++) {
        const d = new Date(today.getTime() - i * 86400000)
        const label = d.toISOString().slice(0, 10)
        const sums = summarizeDir({ fsMod, dir: path.join(root, label) })
        for (const [sid, s] of Object.entries(sums)) {
          const key = days > 1 ? `${label}#${sid}` : sid
          perSession[key] = s
        }
      }
      pushMessage(state, 'info', renderUsage({ perSession, label: days > 1 ? `Penggunaan 7 hari (${root}):` : `Penggunaan hari ini (${root}):` }))
      return { kind: 'message', role: 'info' }
    }
    default:
      if (cmd.name === 'usage' || cmd.name === 'stats' || cmd.name === 'cost') {
        return runSlash(state, { kind: 'usage', arg: cmd.arg }, deps)
      }
      pushMessage(state, 'error', `Perintah "${cmd.name || '?'}" tak dikenal. Ketik /help.`)
      return { kind: 'message', role: 'error' }
  }
}

async function runShell(deps, state, command) {
  if (deps.runShell) return deps.runShell(state, command)
  const { execFile } = await import('node:child_process')
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', command], { cwd: state.workspace, timeout: 30000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
      let out = String(stdout || '') + String(stderr || '')
      if (err?.code) out += `[! exited ${err.code}]`
      resolve(out.trim() || '(tanpa output)')
    })
  })
}

async function defaultRunEditor() {
  const [{ spawnSync }] = [await import('node:child_process')]
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const editor = process.env.EDITOR || 'nano'
  const tmpFile = path.join(os.tmpdir(), `abelink-tui-${Date.now()}.md`)
  try {
    fs.writeFileSync(tmpFile, '', 'utf8')
    const r = spawnSync(editor, [tmpFile], { stdio: 'inherit' })
    if ((r.status ?? 0) !== 0) return null
    return fs.readFileSync(tmpFile, 'utf8').trim() || null
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

async function defaultWriteFile(workspace, target, draft) {
  const path = await import('node:path')
  const fs = await import('node:fs')
  const abs = path.resolve(workspace, target)
  const root = path.resolve(workspace)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { ok: false, error: `Target ${target} di luar workspace — tolak.` }
  }
  try {
    fs.writeFileSync(abs, draft + '\n', 'utf8')
    return { ok: true, path: abs }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// defaultRunTurn: runAgentLoop + environment sidecar (pola v1 buildEnvironment).
// Lazy import agar test stub (deps.runTurn) tak pernah sentuh sidecar.
export async function defaultRunTurn(state, prompt, deps = {}) {
  const turn = createTuiTurn()
  state.currentTurn = turn
  try {
    const { runAgentLoop } = await import('../../src/api/ai/agentRunner.js')
    const { evaluateHeadlessSecurity } = await import('../../src/api/ai/headlessSecurity.js')
    const headless = await import('../../src/api/ai/headlessCli.js').catch(() => ({}))
    const { NATIVE_TOOLS } = await import('../../sidecar/main/node-tools.js')
    const sidecar = deps.sidecar || null
    const auth = deps.auth || {}
    const environment = {
      fetchAI: deps.fetchAI || (async (...callArgs) => {
        let messages, config, isSmallTask, jsonSchema
        if (callArgs.length === 1 && callArgs[0]?.messages) {
          ;({ messages, config, isSmallTask, jsonSchema } = callArgs[0])
        } else {
          ;[messages, config, isSmallTask, jsonSchema] = callArgs
        }
        const { effortForWire, resolveAutoEffort, maxTokensFor } = await import('./modelEffort.mjs')
        // V2-3: effort resolve per turn (auto tak pernah ke wire; ultra =
        // flag lokal, provider terima xhigh + budget max).
        const map = effortForWire(state.effort)
        const resolved = map.needsResolve
          ? resolveAutoEffort((messages || []).map((m) => typeof m?.content === 'string' ? m.content : '').join(' '))
          : state.effort
        state.effortResolved = resolved
        const combinedConfig = {
          aiProvider: state.provider,
          geminiWebModel: state.model,
          customModel: state.model,
          groqModel: state.model,
          // Endpoint diadopsi dari auth (flag/env/GUI shared.json) dulu agar
          // TUI menembak endpoint yang sama dengan GUI (mis. 9Router 20128).
          customEndpoint: auth.customEndpoint || process.env.CUSTOM_ENDPOINT || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1',
          customApiKey: auth.apiKey || process.env.CUSTOM_API_KEY || process.env.OPENAI_API_KEY || '',
          groqApiKey: process.env.GROQ_API_KEY || '',
          temperature: 0,
          effortLevel: state.effort,
          effortResolved: resolved,
          ultraLocal: map.ultraLocal === true,
          customMaxTokens: maxTokensFor(state.effort),
          // S2: capabilities live dari katalog (set saat /model).
          thinkFmt: state.modelCapabilities?.thinkFmt || null,
          thinkReasoning: state.modelCapabilities ? state.modelCapabilities.reasoning !== false : true,
          maxOut: state.modelCapabilities?.maxOut || null,
          ...(config || {}),
        }
        const { buildAiFetchBody } = await import('../core/parser.mjs')
        const { classifyAiError } = await import('./modelEffort.mjs')
        const fetchOnce = (cfg) => sidecar.rpc('ai:fetch', [buildAiFetchBody({ messages, config: cfg, isSmallTask, jsonSchema })])
        const resp = await fetchOnce(combinedConfig)
        if (!resp || !resp.success) {
          const raw = String(resp?.error?.message || resp?.error || 'AI fetch gagal.')
          const info = classifyAiError(raw)
          // Tanpa fallback model (keputusan user): gagal = pesan per-lapis
          // + aksi. ID terlarang (claude-work) ditolak sebelum kirim.
          throw new Error(info.message)
        }
        return resp.data
      }),
      executeTool: deps.executeTool || (async (toolName, query, ctx = {}) => {
        const aborted = checkTurnAborted(turn.signal, toolName)
        if (aborted) return aborted
        const secCheck = evaluateHeadlessSecurity(toolName, query, { workspaceRoot: state.workspace })
        if (!secCheck.allowed) {
          const decision = typeof headless.resolveApprovalDecision === 'function'
            ? headless.resolveApprovalDecision(secCheck, { approveAll: false, denyAll: false, mode: 'auto' })
            : { proceed: true, reason: 'auto default' }
          if (!decision.proceed) {
            const errMsg = `[BLOCKED] Tool "${toolName}" ditolak: ${secCheck.message}`
            return { ok: false, result: errMsg, error: { code: secCheck.code || 'security-denied', message: secCheck.message } }
          }
        }
        const toolDef = NATIVE_TOOLS[toolName]
        if (!toolDef || typeof toolDef.handler !== 'function') {
          const resp = await sidecar.rpc('native-tool:execute', [toolName, query, { workspaceRoot: state.workspace, turn: ctx.step }])
          if (!resp || !resp.success) {
            return { ok: false, result: `[ERROR] ${toolName}: ${resp?.error || 'Unknown'}`, error: { code: 'tool-error', message: resp?.error } }
          }
          return { ok: true, result: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data) }
        }
        try {
          const res = await toolDef.handler(query, { workspaceRoot: state.workspace, turn: ctx.step })
          const ok = res && res.success !== false
          const output = ok
            ? (res.output || res.data || res.content || res.message || JSON.stringify(res))
            : (res.error || res.message || 'Tool gagal.')
          return { ok, result: ok ? String(output) : `[ERROR] ${output}`, error: ok ? null : { code: 'tool-error', message: output } }
        } catch (err) {
          return { ok: false, result: `[ERROR] ${err.message}`, error: { code: 'execution-exception', message: err.message } }
        }
      }),
      onThought: (thought) => {
        if (state.showThinking === false) return
        const line = renderThoughtLine(thought)
        if (line && deps.onEvent) deps.onEvent({ type: 'thought', line })
      },
      onStep: (stepRecord) => {
        if (state.showDetails === false && stepRecord?.kind === 'tool') return
        const line = renderStepLine(stepRecord)
        if (line && deps.onEvent) deps.onEvent({ type: 'step', line })
      },
    }
    const result = await runAgentLoop({
      prompt,
      options: {
        provider: state.provider,
        model: state.model,
        modelVersion: null,
        effort: state.effort,
        maxTurns: deps.maxTurns || 15,
        workspace: state.workspace,
        sessionId: state.sessionId,
        signal: turn.signal,
        initialHistory: state.history,
      },
      environment,
    })
    state.history.push({ role: 'user', content: prompt })
    if (result.reply) state.history.push({ role: 'assistant', content: result.reply })
    await saveTuiSession({
      v: 1, id: state.sessionId, workspace: state.workspace,
      provider: state.provider, model: state.model, modelVersion: null,
      effort: state.effort, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), prompt,
      outcome: result.outcome, terminalReason: result.terminalReason,
      messages: state.history,
    }).catch(() => ({}))
    return result
  } finally {
    state.currentTurn = null
  }
}
