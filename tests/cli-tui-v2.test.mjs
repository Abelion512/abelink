// tests/cli-tui-v2.test.mjs — TUI-V2-1: pure logic (tema, autocomplete,
// slash parser reuse) + smoke entry v2 via pipe. Render JSX (App/PromptRow)
// hanya dijalankan runtime Bun (bin/abelink-tui-v2.tsx), bukan vitest:
// vitest tak mengkompilasi pragma jsxImportSource tanpa tsconfig.
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ABELINK_THEME, TUI_COMMANDS, AUTOCOMPLETE_MAX_ROWS, filterCompletions, shortModel, SIDEBAR_WIDTH, isWide, messageColor, messagePrefix, PROMPT_KEY_BINDINGS, autocompleteTrigger, applyCompletion, moveCompletionIndex, visibleWindow, DIALOG_PANEL_WIDTH, DIALOG_Z_INDEX, DIALOG_KINDS, isDialogKind, dialogVisibleRows, popupHeight, selectedForeground, dialogFooterText, HOME_PLACEHOLDERS, homePlaceholder, homePromptMaxWidth, HOME_TIPS, homeTip, renderMarkdownLines, renderMarkdownText, sessionContextUsage, statusRightText } from '../cli/tui/theme.ts'
import { parseSlashCommand } from '../bin/abelink-tui.mjs'
import { createTuiState, submitLine, effortDialogRows, refreshSessionUsage, touchSessionUsage, switchToSession } from '../cli/tui/engine.mjs'
import { lastTuiSession } from '../cli/core/index.mjs'
import { collapseToolOutput, firstLine } from '../cli/core/index.mjs'
import { estimateLiveTokens } from '../cli/tui/usageStats.mjs'
import { normalizeMode, toggleMode, modeAgentLabel, buildTurnPrompt, PLAN_PROMPT_PREFIX, initWorking, noteWorking, workingLabel, modeStatusText } from '../cli/tui/planMode.mjs'

describe('shortModel (label opencode di dalam prompt box)', () => {
  it('potong prefix provider', () => {
    expect(shortModel('google/gemini-3.8-flash')).toBe('gemini-3.8-flash')
  })
  it('tanpa slash = utuh', () => {
    expect(shortModel('claude-work')).toBe('claude-work')
  })
  it('kosong/null aman', () => {
    expect(shortModel('')).toBe('')
    expect(shortModel(null)).toBe('')
  })
})

describe('ABELINK_THEME', () => {
  it('token port opencode.json dark (single source)', () => {
    expect(ABELINK_THEME.base100).toBe('#161618')
    expect(ABELINK_THEME.primary).toBe('#fab283')
    expect(ABELINK_THEME.success).toBe('#7fd88f')
    expect(ABELINK_THEME.warning).toBe('#f5a742')
    expect(ABELINK_THEME.error).toBe('#e06c75')
  })
  it('frozen (tak termutasi runtime)', () => {
    expect(Object.isFrozen(ABELINK_THEME)).toBe(true)
    expect(Object.isFrozen(TUI_COMMANDS)).toBe(true)
  })
})

describe('filterCompletions', () => {
  it('/ kosong = 10 baris pertama (cap popup)', () => {
    expect(filterCompletions('/').length).toBe(AUTOCOMPLETE_MAX_ROWS)
    expect(filterCompletions('/').map((c) => c.name)).toEqual(
      TUI_COMMANDS.slice(0, AUTOCOMPLETE_MAX_ROWS).map((c) => c.name),
    )
  })
  it('/m = /model + /models', () => {
    const names = filterCompletions('/m').map((c) => c.name)
    expect(names).toEqual(['/model', '/models'])
  })
  it('case-insensitive: /EFF = /effort', () => {
    expect(filterCompletions('/EFF').map((c) => c.name)).toEqual(['/effort'])
  })
  it('/x = [] (tak ada perintah itu)', () => {
    expect(filterCompletions('/x')).toEqual([])
  })
  it('fuzzy: /mdl cocok /model + /models (subsequence nama)', () => {
    const names = filterCompletions('/mdl').map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['/model', '/models']))
  })
  it('fuzzy atas deskripsi: /sesi cocok /sessions + /continue', () => {
    const names = filterCompletions('/sesi').map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['/sessions', '/continue']))
  })
  it('cap 10 baris (AUTOCOMPLETE_MAX_ROWS)', () => {
    expect(AUTOCOMPLETE_MAX_ROWS).toBe(10)
    expect(filterCompletions('/').length).toBeLessThanOrEqual(10)
  })
  it('tanpa leading / = [] (prompt biasa)', () => {
    expect(filterCompletions('halo')).toEqual([])
    expect(filterCompletions('')).toEqual([])
  })
})

