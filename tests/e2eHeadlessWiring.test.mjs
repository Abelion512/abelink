// tests/e2eHeadlessWiring.test.mjs — E2E wiring M2c (hermetik penuh).
// Jalur nyata: submitLine -> runPrompt -> defaultRunTurn (engine asli, BUKAN
// deps.runTurn stub) -> runAgentLoop -> executeToolWithHooks (H5) ->
// harness writer JSONL -> finalize (turn-end + patch sesi).
//
// HERMETIK TANPA env: flag observability lewat deps.trajectoryHeadless
// (seam engine), root harness lewat deps.harnessWriter (writer dengan root
// tmp + fs nyata), HOME tmp tetap dipakai untuk STORE SESI CLI (headlessCli
// membaca HOME saat save/load — aman karena store-nya file per id, bukan
// cache proses). Tanpa env mutation = imun race antar worker vitest.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import 'fake-indexeddb/auto'

import { createTuiState, submitLine } from '../cli/tui/engine.mjs'
import { createHarnessWriter } from '../cli/core/harness-writer.mjs'
import { readSessionEvents } from '../scripts/harness-export.mjs'
import { listCliSessions } from '../src/api/ai/headlessCli.js'

let tmpHome = null
let prevHome = null

const today = () => new Date().toISOString().slice(0, 10)
const decision = (over = {}) => ({
  content: JSON.stringify({
    thought: 'ok',
    answer: 'selesai',
    is_done: true,
    action: null,
    suggested_mode: 'direct',
    task_status: 'done',
    mood: 'neutral',
    ...over,
  }),
})

const toolThenDone = () => {
  let n = 0
  return vi.fn().mockImplementation(() => {
    n++
    if (n === 1) {
      return Promise.resolve({
        content: JSON.stringify({
          thought: 'perlu baca AGENTS.md',
          action: { tool: 'read-file', query: 'AGENTS.md' },
          is_done: false,
          suggested_mode: 'ephemeral',
          task_status: 'in_progress',
          mood: 'neutral',
        }),
      })
    }
    // Klaim selesai SETELAH tool sukses -> evidence 'verified' (objectiveKind
    // file butuh bukti read/write) -> gate meloloskan (bukan replan).
    return Promise.resolve(decision({ objective: 'baca AGENTS.md' }))
  })
}

