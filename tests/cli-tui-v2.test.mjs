// tests/cli-tui-v2.test.mjs — TUI-V2-1: pure logic (tema, autocomplete,
// slash parser reuse) + smoke entry v2 via pipe. Render JSX (App/PromptRow)
// hanya dijalankan runtime Bun (bin/abelink-tui-v2.tsx), bukan vitest:
// vitest tak mengkompilasi pragma jsxImportSource tanpa tsconfig.
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ABELINK_THEME, TUI_COMMANDS, filterCompletions, shortModel, SIDEBAR_WIDTH, isWide, messageColor, messagePrefix, PROMPT_KEY_BINDINGS, autocompleteTrigger, applyCompletion, moveCompletionIndex, visibleWindow } from '../cli/tui/theme.mjs'
import { parseSlashCommand } from '../bin/abelink-tui.mjs'
import { createTuiState, submitLine } from '../cli/tui/engine.mjs'

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
  it('memakai token DaisyUI abelink (single source)', () => {
    expect(ABELINK_THEME.base100).toBe('#161618')
    expect(ABELINK_THEME.primary).toBe('#0a84ff')
    expect(ABELINK_THEME.success).toBe('#30d158')
    expect(ABELINK_THEME.warning).toBe('#ff9f0a')
    expect(ABELINK_THEME.error).toBe('#ff453a')
  })
  it('frozen (tak termutasi runtime)', () => {
    expect(Object.isFrozen(ABELINK_THEME)).toBe(true)
    expect(Object.isFrozen(TUI_COMMANDS)).toBe(true)
  })
})

describe('filterCompletions', () => {
  it('/ kosong = semua perintah', () => {
    expect(filterCompletions('/').length).toBe(TUI_COMMANDS.length)
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
  it('tanpa leading / = [] (prompt biasa)', () => {
    expect(filterCompletions('halo')).toEqual([])
    expect(filterCompletions('')).toEqual([])
  })
})

describe('visibleWindow (jendela picker model)', () => {
  it('daftar pendek -> seluruh baris', () => {
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

describe('layout opencode (sidebar 42, wide > 120)', () => {
  it('konstanta ikut routes/session + sidebar.tsx', () => {
    expect(SIDEBAR_WIDTH).toBe(42)
    expect(isWide(121)).toBe(true)
    expect(isWide(120)).toBe(false)
    expect(isWide(80)).toBe(false)
  })
})

describe('messageColor/messagePrefix (scrollbox per role)', () => {
  it('user/error/shell/meta/info/assistant', () => {
    expect(messagePrefix('user')).toBe('> ')
    expect(messagePrefix('error')).toBe('× ')
    expect(messagePrefix('shell')).toBe('! ')
    expect(messagePrefix('meta')).toBe('— ')
    expect(messagePrefix('info')).toBe('· ')
    expect(messagePrefix('assistant')).toBe('◆ ')
    expect(messageColor('error')).toBe(ABELINK_THEME.error)
    expect(messageColor('user')).toBe(ABELINK_THEME.primary)
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

  it('prompt -> user + assistant + meta', async () => {
    const s = createTuiState()
    const r = await submitLine(s, 'halo engine', deps())
    expect(r.kind).toBe('message')
    expect(s.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'meta'])
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
  it('/new reset sesi; /exit -> kind exit', async () => {
    const s = createTuiState()
    await submitLine(s, '/new', deps())
    expect(s.history).toEqual([])
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
  it('/sessions + /continue + /compact via stub store', async () => {
    const seed = { id: 's1', model: 'm1', effort: 'high', outcome: 'completed', updatedAt: 't', messages: [{ role: 'user', content: 'hi' }] }
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
  it('pipe kosong -> exit 0', async () => {
    const r = await run('')
    expect(r.code).toBe(0)
  }, 30000)
  it('pipe /model (tanpa sidecar) -> info + exit 0', async () => {
    const r = await run('/model\n')
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Model aktif')
  }, 30000)
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