describe('visibleWindow (jendela picker model)', () => {  it('daftar pendek -> seluruh baris', () => {
    expect(visibleWindow(0, 5, 12)).toEqual({ start: 0, end: 5 })
  })
  it('daftar panjang -> jendela ukuran `size`, pilihan selalu terlihat', () => {
    const w = visibleWindow(0, 100, 12)
    expect(w.end - w.start).toBe(12)
    expect(w.start).toBe(0)
    const mid = visibleWindow(50, 100, 12)
    expect(mid.start).toBeLessThanOrEqual(50)
    expect(mid.end).toBeGreaterThan(50)
    expect(mid.end - mid.start).toBe(12)
  })
  it('index di ujung kanan tidak melewati batas', () => {
    expect(visibleWindow(99, 100, 12)).toEqual({ start: 88, end: 100 })
  })
  it('input tak masuk akal -> aman (index di-clamp, size minimal 1)', () => {
    expect(visibleWindow(-5, 0, 12)).toEqual({ start: 0, end: 0 })
    expect(visibleWindow(999, 10, 4)).toEqual({ start: 6, end: 10 })
    expect(visibleWindow(0, 10, 0)).toEqual({ start: 0, end: 1 })
  })
})

describe('dialog tengah CenterDialog (slice 3)', () => {
  it('konstanta ikut opencode dialog.tsx (lebar 60, zIndex 3000)', () => {
    expect(DIALOG_PANEL_WIDTH).toBe(60)
    expect(DIALOG_Z_INDEX).toBe(3000)
  })
  it('DIALOG_KINDS = model/commands/sessions/effort/confirm; isDialogKind selektif', () => {
    expect([...DIALOG_KINDS].sort()).toEqual(['commands', 'confirm', 'effort', 'model', 'sessions'])
    for (const k of ['model', 'commands', 'sessions', 'effort', 'confirm']) expect(isDialogKind(k)).toBe(true)
    expect(isDialogKind('other')).toBe(false)
    expect(isDialogKind('')).toBe(false)
  })
  it('dialogVisibleRows = min(rows, floor(height/2)-6), minimal 1', () => {
    // height 24 -> cap 6; height 40 -> cap 14.
    expect(dialogVisibleRows(100, 24)).toBe(6)
    expect(dialogVisibleRows(3, 24)).toBe(3)
    expect(dialogVisibleRows(100, 40)).toBe(14)
    expect(dialogVisibleRows(0, 24)).toBe(0)
    expect(dialogVisibleRows(5, 8)).toBe(1)
  })
  it('effortDialogRows: 7 level + penanda aktif + filter', async () => {
    const s = createTuiState({ effort: 'high' })
    const all = await effortDialogRows(s)
    expect(all.map((r) => r.id)).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto'])
    expect(all.find((r) => r.id === 'high').section).toMatch(/aktif/)
    const filtered = await effortDialogRows(s, 'xh')
    expect(filtered.map((r) => r.id)).toEqual(['xhigh'])
  })
})

describe('layout opencode (sidebar 42, wide > 120)', () => {
  it('konstanta ikut routes/session + sidebar.tsx', () => {
    expect(SIDEBAR_WIDTH).toBe(42)
    expect(isWide(121)).toBe(true)
    expect(isWide(120)).toBe(false)
    expect(isWide(80)).toBe(false)
  })
})

describe('messageColor/messagePrefix (scrollbox per role)', () => {
  it('paritas opencode: tanpa prefix dekoratif, warna per role', () => {
    for (const r of ['user', 'error', 'shell', 'meta', 'info', 'assistant']) {
      expect(messagePrefix(r)).toBe('')
    }
    expect(messageColor('error')).toBe(ABELINK_THEME.error)
    expect(messageColor('user')).toBe(ABELINK_THEME.text)
  })
})

