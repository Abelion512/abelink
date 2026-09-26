// tests/engineProtocol.test.mjs — Minimal typed client-engine contract & transport isolation tests (Phase A1).
import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'

import {
  EngineSession,
  createEngineSession,
  dispatchEngineCommand,
  ProviderRuntime,
  createProviderRuntime
} from '../cli/core/index.mjs'

describe('EngineProtocol — Phase A1 Contract & Boundary', () => {
  it('dispatches commands and emits typed lifecycle events', async () => {
    const events = []
    const mockFetch = vi.fn().mockImplementation(async (payload) => {
      return {
        content: JSON.stringify({
          thought: 'Saya akan membaca file.',
          action: { tool: 'read-file', query: 'sample.txt' },
          answer: null,
          is_done: false
        })
      }
    })

    let step = 0
    const mockTool = vi.fn().mockImplementation(async (tool, query) => {
      step++
      if (step === 1) {
        return { ok: true, result: 'isi file sample' }
      }
      return { ok: true, result: 'ok' }
    })

    const runtime = createProviderRuntime({
      provider: 'mock-provider',
      model: 'mock-model',
      fetchTransport: vi.fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            thought: 'Membaca sample file...',
            action: { tool: 'read-file', query: 'sample.txt' },
            is_done: false
          })
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            thought: 'Selesai membaca file.',
            action: null,
            answer: 'File berhasil dibaca: isi file sample',
            is_done: true,
            task_status: 'done'
          })
        })
    })

    const session = createEngineSession({
      sessionId: 'test-session-1',
      providerRuntime: runtime,
      environment: {
        executeTool: mockTool
      }
    })

    session.subscribe((ev) => events.push(ev))

    // 1. inspect_status
    const statusBefore = await dispatchEngineCommand(session, {
      type: 'inspect_status',
      payload: { sessionId: session.sessionId }
    })
    expect(statusBefore.status).toBe('idle')
    expect(statusBefore.hasProviderRuntime).toBe(true)

    // 2. run_task
    const runResult = await dispatchEngineCommand(session, {
      type: 'run_task',
      payload: {
        sessionId: session.sessionId,
        prompt: 'Baca file sample.txt',
        options: { maxTurns: 5 }
      }
    })

    expect(runResult.success).toBe(true)
    expect(session.status).toBe('completed')

    // Verifikasi event stream yang di-emit
    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toContain('session.started')
    expect(eventTypes).toContain('tool.started')
    expect(eventTypes).toContain('tool.result')
    expect(eventTypes).toContain('progress.updated')
    expect(eventTypes).toContain('session.completed')

    // Verifikasi payload tool.result
    const toolResultEvent = events.find((e) => e.type === 'tool.result')
    expect(toolResultEvent).toMatchObject({
      sessionId: 'test-session-1',
      tool: 'read-file',
      ok: true,
      result: 'isi file sample'
    })
  })

  it('handles pause, send_input, and resume_session', async () => {
    const events = []
    const runtime = createProviderRuntime({
      fetchTransport: vi.fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            thought: 'Saya butuh konfirmasi user.',
            action: null,
            answer: 'Apakah Anda yakin ingin melanjutkan?',
            is_done: false,
            task_status: 'needs_user'
          })
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            thought: 'User setuju, saya selesaikan tugas.',
            action: null,
            answer: 'Tugas selesai setelah konfirmasi.',
            is_done: true,
            task_status: 'done'
          })
        })
    })

    const session = createEngineSession({
      sessionId: 'test-session-checkpoint',
      providerRuntime: runtime,
      environment: {
        executeTool: vi.fn().mockResolvedValue({ ok: true, result: 'done' })
      }
    })

    session.subscribe((ev) => events.push(ev))

    // Jalankan tugas yang memicu needs_user
    const firstRun = await session.runTask('Tanya user dulu sebelum proses.')
    expect(firstRun.outcome).toBe('needs_user')
    expect(session.status).toBe('paused')
    expect(session.checkpoint).toBeTruthy()

    // Verifikasi event checkpoint.created dan session.paused
    const eventTypes = events.map((e) => e.type)
    expect(eventTypes).toContain('checkpoint.created')
    expect(eventTypes).toContain('session.paused')

    // Kirim input via send_input
    const sendRes = await dispatchEngineCommand(session, {
      type: 'send_input',
      payload: { sessionId: session.sessionId, input: 'Ya, saya yakin lanjutkan.' }
    })
    expect(sendRes.ok).toBe(true)
    expect(session.checkpoint.pendingUserInput).toBe('Ya, saya yakin lanjutkan.')

    // Resume sesi
    const resumeRes = await dispatchEngineCommand(session, {
      type: 'resume_session',
      payload: { sessionId: session.sessionId }
    })
    expect(resumeRes.success).toBe(true)
    expect(session.status).toBe('completed')
    expect(session.checkpoint).toBeNull()
  })

  it('handles cancel command gracefully', async () => {
    const events = []
    let cancelCalled = false

    const runtime = createProviderRuntime({
      fetchTransport: vi.fn().mockImplementation(async () => {
        // Simulasi latensi di mana pembatalan dipanggil
        await new Promise((r) => setTimeout(r, 50))
        return {
          content: JSON.stringify({
            thought: 'Berjalan...',
            action: { tool: 'heavy-task', query: '' },
            is_done: false
          })
        }
      })
    })

    const session = createEngineSession({
      sessionId: 'test-session-cancel',
      providerRuntime: runtime,
      environment: {
        executeTool: vi.fn().mockImplementation(async () => {
          session.cancel('Dibatalkan pengguna')
          return { ok: true, result: 'ok' }
        })
      }
    })

    session.subscribe((ev) => events.push(ev))

    const runPromise = session.runTask('Mulai tugas panjang')
    const result = await runPromise

    expect(session.status).toBe('cancelled')
    const cancelEvent = events.find((e) => e.type === 'session.cancelled')
    expect(cancelEvent).toBeTruthy()
  })

  it('concurrent session isolation — two concurrent sessions do NOT overwrite transports', async () => {
    // Pastikan tidak ada global mutable state yang saling menimpa
    const initialGlobalFetch = globalThis.__ABELINK_AI_FETCH__

    const transportA = vi.fn().mockImplementation(async () => {
      // Delay kecil untuk memastikan interleaved execution
      await new Promise((r) => setTimeout(r, 20))
      return {
        content: JSON.stringify({
          thought: 'Jawaban dari transport A',
          answer: 'Hasil A',
          is_done: true,
          action: null
        })
      }
    })

    const transportB = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return {
        content: JSON.stringify({
          thought: 'Jawaban dari transport B',
          answer: 'Hasil B',
          is_done: true,
          action: null
        })
      }
    })

    const sessionA = createEngineSession({
      sessionId: 'session-alpha',
      providerRuntime: createProviderRuntime({
        provider: 'provider-alpha',
        model: 'model-alpha',
        fetchTransport: transportA
      }),
      environment: { executeTool: vi.fn() }
    })

    const sessionB = createEngineSession({
      sessionId: 'session-beta',
      providerRuntime: createProviderRuntime({
        provider: 'provider-beta',
        model: 'model-beta',
        fetchTransport: transportB
      }),
      environment: { executeTool: vi.fn() }
    })

    // Jalankan kedua sesi secara paralel
    const [resA, resB] = await Promise.all([
      sessionA.runTask('Task for session A'),
      sessionB.runTask('Task for session B')
    ])

    // Sesi A harus memanggil transport A dan mendapatkan jawaban A
    expect(transportA).toHaveBeenCalled()
    expect(resA.reply).toBe('Hasil A')

    // Sesi B harus memanggil transport B dan mendapatkan jawaban B
    expect(transportB).toHaveBeenCalled()
    expect(resB.reply).toBe('Hasil B')

    // Transport A tidak pernah dipanggil oleh sesi B dan sebaliknya
    expect(transportA.mock.calls.length).toBe(1)
    expect(transportB.mock.calls.length).toBe(1)

    // globalThis.__ABELINK_AI_FETCH__ tidak termutasi sama sekali
    expect(globalThis.__ABELINK_AI_FETCH__).toBe(initialGlobalFetch)
  })
})
