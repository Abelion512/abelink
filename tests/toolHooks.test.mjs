// tests/toolHooks.test.mjs — H5 tool gateway hooks (M2c).
// Acceptance dokumen Hermes: "hook after menerima {tool, ok, ms}" +
// "audit JSONL bertambah" + choke point tunggal tanpa mengubah perilaku tool.
import { describe, it, expect, vi } from 'vitest'
import { executeToolWithHooks, createToolAuditLogger } from '../cli/core/tool-hooks.mjs'
import { createHarnessWriter, createHeadlessHarnessLogger } from '../cli/core/harness-writer.mjs'

const memFs = () => {
  const files = new Map()
  return {
    files,
    mkdirSync: (d) => files.set(d, files.get(d) || []),
    statSync: () => { throw new Error('ENOENT') },
    appendFileSync: (f, data) => {
      const cur = files.get(f) || []
      cur.push(data)
      files.set(f, cur)
    },
  }
}

// Writer hermetik: fs mem + root/now di-inject (env eksplisit -> enabled).
const mkWriter = (env = { ABELINK_TRAJECTORY_HEADLESS: '1' }) => {
  const fsM = memFs()
  const writer = createHarnessWriter({ fsMod: fsM, env, root: '/h', now: () => new Date('2026-09-26T00:00:00Z') })
  return { writer, fsM }
}

