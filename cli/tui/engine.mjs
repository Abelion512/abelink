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
  collapseToolOutput,
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
  createToolAuditLogger,
  createHarnessWriter,
  createHeadlessHarnessLogger,
  executeToolWithHooks,
  trajectoryHeadlessEnabled,
  resolveHarnessRoot,
} from '../core/index.mjs'

import {
  buildTurnPrompt,
  initWorking,
  noteWorking,
  modeStatusText,
} from './planMode.mjs'

import { estimateLiveTokens } from './usageStats.mjs'

export { parseSlashCommand, parseShellLine, resolveFileRefs, buildAgentsMd }
export { SESSION_MESSAGE_CAP }
export { movePromptHistory, appendPromptHistory, createPromptHistory } from '../core/promptHistory.mjs'
export { normalizePaste, shouldSummarizePaste, summarizePaste } from '../core/paste.mjs'

export function createTuiState(overrides = {}) {
  return {
    provider: 'custom',
    model: 'oc/muse-spark-1.3-contributor-free',
    effort: 'low',
    // Stream D: mode plan/build (opencode agent.cycle build<->plan via tab).
    // Default build = perilaku lama (eksekusi normal). Meta row tampilkan
    // via modeAgentLabel; permissionMode = auto/normal (opencode
    // context/permission.tsx: /permissions toggle).
    mode: 'build',
    // CATATAN NAMA (merge-review Warning #5): `permissionMode` TUI ini =
    // auto|normal (opencode context/permission.tsx, toggle /permissions).
    // JANGAN disamakan dengan `permissionMode` CLI bin/abelink.mjs =
    // auto|manual|dont-ask (semantik approve-all berbeda). Domain terpisah.
    permissionMode: 'auto',
    workspace: process.cwd(),
    sessionId: `session-${Date.now()}`,
    history: [],
    messages: [],
    showThinking: true,
    showDetails: false,
    busy: false,
    // Batch C (sidebar opencode jujur — tanpa fabrikasi): sinyal usage sesi
    // BERJALAN. null = belum terukur (UI tampilkan '—'). MCP/LSP hanya diisi
    // bila engine expose (default null = segmen di-skip, tanpa angka palsu).
    usage: { tokensEst: null, modelCtx: null },
    mcpConnected: null,
    mcpError: false,
    lspCount: null,
    onSessionSwitch: null,
    ...overrides,
  }
}

// Batch C: segarkan usage sesi BERJALAN (chars/2.5, pola summarizeSession
// di usageStats.mjs). Sinkron supaya bisa dipanggil tiap pushMessage;
// modelCtx sticky (diisi touchSessionUsage saat katalog tersedia, atau dari
// state.modelCapabilities saat ganti model). null = belum terukur.
export function refreshSessionUsage(state) {
  try {
    const tokensEst = estimateLiveTokens({ history: state.history, messages: state.messages })
    const cap = Number(state?.modelCapabilities?.ctx)
    const modelCtx = Number.isFinite(cap) && cap > 0 ? cap
      : (Number.isFinite(Number(state?.usage?.modelCtx)) && Number(state.usage.modelCtx) > 0
        ? Number(state.usage.modelCtx) : null)
    state.usage = { tokensEst, modelCtx }
  } catch { /* usage opsional, jangan gagalkan pesan */ }
  return state.usage
}

// Batch C: cari ctx model aktif di katalog disk (tanpa network), lalu
// refresh. Dipanggil setelah /model, /continue, bootstrap (fire-and-forget).
// Cache + custom dibaca TERPISAH: custom korup tak boleh menenggelamkan
// hit cache yang valid.
export async function touchSessionUsage(state, deps = {}) {
  let hit = null
  try {
    const { readCatalogCache, readCustomModels } = await import('./modelCatalog.mjs')
    const osMod = await import('node:os')
    const fsMod = deps.fsMod || await import('node:fs')
    const home = deps.homeDir || osMod.homedir?.() || process.env.HOME || ''
    let cachedModels = []
    let customModels = []
    try { cachedModels = readCatalogCache({ fsMod, homeDir: home }).models || [] } catch { /* cache tak terbaca */ }
    try { customModels = readCustomModels({ fsMod, homeDir: home }) || [] } catch { /* custom korup */ }
    hit = [...cachedModels, ...customModels]
      .find((m) => String(m?.id || '') === String(state.model || '')) || null
    if (Number.isFinite(Number(hit?.ctx)) && Number(hit.ctx) > 0) {
      state.modelCapabilities = hit
    }
  } catch { /* katalog tak terbaca -> ctx null (jujur) */ }
  refreshSessionUsage(state)
  try { state.onPush?.() } catch { /* repaint opsional */ }
  return state.usage
}

// Batch C: alihkan ke sesi tersimpan (dipakai /continue + dialog sessions).
// Menyatukan baris yang sebelumnya inline di case 'continue'. Usage
// disegarkan (histori baru); ctx dicari ulang oleh caller via touch.
export function switchToSession(state, session) {
  state.sessionId = session.id
  state.history = sessionToInitialHistory(session)
  if (session.model) state.model = session.model
  if (session.effort) state.effort = session.effort
  refreshSessionUsage(state)
  try { state.onSessionSwitch?.(session.id) } catch { /* hook opsional */ }
  return state.history.length
}