describe('engine submitLine (stub, tanpa network)', () => {
  const stubRunTurn = async () => ({
    reply: 'stub-reply', outcome: 'completed', terminalReason: 'answer', stepCount: 1, toolCallsCount: 0,
  })
  const deps = (over = {}) => ({
    runTurn: stubRunTurn,
    resolveFileRefs: (text) => ({ ok: true, text, attached: [] }),
    aliases: { gemini: 'google/gemini-3.8-flash' },
    homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-tui-')),
    ...over,
  })

  it('prompt -> user + assistant (tanpa baris meta completion)', async () => {
    const s = createTuiState()
    const r = await submitLine(s, 'halo engine', deps())
    expect(r.kind).toBe('message')
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(s.messages[1].text).toBe('stub-reply')
  })
  it('/model gemini -> ganti state + info', async () => {
    const s = createTuiState()
    const r = await submitLine(s, '/model gemini', deps({ fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }) }))
    expect(r.kind).toBe('message')
    expect(s.model).toBe('google/gemini-3.8-flash')
    expect(s.messages.at(-1).role).toBe('info')
  })
  it('/model tanpa arg -> tampilkan aktif + sumber', async () => {
    const s = createTuiState()
    await submitLine(s, '/model', deps())
    expect(s.messages.at(-1).text).toContain('Model aktif')
  })
  it('/model qwen (katalog stub) -> id + capabilities + recent + persist', async () => {
    const s = createTuiState()
    // Katalog penuh kini opt-in (/models --all); capabilities dari katalog
    // hanya tersedia saat loadCatalog diaktifkan eksplisit.
    const d = deps({
      loadCatalog: true,
      fetchFn: async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'qwen', capabilities: { reasoning: true, contextWindow: 262144, maxOutput: 384000, thinkingFormat: 'qwen', thinkingCanDisable: true } },
          ],
        }),
      }),
    })
    await submitLine(s, '/model qwen', d)
    expect(s.model).toBe('qwen')
    expect(s.modelCapabilities).toMatchObject({ thinkFmt: 'qwen', maxOut: 384000 })
    expect(s.recentModels).toEqual(['qwen'])
    const saved = JSON.parse(fs.readFileSync(path.join(d.homeDir, '.config', 'abelink', 'cli.json'), 'utf8'))
    expect(saved.model).toBe('qwen')
    expect(saved.recentModels).toEqual(['qwen'])
    expect(s.messages.at(-1).text).toContain('katalog')
  })
  it('/model gemini-web -> tolak eksplisit (GUI-only)', async () => {
    const s = createTuiState()
    const r = await submitLine(s, '/model gemini-web', deps({ fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }) }))
    expect(r.role).toBe('error')
    expect(s.messages.at(-1).text).toContain('GUI')
  })
  it('/effort ultra -> flag lokal + max_tokens + persist', async () => {
    const s = createTuiState()
    const d = deps()
    await submitLine(s, '/effort ultra', d)
    expect(s.effort).toBe('ultra')
    expect(s.ultraLocal).toBe(true)
    const saved = JSON.parse(fs.readFileSync(path.join(d.homeDir, '.config', 'abelink', 'cli.json'), 'utf8'))
    expect(saved.effort).toBe('ultra')
    expect(s.messages.at(-1).text).toContain('65536')
  })
  it('warning cache muncul bila history non-kosong', async () => {
    const s = createTuiState({ history: [{ role: 'user', content: 'hi' }] })
    await submitLine(s, '/model gemini', deps({ fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }) }))
    expect(s.messages.at(-1).text).toContain('prompt cache')
  })
  it('/effort xhigh -> ganti; /effort bad -> error', async () => {
    const s = createTuiState()
    await submitLine(s, '/effort xhigh', deps())
    expect(s.effort).toBe('xhigh')
    const r = await submitLine(s, '/effort ngawur', deps())
    expect(r.role).toBe('error')
  })
  it('/new reset sesi (bersih langsung; kotor -> confirm); /exit -> kind exit', async () => {
    const s = createTuiState()
    await submitLine(s, '/new', deps())
    expect(s.history).toEqual([])
    const dirty = createTuiState({ history: [{ role: 'user', content: 'hi' }] })
    expect((await submitLine(dirty, '/new', deps())).kind).toBe('confirm')
    const r = await submitLine(s, '/exit', deps())
    expect(r.kind).toBe('exit')
  })
  it('/unknown -> error; baris kosong -> noop', async () => {
    const s = createTuiState()
    expect((await submitLine(s, '/ngawur', deps())).role).toBe('error')
    expect((await submitLine(s, '   ', deps())).kind).toBe('noop')
  })
  it('!shell via stub runShell', async () => {
    const s = createTuiState()
    const r = await submitLine(s, '!echo hi', deps({ runShell: async () => 'hi' }))
    expect(r.role).toBe('shell')
    expect(s.messages.at(-1).text).toBe('hi')
  })
  it('/model claude-work -> ditolak (FORBIDDEN_MODELS, tanpa runTurn)', async () => {
    const s = createTuiState()
    let called = false
    const r = await submitLine(s, '/model claude-work', deps({
      fetchFn: async () => ({ ok: true, json: async () => ({ data: [] }) }),
      runTurn: async () => { called = true },
    }))
    expect(r.role).toBe('error')
    expect(s.model).toBe('oc/muse-spark-1.3-contributor-free')
    expect(called).toBe(false)
  })
  it('prompt ditolak bila model terlarang (cli.json/env lama), tanpa runTurn', async () => {
    const s = createTuiState({ model: 'claude-work' })
    let called = false
    const r = await submitLine(s, 'halo', deps({ runTurn: async () => { called = true } }))
    expect(r.role).toBe('error')
    expect(called).toBe(false)
    expect(s.messages.at(-1).text).toContain('dilarang')
  })
  it('file-ref gagal -> error tanpa runTurn', async () => {
    const s = createTuiState()
    let called = false
    const r = await submitLine(s, 'lihat @x', deps({
      resolveFileRefs: () => ({ ok: false, error: '@x tak terbaca.' }),
      runTurn: async () => { called = true },
    }))
    expect(r.role).toBe('error')
    expect(called).toBe(false)
  })
  it('/sessions + /continue + /compact via stub store', async () => {    const seed = { id: 's1', model: 'm1', effort: 'high', outcome: 'completed', updatedAt: 't', messages: [{ role: 'user', content: 'hi' }] }
    const store = {
      listCliSessions: () => [seed],
      loadCliSession: () => seed,
      saveCliSession: () => ({ ok: true }),
    }
    const s = createTuiState()
    await submitLine(s, '/sessions', deps({ store }))
    expect(s.messages.at(-1).text).toContain('s1')
    await submitLine(s, '/continue s1', deps({ store }))
    expect(s.sessionId).toBe('s1')
    expect(s.model).toBe('m1')
    s.history = [{ role: 'user', content: 'a' }]
    await submitLine(s, '/compact', deps({ store }))
    expect(s.messages.at(-1).text).toContain('Histori')
  })
})

