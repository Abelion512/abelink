import { describe, it, expect } from 'vitest'
import {
  parseSlashCommand,
  resolveTuiModel,
  parseEffortLevel,
  renderThoughtLine,
  renderStepLine,
  createTuiTurn,
  checkTurnAborted,
  makeAbortedToolResult,
  nextPromptAction,
  sessionToInitialHistory,
  loadTuiSession,
  saveTuiSession,
  listTuiSessions,
  buildAiFetchBody,
  extractFileRefs,
  resolveFileRefs,
  parseShellLine,
  buildAgentsMd,
  TUI_STREAM_ENABLED,
  EFFORT_LEVELS,
  SESSION_MESSAGE_CAP,
  TUI_FILE_REF_MAX_FILES,
  TUI_FILE_REF_MAX_BYTES
} from '../bin/abelink-tui.mjs'

const ALIASES = { gemini: 'google/gemini-3.8-flash', free: 'qwen/qwen3.8-27b:free', auto: 'openrouter/auto' }

function makeStubStore(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    map,
    async loadCliSession(id) { return map.get(id) || null },
    async saveCliSession(s) { map.set(s.id, s) },
    async listCliSessions() { return [...map.values()] }
  }
}

describe('TUI slash parser', () => {
  it.each([
    ['/model', { kind: 'model', arg: null }],
    ['/model gemini', { kind: 'model', arg: 'gemini' }],
    ['/models', { kind: 'models', arg: null }],
    ['/models kimi', { kind: 'models', arg: 'kimi' }],
    ['/effort high', { kind: 'effort', arg: 'high' }],
    ['/effort', { kind: 'effort', arg: null }],
    ['/sessions', { kind: 'sessions' }],
    ['/resume', { kind: 'sessions' }],
    ['/continue abc123', { kind: 'continue', arg: 'abc123' }],
    ['/new', { kind: 'new' }],
    ['/clear', { kind: 'new' }],
    ['/compact', { kind: 'compact' }],
    ['/summarize', { kind: 'compact' }],
    ['/thinking', { kind: 'thinking' }],
    ['/details', { kind: 'details' }],
    ['/editor', { kind: 'editor' }],
    ['/init', { kind: 'init', arg: null }],
    ['/init AGENTS.custom.md', { kind: 'init', arg: 'AGENTS.custom.md' }],
    ['/help', { kind: 'help' }],
    ['/exit', { kind: 'exit' }],
    ['/quit', { kind: 'exit' }],
    ['/q', { kind: 'exit' }]
  ])('parses %s', (line, expected) => {
    const cmd = parseSlashCommand(line)
    expect(cmd.kind).toBe(expected.kind)
    if ('arg' in expected && expected.arg !== undefined) expect(cmd.arg).toBe(expected.arg)
  })

  it('passes non-slash lines through as prompt', () => {
    const cmd = parseSlashCommand('hitung 2+2 dong')
    expect(cmd.kind).toBe('prompt')
    expect(cmd.text).toBe('hitung 2+2 dong')
  })

  it('flags /undo as unsupported (deferred per plan)', () => {
    const cmd = parseSlashCommand('/undo')
    expect(cmd.kind).toBe('unsupported')
  })

  it('flags unknown slash as unknown', () => {
    const cmd = parseSlashCommand('/foobar x')
    expect(cmd.kind).toBe('unknown')
  })
})

describe('/model alias resolve', () => {
  it('resolves known alias via table', () => {
    const r = resolveTuiModel('gemini', ALIASES)
    expect(r.ok).toBe(true)
    expect(r.model).toBe('google/gemini-3.8-flash')
    expect(r.alias).toBe('gemini')
  })

  it('passes unknown id through unchanged', () => {
    const r = resolveTuiModel('openai/gpt-9-custom', ALIASES)
    expect(r.ok).toBe(true)
    expect(r.model).toBe('openai/gpt-9-custom')
    expect(r.alias).toBeNull()
  })

  it('rejects empty input', () => {
    expect(resolveTuiModel('', ALIASES).ok).toBe(false)
    expect(resolveTuiModel(null, ALIASES).ok).toBe(false)
  })
})

describe('/effort validation', () => {
  it.each(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'auto'])('accepts %s', (level) => {
    expect(parseEffortLevel(level)).toEqual({ ok: true, effort: level })
  })

  it('rejects invalid values', () => {
    for (const bad of ['', 'turbo', 'HIGH!', 'medium high', '0']) {
      const r = parseEffortLevel(bad)
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/Effort harus/)
    }
  })

  it('exports exactly the 7 plan values', () => {
    expect([...EFFORT_LEVELS].sort()).toEqual(['auto', 'high', 'low', 'max', 'medium', 'ultra', 'xhigh'].sort())
  })
})

