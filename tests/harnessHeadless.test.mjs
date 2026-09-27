// tests/harnessHeadless.test.mjs — PLAN-T1 trajectory headless (M2c).
// Gate: writer menghasilkan baris {ts,kind,line} di root SAMA dengan GUI,
// flag default OFF (perilaku lama), kind divalidasi ketat (mirror Rust),
// file >50MB fail-closed, dan diagnose/export membaca hasilnya tanpa cabang.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHarnessWriter, createHeadlessHarnessLogger, trajectoryHeadlessEnabled, resolveHarnessRoot } from '../cli/core/harness-writer.mjs'
import { makeHarnessToolCall, makeHarnessTurnStart, makeHarnessTurnEnd, normalizeHarnessSessionId } from '../src/api/harnessCore.js'
import { readSessionEvents } from '../scripts/harness-export.mjs'
import { parseHarnessRow } from '../cli/tui/usageStats.mjs'

const mkFs = () => {
  const dirs = new Set()
  const files = new Map()
  return {
    dirs,
    files,
    mkdirSync: (d) => { dirs.add(d) },
    statSync: (f) => {
      const size = files.get(f)
      if (size === undefined) throw new Error('ENOENT')
      return { size }
    },
    appendFileSync: (f, data) => {
      files.set(f, (files.get(f) || 0) + data.length)
      files.set(f + '::rows', (files.get(f + '::rows') || 0) + 1)
    },
  }
}

const enabledEnv = () => ({ ABELINK_TRAJECTORY_HEADLESS: '1', ABELINK_DATA_HOME: '/data-dev' })

describe('flag', () => {
  it('default OFF (perilaku lama sampai flag lulus — plan §4.4)', () => {
    expect(trajectoryHeadlessEnabled({})).toBe(false)
    expect(trajectoryHeadlessEnabled({ ABELINK_TRAJECTORY_HEADLESS: '0' })).toBe(false)
    expect(trajectoryHeadlessEnabled({ ABELINK_TRAJECTORY_HEADLESS: '1' })).toBe(true)
  })
  it('resolveHarnessRoot: ABELINK_DATA_HOME menang + brand abelink sekali', () => {
    expect(resolveHarnessRoot({ ABELINK_DATA_HOME: '/d', HOME: '/h' })).toBe(path.join('/d', 'abelink', 'harness'))
    expect(resolveHarnessRoot({ XDG_DATA_HOME: '/x', HOME: '/h' })).toBe(path.join('/x', 'abelink', 'harness'))
    expect(resolveHarnessRoot({ HOME: '/h' })).toBe(path.join('/h', '.local', 'share', 'abelink', 'harness'))
  })
})