describe('PROMPT_KEY_BINDINGS (Shift+Enter=newline; Enter manual di onKeyDown)', () => {
  const find = (name, mods = {}) =>
    PROMPT_KEY_BINDINGS.find((b) =>
      b.name === name &&
      (b.shift === true) === (mods.shift === true) &&
      (b.ctrl === true) === (mods.ctrl === true) &&
      (b.meta === true) === (mods.meta === true))
  it('Enter polos TIDAK di binding (ditangani manual: popup->pilih, tutup->submit)', () => {
    expect(find('return')).toBe(undefined)
    expect(find('linefeed')).toBe(undefined)
  })
  it('Shift/Ctrl/Meta+Enter + Ctrl+J = newline', () => {
    expect(find('return', { shift: true }).action).toBe('newline')
    expect(find('linefeed', { shift: true }).action).toBe('newline')
    expect(find('return', { ctrl: true }).action).toBe('newline')
    expect(find('return', { meta: true }).action).toBe('newline')
    expect(find('j', { ctrl: true }).action).toBe('newline')
  })
})

describe('autocompleteTrigger/applyCompletion/moveCompletionIndex (mode-stack opencode)', () => {
  it('slash: baris / + tanpa spasi', () => {
    expect(autocompleteTrigger('/mod')).toEqual({ mode: 'slash', query: 'mod' })
    expect(autocompleteTrigger('/')).toEqual({ mode: 'slash', query: '' })
    expect(autocompleteTrigger('/model x')).toBe(null)
    expect(autocompleteTrigger('halo')).toBe(null)
  })
  it('file: @ setelah awal/spasi, tanpa spasi setelahnya', () => {
    expect(autocompleteTrigger('lihat @AGE')).toEqual({ mode: 'file', query: 'AGE' })
    expect(autocompleteTrigger('@READ')).toEqual({ mode: 'file', query: 'READ' })
    expect(autocompleteTrigger('a@b')).toBe(null)
    expect(autocompleteTrigger('lihat @A B')).toBe(null)
  })
  it('apply: slash ganti baris terakhir; file ganti token', () => {
    expect(applyCompletion('/mod', { mode: 'slash', query: 'mod' }, '/model')).toBe('/model')
    expect(applyCompletion('a\n/mod', { mode: 'slash', query: 'mod' }, '/models')).toBe('a\n/models')
    expect(applyCompletion('lihat @AGE', { mode: 'file', query: 'AGE' }, '@/AGENTS.md')).toBe('lihat @/AGENTS.md ')
    expect(applyCompletion('x', null, '/model')).toBe('x')
  })
  it('navigasi sirkular', () => {
    expect(moveCompletionIndex(0, 1, 3)).toBe(1)
    expect(moveCompletionIndex(2, 1, 3)).toBe(0)
    expect(moveCompletionIndex(0, -1, 3)).toBe(2)
    expect(moveCompletionIndex(0, 1, 0)).toBe(0)
  })
})