describe('executeToolWithHooks (H5)', () => {
  it('tanpa hooks: perilaku core apa adanya', async () => {
    const core = vi.fn().mockResolvedValue({ ok: true, result: 'done' })
    const out = await executeToolWithHooks(core, {}, 'read-file', 'q', {})
    expect(out).toEqual({ ok: true, result: 'done' })
    expect(core).toHaveBeenCalledWith('read-file', 'q', {})
  })

  it('core melempar -> shape [ERROR] standar, tidak melempar ke loop', async () => {
    const core = vi.fn().mockRejectedValue(new Error('ENOENT boom'))
    const out = await executeToolWithHooks(core, {}, 'read-file', 'q', {})
    expect(out.ok).toBe(false)
    expect(out.result).toContain('[ERROR]')
    expect(out.error.code).toBe('execution-exception')
  })

  it('onAfterTool menerima {tool, ok, ms} — acceptance H5', async () => {
    const seen = []
    const core = vi.fn().mockResolvedValue({ ok: true, result: 'ok-data' })
    await executeToolWithHooks(core, { onAfterTool: (i) => seen.push(i) }, 'run-shell', 'ls', { step: 2 })
    expect(seen.length).toBe(1)
    expect(seen[0].tool).toBe('run-shell')
    expect(seen[0].ok).toBe(true)
    expect(typeof seen[0].ms).toBe('number')
    expect(seen[0].ms).toBeGreaterThanOrEqual(0)
    expect(seen[0].result).toEqual({ ok: true, result: 'ok-data' })
  })

  it('onBeforeTool {ok:false} = BLOCK, core TIDAK dipanggil, audit rejected tercatat', async () => {
    const core = vi.fn()
    const entries = []
    const audit = { logToolCall: (e) => entries.push(e) }
    const out = await executeToolWithHooks(core, { onBeforeTool: () => ({ ok: false, result: 'denied' }), audit }, 'run-shell', 'rm -rf', { step: 1 })
    expect(core).not.toHaveBeenCalled()
    expect(out.ok).toBe(false)
    expect(entries.length).toBe(1)
    expect(entries[0].rejected).toBe(true)
    expect(entries[0].ok).toBe(false)
  })

  it('audit menerima setiap hasil core (sukses + gagal) — audit JSONL bertambah', async () => {
    const entries = []
    const audit = { logToolCall: (e) => entries.push(e) }
    let n = 0
    const core = vi.fn().mockImplementation(() => {
      n++
      return n === 1 ? { ok: true, result: 'ok' } : { ok: false, result: '[ERROR] gagal', error: { code: 'tool-error' } }
    })
    await executeToolWithHooks(core, { audit }, 'a', 'q1', { step: 1 })
    await executeToolWithHooks(core, { audit }, 'a', 'q2', { step: 1 })
    expect(entries.length).toBe(2)
    expect(entries[0].ok).toBe(true)
    expect(entries[1].ok).toBe(false)
    expect(typeof entries[0].durationMs).toBe('number')
  })

  it('hook yang melempar tidak menggagalkan eksekusi tool', async () => {
    const core = vi.fn().mockResolvedValue({ ok: true, result: 'fine' })
    const out = await executeToolWithHooks(core, {
      onBeforeTool: () => { throw new Error('hook rusak') },
      onAfterTool: () => { throw new Error('hook rusak') },
    }, 'x', 'q', {})
    expect(out.ok).toBe(true)
  })

  it('onAfterTool boleh redaksi hasil (ok:false menggantikan result)', async () => {
    const core = vi.fn().mockResolvedValue({ ok: true, result: 'secret-raw' })
    const out = await executeToolWithHooks(core, {
      onAfterTool: ({ result }) => ({ ok: false, result: '[REDACTED]', error: { code: 'redacted' } }),
    }, 'x', 'q', {})
    expect(out.result).toBe('[REDACTED]')
  })

  it('createToolAuditLogger: satu run = satu turn; step internal di field step', async () => {
    const frames = []
    const logger = {
      logTurnStart: (e) => frames.push(['start', e]),
      logToolCall: (e) => frames.push(['tool', e]),
      logTurnEnd: (e) => frames.push(['end', e]),
    }
    const audit = createToolAuditLogger({ logger, sessionId: 'session-x', deps: {} })
    // Run 1: multi-step internal (step loop 1..3) -> turn harness 1.
    audit.beginTurn({ prompt: 'p1', provider: 'custom', model: 'm', effort: 'low' })
    audit.logToolCall({ tool: 't', ok: true, turn: 1 })
    audit.logToolCall({ tool: 't', ok: true, turn: 2 })
    audit.logToolCall({ tool: 't', ok: true, turn: 3 })
    await audit.finalize({ outcome: 'completed', terminalReason: 'r1' })
    // Run 2 di sesi yang sama -> turn harness 2 (tanpa bentrok nomor).
    audit.beginTurn({ prompt: 'p2' })
    audit.logToolCall({ tool: 't', ok: true, turn: 1 })
    await audit.finalize({ outcome: 'failed', terminalReason: 'r2' })

    const starts = frames.filter((f) => f[0] === 'start').map((f) => f[1].turn)
    const ends = frames.filter((f) => f[0] === 'end').map((f) => f[1].turn)
    expect(starts).toEqual([1, 2])
    expect(ends).toEqual([1, 2])
    const toolTurns = frames.filter((f) => f[0] === 'tool').map((f) => f[1].turn)
    const toolSteps = frames.filter((f) => f[0] === 'tool').map((f) => f[1].step)
    expect(toolTurns).toEqual([1, 1, 1, 2])
    expect(toolSteps).toEqual([1, 2, 3, 1])
    expect(frames[0][1].prompt).toBe('p1')
    expect(frames[0][1].model).toBe('m')
    // forSession: kunci sesi untuk recreate audit saat /new atau /continue.
    expect(audit.forSession).toBe('session-x')
  })

  it('createHeadlessHarnessLogger: bentuk event paritas GUI + success skema', async () => {
    const { writer, fsM } = mkWriter()
    const logger = createHeadlessHarnessLogger({ writer, sessionId: 'session-zz' })
    logger.logTurnStart({ turn: 1, prompt: 'halo', provider: 'custom', model: 'm1', effort: 'low' })
    logger.logToolCall({ tool: 'read-file', query: 'a'.repeat(400), ok: false, resultSummary: 'gagal', turn: 1, durationMs: 12 })
    logger.logTurnEnd({ turn: 1, outcome: 'failed', reason: 'x' })
    const envelopes = [...fsM.files.values()].flat().map((r) => JSON.parse(JSON.parse(r).line))
    expect(envelopes.map((e) => e.kind).sort()).toEqual(['tool-call', 'turn-end', 'turn-start'])
    const tool = envelopes.find((e) => e.kind === 'tool-call')
    expect(tool.sessionId).toBe('session-zz')
    expect(tool.ok).toBe(false)
    expect(tool.success).toBe(false)
    expect(tool.query.length).toBe(200) // cap 200 char
    expect(tool.durationMs).toBe(12)
    const start = envelopes.find((e) => e.kind === 'turn-start')
    expect(start).toMatchObject({ turn: 1, prompt: 'halo', provider: 'custom', model: 'm1', effort: 'low' })
  })
})