// Baca katalog dari cache disk saja (tanpa network). Dipakai jalur /model dan
// /models tanpa filter supaya tidak memicu GET /v1/models yang lambat
// (5-26 dtk) hanya untuk menampilkan daftar.
// `custom` = ID bebas simpanan user (cli.json customModels), dibaca dari disk
// tiap panggil (dynamic) supaya ID yang disimpan sesi ini langsung dipakai.
export async function readCachedCatalog(deps = {}) {
  const { readCatalogCache, readCustomModels } = await import('./modelCatalog.mjs')
  const osMod = await import('node:os')
  const fsMod = deps.fsMod || await import('node:fs')
  const home = deps.homeDir || osMod.homedir?.() || process.env.HOME || ''
  const cached = readCatalogCache({ fsMod, homeDir: home })
  const custom = readCustomModels({ fsMod, homeDir: home })
  return { models: cached.ok ? cached.models : [], custom, stale: cached.stale === true, error: null }
}

// `state.onPush` = hook repaint (dipasang entry TUI). Tanpa ini pesan baru
// (termasuk prompt user sendiri) baru terlihat saat event berikutnya tiba —
// TUI tampak beku selama turn panjang (terukur PTY 2026-09-26).
export function pushMessage(state, role, text) {
  state.messages.push({ role, text: String(text ?? '') })
  // Batch C: usage sesi berjalan ikut segar tiap pesan (sinkron, murah).
  try { refreshSessionUsage(state) } catch { /* usage opsional */ }
  try { state.onPush?.() } catch { /* repaint opsional, jangan gagalkan pesan */ }
  return state.messages.length
}

// S1: katalog model (stale-while-revalidate, pola opencode models-dev).
// Cache fresh -> pakai langsung. Stale/kosong -> coba live (timeout pendek);
// live gagal -> cache stale + error jujur; tanpa cache -> alias statis saja.
export async function loadModelCatalog(state, deps = {}, forceRefresh = false) {
  const { readCatalogCache, writeCatalogCache, fetchLiveCatalog, readCustomModels } = await import('./modelCatalog.mjs')
  const os = await import('node:os')
  const fsMod = deps.fsMod || await import('node:fs')
  const pathMod = deps.pathMod || await import('node:path')
  const homeDir = deps.homeDir || null
  const home = homeDir || os.homedir?.() || process.env.HOME || ''
  const cached = readCatalogCache({ fsMod, homeDir: home })
  const custom = readCustomModels({ fsMod, homeDir: home })
  if (cached.ok && cached.stale === false && !forceRefresh) {
    return { models: cached.models, custom, stale: false, error: null }
  }
  const fetchFn = deps.fetchFn || null
  const live = await fetchLiveCatalog({
    fetchFn,
    endpoint: deps.modelsEndpoint || process.env.ABELINK_MODELS_ENDPOINT || 'http://127.0.0.1:20128/v1',
  })
  if (live.ok && live.models.length) {
    writeCatalogCache(live.models, { fsMod, pathMod, homeDir: home })
    return { models: live.models, custom, stale: false, error: null }
  }
  if (cached.ok && cached.models.length) {
    return { models: cached.models, custom, stale: true, error: live.error ? `Discovery gagal (${live.error}); pakai cache.` : null }
  }
  return { models: [], custom, stale: true, error: live.error ? `Discovery gagal (${live.error}); pakai alias statis.` : 'Katalog kosong; pakai alias statis.' }
}