describe('slash parser v1 reuse (kontrak tak berubah di v2)', () => {
  it('/model + /effort + unknown + prompt', () => {
    expect(parseSlashCommand('/model gemini').kind).toBe('model')
    expect(parseSlashCommand('/effort high').kind).toBe('effort')
    expect(parseSlashCommand('/nope').kind).toBe('unknown')
    expect(parseSlashCommand('halo dunia').kind).toBe('prompt')
  })
  it('/plan + /build -> kind plan/build', () => {
    expect(parseSlashCommand('/plan').kind).toBe('plan')
    expect(parseSlashCommand('/build').kind).toBe('build')
  })
})

describe('stream D plan/build + working (cli/tui/planMode.mjs)', () => {
  const dRunTurn = async () => ({
    reply: 'stub-reply', outcome: 'completed', terminalReason: 'answer', stepCount: 1, toolCallsCount: 0,
  })
  const dDeps = (over = {}) => ({
    runTurn: dRunTurn,
    resolveFileRefs: (text) => ({ ok: true, text, attached: [] }),
    homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-tui-')),
    ...over,
  })
  it('normalize/toggle/label murni', () => {
    expect(normalizeMode('plan')).toBe('plan')
    expect(normalizeMode('PLAN')).toBe('plan')
    expect(normalizeMode('ngawur')).toBe('build')
    expect(normalizeMode(null)).toBe('build')
    expect(toggleMode('build')).toBe('plan')
    expect(toggleMode('plan')).toBe('build')
    expect(modeAgentLabel('plan')).toBe('Plan')
    expect(modeAgentLabel('build')).toBe('Build')
  })
  it('build passthrough; plan = prefix + prompt', () => {
    expect(buildTurnPrompt('build', 'hi')).toBe('hi')
    const p = buildTurnPrompt('plan', 'hi')
    expect(p.startsWith(PLAN_PROMPT_PREFIX)).toBe(true)
    expect(p).toContain('hi')
  })
  it('working label: idle -> fallback; step+tool terisi', () => {
    expect(workingLabel(null)).toBe('working…')
    expect(workingLabel(initWorking())).toBe('working…')
    expect(workingLabel({ steps: 3, tool: 'read' })).toBe('working… step 3 · read')
    expect(workingLabel({ steps: 2, tool: null })).toBe('working… step 2')
  })
  it('noteWorking: step max, tool terakhir, non-tool tak hapus tool', () => {
    const w = initWorking()
    noteWorking(w, { step: 2, kind: 'tool', tool: 'grep' })
    expect(w).toEqual({ steps: 2, tool: 'grep' })
    // step record mundur (n=1 < max 2) -> max bertahan; tool tak terhapus.
    noteWorking(w, { step: 1, kind: 'decision' })
    expect(w).toEqual({ steps: 2, tool: 'grep' })
    // record tanpa step.number -> increment; tool baru gantikan yang lama.
    noteWorking(w, { kind: 'tool', tool: 'read' })
    expect(w).toEqual({ steps: 3, tool: 'read' })
  })
  it('/plan toggle mode + pesan jujur; /plan lagi idempotent', async () => {
    const s = createTuiState()
    expect(s.mode).toBe('build')
    await submitLine(s, '/plan', dDeps())
    expect(s.mode).toBe('plan')
    expect(s.messages.at(-1).text).toContain('engine belum menahan')
    await submitLine(s, '/plan', dDeps())
    expect(s.mode).toBe('plan')
    expect(s.messages.at(-1).text).toContain('Sudah mode PLAN')
  })
  it('/build kembali + plan prefix sampai ke runTurn', async () => {
    const s = createTuiState({ mode: 'plan' })
    let got = null
    await submitLine(s, 'rancang X', dDeps({ runTurn: async (st, prompt) => { got = prompt; return dRunTurn() } }))
    expect(String(got).startsWith(PLAN_PROMPT_PREFIX)).toBe(true)
    await submitLine(s, '/build', dDeps())
    expect(s.mode).toBe('build')
    expect(modeStatusText('build')).toContain('BUILD')
    got = null
    await submitLine(s, 'jalan X', dDeps({ runTurn: async (st, prompt) => { got = prompt; return dRunTurn() } }))
    expect(got).toBe('jalan X')
  })
})

