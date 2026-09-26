import { runAgentLoop } from '../../src/api/ai/agentRunner.js'
import { ProviderRuntime } from './provider-runtime.mjs'

let defaultTaskStore = null
async function resolveTaskStore(storeOption) {
  if (storeOption && typeof storeOption === 'object') return storeOption
  if (defaultTaskStore) return defaultTaskStore
  try {
    defaultTaskStore = await import('../../src/api/taskStore.js')
    return defaultTaskStore
  } catch (_) {
    return null
  }
}

export class EngineSession {
  constructor({
    sessionId = null,
    providerRuntime = null,
    environment = {},
    baseEnvironment = null,
    store = null,
    options = {}
  } = {}) {
    this.sessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const baseEnv = baseEnvironment || environment || {}
    this.baseEnvironment = baseEnv
    this.providerRuntime = providerRuntime instanceof ProviderRuntime
      ? providerRuntime
      : new ProviderRuntime({
        ...(typeof providerRuntime === 'object' ? providerRuntime : {}),
        fetchTransport: providerRuntime?.fetchTransport || baseEnv.fetchAI || null
      })
    this.status = 'idle' // 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
    this.subscribers = new Set()
    this.checkpoint = null
    this.abortController = null
    this.stepCount = 0
    this.options = { ...options }
    this.activePrompt = null
    this.store = store || null
  }

  // Mengakses store persistensi kanonikal (taskStore)
  async getStore() {
    if (this.store) return this.store
    return resolveTaskStore()
  }

  // Memulihkan checkpoint dari authoritative persistence store
  async loadPersistedCheckpoint() {
    const store = await this.getStore()
    if (store && typeof store.getAgentTask === 'function') {
      try {
        const task = await store.getAgentTask(this.sessionId)
        if (task?.checkpoint) {
          this.checkpoint = { ...task.checkpoint }
          this.activePrompt = this.checkpoint.prompt || this.activePrompt
          this.stepCount = this.checkpoint.stepCount || 0
          this.status = 'paused'
          return this.checkpoint
        }
      } catch (_) {}
    }
    return null
  }