describe('session store round-trip (Fase-1-shaped stubs)', () => {
  it('save -> load -> list preserves session', async () => {
    const store = makeStubStore()
    const session = {
      v: 1, id: 's1', workspace: '/tmp/w', provider: 'custom',
      model: 'm', modelVersion: null, effort: 'low',
      createdAt: 't', updatedAt: 't', prompt: 'halo',
      outcome: 'completed', terminalReason: 'explicit-done',
      messages: [{ role: 'user', content: 'halo' }, { role: 'assistant', content: 'hai' }]
    }
    expect((await saveTuiSession(session, store)).ok).toBe(true)
    const loaded = await loadTuiSession('s1', store)
    expect(loaded.ok).toBe(true)
    expect(loaded.session.messages).toHaveLength(2)
    const listed = await listTuiSessions(store)
    expect(listed.ok).toBe(true)
    expect(listed.sessions.map((s) => s.id)).toContain('s1')
  })

  it('caps messages at 50 on save', async () => {
    const store = makeStubStore()
    const messages = Array.from({ length: 80 }, (_, i) => ({ role: 'user', content: `m${i}` }))
    await saveTuiSession({ id: 'big', messages }, store)
    expect(store.map.get('big').messages).toHaveLength(SESSION_MESSAGE_CAP)
  })

  it('missing session reports not-found, not throw', async () => {
    const r = await loadTuiSession('nope', makeStubStore())
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/tidak ditemukan/)
  })

  it('round-trips through the REAL Fase-1 store (tmpdir, no second store)', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(`${tmpdir()}/tui-fase1-`)
    const { saveCliSession, loadCliSession, listCliSessions } = await import('../src/api/ai/headlessCli.js')
    const realStore = { loadCliSession: (id) => loadCliSession(id, { dir }), saveCliSession: (s) => saveCliSession(s, { dir }), listCliSessions: () => listCliSessions({ dir }) }
    const session = {
      v: 1, id: 'realsess', workspace: '/tmp/w', provider: 'custom',
      model: 'm', modelVersion: null, effort: 'low',
      createdAt: 't', updatedAt: 't', prompt: 'halo',
      outcome: 'completed', terminalReason: 'explicit-done',
      messages: [{ role: 'user', content: 'halo' }]
    }
    expect((await saveTuiSession(session, realStore)).ok).toBe(true)
    const loaded = await loadTuiSession('realsess', realStore)
    expect(loaded.ok).toBe(true)
    expect(loaded.session.messages).toHaveLength(1)
    // initialHistory feeds runAgentLoop's loopMessages seed (Fase-1 contract)
    expect(sessionToInitialHistory(loaded.session)).toEqual([{ role: 'user', content: 'halo' }])
  })

  it('sessionToInitialHistory keeps only user/assistant strings, capped', () => {
    const msgs = [
      { role: 'user', content: 'a' },
      { role: 'system', content: 'skip' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 42 },
      { role: 'assistant', content: 'c' }
    ]
    expect(sessionToInitialHistory({ messages: msgs })).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'assistant', content: 'c' }
    ])
    const big = { messages: Array.from({ length: 70 }, (_, i) => ({ role: 'user', content: `x${i}` })) }
    expect(sessionToInitialHistory(big)).toHaveLength(SESSION_MESSAGE_CAP)
  })
})

describe('abort maps to user_abort', () => {
  it('non-aborted turn passes through', () => {
    const turn = createTuiTurn()
    expect(checkTurnAborted(turn.signal, 'read-file')).toBeNull()
  })

  it('aborted turn returns user_abort error shape', () => {
    const turn = createTuiTurn()
    turn.controller.abort()
    const r = checkTurnAborted(turn.signal, 'write-file')
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('user_abort')
    expect(r.result).toMatch(/ABORTED/)
  })

  it('mock executeTool honoring ctx.signal surfaces user_abort', async () => {
    const mockExecuteTool = async (toolName, _query, ctx = {}) => {
      const aborted = checkTurnAborted(ctx.signal, toolName)
      if (aborted) return aborted
      return { ok: true, result: 'done' }
    }
    const turn = createTuiTurn()
    expect((await mockExecuteTool('t', 'q', { signal: turn.signal })).ok).toBe(true)
    turn.controller.abort()
    const r = await mockExecuteTool('t', 'q', { signal: turn.signal })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('user_abort')
  })

  it('makeAbortedToolResult carries tool name', () => {
    expect(makeAbortedToolResult('x').result).toContain('x')
  })
})