describe('layar awal tengah HomeView (slice 4, pola opencode home.tsx)', () => {
  it('HOME_PLACEHOLDERS frozen + non-kosong', () => {
    expect(HOME_PLACEHOLDERS.length).toBeGreaterThan(0)
    expect(Object.isFrozen(HOME_PLACEHOLDERS)).toBe(true)
  })
  it('homePlaceholder melingkar (0, wrap, negatif)', () => {
    expect(homePlaceholder(0)).toBe(HOME_PLACEHOLDERS[0])
    expect(homePlaceholder(HOME_PLACEHOLDERS.length)).toBe(HOME_PLACEHOLDERS[0])
    expect(homePlaceholder(-1)).toBe(HOME_PLACEHOLDERS[HOME_PLACEHOLDERS.length - 1])
  })
  it('homePromptMaxWidth: default 75; auto = max(75, 70% lebar)', () => {
    expect(homePromptMaxWidth(80)).toBe(75)
    expect(homePromptMaxWidth(80, null)).toBe(75)
    expect(homePromptMaxWidth(80, 60)).toBe(60)
    expect(homePromptMaxWidth(100, 'auto')).toBe(75)
    expect(homePromptMaxWidth(200, 'auto')).toBe(140)
  })
})

describe('popup slash paritas opencode (stream C)', () => {
  it('selectedForeground = luminance (port theme/index.ts)', () => {
    expect(selectedForeground('#ffffff')).toBe('#000000')
    expect(selectedForeground('#000000')).toBe('#ffffff')
  })
  it('popupHeight = min(10, jumlah, ruang di atas)', () => {
    expect(popupHeight(14, 24)).toBe(10)
    expect(popupHeight(3, 24)).toBe(3)
    expect(popupHeight(10, 4)).toBe(4)
    expect(popupHeight(0, 24)).toBe(1)
  })
})

describe('dialogFooterText (stale/total/error jujur, stream C)', () => {
  it('loading -> memuat…', () => {
    expect(dialogFooterText({ loading: true })).toBe('memuat…')
  })
  it('baris ada -> hint + (N baris dari TOTAL model, katalog stale)', () => {
    const t = dialogFooterText({ rowCount: 5, total: 1300, stale: true })
    expect(t).toContain('(5 baris dari 1300 model, katalog stale)')
  })
  it('error tampil walau baris ada (dulu tertelan)', () => {
    const t = dialogFooterText({ rowCount: 3, error: 'Discovery gagal' })
    expect(t).toContain('Discovery gagal')
  })
  it('kosong -> empty-state + error opsional', () => {
    expect(dialogFooterText({ rowCount: 0 })).toContain('Tidak ada yang cocok')
    expect(dialogFooterText({ rowCount: 0, error: 'x' })).toContain('(x)')
  })
})

describe('batch C: markdown ringan (tanpa dep, pola session-ui)', () => {
  it('link [t](u) -> "t (u)"; heading/hr dilucuti', () => {
    const lines = renderMarkdownLines('[Abelink](https://example.com/x)\n# Judul\n---')
    expect(lines[0].text).toBe('Abelink (https://example.com/x)')
    expect(lines[1].text).toBe('Judul')
    expect(lines[2].text).toBe('─'.repeat(24))
  })
  it('list "-" dan enumerasi "1." + nested quote ">>"', () => {
    const lines = renderMarkdownLines('- apel\n1. pertama\n>> dalam\n> luar')
    expect(lines[0].text).toBe('• apel')
    expect(lines[1].text).toBe('1. pertama')
    expect(lines[2].text).toContain('dalam')
    expect(lines[3].text).toContain('luar')
  })
  it('fence multi-baris dijaga utuh + flag code', () => {
    const lines = renderMarkdownLines('```js\nconst a = 1;\nconst b = 2;\n```')
    expect(lines.length).toBe(2)
    expect(lines.every((l) => l.code)).toBe(true)
    expect(lines[0].text).toContain('[js]')
    expect(renderMarkdownText('```\nx\n```')).toBe('  x')
  })
  it('inline code dilindungi dari strip bold/underscore', () => {
    expect(renderMarkdownLines('pakai `__init__` di sini')[0].text).toBe('pakai __init__ di sini')
    expect(renderMarkdownLines('var `foo_bar_baz` tetap')[0].text).toBe('var foo_bar_baz tetap')
  })
})

