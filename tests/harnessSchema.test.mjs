// Konformansi docs/HARNESS-LOG-SCHEMA.md v1: envelope, validator, caps,
// dan export script. Standar diadopsi (AgentGuide/AOS), bukan bikinan.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  HARNESS_SCHEMA_VERSION,
  HARNESS_EVENT_KINDS,
  makeHarnessEvent,
  validateHarnessEvent,
  estimateTokens,
  logToolCall,
  logObservation,
  logAnswer,
  logTurnStart,
  logTurnEnd,
  getTrajectoryBuffer,
  clearTrajectoryBuffer
} from '../src/api/trajectory.js'

describe('harness envelope', () => {
  it('maker mengisi v/ts/id dan meneruskan sessionId/turn', () => {
    const e = makeHarnessEvent({ kind: 'tool-call', sessionId: 1, turn: 3, tool: 'x' })
    expect(e.v).toBe(HARNESS_SCHEMA_VERSION)
    expect(Number.isNaN(Date.parse(e.ts))).toBe(false)
    expect(e.sessionId).toBe(1)
    expect(e.turn).toBe(3)
    expect(typeof e.id).toBe('string')
  })

  it('validator menerima event valid, menolak yang cacat', () => {
    expect(validateHarnessEvent(makeHarnessEvent({ kind: 'answer' }))).toBeNull()
    expect(validateHarnessEvent(null)).toBeTruthy()
    expect(validateHarnessEvent({ ...makeHarnessEvent({ kind: 'answer' }), v: 99 })).toBeTruthy()
    expect(validateHarnessEvent({ ...makeHarnessEvent({ kind: 'answer' }), kind: 'sihir' })).toBeTruthy()
    expect(validateHarnessEvent({ ...makeHarnessEvent({ kind: 'answer' }), ts: 'kemarin' })).toBeTruthy()
  })

  it('semua kind terdokumentasi lolos validator', () => {
    for (const kind of HARNESS_EVENT_KINDS) {
      expect(validateHarnessEvent(makeHarnessEvent({ kind }))).toBeNull()
    }
  })
})

describe('v1.1 deepseek-aligned', () => {
  it('seq monotonik menaik', () => {
    const a = makeHarnessEvent({ kind: 'answer' })
    const b = makeHarnessEvent({ kind: 'answer' })
    expect(b.seq).toBeGreaterThan(a.seq)
  })

  it('framing turn-start/turn-end valid dan membawa turn', () => {
    clearTrajectoryBuffer()
    logTurnStart({ turn: 3, sessionId: 1 })
    logTurnEnd({ turn: 3, sessionId: 1, outcome: 'blocked', reason: 'x' })
    const buf = getTrajectoryBuffer()
    expect(buf.at(-2)).toMatchObject({ kind: 'turn-start', turn: 3 })
    expect(buf.at(-1)).toMatchObject({ kind: 'turn-end', turn: 3, outcome: 'blocked' })
    expect(validateHarnessEvent(buf.at(-1))).toBeNull()
    clearTrajectoryBuffer()
  })

  it('estimateTokens deterministik divisor 2.5', () => {
    expect(estimateTokens('xxxx')).toBe(2)
    expect(estimateTokens('', null, undefined)).toBe(0)
  })
})

describe('caps jujur (bukan sampling diam-diam)', () => {
  it('tool result dipangkas 2000, observation 3000, answer 4000', () => {
    clearTrajectoryBuffer()
    logToolCall({ tool: 't', result: 'x'.repeat(5000) })
    logObservation({ observation: 'y'.repeat(5000) })
    logAnswer({ answer: 'z'.repeat(5000) })
    const buf = getTrajectoryBuffer()
    expect(buf.at(-3).result.length).toBeLessThanOrEqual(2000)
    expect(buf.at(-2).observation.length).toBeLessThanOrEqual(3000)
    expect(buf.at(-1).answer.length).toBeLessThanOrEqual(4000)
    clearTrajectoryBuffer()
  })
})

describe('harness-diagnose.mjs', () => {
  const fixture = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'harness-'))
    const day = path.join(root, '2026-09-12')
    mkdirSync(day)
    const ev = (kind, body) =>
      JSON.stringify({ ts: '2026-09-12T00:00:00', kind: 'tool-call', line: JSON.stringify({ v: 1, ts: '2026-09-12T00:00:00', kind, sessionId: 5, ...body }) })
    writeFileSync(
      path.join(day, 'tool-calls.jsonl'),
      [
        ev('turn-start', { turn: 1 }),
        ev('tool-call', { turn: 1, tool: 'browser-navigate', success: true }),
        ev('turn-end', { turn: 1, outcome: 'completed' }),
        ev('turn-start', { turn: 2 }),
        ev('tool-call', { turn: 2, tool: 'x', success: false, result: 'STOP OVERLAY boom' })
      ].join('\n')
    )
    return root
  }

  it('mendeteksi turn-stuck + red flag dalam budget', () => {
    const out = execFileSync(
      'node',
      ['scripts/harness-diagnose.mjs', '--session', '5', '--date', '2026-09-12', '--dir', fixture(), '--budget', '4000'],
      { encoding: 'utf8' }
    )
    expect(out).toMatch('turn 2 START tanpa END')
    expect(out).toMatch('STOP OVERLAY')
    expect(out.length).toBeLessThanOrEqual(4100)
  })

  it('--latest memilih sesi tersibuk', () => {
    const out = execFileSync(
      'node',
      ['scripts/harness-diagnose.mjs', '--date', '2026-09-12', '--dir', fixture()],
      { encoding: 'utf8' }
    )
    expect(out).toMatch('DIAGNOSA SESI 5')
  })
})

describe('harness-export.mjs', () => {
  it('menggabung per-kind menjadi satu JSONL sesi terurut-ts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'harness-'))
    const day = path.join(root, '2026-09-12')
    mkdirSync(day)
    const line = (sessionId, ts, extra = {}) =>
      JSON.stringify({ ts: '2026-09-12T00:00:00', kind: 'tool-call', line: JSON.stringify({ v: 1, ts, kind: 'tool-call', sessionId, ...extra }) })
    writeFileSync(
      path.join(day, 'tool-calls.jsonl'),
      line(7, '2026-09-12T00:00:02') + '\n' + line(7, '2026-09-12T00:00:01') + '\n' + line(9, '2026-09-12T00:00:00') + '\nkorup{\n'
    )
    const out = execFileSync('node', ['scripts/harness-export.mjs', '--session', '7', '--date', '2026-09-12', '--dir', root], { encoding: 'utf8' })
    const lines = out.trim().split('\n').map((r) => JSON.parse(r))
    const header = lines[0]
    expect(header.type).toBe('header')
    expect(header.schema).toBe('harness-log/v1')
    expect(header.count).toBe(2)
    const rows = lines.slice(1)
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.ts)).toEqual(['2026-09-12T00:00:01', '2026-09-12T00:00:02'])
  })

  it('sesi tak dikenal -> header count 0, exit 0', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'harness-'))
    const day = path.join(root, '2026-09-12')
    mkdirSync(day)
    writeFileSync(path.join(day, 'tool-calls.jsonl'), '')
    const out = execFileSync('node', ['scripts/harness-export.mjs', '--session', '99', '--date', '2026-09-12', '--dir', root], { encoding: 'utf8' })
    const header = JSON.parse(out.trim())
    expect(header.type).toBe('header')
    expect(header.count).toBe(0)
  })
})
