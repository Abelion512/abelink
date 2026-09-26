#!/usr/bin/env bun
/** @jsxImportSource @opentui/solid */
// bin/abelink-tui-v2.tsx — TUI-v2 entry: flags + engine + render OpenTUI.
// State + routing di cli/tui/engine.mjs (submitLine); App.tsx presentational.
// Piped stdin (E2E): tiap baris via submitLine dengan runTurn stub-able,
// lalu exit — cermin perilaku v1 readline.
import { createCliRenderer } from '@opentui/core'
import { createDefaultOpenTuiKeymap } from '@opentui/keymap/opentui'
import { KeymapProvider } from '@opentui/keymap/solid'
import { render } from '@opentui/solid'
import { createSignal } from 'solid-js'
import { App } from '../cli/tui/App.tsx'
import { createTuiState, submitLine } from '../cli/tui/engine.mjs'
import { parseTuiArgs, parseSlashCommand, parseShellLine, TUI_HELP, TUI_VERSION } from '../bin/abelink-tui.mjs'
import type {
  PickerRow,
  PickerState,
  SidecarClient,
  TuiCliOptions,
  TuiFileConfig,
  TuiProgressEvent,
  TuiState
} from '../cli/tui/types.ts'

export { TUI_VERSION }
export const TUI_V2_VERSION = TUI_VERSION

// Modul headless (masih .js sampai M4). Dipakai lewat `Partial` karena beberapa
// jalur memuatnya dengan `.catch(() => ({}))` saat modul tak tersedia.
type HeadlessCliModule = typeof import('../src/api/ai/headlessCli.js')

/** Hasil `resolveCliAuth` (src/api/ai/headlessCli.js — masih JS). */
interface CliAuth {
  provider?: string | null
  model?: string | null
  modelVersion?: string | null
  apiKey?: string | null
  customEndpoint?: string | null
}

interface BootstrapDeps {
  headless?: Partial<HeadlessCliModule>
}

/** Deps yang dioper ke `submitLine` (engine.mjs). */
interface TuiDeps {
  auth: CliAuth
  aliases: Record<string, string>
  maxTurns?: number
  helpText: string
  homeDir: string | null
  cliConfig: TuiFileConfig
  sidecar?: SidecarClient | null
  onEvent?: (e: TuiProgressEvent) => void
  /** `/models --all` = opt-in muat katalog penuh (default: hanya yang dipakai). */
  loadCatalog?: boolean
}

export async function bootstrapTuiState(cliOptions: TuiCliOptions, deps: BootstrapDeps = {}) {
  const headless = deps.headless || await import('../src/api/ai/headlessCli.js').catch(() => ({} as Partial<HeadlessCliModule>))
  const {
    loadCliFileConfig = null,
    resolveCliAuth = null,
    loadNineRouterKey = null,
    loadHeadlessMemories = null,
    MODEL_ALIASES = null,
    DEFAULT_CLI_MODEL = null,
  } = headless
  let fileConfig: TuiFileConfig = {}
  try {
    if (typeof loadCliFileConfig === 'function') fileConfig = (loadCliFileConfig({ cwd: cliOptions.workspace, homeDir: cliOptions.homeDir || undefined }) || {}) as TuiFileConfig
  } catch { fileConfig = {} }
  const auth: CliAuth = typeof resolveCliAuth === 'function'
    ? resolveCliAuth({
      // Hanya override bila user set flag eksplisit — sisanya biarkan GUI
      // (shared.json) / cli.json / default menentukan (adopsi satu produk).
      flags: {
        provider: cliOptions.providerExplicit ? cliOptions.provider : null,
        model: cliOptions.modelExplicit ? cliOptions.model : null,
        modelVersion: null,
        apiKey: null,
      },
      env: process.env,
      fileConfig,
    })
    : { provider: cliOptions.provider, model: cliOptions.model, modelVersion: null, apiKey: null }
  if (!auth.apiKey && typeof loadNineRouterKey === 'function') {
    try { auth.apiKey = await loadNineRouterKey() } catch {}
  }
  let headlessMemories: unknown[] = []
  try {
    if (typeof loadHeadlessMemories === 'function') {
      headlessMemories = await loadHeadlessMemories({ workspaceRoot: cliOptions.workspace })
    }
  } catch { headlessMemories = [] }
  const state: TuiState = createTuiState({
    provider: auth.provider || cliOptions.provider,
    model: auth.model || cliOptions.model || DEFAULT_CLI_MODEL || 'oc/muse-spark-1.3-contributor-free',
    effort: (cliOptions.effortExplicit ? cliOptions.effort : null) || fileConfig.effort || cliOptions.effort,
    workspace: cliOptions.workspace,
    recentModels: Array.isArray(fileConfig.recentModels) ? fileConfig.recentModels : [],
  })
  return {
    state,
    auth,
    aliases: MODEL_ALIASES || {},
    headlessMemories,
    maxTurns: cliOptions.maxTurns,
    fileConfig,
  }
}