describe('batch C: tips rotasi dari file (bukan hardcode lokal)', () => {
  it('HOME_TIPS frozen + non-kosong; homeTip melingkar', () => {
    expect(HOME_TIPS.length).toBeGreaterThan(0)
    expect(Object.isFrozen(HOME_TIPS)).toBe(true)
    expect(homeTip(0)).toBe(HOME_TIPS[0])
    expect(homeTip(HOME_TIPS.length)).toBe(HOME_TIPS[0])
    expect(homeTip(-1)).toBe(HOME_TIPS[HOME_TIPS.length - 1])
  })
})

describe('batch C: tool display compact satu baris', () => {
  it('firstLine: baris pertama non-kosong, collapse whitespace, cap + …', () => {
    expect(firstLine('\n  halo   dunia\nbaris2')).toBe('halo dunia')
    expect(firstLine('')).toBe('—')
    const long = firstLine('x'.repeat(200), 10)
    expect(long.endsWith('…')).toBe(true)
    expect(Array.from(long).length).toBe(10)
  })
  it('collapseToolOutput: port verbatim opencode (overflow flag)', () => {
    expect(collapseToolOutput('a\nb', 5, 100)).toEqual({ output: 'a\nb', overflow: false })
    const cut = collapseToolOutput('a\nb\nc\nd', 2, 100)
    expect(cut.overflow).toBe(true)
    expect(cut.output).toBe('a\nb\n…')
  })
})

describe('batch C: context usage jujur (tanpa fabrikasi)', () => {
  it('sessionContextUsage: persen hanya bila ctx dikenal', () => {
    expect(sessionContextUsage(5000, 100000)).toEqual({ label: '~5,000 tokens (est.)', pct: '5% used' })
    expect(sessionContextUsage(5000, null).pct).toBeNull()
    expect(sessionContextUsage(0, 0).pct).toBeNull()
  })
  it('status line kanan: /status saja (LSP/MCP dihapus, redundant)', () => {
    expect(statusRightText({})).toBe('/status')
  })
  it('estimateLiveTokens: chars/2.5 dari history+messages', () => {
    expect(estimateLiveTokens({ history: [{ content: 'ab' }], messages: [{ text: 'cdef' }] })).toBe(2)
    expect(estimateLiveTokens()).toBe(0)
  })
  it('refreshSessionUsage: sinkron, ctx sticky dari capabilities', () => {
    const s = createTuiState({ history: [{ content: 'x'.repeat(25) }], modelCapabilities: { ctx: 1000 } })
    refreshSessionUsage(s)
    expect(s.usage.tokensEst).toBe(10)
    expect(s.usage.modelCtx).toBe(1000)
  })
  it('refreshSessionUsage: ctx null bila tak dikenal (jujur)', () => {
    const s = createTuiState()
    refreshSessionUsage(s)
    expect(s.usage.tokensEst).toBe(0)
    expect(s.usage.modelCtx).toBeNull()
  })
  it('switchToSession: pindah histori + segarkan usage', () => {
    const s = createTuiState()
    const n = switchToSession(s, { id: 'abc', messages: [{ role: 'user', content: 'halo' }] })
    expect(s.sessionId).toBe('abc')
    expect(n).toBe(1)
    expect(s.usage.tokensEst).toBeGreaterThan(0)
  })
  it('lastTuiSession: null bila kosong; terbaru dari store stub', async () => {
    expect(await lastTuiSession({ async listCliSessions() { return [] } })).toBeNull()
    const store = {
      async listCliSessions() {
        return [
          { id: 'lama', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'baru', updatedAt: '2026-09-28T00:00:00.000Z' },
        ]
      },
    }
    const last = await lastTuiSession(store)
    expect(last.id).toBe('baru')
  })
  it('touchSessionUsage: ctx dari katalog disk stub', async () => {
    const s = createTuiState({ model: 'm-x' })
    const fsMod = { readFileSync: (p) => (String(p).endsWith('models-cache.json')
      ? JSON.stringify({ fetchedAt: Date.now(), models: [{ id: 'm-x', capabilities: { contextWindow: 8000 } }] })
      : '{}') }
    await touchSessionUsage(s, { fsMod, homeDir: '/tmp/batch-c-home' })
    expect(s.usage.modelCtx).toBe(8000)
  })
})