describe('createHarnessWriter', () => {
  it('menulis row {ts,kind,line} ke <root>/<date>/<kind>.jsonl', () => {
    const f = mkFs()
    const w = createHarnessWriter({ fsMod: f, env: enabledEnv(), root: '/h', now: () => new Date('2026-09-26T01:02:03Z') })
    const ok = w.append('turn-start', { kind: 'turn-start', turn: 1, sessionId: 'session-abc' })
    expect(ok).toBe(true)
    const file = path.join('/h', '2026-09-26', 'turn-start.jsonl')
    expect(f.files.has(file)).toBe(true)
    expect(w.stats().written).toBe(1)
  })

  it('flag OFF / ABELINK_HARNESS_DISABLE -> tanpa tulis (no-op, tanpa error)', () => {
    const f = mkFs()
    const off = createHarnessWriter({ fsMod: f, env: {}, root: '/h' })
    const kill = createHarnessWriter({ fsMod: f, env: { ABELINK_TRAJECTORY_HEADLESS: '1', ABELINK_HARNESS_DISABLE: '1' }, root: '/h' })
    expect(off.append('turn-start', { kind: 'turn-start' })).toBe(false)
    expect(kill.append('turn-start', { kind: 'turn-start' })).toBe(false)
    expect(off.stats().disabled).toBe(true)
    expect(f.files.size).toBe(0)
  })

  it('kind divalidasi ketat (mirror Rust) — path escape ditolak', () => {
    const f = mkFs()
    const w = createHarnessWriter({ fsMod: f, env: enabledEnv(), root: '/h' })
    expect(w.append('../evil', { a: 1 })).toBe(false)
    expect(w.append('', { a: 1 })).toBe(false)
    expect(w.append('a'.repeat(65), { a: 1 })).toBe(false)
    expect(w.stats().written).toBe(0)
  })

  it('file aktif >50MB -> fail-closed (tanpa rotasi, counter skipped)', () => {
    const f = mkFs()
    const big = path.join('/h', '2026-09-26', 'tool-calls.jsonl')
    f.files.set(big, 50 * 1024 * 1024 + 1)
    const w = createHarnessWriter({ fsMod: f, env: enabledEnv(), root: '/h', now: () => new Date('2026-09-26T01:02:03Z') })
    expect(w.append('tool-calls', { kind: 'tool-call' })).toBe(false)
    expect(w.stats().skippedSize).toBe(1)
  })

  it('envelope rusak (tak serializable) -> skip, tidak melempar', () => {
    const f = mkFs()
    const w = createHarnessWriter({ fsMod: f, env: enabledEnv(), root: '/h' })
    const circular = {}
    circular.self = circular
    expect(w.append('turn-start', circular)).toBe(false)
  })

  it('ts MONOTONIK KETAT: urutan reader benar walau clock beku (regresi flake run6)', () => {
    // Clock beku (Date(0)): tanpa guard monotonic, ketiga event dapat ts
    // identik dari TIGA file berbeda — urutan readdir arbitrer membuat
    // readSessionEvents salah urut (flake nyata run6). Guard baru: ts naik
    // ketat 0,1,2 ms -> urutan selalu benar.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-mono-'))
    const root = path.join(tmp, 'harness')
    const w = createHarnessWriter({ fsMod: fs, env: enabledEnv(), root, now: () => new Date(0) })
    const log = createHeadlessHarnessLogger({ writer: w, sessionId: 'session-mono' })
    log.logTurnStart({ turn: 1 })
    log.logToolCall({ tool: 'read-file', ok: true, resultSummary: 'ok', turn: 1 })
    log.logTurnEnd({ turn: 1, outcome: 'completed', reason: 'r' })
    const events = readSessionEvents({ session: 'session-mono', date: '1970-01-01', dir: path.join(root, '1970-01-01') })
    expect(events.map((e) => e.kind)).toEqual(['turn-start', 'tool-call', 'turn-end'])
    expect(new Date(events[2].ts).getTime()).toBeGreaterThan(new Date(events[0].ts).getTime())
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('bentuk event harnessCore', () => {
  it('makeHarnessToolCall: caps query 200 / resultSummary 2000 + success skema', () => {
    const e = makeHarnessToolCall({ tool: 'run-shell', query: 'x'.repeat(500), ok: false, resultSummary: 'y'.repeat(3000), sessionId: 's', turn: 2 })
    expect(e.kind).toBe('tool-call')
    expect(e.query.length).toBe(200)
    expect(e.resultSummary.length).toBe(2000)
    expect(e.ok).toBe(false)
    expect(e.success).toBe(false)
  })
  it('makeHarnessTurnStart/End bentuk minimal', () => {
    expect(makeHarnessTurnStart({ turn: 1, sessionId: 's' })).toMatchObject({ kind: 'turn-start', turn: 1, sessionId: 's' })
    expect(makeHarnessTurnEnd({ turn: 1, sessionId: 's', outcome: 'completed', reason: 'r' })).toMatchObject({ kind: 'turn-end', outcome: 'completed', reason: 'r' })
  })
  it('normalizeHarnessSessionId: null/empty jujur null', () => {
    expect(normalizeHarnessSessionId('session-1')).toBe('session-1')
    expect(normalizeHarnessSessionId(7)).toBe('7')
    expect(normalizeHarnessSessionId(null)).toBe(null)
    expect(normalizeHarnessSessionId('  ')).toBe(null)
  })
})

describe('readiness lintas penulis (GUI row vs headless row)', () => {
  it('parseHarnessRow + readSessionEvents membaca row headless seperti row GUI', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-hh-'))
    const dir = path.join(tmp, '2026-09-26')
    fs.mkdirSync(dir, { recursive: true })
    const env = { kind: 'turn-end', turn: 1, sessionId: 'session-zz', outcome: 'completed', reason: 'verify:gate', v: 1, ts: '2026-09-26T01:00:00.000Z' }
    const row = JSON.stringify({ ts: '2026-09-26T01:00:00.001Z', kind: 'turn-end', line: JSON.stringify(env) }) + '\n'
    fs.writeFileSync(path.join(dir, 'turn-end.jsonl'), row)
    // readSessionEvents menerima DIR TANGGAL (cermin main() harness-export).
    const events = readSessionEvents({ session: 'session-zz', date: '2026-09-26', dir })
    expect(events.length).toBe(1)
    expect(events[0].outcome).toBe('completed')
    expect(parseHarnessRow(row).sessionId).toBe('session-zz')
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('logger headless -> file nyata (tmp) -> diagnose-format kinds terbaca', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-hw-'))
    const root = path.join(tmp, 'harness')
    const w = createHarnessWriter({ fsMod: fs, env: enabledEnv(), root })
    const log = createHeadlessHarnessLogger({ writer: w, sessionId: 'session-live' })
    log.logTurnStart({ turn: 1, prompt: 'jawab singkat', provider: 'custom', model: 'zen', effort: 'low' })
    log.logToolCall({ tool: 'read-file', query: 'AGENTS.md', ok: true, resultSummary: 'ok', turn: 1, durationMs: 4 })
    log.logTurnEnd({ turn: 1, outcome: 'completed', reason: 'done' })
    const dir = path.join(root, new Date().toISOString().slice(0, 10))
    for (const kind of ['turn-start', 'tool-calls', 'turn-end']) {
      expect(fs.existsSync(path.join(dir, `${kind}.jsonl`))).toBe(true)
    }
    const events = readSessionEvents({ session: 'session-live', date: new Date().toISOString().slice(0, 10), dir })
    expect(events.length).toBe(3)
    expect(events.map((e) => e.kind)).toEqual(['turn-start', 'tool-call', 'turn-end'])
    expect(events[0].prompt).toBe('jawab singkat')
    expect(events[1].durationMs).toBe(4)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