// Baris picker model (presentasi; recent tetap milik engine).
// DEFAULT = HANYA model yang user pernah pakai (Aktif -> Recent -> Favorit ->
// Alias). Katalog 1300+ model TIDAK dimuat otomatis: cukup yang pernah
// dimasukkan user, sisanya opt-in (`/models --all` via deps.loadCatalog).
// Katalog dari CACHE disk boleh disertakan tanpa network (murah); fetch live
// hanya saat deps.loadCatalog true. Recent tak difilter katalog: ID combo
// 9Router (mis. oc/muse-spark-1.3-contributor-free) TIDAK muncul di GET
// /v1/models tapi sah dipakai — menyembunyikannya justru bikin bingung.
// Port dialog-select `current`: baris yang cocok model aktif ditandai (●).
// Aktif selalu current; baris lain current bila id-nya == model aktif.
export async function modelPickerRows(state, deps = {}, query = '') {
  const { curatePicker, readCatalogCache } = await import('./modelCatalog.mjs')
  const q = String(query || '').trim().toLowerCase()
  const match = (id) => !q || String(id || '').toLowerCase().includes(q)
  const rows = []
  const isActive = (id) => String(id ?? '') === String(state.model ?? '')
  if (state.model && !q) rows.push({ id: state.model, section: 'Aktif', label: state.model, current: true })
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
  let catalogCustom = null
  if (deps.loadCatalog === true) {
    const catalog = await loadModelCatalog(state, deps)
    catalogModels = catalog.models
    catalogStale = catalog.stale === true
    catalogError = catalog.error || null
    catalogLoaded = true
    if (Array.isArray(catalog.custom)) catalogCustom = catalog.custom
  } else {
    // Baca cache disk saja (tanpa network) — murah, dan membuat filter picker
    // berguna bila katalog pernah dimuat tanpa memaksa fetch tiap buka.
    // Custom (ID bebas simpanan) ikut dibaca tiap buka: dynamic, bukan snapshot.
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
  const { readCustomModels } = await import('./modelCatalog.mjs')
  if (!catalogCustom) {
    try {
      const osMod = await import('node:os')
      const fsMod = deps.fsMod || await import('node:fs')
      const home = deps.homeDir || osMod.homedir?.() || process.env.HOME || ''
      catalogCustom = readCustomModels({ fsMod, homeDir: home })
    } catch {
      catalogCustom = []
    }
  }
  const picked = curatePicker({
    models: catalogModels,
    favorites: deps.cliConfig?.favModels || [],
    recent: state.recentModels || deps.cliConfig?.recentModels || [],
    custom: [...catalogCustom, ...(deps.cliConfig?.customModels || [])],
    query: q,
    perSection: 40,
  })
  const seenIds = new Set(rows.map((r) => r.id))
  const capOf = (id) => (Array.isArray(catalogModels) ? catalogModels.find((m) => m?.id === id) : null)
  const capDetail = (id) => {
    if (/->/.test(String(id ?? ''))) return null
    const c = capOf(id)
    if (!c) return null
    const bits = []
    if (c.reasoning === true) bits.push('reasoning')
    if (c.ctx != null) bits.push(`ctx ${c.ctx}`)
    if (c.maxOut != null) bits.push(`out ${c.maxOut}`)
    return bits.length ? bits.join(' · ') : null
  }
  for (const id of picked.custom) {
    if (!seenIds.has(id)) {
      rows.push({ id, section: 'Custom', label: id, current: isActive(id), detail: capDetail(id) })
      seenIds.add(id)
    }
  }
  // Custom-wins dipertahankan di push site juga: curatePicker sudah
  // mengecualikan custom dari rest, tapi seenIds menutup jalur ganda bila
  // daftar custom berubah di antara curate dan push.
  for (const id of picked.models) {
    if (!seenIds.has(id)) {
      rows.push({ id, section: 'Katalog', label: id, current: isActive(id), detail: capDetail(id) })
      seenIds.add(id)
    }
  }
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

// Baris dialog effort (slice 3, presentasi): 7 level + penanda aktif.
// `current` ikut diset agar CenterDialog render ● (port dialog-select).
// Filter substring case-insensitive atas id. Murni + testable.
export async function effortDialogRows(state, query = '') {
  const { EFFORT_LEVELS } = await import('../core/index.mjs')
  const q = String(query || '').trim().toLowerCase()
  const active = String(state?.effort || '').toLowerCase()
  return EFFORT_LEVELS
    .filter((id) => !q || String(id).toLowerCase().includes(q))
    .map((id) => {
      const on = id.toLowerCase() === active
      return {
        id,
        label: id,
        section: on ? 'aktif' : '',
        current: on,
      }
    })
}

// Guard dialog-confirm (/new sesi kotor): true bila histori berjalan perlu
// konfirmasi ganti sesi. Murni + testable. `dirty` = ada histori ATAU turn
// aktif; `/new --force` = lewati. Tanpa force + dirty -> engine kembalikan
// instruksi `confirm`, entry render dialog-confirm dua tombol.
/**
 * @param {{ history?: Array<unknown>, currentTurn?: unknown }} [state]
 * @param {string} [arg]
 * @returns {boolean}
 */
export function needsNewConfirm(state, arg = '') {
  const force = String(arg ?? '').trim().toLowerCase() === '--force'
  if (force) return false
  if (state?.currentTurn) return true
  return Array.isArray(state?.history) && state.history.length > 0
}

// Baris dialog sesi (presentasi murni, port dialog-session-list `buildOption`):
// Pinned -> paling atas dengan kategori "Pinned"; sisanya kategori tanggal
// ("Today" / toDateString). `current` = sesi aktif (●). `detail` = prompt
// 48 char (port `details` baris kedua). Never throws (store null -> []).
// `now` injectable untuk test hermetik.
/**
 * @param {Array<{ id?: string, title?: string, parentID?: string, updatedAt?: string, prompt?: string }>} [sessions]
 * @param {{ pinned?: string[], slots?: string[], currentId?: string | null, now?: number }} [opts]
 * @returns {Array<{ id: string, label: string, section: string, current: boolean, detail: string | null }>}
 */
export function sessionDialogRows(sessions = [], { pinned = [], slots = [], currentId = null, now = Date.now() } = {}) {
  const list = Array.isArray(sessions) ? sessions.filter((s) => s && s.id && s.parentID === undefined) : []
  const byId = new Map(list.map((s) => [s.id, s]))
  const slotById = new Map((Array.isArray(slots) ? slots : []).map((id, i) => [id, i + 1]))
  const today = new Date(now).toDateString()
  const build = (id, category) => {
    const s = byId.get(id)
    if (!s) return null
    const slot = slotById.get(id)
    const label = slot !== undefined ? `[${slot}] ${s.title || s.id}` : (s.title || s.id)
    const prompt = String(s.prompt ?? '').slice(0, 48)
    return {
      id: s.id,
      label,
      section: category,
      current: currentId != null && s.id === currentId,
      detail: prompt ? prompt : null,
    }
  }
  const pinRows = (Array.isArray(pinned) ? pinned : []).map((id) => build(id, 'Pinned')).filter(Boolean)
  const pinnedSet = new Set((Array.isArray(pinned) ? pinned : []).filter((id) => byId.has(id)))
  const rest = list
    .slice()
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .filter((s) => !pinnedSet.has(s.id))
    .map((s) => {
      const d = s.updatedAt ? new Date(s.updatedAt).toDateString() : ''
      return build(s.id, d === today ? 'Today' : (d || 'Sesi'))
    })
    .filter(Boolean)
  return pinRows.concat(rest)
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
  // Port opencode onPaste/pasteInputText: CRLF/CR -> LF di boundary input.
  // TTY paste lintas-OS (Windows CRLF, macOS klasik CR) ternormalisasi di
  // SINI (satu choke point) agar normalisasi tak tercecer per-caller.
  let text = String(line ?? '')
  try {
    const { normalizePaste } = await import('../core/paste.mjs')
    text = normalizePaste(text)
  } catch { /* normalisasi opsional, jangan gagalkan kirim */ }
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
  // Gambar drop/paste: path mentah -> attachment -> deskripsi vision via
  // sidecar (pola GUI visionTools: contentArray + fetchVisionAI chain).
  // Jalur TUI string-only, jadi deskripsi disisipkan sebagai teks konteks.
  // Port opencode prompt/local-attachment.ts: SVG = TEKS (markup langsung,
  // bukan base64); image/* lain + PDF = binary bytes. PDF ke LLM vision =
  // tolak-jujur (catat path, isi tak dikirim — tanpa parser PDF di CLI).
  // Tanpa sidecar (test/pipe): lampirkan penanda jujur, bukan fabrikasi isi.
  const { resolveImageRefs } = await import('../core/imageRefs.mjs')
  const fsMod = deps.fsMod || await import('node:fs').catch(() => null)
  const pathMod = deps.pathMod || await import('node:path').catch(() => null)
  // resolveImageRefs makan resolved.text (bukan text mentah) agar ekspansi
  // @file tidak terbuang saat gambar terlampir (merge-review Critical #1).
  const imgResolved = resolveImageRefs(resolved.text, { workspace: state.workspace, fsMod, pathMod })
  let effectiveText = resolved.text
  if (imgResolved.attached?.length) {
    const bins = imgResolved.attached.filter((a) => a.kind !== 'text')
    const svgs = imgResolved.attached.filter((a) => a.kind === 'text')
    // `bins` dipakai 2x di bawah (pdfs + imgs) — bukan perantara mati
    // (merge-review Suggestion #8: verifikasi, biarkan).
    const pdfs = bins.filter((a) => a.mime === 'application/pdf')
    const imgs = bins.filter((a) => a.mime !== 'application/pdf')
    const labels = imgResolved.attached.map((a) => a.ref).join(', ')
    pushMessage(state, 'info', `Lampirkan ${imgResolved.attached.length} lampiran (${labels}).`)
    effectiveText = imgResolved.text
    // SVG = teks: markup disisip inline agar model baca langsung.
    for (const s of svgs) {
      effectiveText += `\n[ISI SVG ${s.ref}]\n${String(s.text ?? '').slice(0, 20000)}\n[/ISI]\n`
    }
    // PDF = tolak-jujur: catat path, isi tak dikirim (tanpa parser PDF).
    for (const p of pdfs) {
      effectiveText += `\n[PDF ${p.ref}: isi tak dikirim — tanpa parser PDF di CLI; baca manual bila relevan.]\n`
    }
    const sidecar = deps.sidecar || null
    if (sidecar?.rpc && imgs.length) {
      for (const img of imgs) {
        try {
          const resp = await sidecar.rpc('ai:fetch', [{
            messages: [{ role: 'user', content: [
              { type: 'text', text: `Deskripsikan gambar ini secara faktual dalam 3-5 kalimat (objek, teks terlihat, konteks). Jawab Bahasa Indonesia.` },
              { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}` } },
            ] }],
            config: { aiProvider: state.provider, customModel: state.model, customEndpoint: deps.auth?.customEndpoint || process.env.CUSTOM_ENDPOINT || 'http://localhost:20128/v1', customApiKey: deps.auth?.apiKey || process.env.CUSTOM_API_KEY || '' },
          }])
          const desc = typeof resp?.data?.content === 'string' ? resp.data.content : String(resp?.data ?? '')
          if (desc.trim()) effectiveText += `\n[DESKRIPSI GAMBAR ${img.ref}]\n${desc.trim()}\n[/DESKRIPSI]\n`
          else pushMessage(state, 'info', `Gambar ${img.ref}: vision tak menjawab, kirim tanpa deskripsi.`)
        } catch (err) {
          pushMessage(state, 'info', `Gambar ${img.ref}: deskripsi vision gagal (${String(err?.message || err).slice(0, 120)}), kirim tanpa deskripsi.`)
        }
      }
    } else if (imgs.length) {
      pushMessage(state, 'info', 'Tanpa sidecar: gambar tercatat sebagai path, isi tak dideskripsikan.')
    }
  }
  for (const s of (imgResolved.skipped || [])) {
    pushMessage(state, 'info', `Gambar dilewati: ${s.ref} (${s.reason}).`)
  }
  pushMessage(state, 'user', text)
  // Port opencode prompt/history.tsx append: prompt terkirim masuk histori
  // (dedup + cap 50). state.promptHistory malas-dibuat agar state lama aman.
  try {
    const { appendPromptHistory, createPromptHistory } = await import('../core/promptHistory.mjs')
    if (!state.promptHistory) state.promptHistory = createPromptHistory()
    appendPromptHistory(state.promptHistory, text)
  } catch { /* histori prompt opsional, jangan gagalkan kirim */ }
  const runTurn = deps.runTurn || defaultRunTurn
  // Stream D: plan = prompt prefix (planMode.mjs). Penahanan tool di engine
  // SENGAJA tidak ada (butuh ubah src/): lihat catatan jujur di planMode.mjs.
  // Prefix membungkus effectiveText (bukan resolved.text) agar deskripsi
  // gambar stream B ikut terkirim saat plan mode aktif.
  const mode = state.mode === 'plan' ? 'plan' : 'build'
  const result = await runTurn(state, buildTurnPrompt(mode, effectiveText), deps)
  if (result?.reply) pushMessage(state, 'assistant', result.reply)
  return { kind: 'message', role: 'assistant' }
}

async function runSlash(state, cmd, deps) {
  switch (cmd.kind) {
    case 'exit': return { kind: 'exit' }
    case 'help':
      pushMessage(state, 'info', deps.helpText || 'Ketik /help di TUI untuk daftar perintah.')
      return { kind: 'message', role: 'info' }
    // /status: ringkasan sesi berjalan (model, effort, mode, pesan, usage).
    // Ada karena status line + home merujuknya — tanpa ini halusinasi.
    case 'status': {
      const n = Array.isArray(state.messages) ? state.messages.length : 0
      const u = state.usage?.tokensEst
      pushMessage(state, 'info',
        [`Sesi: ${state.sessionId || '—'}`, `Model: ${state.model || '—'}`, `Effort: ${state.effort || '—'}`, `Mode: ${state.mode === 'plan' ? 'plan' : 'build'}`, `Pesan: ${n}`, u == null ? 'Konteks: —' : `Konteks: ~${Number(u).toLocaleString('en-US')} tokens (est.)`].join('\n'))
      return { kind: 'message', role: 'info' }
    }
    case 'unsupported':
      pushMessage(state, 'error', cmd.reason)
      return { kind: 'message', role: 'error' }
    case 'model': {
      if (!cmd.arg) {
        const { modelSourceLabel } = await import('./modelEffort.mjs')
        pushMessage(state, 'info', `Model aktif: ${modelSourceLabel(state.model, state.provider)}`)
        return { kind: 'message', role: 'info' }
      }
      const { resolveCatalogModel, pushRecent, upsertCustomModel, withCustomCapabilities } = await import('./modelCatalog.mjs')
      const { cacheSwitchWarning, persistCliField } = await import('./modelEffort.mjs')
      const headless = await import('../../src/api/ai/headlessCli.js').catch(() => ({}))
      // Live hanya bila katalog sudah di-opt-in; selain itu cache disk saja
      // (alias/passthrough tetap jalan tanpa jaringan).
      const catalog = deps.loadCatalog === true
        ? await loadModelCatalog(state, deps)
        : await readCachedCatalog(deps)
      // Custom (simpanan cli.json) digabung dynamic: ID bebas yang pernah
      // disimpan membawa capability-nya walau tak ada di katalog live/cache.
      const merged = withCustomCapabilities(catalog.models, [
        ...(catalog.custom || []),
        ...(deps.cliConfig?.customModels || []),
      ])
      const r = resolveCatalogModel(cmd.arg, {
        models: merged,
        aliases: deps.aliases || {},
        // Satu sumber kebenaran, bukan daftar lokal di modelCatalog.
        forbidden: headless.FORBIDDEN_MODELS || ['claude-work'],
      })
      if (!r.ok) {
        pushMessage(state, 'error', r.error)
        return { kind: 'message', role: 'error' }
      }
      state.model = r.id
      const hit = merged.find((m) => m.id === r.id) || null
      state.modelCapabilities = hit
      // Batch C: ctx model baru langsung dipakai sidebar (tanpa tunggu touch).
      refreshSessionUsage(state)
      const recent = pushRecent(deps.cliConfig?.recentModels || state.recentModels || [], r.id)
      state.recentModels = recent
      const warn = cacheSwitchWarning(state.history)
      const saved = await persistCliField('model', r.via === 'alias' ? cmd.arg : r.id, { homeDir: deps.homeDir || null })
      await saveRecentModels(recent, { homeDir: deps.homeDir || null })
      // ID bebas (passthrough, via 'langsung') disimpan ke cli.json ->
      // customModels[{id, ctx, maxOut, reasoning, lastSeen}] supaya muncul di
      // section Custom picker sesi berikut. Capability dari katalog bila ada,
      // null (tak diketahui) bila murni bebas.
      let customNote = null
      if (r.via === 'langsung') {
        const fsMod = deps.fsMod || await import('node:fs')
        const pathMod = deps.pathMod || await import('node:path')
        const up = upsertCustomModel(
          { id: r.id, ctx: hit?.ctx ?? null, maxOut: hit?.maxOut ?? null, reasoning: hit?.reasoning ?? false },
          { fsMod, pathMod, homeDir: deps.homeDir || null },
        )
        customNote = up.ok ? `ID bebas tersimpan ke Custom (${r.id}).` : `Simpan Custom gagal: ${up.error}.`
      }
      // Rapikan warning passthrough: label resolve membawa kalimat panjang;
      // ringkas jadi satu baris status.
      const resolvedLabel = r.via === 'langsung'
        ? `${r.id} (ID bebas — tak ada di katalog, bisa gagal di provider)`
        : r.label
      const bits = [`Model: ${resolvedLabel}${catalog.stale ? ' (katalog stale)' : ''}`]
      if (warn) bits.push(warn)
      if (customNote) bits.push(customNote)
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
        custom: [...(catalog.custom || []), ...(deps.cliConfig?.customModels || [])],
        aliases: deps.aliases || {},
        query: q,
      })
      const out = []
      if (picked.favorites.length) out.push('Favorites:\n' + picked.favorites.map((id) => `  ${id}`).join('\n'))
      if (picked.recent.length) out.push('Recent:\n' + picked.recent.map((id) => `  ${id}`).join('\n'))
      if (picked.custom.length) out.push('Custom:\n' + picked.custom.map((id) => `  ${id}`).join('\n'))
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
      const { TUI_COMMANDS } = await import('./theme.ts')
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
      const switched = switchToSession(state, { ...r.session, id: state.sessionId })
      // ctx model sesi lanjutan dicari di katalog disk (fire-and-forget).
      void touchSessionUsage(state, deps)
      pushMessage(state, 'info', `Lanjut sesi ${state.sessionId} (${switched} pesan histori).`)
      return { kind: 'message', role: 'info' }
    }
    case 'new':
      if (needsNewConfirm(state, cmd.arg)) {
        pushMessage(state, 'info', `Sesi berjalan (${state.history.length} pesan histori) — ketik "/new --force" untuk buang dan mulai baru.`)
        return { kind: 'confirm', action: 'new', role: 'info' }
      }
      state.sessionId = `session-${Date.now()}`
      state.history = []
      // Layar fresh ala opencode: pesan lama ikut dibuang (bukan lanjut di bawah).
      state.messages = []
      try { state.onPush?.() } catch {}
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
    // Port opencode dialog-message: Copy = pesan assistant terakhir ke
    // clipboard; Fork = sesi baru berisi histori sampai pesan itu.
    // Revert butuh primitif undo file engine (tak ada) — tolak jujur.
    case 'copy': {
      const last = [...(state.messages || [])].reverse().find((m) => m?.role === 'assistant' && String(m.text ?? '').trim())
      if (!last) {
        pushMessage(state, 'error', 'Belum ada pesan AI untuk disalin.')
        return { kind: 'message', role: 'error' }
      }
      try {
        const { writeClipboard } = await import('../core/clipboard.mjs')
        await writeClipboard(String(last.text))
        pushMessage(state, 'info', 'Pesan AI terakhir disalin ke clipboard.')
      } catch (err) {
        pushMessage(state, 'error', `Gagal menyalin: ${String(err?.message || err).slice(0, 120)}`)
      }
      return { kind: 'message', role: 'info' }
    }
    case 'fork': {
      const msgs = [...(state.messages || [])]
      const idx = msgs.map((m) => m?.role).lastIndexOf('assistant')
      if (idx < 0) {
        pushMessage(state, 'error', 'Belum ada pesan AI untuk fork.')
        return { kind: 'message', role: 'error' }
      }
      const cut = msgs.slice(0, idx + 1)
      state.sessionId = `session-${Date.now()}`
      state.history = cut
        .filter((m) => m?.role === 'user' || m?.role === 'assistant')
        .map((m) => ({ role: m.role, content: String(m.text ?? '') }))
      pushMessage(state, 'info', `Fork sesi baru: ${state.sessionId} (${cut.length} pesan dibawa).`)
      return { kind: 'message', role: 'info' }
    }
    case 'details':
      state.showDetails = !state.showDetails
      pushMessage(state, 'info', `Detail tool: ${state.showDetails ? 'TAMPIL' : 'SEMBUNYI'}.`)
      return { kind: 'message', role: 'info' }
    // Stream D: mode plan/build (pola opencode agent.cycle build<->plan).
    // Idempotent: sudah di mode itu -> status saja, tanpa noise.
    case 'plan':
    case 'build': {
      const next = cmd.kind === 'plan' ? 'plan' : 'build'
      if (state.mode === next) {
        pushMessage(state, 'info', next === 'plan'
          ? 'Sudah mode PLAN (prompt prefix aktif; tool tetap tak ditahan engine).'
          : 'Sudah mode BUILD (eksekusi normal).')
        return { kind: 'message', role: 'info' }
      }
      state.mode = next
      try { state.onPush?.() } catch { /* repaint opsional */ }
      pushMessage(state, 'info', modeStatusText(next))
      return { kind: 'message', role: 'info' }
    }
    case 'editor': {
      const runEditor = deps.runEditor || defaultRunEditor
      const text = await runEditor()
      if (!text) {
        pushMessage(state, 'info', 'Editor kosong — batal.')
        return { kind: 'message', role: 'info' }
      }
      // Port opencode normalizePromptContent: CRLF user Windows -> LF.
      try {
        const { normalizePaste } = await import('../core/paste.mjs')
        const norm = normalizePaste(text)
        if (norm !== text) return runPrompt(state, norm, deps)
      } catch { /* normalisasi opsional */ }
      return runPrompt(state, text, deps)
    }
    // Port opencode app.tsx permission.mode: toggle auto-approve tool.
    // KONSEP TERPISAH dari plan mode (plan = rencana vs eksekusi; ini =
    // tool jalan otomatis vs minta izin). Idempotent: arg eksplisit boleh.
    case 'permissions': {
      const arg = String(cmd.arg || '').toLowerCase()
      const cur = state.permissionMode === 'normal' ? 'normal' : 'auto'
      const next = arg === 'auto' ? 'auto' : arg === 'normal' ? 'normal' : (cur === 'auto' ? 'normal' : 'auto')
      state.permissionMode = next
      try { state.onPush?.() } catch { /* repaint opsional */ }
      pushMessage(state, 'info', next === 'auto'
        ? 'Permission: AUTO (tool auto-approve, tercatat di harness). Matikan: /permissions normal.'
        : 'Permission: NORMAL (tool sensitif minta izin eksplisit). Nyalakan: /permissions auto.')
      return { kind: 'message', role: 'info' }
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
    // Port GUI Skills: daftar nama+deskripsi via sidecar lazy (load when
    // needed — tanpa sidecar = tolak jujur, bukan render semua di awal).
    case 'skills': {
      const sidecar = deps.sidecar || null
      if (!sidecar?.rpc) {
        pushMessage(state, 'error', 'Skills butuh sidecar (jalan interaktif, bukan pipe).')
        return { kind: 'message', role: 'error' }
      }
      try {
        const resp = await sidecar.rpc('skills:get-all', [])
        const list = resp?.data ?? resp ?? []
        const rows = Array.isArray(list) ? list : []
        if (!rows.length) {
          pushMessage(state, 'info', 'Belum ada skill. Isi dibaca saat dipakai (lazy).')
          return { kind: 'message', role: 'info' }
        }
        pushMessage(state, 'info', rows.map((s) => `· ${s?.name ?? s}${s?.description ? ` — ${s.description}` : ''}`).join('\n'))
      } catch (err) {
        pushMessage(state, 'error', `Skills gagal: ${String(err?.message || err).slice(0, 120)}`)
      }
      return { kind: 'message', role: 'info' }
    }
    case 'usage': {
      const { summarizeDir, renderUsage } = await import('./usageStats.mjs')
      const path = await import('node:path')
      const fsMod = deps.fsMod || await import('node:fs')
      // M2c: satu sumber rumus root harness (resolveHarnessRoot -> dataHome).
      // Override deps.harnessRoot dipertahankan untuk test hermetik (tanpa brand).
      const root = deps.harnessRoot
        ? path.join(deps.harnessRoot, 'abelink', 'harness')
        : resolveHarnessRoot()
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
// M2c: environment.executeTool dibungkus executeToolWithHooks (H5 pre/post +
// audit harness JSONL via ABELINK_TRAJECTORY_HEADLESS=1) — choke point tunggal,
// host tetap bisa override via deps.executeTool (tetap dibungkus hooks juga).
export async function defaultRunTurn(state, prompt, deps = {}) {
  const turn = createTuiTurn()
  state.currentTurn = turn
  // Stream D: status working per turn (opencode spinner + step/tool).
  // Di-reset tiap turn; dibaca entry via state.working.
  state.working = initWorking()
  try {
    const { runAgentLoop } = await import('../../src/api/ai/agentRunner.js')
    const { evaluateHeadlessSecurity } = await import('../../src/api/ai/headlessSecurity.js')
    const headless = await import('../../src/api/ai/headlessCli.js').catch(() => ({}))
    const { NATIVE_TOOLS } = await import('../../sidecar/main/node-tools.js')
    const sidecar = deps.sidecar || null
    const auth = deps.auth || {}

    // PLAN-T1: audit harness headless (flag-gated; writer no-op tanpa flag).
    // Audit hidup per SESI (bukan per run) agar turn offset kontinu lintas
    // run; di-recreate saat /new atau /continue (forSession != sessionId).
    let audit = state.harnessAudit || null
    // Flag injectable (deps.trajectoryHeadless) untuk e2e hermetik tanpa env;
    // default tetap proses env (ABELINK_TRAJECTORY_HEADLESS=1).
    const wantTrajectory = deps.trajectoryHeadless ?? trajectoryHeadlessEnabled()
    if (wantTrajectory && (!audit || audit.forSession !== state.sessionId)) {
      const fsMod = deps.fsMod || await import('node:fs')
      const writer = deps.harnessWriter || createHarnessWriter({ fsMod })
      const logger = deps.harnessLogger || createHeadlessHarnessLogger({ writer, sessionId: state.sessionId })
      audit = createToolAuditLogger({
        logger,
        sessionId: state.sessionId,
        deps: {
          loadFn: deps.loadTuiSession || loadTuiSession,
          saveFn: deps.saveTuiSession || saveTuiSession,
        },
      })
      state.harnessAudit = audit
    }
    const hooks = { onBeforeTool: deps.onBeforeTool || null, onAfterTool: deps.onAfterTool || null, audit }

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
      coreExecuteTool: deps.executeTool || (async (toolName, query, ctx = {}) => {
        const aborted = checkTurnAborted(turn.signal, toolName)
        if (aborted) return aborted
        const secCheck = evaluateHeadlessSecurity(toolName, query, { workspaceRoot: state.workspace })
        if (!secCheck.allowed) {
          // Port opencode permission mode: auto = proceed tercatat; normal =
          // mode 'manual' (tanpa --approve-all = tolak + instruksi).
          const permMode = state.permissionMode === 'normal' ? 'manual' : 'auto'
          const decision = typeof headless.resolveApprovalDecision === 'function'
            ? headless.resolveApprovalDecision(secCheck, { approveAll: false, denyAll: false, mode: permMode })
            : { proceed: permMode !== 'manual', reason: permMode === 'manual' ? 'normal mode: izin eksplisit' : 'auto default' }
          if (!decision.proceed) {
            const errMsg = `[BLOCKED] Tool "${toolName}" ditolak (${state.permissionMode === 'normal' ? 'permission NORMAL' : decision.reason}: ${secCheck.message}). Jalankan manual atau /permissions auto.`
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
      // H5: choke point tunggal — pre/post hook + audit JSONL (M2c).
      // coreExecuteTool diselesaikan saat call time (environment sudah utuh).
      executeTool: (toolName, query, ctx = {}) =>
        executeToolWithHooks(
          environment.coreExecuteTool,
          hooks,
          toolName,
          query,
          ctx,
        ),
      onThought: (thought) => {
        if (state.showThinking === false) return
        const line = renderThoughtLine(thought)
        if (line && deps.onEvent) deps.onEvent({ type: 'thought', line })
      },
      onStep: (stepRecord) => {
        // Stream D: catat progres SEBELUM gate showDetails — indikator
        // working harus hidup walau detail tool disembunyikan.
        try { noteWorking(state.working, stepRecord) } catch { /* status opsional */ }
        try { state.onPush?.() } catch { /* repaint opsional */ }
        if (state.showDetails === false && stepRecord?.kind === 'tool') return
        // Detail tool panjang di-collapse (merge-review Warning #7): maks
        // 12 baris / 800 char + flag overflow, bukan potong diam-diam.
        if (stepRecord?.kind === 'tool' && typeof stepRecord.result === 'string') {
          const c = collapseToolOutput(stepRecord.result, 12, 800)
          stepRecord = { ...stepRecord, result: c.output + (c.overflow ? '\n[…output dipadatkan]' : '') }
        }
        const line = renderStepLine(stepRecord)
        if (line && deps.onEvent) deps.onEvent({ type: 'step', line })
      },
    }
    // PLAN-T1: frame turn-start (prompt efektif + provider/model/effort).
    try { audit?.beginTurn({ prompt, provider: state.provider, model: state.model, effort: state.effort }) } catch { }
    let result
    try {
      result = await runAgentLoop({
        prompt,
        options: {
          provider: state.provider,
          model: state.model,
          modelVersion: null,
          effort: state.effort,
          maxTurns: deps.maxTurns ?? undefined,
          workspace: state.workspace,
          sessionId: state.sessionId,
          signal: turn.signal,
          initialHistory: state.history,
        },
        environment,
      })
    } catch (err) {
      // PLAN-T1: crash path juga dapat turn-end (start tanpa end = red flag
      // interupsi di harness:diagnose). Error tetap dilempar — perilaku
      // propagasi submitLine tidak diubah, jejaknya saja yang jujur.
      try { await audit?.finalize({ outcome: 'failed', terminalReason: 'fatal-exception', turn: null }) } catch { }
      throw err
    }
    state.history.push({ role: 'user', content: prompt })
    if (result.reply) state.history.push({ role: 'assistant', content: result.reply })
    // Batch C: usage sesi berjalan segar tiap turn selesai (reply masuk).
    refreshSessionUsage(state)
    // PLAN-T1: turn-end + patch outcome ke sesi (harus sebelum saveTuiSession
    // agar save menulis versi yang SUDAH dipatch — tidak saling timpa).
    try { await audit?.finalize({ outcome: result.outcome, terminalReason: result.terminalReason, turn: result.stepCount }) } catch { }
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