describe('bin/abelink-tui-v2.tsx (E2E pipe)', () => {
  // ponytail: execFile `input:` hang di env ini (bahkan `bun -e` trivial) —
  // pakai spawn + stdin.end() eksplisit.
  // ABELINK_HOME isolasi: persist/cache E2E tak sentuh HOME asli.
  const run = (input, extraEnv = {}) =>
    new Promise((resolve) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-e2e-'))
      const c = spawn('bun', ['bin/abelink-tui-v2.tsx'], {
        timeout: 90000,
        env: { ...process.env, ABELINK_HOME: home, ...extraEnv },
      })
      let stdout = ''
      let stderr = ''
      c.stdout.on('data', (d) => { stdout += String(d ?? '') })
      c.stderr.on('data', (d) => { stderr += String(d ?? '') })
      c.on('error', (err) => resolve({ code: 1, stdout, stderr: stderr + String(err?.message || err) }))
      c.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
      c.stdin.write(input)
      c.stdin.end()
    })
  // Timeout zamanikan: spawn bun + startup TUI di bawah beban suite paralel
  // penuh bisa >30s (flake saat verify gate post-#62) — margin, bukan regressi.
  it('pipe kosong -> exit 0', async () => {
    const r = await run('')
    expect(r.code).toBe(0)
  }, 60000)
  it('pipe /model (tanpa sidecar) -> info + exit 0', async () => {
    const r = await run('/model\n')
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Model aktif')
  }, 60000)
  it('pipe /effort + /exit -> exit 0', async () => {
    const r = await run('/effort high\n/exit\n')
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Effort: high')
  }, 45000)
  // HERMETIK + DETERMINISTIK (dulu "live 9Router"): endpoint discovery diarahkan
  // ke port mati, jadi hasilnya SELALU jalur gagal — bukan tergantung 9Router
  // hidup di laptop pengembang. Versi lama menuntut string 'Katalog' sehingga
  // hijau lokal tapi merah di CI (B-8). Kontrak yang diuji di sini adalah
  // KEJUJURAN: sebut discovery gagal + pakai alias statis, jangan katalog palsu.
  // Asersi katalog sungguhan ada di tests/cli-tui-v2.live.test.mjs (`bun run test:live`).
  it('pipe /models kimi (discovery mati) -> jujur + exit 0', async () => {
    const r = await run('/models kimi\n', { ABELINK_MODELS_ENDPOINT: 'http://127.0.0.1:1/v1' })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Model aktif')
    expect(r.stdout).toMatch(/Discovery gagal|alias statis/i)
    expect(r.stdout).not.toContain('Katalog')
  }, 60000)
})

describe('rankFileMatches (port opencode frecency+r ranking)', () => {
  it('prefix basename menang, frecency boost, seri alfabetis', async () => {
    const { rankFileMatches, scoreFileUse } = await import('../cli/tui/theme.ts')
    const now = 1700000000000
    expect(scoreFileUse(null, now)).toBe(0)
    expect(scoreFileUse({ frequency: 2, lastOpen: now }, now)).toBe(2)
    const files = ['src/zebra.ts', 'src/app.ts', 'docs/app.md']
    expect(rankFileMatches(files, 'app', {}, now)).toEqual(['docs/app.md', 'src/app.ts'])
    const usage = { 'src/zebra.ts': { frequency: 10, lastOpen: now } }
    expect(rankFileMatches(files, '', usage, now)[0]).toBe('src/zebra.ts')
  })
})

describe('statusRightText (merge-review Critical #1)', () => {
  it('prop working menang saat busy, chips selain itu', async () => {
    const { statusRightText } = await import('../cli/tui/theme.ts')
    expect(statusRightText({ busy: true, prop: 'working… step 2' })).toBe('working… step 2')
    expect(statusRightText({ busy: false, prop: 'working…' })).toBe('/status')
    expect(statusRightText({})).toBe('/status')
  })
})

describe('abbreviateHome (status line 1 baris)', () => {
  it('ganti $HOME jadi ~, non-prefix utuh', async () => {
    const { abbreviateHome } = await import('../cli/tui/theme.ts')
    expect(abbreviateHome('/home/u/proj', '/home/u')).toBe('~/proj')
    expect(abbreviateHome('/home/u', '/home/u')).toBe('~')
    expect(abbreviateHome('/tmp/x', '/home/u')).toBe('/tmp/x')
    expect(abbreviateHome('', '')).toBe('')
  })
})