describe('needs_user returns to prompt', () => {
  it.each([
    [{ outcome: 'needs_user', terminalReason: 'question-asked', reply: 'maksudnya?' }],
    [{ outcome: 'completed', terminalReason: 'explicit-done' }],
    [{ outcome: 'failed', terminalReason: 'step-budget-exhausted' }],
    [{ outcome: 'blocked', terminalReason: 'blocked-reported' }],
    [null],
    [undefined]
  ])('reprompts for %j (never exits)', (result) => {
    expect(nextPromptAction(result)).toBe('reprompt')
  })
})

describe('line renderers', () => {
  it('renders thought lines, null on empty', () => {
    expect(renderThoughtLine('pikir')).toBe('[THOUGHT]: pikir')
    expect(renderThoughtLine('')).toBeNull()
  })

  it('renders decision + tool step lines', () => {
    const dec = renderStepLine({ kind: 'decision', decision: { action: { tool: 'read-file', query: 'a' } } })
    expect(dec).toContain('read-file')
    const tool = renderStepLine({ kind: 'tool', tool: 'read-file', ok: true, result: 'ok' })
    expect(tool).toContain('OK')
    const fail = renderStepLine({ kind: 'tool', tool: 't', ok: false, result: 'err' })
    expect(fail).toContain('FAIL')
  })
})

describe('streaming flag flip', () => {
  it('omits stream key when disabled (default)', () => {
    expect(TUI_STREAM_ENABLED).toBe(false)
    expect('stream' in buildAiFetchBody({ messages: [], config: {} })).toBe(false)
  })
})

describe('@file reference', () => {
  it('extracts refs from text', () => {
    expect(extractFileRefs('jelaskan @src/a.js dan @docs/b.md')).toEqual(['src/a.js', 'docs/b.md'])
    expect(extractFileRefs('tanpa ref')).toEqual([])
  })

  it('attaches file content within workspace', () => {
    const fsMod = {
      statSync: () => ({ isFile: () => true, size: 10 }),
      readFileSync: () => 'ISI FILE'
    }
    const r = resolveFileRefs('jelaskan @a.txt ya', { workspace: '/tmp/w', fsMod })
    expect(r.ok).toBe(true)
    expect(r.text).toContain('ISI FILE')
    expect(r.attached).toEqual([{ ref: 'a.txt', bytes: 8 }])
  })

  it('rejects outside-workspace, oversize, too-many, unreadable', () => {
    const fsMod = {
      statSync: () => ({ isFile: () => true, size: 10 }),
      readFileSync: () => 'x'
    }
    expect(resolveFileRefs('lihat @../evil.txt', { workspace: '/tmp/w', fsMod }).ok).toBe(false)
    const big = { statSync: () => ({ isFile: () => true, size: TUI_FILE_REF_MAX_BYTES + 1 }), readFileSync: () => 'x' }
    expect(resolveFileRefs('lihat @big.bin', { workspace: '/tmp/w', fsMod: big }).ok).toBe(false)
    const many = Array.from({ length: TUI_FILE_REF_MAX_FILES + 1 }, (_, i) => `@f${i}.txt`).join(' ')
    expect(resolveFileRefs(many, { workspace: '/tmp/w', fsMod }).ok).toBe(false)
    const bad = { statSync: () => { throw new Error('no') }, readFileSync: () => { throw new Error('no') } }
    expect(resolveFileRefs('lihat @hilang.txt', { workspace: '/tmp/w', fsMod: bad }).ok).toBe(false)
  })
})

describe('!shell mode', () => {
  it('parses !command, null otherwise', () => {
    expect(parseShellLine('!ls -la')).toBe('ls -la')
    expect(parseShellLine('  !git status  ')).toBe('git status')
    expect(parseShellLine('!')).toBeNull()
    expect(parseShellLine('hitung 2+2')).toBeNull()
    expect(parseShellLine('/model')).toBeNull()
    expect(parseShellLine('')).toBeNull()
  })
})

describe('/init generator', () => {
  it('builds draft from workspace entries', () => {
    const md = buildAgentsMd({ workspace: '/tmp/w', entries: ['package.json', 'src', 'README.md'] })
    expect(md).toContain('# AGENTS.md')
    expect(md).toContain('package.json')
    expect(md).toContain('src')
  })

  it('handles empty workspace honestly', () => {
    const md = buildAgentsMd({ workspace: '/tmp/empty', entries: [] })
    expect(md).toContain('# AGENTS.md')
    expect(md).toContain('kosong')
  })

  it('caps entry listing', () => {
    const entries = Array.from({ length: 100 }, (_, i) => `f${i}.js`)
    const md = buildAgentsMd({ workspace: '/tmp/w', entries })
    expect(md.split('\n').filter((l) => l.startsWith('- `')).length).toBeLessThanOrEqual(20)
  })
})