  // Mendaftarkan listener event stream
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    this.subscribers.add(listener)
    return () => this.subscribers.delete(listener)
  }

  // Mengirim event terstruktur ke semua subscriber
  emit(event) {
    const enriched = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      ...event
    }
    for (const sub of this.subscribers) {
      try {
        sub(enriched)
      } catch (err) {
        console.error('[EngineSession] subscriber listener error:', err)
      }
    }
    return enriched
  }

  // Menginspeksi status sesi saat ini
  inspectStatus() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      stepCount: this.stepCount,
      checkpoint: this.checkpoint,
      hasProviderRuntime: !!this.providerRuntime,
      provider: this.providerRuntime?.provider || null,
      model: this.providerRuntime?.model || null
    }
  }

  // Menghentikan sementara sesi yang sedang berjalan
  async pause(reason = 'manual_pause') {
    if (this.status !== 'running') return false
    const candidateCheckpoint = {
      ...(this.checkpoint || {}),
      sessionId: this.sessionId,
      prompt: this.activePrompt,
      pausedAt: Date.now(),
      reason
    }
    const store = await this.getStore()
    if (store && typeof store.updateAgentTask === 'function') {
      try {
        await store.updateAgentTask(this.sessionId, {
          status: 'paused',
          checkpoint: candidateCheckpoint
        })
      } catch (err) {
        this.emit({
          type: 'checkpoint.failed',
          error: err?.message || 'persistence-failed',
          reason: 'manual_pause_store_rejected'
        })
        return false
      }
    }
    this.status = 'paused'
    this.checkpoint = candidateCheckpoint
    if (this.abortController) {
      this.abortController.abort(new Error(`Session paused: ${reason}`))
    }
    this.emit({ type: 'checkpoint.created', checkpoint: this.checkpoint })
    this.emit({ type: 'session.paused', reason })
    return true
  }

  // Membatalkan sesi (eksplisit user cancel)
  cancel(reason = 'manual_cancel') {
    if (this.status !== 'running' && this.status !== 'paused') return false
    this.status = 'cancelled'
    if (this.abortController) {
      this.abortController.abort(new Error(`Session cancelled: ${reason}`))
    }
    this.emit({ type: 'session.cancelled', reason })
    return true
  }

  // Mengirim input tambahan dari user ke sesi yang menunggu/jeda
  async sendInput(input) {
    if (!input || typeof input !== 'string') {
      return { ok: false, error: 'Input wajib berupa string.' }
    }
    if (!this.checkpoint) {
      await this.loadPersistedCheckpoint()
    }
    if (this.status === 'paused' || this.checkpoint) {
      const updatedCheckpoint = {
        ...(this.checkpoint || {}),
        pendingUserInput: input
      }
      const store = await this.getStore()
      if (store && typeof store.updateAgentTask === 'function') {
        try {
          await store.updateAgentTask(this.sessionId, { checkpoint: updatedCheckpoint })
        } catch (err) {
          this.emit({
            type: 'checkpoint.failed',
            error: err?.message || 'persistence-failed',
            reason: 'input_persistence_failed'
          })
          return { ok: false, error: `Gagal menyimpan input pengguna ke taskStore: ${err?.message || 'write-rejected'}` }
        }
      }
      this.checkpoint = updatedCheckpoint
      this.emit({ type: 'session.input_received', input })
      return { ok: true, status: this.status, queued: true }
    }
    return { ok: false, error: 'Session tidak sedang menunggu input atau dalam status paused.' }
  }

  // Menjalankan tugas otonom baru
  async runTask(prompt, taskOptions = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('EngineSession.runTask: prompt wajib berupa string non-kosong.')
    }

    this.activePrompt = taskOptions.originalPrompt || prompt
    this.status = 'running'
    this.abortController = new AbortController()

    const mergedOptions = {
      ...this.options,
      ...taskOptions,
      sessionId: this.sessionId,
      signal: this.abortController.signal
    }

    if (this.providerRuntime?.provider && !mergedOptions.provider) {
      mergedOptions.provider = this.providerRuntime.provider
    }
    if (this.providerRuntime?.model && !mergedOptions.model) {
      mergedOptions.model = this.providerRuntime.model
    }

    this.emit({
      type: 'session.started',
      prompt,
      options: mergedOptions
    })

    const sessionEnv = {
      ...this.baseEnvironment,
      // Transport terisolasi per sesi tanpa mutasi global
      fetchAI: async (payload, opts) => {
        if (typeof this.providerRuntime?.fetchAI === 'function') {
          return this.providerRuntime.fetchAI(payload, opts)
        }
        if (typeof this.baseEnvironment.fetchAI === 'function') {
          return this.baseEnvironment.fetchAI(payload, opts)
        }
        throw new Error('AI transport tidak tersedia di EngineSession.')
      },
      executeTool: async (tool, query, meta) => {
        const stepNum = meta?.step || this.stepCount
        this.emit({ type: 'tool.started', tool, query, step: stepNum })
        const start = Date.now()
        let res
        try {
          res = await this.baseEnvironment.executeTool(tool, query, meta)
        } catch (err) {
          res = {
            ok: false,
            result: `[ERROR] Tool ${tool} gagal: ${err.message}`,
            error: { code: 'tool-error', message: err.message }
          }
        }
        const durationMs = Date.now() - start
        const isOk = res?.ok === true
        const textResult = typeof res?.result === 'string'
          ? res.result
          : JSON.stringify(res?.result ?? res?.error ?? 'ok')

        this.emit({
          type: 'tool.result',
          tool,
          ok: isOk,
          result: textResult,
          durationMs,
          step: stepNum
        })
        return res
      },
      onThought: (text) => {
        this.emit({ type: 'assistant.delta', delta: text })
        this.baseEnvironment.onThought?.(text)
      },
      onStep: (stepTrace) => {
        this.stepCount = stepTrace?.step || this.stepCount + 1
        if (stepTrace?.kind === 'decision') {
          this.emit({
            type: 'progress.updated',
            step: this.stepCount,
            decision: stepTrace.decision
          })
        }
        this.baseEnvironment.onStep?.(stepTrace)
      }
    }

    mergedOptions.transport = sessionEnv.fetchAI
    mergedOptions.fetchAI = sessionEnv.fetchAI

    const store = await this.getStore()
    if (store && typeof store.getAgentTask === 'function') {
      try {
        const existing = await store.getAgentTask(this.sessionId)
        if (!existing && typeof store.createAgentTask === 'function') {
          await store.createAgentTask({
            id: this.sessionId,
            title: (this.activePrompt || 'Engine Task').slice(0, 50),
            objective: this.activePrompt || '',
            mode: 'durable',
            status: 'running',
            steps: [{ id: `${this.sessionId}-step-1`, title: 'Execution', objective: this.activePrompt || '' }]
          })
        } else if (existing && typeof store.updateAgentTask === 'function') {
          await store.updateAgentTask(this.sessionId, { status: 'running' })
        }
      } catch (_) {}
    }

    try {
      const result = await runAgentLoop({
        prompt,
        options: mergedOptions,
        environment: sessionEnv
      })

      this.stepCount = result.stepCount || this.stepCount

      if (result.outcome === 'needs_user') {
        const candidateCheckpoint = {
          sessionId: this.sessionId,
          prompt: this.activePrompt,
          originalPrompt: mergedOptions.originalPrompt || this.activePrompt,
          lastReply: result.reply,
          history: result.history,
          stepCount: result.stepCount,
          executedTools: result.executedTools,
          terminalReason: result.terminalReason,
          pendingUserInput: this.checkpoint?.pendingUserInput || null,
          timestamp: Date.now()
        }

        if (store && typeof store.updateAgentTask === 'function') {
          try {
            await store.updateAgentTask(this.sessionId, {
              status: 'paused',
              checkpoint: candidateCheckpoint
            })
          } catch (err) {
            // Checkpoint persistence MUST fail closed: do NOT claim durable checkpoint
            this.status = 'failed'
            this.checkpoint = null
            this.emit({
              type: 'checkpoint.failed',
              error: err?.message || 'persistence-failed',
              reason: 'store_write_rejected'
            })
            this.emit({
              type: 'session.failed',
              error: `Checkpoint persistence failed: ${err?.message || 'store write rejected'}`,
              terminalReason: 'checkpoint-persistence-failed'
            })
            return {
              ...result,
              success: false,
              outcome: 'failed',
              terminalReason: `checkpoint-persistence-failed:${err?.message || 'store-write-rejected'}`
            }
          }
        }

        // Only after persistence succeeds do we expose paused/checkpoint state
        this.status = 'paused'
        this.checkpoint = candidateCheckpoint
        this.emit({ type: 'checkpoint.created', checkpoint: this.checkpoint })
        this.emit({ type: 'session.paused', reason: result.terminalReason || 'needs_user' })
        return result
      }

      if (result.outcome === 'user_abort' || this.abortController.signal.aborted) {
        this.status = 'cancelled'
        if (store && typeof store.updateAgentTask === 'function') {
          try {
            await store.updateAgentTask(this.sessionId, {
              status: 'cancelled',
              error: result.terminalReason || 'user_abort'
            })
          } catch (_) {}
        }
        this.emit({ type: 'session.cancelled', reason: result.terminalReason || 'user_abort' })
        return result
      }

      if (result.success) {
        this.status = 'completed'
        if (store && typeof store.updateAgentTask === 'function') {
          try {
            await store.updateAgentTask(this.sessionId, {
              status: 'completed',
              completedAt: Date.now(),
              checkpoint: null
            })
          } catch (_) {}
        }
        this.emit({
          type: 'session.completed',
          outcome: result.outcome,
          reply: result.reply,
          stepCount: result.stepCount
        })
        return result
      }

      this.status = 'failed'
      if (store && typeof store.updateAgentTask === 'function') {
        try {
          await store.updateAgentTask(this.sessionId, {
            status: 'failed',
            error: result.terminalReason || 'task-failed'
          })
        } catch (_) {}
      }
      this.emit({
        type: 'session.failed',
        error: result.terminalReason || 'task-failed',
        terminalReason: result.terminalReason
      })
      return result
    } catch (err) {
      if (this.abortController.signal.aborted) {
        this.status = 'cancelled'
        if (store && typeof store.updateAgentTask === 'function') {
          try {
            await store.updateAgentTask(this.sessionId, {
              status: 'cancelled',
              error: err.message
            })
          } catch (_) {}
        }
        this.emit({ type: 'session.cancelled', reason: err.message })
        return { success: false, outcome: 'cancelled', terminalReason: 'aborted-by-signal', reply: '', stepCount: this.stepCount }
      }
      this.status = 'failed'
      if (store && typeof store.updateAgentTask === 'function') {
        try {
          await store.updateAgentTask(this.sessionId, {
            status: 'failed',
            error: err.message
          })
        } catch (_) {}
      }
      this.emit({ type: 'session.failed', error: err.message, terminalReason: 'runner-error' })
      throw err
    }
  }

  // Melanjutkan sesi dari checkpoint yang tersimpan (in-memory atau persisted store)
  async resumeSession(input = '', resumeOptions = {}) {
    if (!this.checkpoint) {
      await this.loadPersistedCheckpoint()
    }
    if (!this.checkpoint) {
      throw new Error(`EngineSession.resumeSession: Tidak ada checkpoint yang dapat di-resume untuk sesi ${this.sessionId}.`)
    }

    const userInput = input || this.checkpoint.pendingUserInput || 'Lanjutkan tugas.'
    const initialHistory = Array.isArray(this.checkpoint.history) ? [...this.checkpoint.history] : []
    const initialExecutedTools = Array.isArray(this.checkpoint.executedTools) ? [...this.checkpoint.executedTools] : []
    const initialStepCount = this.checkpoint.stepCount || this.stepCount || 0
    const originalPrompt = this.checkpoint.originalPrompt || this.checkpoint.prompt || this.activePrompt || userInput

    const nextOptions = {
      ...this.options,
      ...resumeOptions,
      originalPrompt,
      initialHistory,
      initialExecutedTools,
      initialStepCount
    }

    // Bersihkan checkpoint yang sudah di-resume
    this.checkpoint = null

    return this.runTask(userInput, nextOptions)
  }

  // Dispatcher perintah generik
  async dispatch(command) {
    return dispatchEngineCommand(this, command)
  }
}

// Handler pengirim perintah client ke engine session
export async function dispatchEngineCommand(session, command) {
  if (!session || typeof session.runTask !== 'function') {
    throw new Error('dispatchEngineCommand: session wajib instance dari EngineSession.')
  }
  if (!command || typeof command.type !== 'string') {
    throw new Error('dispatchEngineCommand: command.type wajib string.')
  }

  switch (command.type) {
    case 'run_task':
      return session.runTask(command.payload?.prompt, command.payload?.options)
    case 'resume_session':
      return session.resumeSession(command.payload?.input, command.payload?.options)
    case 'pause':
      return session.pause(command.payload?.reason)
    case 'cancel':
      return session.cancel(command.payload?.reason)
    case 'send_input':
      return session.sendInput(command.payload?.input)
    case 'inspect_status':
      return session.inspectStatus()
    case 'subscribe_stream':
      if (typeof command.payload?.listener === 'function') {
        return session.subscribe(command.payload.listener)
      }
      return session.inspectStatus()
    default:
      throw new Error(`Unknown engine command type: ${command.type}`)
  }
}

export function createEngineSession(config = {}) {
  return new EngineSession(config)
}