async function main() {
  const cliOptions = parseTuiArgs(process.argv) as TuiCliOptions
  const { promises: fs } = await import('node:fs')
  try { await fs.mkdir(cliOptions.workspace, { recursive: true }) } catch {}

  const piped = !process.stdin.isTTY
  let pipedText = ''
  if (piped) {
    process.stdin.resume()
    for await (const chunk of process.stdin) pipedText += String(chunk ?? '')
  }
  const lines = pipedText.split('\n').map((l) => String(l ?? '')).filter((l) => l.trim())

  // ABELINK_HOME: override HOME untuk persist/cache (isolasi E2E; default HOME).
  const e2eHome = process.env.ABELINK_HOME || null
  const boot = await bootstrapTuiState({ ...cliOptions, homeDir: e2eHome })
  const { state, auth, aliases, maxTurns } = boot
  // Keputusan owner: ID terlarang ditolak sebelum render (bukan saat prompt
  // pertama) supaya pesannya jelas dan tidak ada request yang terkirim.
  const headlessMod = await import('../src/api/ai/headlessCli.js').catch(() => ({} as Partial<HeadlessCliModule>))
  if (typeof headlessMod.isForbiddenModel === 'function' && headlessMod.isForbiddenModel(state.model)) {
    // `!` disengaja: modul ini didefinisikan berpasangan (isForbiddenModel +
    // forbiddenModelError). Perilaku lama = apa pun dari modul itu; `!` menjaga
    // runtime tetap identik (bukan menghaluskan jalur error).
    console.error(`[TUI] ${headlessMod.forbiddenModelError!(state.model)}`)
    process.exit(2)
  }
  // cliConfig (recent/fav) dibaca bootstrap dari HOME yang sama.
  const cliConfig = boot.fileConfig || {}
  const deps: TuiDeps = { auth, aliases, maxTurns, helpText: TUI_HELP, homeDir: e2eHome, cliConfig }
  const { parseSlashCommand, parseShellLine } = await import('../bin/abelink-tui.mjs')

  if (piped) {
    // Lazy sidecar: hanya bila ada prompt (bukan slash-info murni).
    let sidecar: SidecarClient | null = null
    const getSidecar = async (): Promise<SidecarClient> => {
      if (!sidecar) {
        const { createSidecarClient } = await import('../bin/abelink-tui.mjs')
        sidecar = createSidecarClient() as SidecarClient
      }
      return sidecar
    }
    try {
      for (const l of lines) {
        // Slash-info/shell tak butuh engine; spawn hanya saat baris ini
        // prompt model (parse lokal, tanpa network).
        const needEngine = parseShellLine(l) === null && parseSlashCommand(l).kind === 'prompt' && l.trim()
        const r = await submitLine(state, l, {
          ...deps,
          sidecar: needEngine ? await getSidecar() : null,
          onEvent: (e: TuiProgressEvent) => { if (e?.line) console.log(e.line) },
        })
        if (r?.kind === 'exit') break
      }
      for (const m of state.messages) {
        if (m.role === 'user') console.log(`> ${m.text}`)
        else if (m.role === 'assistant') console.log(`\n${m.text}\n`)
        else if (m.role === 'error') console.error(`[ERROR]: ${m.text}`)
        else if (m.role !== 'meta') console.log(`[${m.role}] ${m.text}`)
      }
    } finally {
      // Cast disengaja: assignment lewat closure getSidecar() tak terlihat oleh
      // control-flow analysis TS, sehingga `sidecar` di sini dianggap tetap null.
      try { (sidecar as SidecarClient | null)?.dispose?.() } catch {}
    }
    process.exit(0)
  }

  const renderer = await createCliRenderer()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  let exited = false
  let sidecar: SidecarClient | null = null
  const exit = () => {
    if (exited) return
    exited = true
    // Sidecar child menahan event loop parent: tanpa dispose, `/exit`/Ctrl-C
    // meninggalkan proses bun sidecar/engine.mjs yang nyangkut
    // (terukur 2026-09-26: 3 proses orphan dari sesi sebelumnya).
    try { sidecar?.dispose?.() } catch {}
    try { renderer.destroy() } catch {}
  }

  const [tick, setTick] = createSignal(0)
  const [busy, setBusy] = createSignal(false)
  const [picker, setPicker] = createSignal<PickerState | null>(null)
  const bump = () => setTick((t) => t + 1)
  // Repaint tiap engine push (prompt user, info, error) — bukan hanya saat
  // event agent tiba, supaya TUI tidak tampak beku selama turn panjang.
  state.onPush = () => bump()
  const getSidecar = async (): Promise<SidecarClient> => {
    if (!sidecar) {
      const { createSidecarClient } = await import('../bin/abelink-tui.mjs')
      sidecar = createSidecarClient() as SidecarClient
    }
    return sidecar
  }

  // Overlay generik (pola opencode dialog): satu mekanisme render di App untuk
  // (1) picker model, (2) command palette ctrl+p, (3) dialog sesi /sessions.
  // `kind` menentukan aksi Enter. baseRows = sumber filter lokal (commands/sesi).
  let baseRows: PickerRow[] = []
  const filterRows = (q: string): PickerRow[] => {
    const s = String(q || '').trim().toLowerCase()
    if (!s) return baseRows
    return baseRows.filter((r) =>
      String(r.label || '').toLowerCase().includes(s) ||
      String(r.id || '').toLowerCase().includes(s) ||
      String(r.section || '').toLowerCase().includes(s))
  }
  const loadPickerRows = async (query = ''): Promise<{ rows?: PickerRow[] }> => {
    const { modelPickerRows } = await import('../cli/tui/engine.mjs')
    return modelPickerRows(state, deps, query)
  }
  const openPicker = async (query = '') => {
    setPicker({ kind: 'model', title: 'pilih model', rows: [], index: 0, query: String(query || ''), loading: true })
    bump()
    try {
      const res = await loadPickerRows(query)
      baseRows = res.rows || []
      setPicker({ ...res, kind: 'model', title: 'pilih model', index: 0, query: String(query || ''), loading: false })
    } catch (err: unknown) {
      setPicker(null)
      state.messages.push({ role: 'error', text: `Picker model gagal: ${String((err as Error)?.message || err)}` })
    }
    bump()
  }
  // ctrl+p / `/commands`: daftar perintah TUI (fungsi nyata, bukan hiasan).
  const openCommands = async () => {
    const { TUI_COMMANDS } = await import('../cli/tui/theme.mjs')
    baseRows = TUI_COMMANDS.map((c: { name: string; desc: string }) => ({ id: c.name, label: c.name, section: c.desc }))
    setPicker({
      kind: 'commands', title: 'perintah', kindHint: '↑↓ pilih · Enter jalankan · Esc batal · ketik untuk filter',
      rows: baseRows, index: 0, query: '', loading: false,
    })
    bump()
  }
  // `/sessions`: dialog sesi tersimpan (Enter = lanjut sesi).
  const openSessions = async () => {
    const { listTuiSessions } = await import('../bin/abelink-tui.mjs')
    let sessions: Array<{ id: string; outcome?: string; updatedAt?: string; prompt?: string }> = []
    try {
      const r = await listTuiSessions((deps as { store?: unknown }).store || null)
      sessions = r?.sessions || []
    } catch { /* tanpa store -> daftar kosong */ }
    baseRows = sessions.map((s) => ({ id: s.id, label: s.id, section: `${s.outcome || '?'} · ${s.updatedAt || ''} · ${(s.prompt || '').slice(0, 48)}` }))
    setPicker({
      kind: 'sessions', title: 'sesi tersimpan', kindHint: '↑↓ pilih · Enter lanjut · Esc batal · ketik untuk filter',
      rows: baseRows, index: 0, query: '', loading: false,
      hint: baseRows.length ? null : 'Belum ada sesi tersimpan untuk workspace ini.',
    })
    bump()
  }
  const closePicker = () => { setPicker(null); bump() }
  const movePicker = (delta: number) => {
    const p = picker()
    if (!p || !p.rows?.length) return
    const n = p.rows.length
    setPicker({ ...p, index: ((((p.index ?? 0) + delta) % n) + n) % n })
    bump()
  }
  const selectPicker = async () => {
    const p = picker()
    if (!p || !p.rows?.length) return
    const row = p.rows[Math.min(Math.max(0, p.index ?? 0), p.rows.length - 1)]
    const kind = p.kind || 'model'
    closePicker()
    const rowId = String(row.id ?? '')
    if (kind === 'commands') { await handleSubmit(rowId); return }
    if (kind === 'sessions') { await handleSubmit(`/continue ${rowId}`); return }
    await handleSubmit(`/model ${rowId}`)
  }
  const filterPicker = async (text: string) => {
    const p = picker()
    if (!p) return
    const q = String(text || '').trim()
    if (q === p.query) return
    if ((p.kind || 'model') === 'model') {
      try {
        const res = await loadPickerRows(q)
        baseRows = res.rows || []
        setPicker({ ...res, kind: 'model', title: 'pilih model', index: 0, query: q, loading: false })
      } catch {
        setPicker({ ...p, query: q })
      }
    } else {
      setPicker({ ...p, query: q, rows: filterRows(q), index: 0 })
    }
    bump()
  }

  const handleSubmit = async (text: string) => {
    if (busy()) return
    const line = String(text ?? '')
    // `/models --all` = opt-in muat katalog penuh (default picker hanya model
    // yang pernah dipakai; katalog 1300+ ID tidak dimuat otomatis).
    if (/^\/models\s+(--all|--refresh)\s*$/i.test(line.trim())) {
      deps.loadCatalog = true
      await openPicker('')
      return
    }
    // `/model` atau `/models` tanpa arg = buka picker (bukan teks panjang).
    if (/^\/(model|models)\s*$/.test(line.trim())) {
      await openPicker('')
      return
    }
    // `/sessions` tanpa arg = dialog sesi (Enter lanjut). `/commands` = palette.
    if (/^\/sessions\s*$/i.test(line.trim())) {
      await openSessions()
      return
    }
    if (/^\/commands\s*$/i.test(line.trim())) {
      await openCommands()
      return
    }
    setBusy(true)
    bump()
    try {
      // Sidecar lazy (cermin mode pipe): slash/shell tak butuh engine —
      // jangan spawn proses untuk `/help` atau `/model zen`.
      const needEngine = parseShellLine(line) === null && parseSlashCommand(line).kind === 'prompt' && line.trim()
      const r = await submitLine(state, line, {
        ...deps,
        sidecar: needEngine ? await getSidecar() : null,
        onEvent: (e: TuiProgressEvent) => {
          if (e?.line) {
            state.messages.push({ role: e.type === 'thought' ? 'assistant' : 'meta', text: e.line })
            bump()
          }
        },
      })
      if (r?.kind === 'exit') exit()
    } catch (err: unknown) {
      state.messages.push({ role: 'error', text: String((err as Error)?.message || err) })
    } finally {
      setBusy(false)
      bump()
    }
  }

  await render(
    () => (
      <KeymapProvider keymap={keymap}>
        <App
          messages={() => state.messages}
          tick={tick}
          busy={busy}
          model={() => state.model}
          version={TUI_VERSION}
          sessionId={() => state.sessionId}
          title="Abelink"
          workspace={state.workspace}
          onSubmitLine={handleSubmit}
          onExit={exit}
          picker={picker}
          onPickerMove={movePicker}
          onPickerSelect={selectPicker}
          onPickerCancel={closePicker}
          onPickerFilter={filterPicker}
          onCommands={openCommands}
        />
      </KeymapProvider>
    ),
    renderer,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
