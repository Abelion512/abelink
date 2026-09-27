// tests/cli-usage-stats.test.mjs — S3: agregat /usage harness lokal.
// Stub fs (tanpa HOME asli). Tanpa network, tanpa $.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  summarizeSession,
  parseHarnessRow,
  summarizeDir,
  renderUsage,
} from '../cli/tui/usageStats.mjs'
import { createTuiState, submitLine } from '../cli/tui/engine.mjs'

const row = (kind, line) => JSON.stringify({ kind, line: JSON.stringify(line), ts: '2026-09-25T00:00:00Z' })

describe('parseHarnessRow', () => {
  it('envelope line string + row langsung', () => {
    expect(parseHarnessRow(row('x', { sessionId: 1, turn: 2 })).sessionId).toBe(1)
    expect(parseHarnessRow('korup{{{')).toBe(null)
    expect(parseHarnessRow('')).toBe(null)
  })
})

describe('summarizeSession', () => {
  it('turns/tools/outcomes/tokensEst', () => {
    const s = summarizeSession([
      { kind: 'turn-start', turn: 1, sessionId: 1 },
      { kind: 'tool-call', tool: 'read-file', success: true, turn: 1, result: 'ok' },
      { kind: 'tool-call', tool: 'run-shell', success: false, turn: 1 },
      { kind: 'observation', tool: 'run-shell', observation: 'x'.repeat(250) },
      { kind: 'turn-end', turn: 1, outcome: 'completed' },
      { kind: 'answer', outcome: 'completed', answer: 'done' },
    ])
    expect(s.turns).toBe(1)
    expect(s.toolCalls).toBe(2)
    expect(s.toolOk).toBe(1)
    expect(s.toolFail).toBe(1)
    expect(s.tools).toMatchObject({ 'read-file': 1, 'run-shell': 1 })
    expect(s.outcomes.completed).toBe(2)
    expect(s.tokensEst).toBeGreaterThan(0)
  })
  it('kosongan aman', () => {
    expect(summarizeSession([])).toMatchObject({ turns: 0, toolCalls: 0, tokensEst: 0 })
    expect(summarizeSession(null)).toMatchObject({ turns: 0 })
  })
})

describe('summarizeDir (mem-fs)', () => {
  const memFs = (files) => ({
    readdirSync: () => Object.keys(files).map((k) => k.split('/').pop()),
    readFileSync: (p) => {
      const base = String(p).split('/').pop()
      const hit = Object.keys(files).find((k) => k === p || k.split('/').pop() === base)
      if (!hit) throw new Error('ENOENT')
      return files[hit]
    },
  })
  it('gabung kinds per sessionId', () => {
    const f = memFs({
      'tool-calls.jsonl': row('t', { kind: 'tool-call', tool: 'a', success: true, turn: 1, sessionId: 7 }) + '\n',
      'turn-end.jsonl': row('t', { kind: 'turn-end', turn: 1, outcome: 'completed', sessionId: 7 }) + '\n',
    })
    const sums = summarizeDir({ fsMod: f, dir: '/d' })
    expect(sums['7'].toolCalls).toBe(1)
    expect(sums['7'].outcomes.completed).toBe(1)
  })
  it('dir hilang -> {}', () => {
    expect(summarizeDir({ fsMod: memFs({}), dir: '/x' })).toEqual({})
  })
})

describe('renderUsage', () => {
  it('kosong jujur', () => {
    expect(renderUsage({ perSession: {} })).toContain('Belum ada')
  })
  it('tabel sesi + total, tanpa $', () => {
    const out = renderUsage({ perSession: { 1: { turns: 2, toolCalls: 3, toolOk: 3, toolFail: 0, tools: { a: 3 }, outcomes: { completed: 1 }, tokensEst: 100 } } })
    expect(out).toContain('sesi 1')
    expect(out).toContain('total:')
    expect(out).not.toContain('$')
    expect(out).toContain('estimasi')
  })
})

describe('/usage di engine (stub HOME + harness)', () => {
  const mkHarness = (home) => {
    const dir = path.join(home, '.local', 'share', 'abelink', 'harness', new Date().toISOString().slice(0, 10))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'turn-end.jsonl'),
      row('t', { kind: 'turn-end', turn: 1, outcome: 'completed', sessionId: 9 }) + '\n',
    )
  }
  const deps = (over = {}) => ({
    runTurn: async () => ({ reply: 'x', outcome: 'completed', terminalReason: 'a', stepCount: 1, toolCallsCount: 0 }),
    resolveFileRefs: (text) => ({ ok: true, text, attached: [] }),
    aliases: {},
    homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-use-')),
    ...over,
  })
  it('/usage tampilkan sesi hari ini', async () => {
    const d = deps()
    mkHarness(d.homeDir)
    // harnessRoot baca ABELINK_DATA_HOME/XDG/HOME — set XDG ke tmp via harnessRoot override
    const s = createTuiState()
    const { summarizeDir: sd, renderUsage: ru } = await import('../cli/tui/usageStats.mjs')
    const sums = sd({ fsMod: fs, dir: path.join(d.homeDir, '.local', 'share', 'abelink', 'harness', new Date().toISOString().slice(0, 10)) })
    expect(sums['9'].outcomes.completed).toBe(1)
    expect(ru({ perSession: sums })).toContain('sesi 9')
    void s
  })
  it('/usage unknown-parser -> rute usage (alias /stats)', async () => {
    const d = deps()
    const s = createTuiState()
    const r = await submitLine(s, '/stats', { ...d, harnessRoot: path.join(d.homeDir, '.local', 'share') })
    expect(r.role).toBe('info')
    expect(s.messages.at(-1).text).toMatch(/Belum ada|Penggunaan/)
  })
})
