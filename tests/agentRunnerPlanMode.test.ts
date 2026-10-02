// P1 plan-mode wiring (audit manager): `options.disableTools` HARUS diteruskan
// ke classifyMainDecision agar turn plan-mode terminal sebagai FINAL
// ('tools-disabled') — bukan advisory prompt yang bisa terjebak stagnation
// ladder. Invarian: aksi model TIDAK PERNAH sampai ke executeTool saat
// disableTools; build mode perilaku eksekusi tidak berubah.
import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { runAgentLoop } from '../src/api/ai/agentRunner.ts'

const toolDecision = {
  thought: 'Perlu baca file.',
  action: { tool: 'read-file', query: 'config.json' },
  answer: '',
  is_done: false
}

const talkDecision = {
  thought: 'Cukup jawab.',
  answer: 'Ini rencananya: langkah 1, langkah 2.',
  is_done: true,
  action: null,
  task_status: 'done'
}

// Transport fetchAI WAJIB async (FetchTransport kontraknya Promise):
// impl sinkron bikin core.fetchAI menerima objek non-thenable -> .then meledak.
const env = (aiImpl) => ({
  fetchAI: vi.fn().mockImplementation(async (...a) => aiImpl(...a)),
  executeTool: vi.fn().mockResolvedValue({ ok: true, result: 'isi' }),
  onThought: vi.fn(),
  onStep: vi.fn()
})

describe('agentRunner plan mode — disableTools wiring (P1)', () => {
  it('A. plan mode + model emit tool action -> executeTool TIDAK pernah dipanggil', async () => {
    const environment = env(() => ({
      content: JSON.stringify(toolDecision)
    }))
    const res = await runAgentLoop({
      prompt: 'buatkan rencana refactor',
      options: { maxTurns: 5, disableTools: true },
      environment
    })
    expect(environment.executeTool).not.toHaveBeenCalled()
    expect(res.success).toBe(true)
    expect(res.outcome).toBe('completed')
    expect(res.terminalReason).toBe('tools-disabled')
  })

  it('B. plan mode + model emit final answer -> terminal final (bukan FINAL-by-claim tanpa reason tools-disabled)', async () => {
    const environment = env(() => ({
      content: JSON.stringify(talkDecision)
    }))
    const res = await runAgentLoop({
      prompt: 'jelaskan rencana',
      options: { maxTurns: 5, disableTools: true },
      environment
    })
    expect(environment.executeTool).not.toHaveBeenCalled()
    expect(res.outcome).toBe('completed')
    expect(res.reply).toBe('Ini rencananya: langkah 1, langkah 2.')
    // Terminal karena tools-disabled path (classifier), bukan sekadar is_done.
    expect(res.terminalReason).toBe('tools-disabled')
  })

  it('C. plan mode respons berulang TANPA is_done -> tetap terminal, bukan stagnation loop', async () => {
    let calls = 0
    const environment = env(() => {
      calls++
      return {
        content: JSON.stringify({
          thought: 'mikir',
          answer: 'belum selesai',
          is_done: false,
          action: null
        })
      }
    })
    const res = await runAgentLoop({
      prompt: 'rencanakan sesuatu',
      options: { maxTurns: 20, disableTools: true },
      environment
    })
    expect(environment.executeTool).not.toHaveBeenCalled()
    expect(res.outcome).toBe('completed')
    expect(res.terminalReason).toBe('tools-disabled')
    expect(res.stepCount).toBeLessThanOrEqual(3)
    expect(calls).toBeLessThanOrEqual(3)
  })

  it('D. build mode (disableTools tidak diset) tetap mengeksekusi tool', async () => {
    let calls = 0
    const environment = env(() => {
      calls++
      if (calls === 1) return { content: JSON.stringify(toolDecision) }
      return {
        content: JSON.stringify({
          thought: 'selesai',
          answer: 'beres.',
          is_done: true,
          action: null,
          task_status: 'done'
        })
      }
    })
    const res = await runAgentLoop({
      prompt: 'baca file config',
      options: { maxTurns: 5 },
      environment
    })
    expect(environment.executeTool).toHaveBeenCalledOnce()
    expect(res.outcome).toBe('completed')
    expect(res.toolCallsCount).toBe(1)
  })

  it('E. /plan -> /build: build turn kembali mengeksekusi tool (disableTools off)', async () => {
    // Simulasi toggle: run pertama disableTools:true, run kedua tanpa flag —
    // state yang sama, loop baru. Kontrak: flag per-run, bukan sticky.
    const environment1 = env(() => ({ content: JSON.stringify(toolDecision) }))
    await runAgentLoop({
      prompt: 'plan dulu',
      options: { maxTurns: 5, disableTools: true },
      environment: environment1
    })
    expect(environment1.executeTool).not.toHaveBeenCalled()

    let calls = 0
    const environment2 = env(() => {
      calls++
      if (calls === 1) return { content: JSON.stringify(toolDecision) }
      return {
        content: JSON.stringify({ thought: 'ok', answer: 'done', is_done: true, action: null, task_status: 'done' })
      }
    })
    const res = await runAgentLoop({
      prompt: 'lanjut build',
      options: { maxTurns: 5 },
      environment: environment2
    })
    expect(environment2.executeTool).toHaveBeenCalledOnce()
    expect(res.toolCallsCount).toBe(1)
  })

  it('F. /build eksplisit (disableTools:false) identik dengan build default — idempoten', async () => {
    let calls = 0
    const runOnce = async () => {
      calls = 0
      const environment = env(() => {
        calls++
        if (calls === 1) return { content: JSON.stringify(toolDecision) }
        return {
          content: JSON.stringify({ thought: 'ok', answer: 'done', is_done: true, action: null, task_status: 'done' })
        }
      })
      const res = await runAgentLoop({
        prompt: 'kerja',
        options: { maxTurns: 5, disableTools: false },
        environment
      })
      return { res, environment }
    }
    const a = await runOnce()
    const b = await runOnce()
    expect(a.environment.executeTool).toHaveBeenCalledOnce()
    expect(b.environment.executeTool).toHaveBeenCalledOnce()
    expect(a.res.outcome).toBe('completed')
    expect(b.res.outcome).toBe('completed')
  })
})