describe('e2e wiring defaultRunTurn -> hooks -> harness writer', () => {
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-e2e-'))
    prevHome = process.env.HOME
    process.env.HOME = tmpHome
  })
  afterEach(() => {
    process.env.HOME = prevHome
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  // Root harness hermetik per test (fs nyata, tmp) + flag via deps (bukan env).
  const mkHarnessDeps = () => {
    const root = path.join(tmpHome, 'harness-root')
    const writer = createHarnessWriter({ fsMod: fs, env: { ABELINK_TRAJECTORY_HEADLESS: '1' }, root })
    return { trajectoryHeadless: true, harnessWriter: writer, root }
  }

  const mkDeps = (fetchAI, over = {}) => ({
    sidecar: { rpc: vi.fn().mockResolvedValue({ success: true, data: '' }) },
    fetchAI,
    resolveFileRefs: (text) => ({ ok: true, text, attached: [] }),
    aliases: {},
    maxTurns: 5,
    ...over,
  })

  // Timeout eksplisit: latensi integrasi (planning + Dexie fake-indexeddb)
  // ~4.5-6s per turn; timeout default 5s memotong di tengah dan loop zombie
  // mengembalikan __ABELINK_AI_FETCH__ saat test berikutnya jalan (interferensi).
  const E2E_TIMEOUT = 30000

  it('turn dengan tool: audit JSONL 3 kinds + sesi dipatch outcome', { timeout: E2E_TIMEOUT }, async () => {
    const h = mkHarnessDeps()
    const s = createTuiState({ sessionId: 'session-e2e-tool' })
    const r = await submitLine(s, 'baca AGENTS.md lalu selesaikan', mkDeps(toolThenDone(), h))
    expect(r.role).toBe('assistant')

    const dir = path.join(h.root, today())
    for (const kind of ['turn-start', 'tool-calls', 'turn-end']) {
      expect(fs.existsSync(path.join(dir, `${kind}.jsonl`)), kind).toBe(true)
    }
    const events = readSessionEvents({ session: 'session-e2e-tool', date: today(), dir })
    expect(events.map((e) => e.kind)).toEqual(['turn-start', 'tool-call', 'turn-end'])
    // Satu run prompt = satu turn harness; step internal loop di field `step`.
    expect(events[0]).toMatchObject({ turn: 1, provider: 'custom' })
    expect(String(events[0].prompt)).toContain('baca AGENTS.md')
    expect(events[1]).toMatchObject({ tool: 'read-file', ok: true, success: true, turn: 1, step: 1 })
    expect(typeof events[1].durationMs).toBe('number')
    expect(events[2]).toMatchObject({ turn: 1, outcome: 'completed' })

    // Patch sesi: outcome sama dengan hasil turn (store Fase-1, HOME tmp).
    const sessions = listCliSessions()
    const mine = sessions.find((x) => x.id === 'session-e2e-tool')
    expect(mine).toBeTruthy()
    expect(mine.outcome).toBe('completed')
    expect(mine.terminalReason).toBeTruthy()
  })

  it('crash path (AI fetch gagal): tetap ada turn-start + turn-end failed; submitLine melempar', { timeout: E2E_TIMEOUT }, async () => {
    const h = mkHarnessDeps()
    const s = createTuiState({ sessionId: 'session-e2e-boom' })
    // Perilaku v2: defaultRunTurn melempar -> runPrompt melempar (App menampilkan
    // error). E2E ini memverifikasi JEJAK, bukan mengubah kontrak error.
    await expect(
      submitLine(s, 'coba', mkDeps(vi.fn().mockRejectedValue(new Error('ECONNREFUSED 9Router')), h))
    ).rejects.toThrow(/ECONNREFUSED/)

    const dir = path.join(h.root, today())
    expect(fs.existsSync(path.join(dir, 'turn-start.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'turn-end.jsonl'))).toBe(true)
    const events = readSessionEvents({ session: 'session-e2e-boom', date: today(), dir })
    const end = events.find((e) => e.kind === 'turn-end')
    expect(end).toBeTruthy()
    expect(end.outcome).toBe('failed')
    expect(end.reason).toBe('fatal-exception')
    // Red-flag harness:diagnose = start tanpa end. Di sini keduanya ada.
    const starts = events.filter((e) => e.kind === 'turn-start').length
    const ends = events.filter((e) => e.kind === 'turn-end').length
    expect(starts).toBe(ends)
  })

  it('dua run satu sesi: turn monoton (1,2) tanpa bentrok nomor', { timeout: E2E_TIMEOUT }, async () => {
    const h = mkHarnessDeps()
    const s = createTuiState({ sessionId: 'session-e2e-multi' })
    const deps = mkDeps(vi.fn().mockResolvedValue(decision()), h)
    await submitLine(s, 'run pertama', deps)
    await submitLine(s, 'run kedua', deps)

    const dir = path.join(h.root, today())
    const events = readSessionEvents({ session: 'session-e2e-multi', date: today(), dir })
    const starts = events.filter((e) => e.kind === 'turn-start').map((e) => e.turn)
    const ends = events.filter((e) => e.kind === 'turn-end').map((e) => e.turn)
    expect(starts).toEqual([1, 2])
    expect(ends).toEqual([1, 2])
  })

  it('flag OFF (default): tidak ada file harness sama sekali', { timeout: E2E_TIMEOUT }, async () => {
    const s = createTuiState({ sessionId: 'session-e2e-off' })
    await submitLine(s, 'run tanpa flag', mkDeps(vi.fn().mockResolvedValue(decision())))
    const dir = path.join(tmpHome, '.local', 'share', 'abelink', 'harness', today())
    expect(fs.existsSync(dir)).toBe(false)
  })
})
