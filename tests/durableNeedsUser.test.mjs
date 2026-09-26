// tests/durableNeedsUser.test.mjs — Phase B4: Durable Needs User & Checkpoint Resume Tests.
//
// Contracts pinned here:
//   - A decision classified as INTENT.NEEDS_USER does NOT cause terminal session failure.
//   - Instead, the session status transitions to 'paused' and creates a structured checkpoint.
//   - Checkpoint records: prompt, originalPrompt, history, stepCount, executedTools, terminalReason.
//   - sendInput queues user decision/input into the checkpoint.
//   - resumeSession restores the exact state without resetting stepCount or discarding executed tools.
//   - Subsequent tool actions complete the original objective end-to-end.
//
// Durability Boundary Classification (Strictly Governed):
//   - Cross-instance recreation (same process): PASS.
//     Proven in Scenario E5: destroying sessionA and creating sessionB with the same sessionId
//     reloads the checkpoint from taskStore (Dexie agentTasks).
//   - Cross-process durability (headless): PARTIAL / NOT SUPPORTED IN HEADLESS IN-MEMORY.
//     Headless Node/Bun runs on fake-indexeddb (in-memory shim). True cross-process durability
//     across OS process boundaries in CLI requires an authoritative disk-backed adapter (e.g. SQLite),
//     which is deferred to subsequent architecture phases. Tauri GUI uses browser disk IndexedDB.

import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { createEngineSession, dispatchEngineCommand } from '../cli/core/engine-session.mjs'

describe('Scenario E: Durable needs_user checkpoint & resume lifecycle', () => {
  it('Scenario E1 & E2: needs_user pauses session and records structured checkpoint', async () => {
    let turn = 0
    const events = []

    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        // Step 1: Tool preparation
        return {
          content: JSON.stringify({
            thought: 'Menyiapkan struktur direktori database',
            action: { tool: 'list-dir', query: 'migrations' }
          })
        }
      }
      // Step 2: Needs user decision
      return {
        content: JSON.stringify({
          thought: 'Perlu konfirmasi database driver dari pengguna',
          answer: 'Apakah Anda ingin menggunakan PostgreSQL atau SQLite?',
          is_done: false,
          task_status: 'needs_user',
          action: null
        })
      }
    }

    const session = createEngineSession({
      baseEnvironment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'migrations/' })
      }
    })

    session.subscribe((ev) => events.push(ev))

    const result = await session.runTask('Siapkan migrasi database dan simpan schema.sql')

    // Verification of paused outcome (NOT failed)
    expect(result.outcome).toBe('needs_user')
    expect(session.status).toBe('paused')
    expect(session.checkpoint).toBeTruthy()
    expect(session.checkpoint.stepCount).toBeGreaterThanOrEqual(2)
    expect(session.checkpoint.executedTools.length).toBe(1)
    expect(session.checkpoint.executedTools[0].tool).toBe('list-dir')
    expect(session.checkpoint.lastReply).toContain('PostgreSQL atau SQLite')

    // Verify events emitted
    const checkpointEvent = events.find((e) => e.type === 'checkpoint.created')
    const pausedEvent = events.find((e) => e.type === 'session.paused')
    expect(checkpointEvent).toBeTruthy()
    expect(pausedEvent).toBeTruthy()

    // Test sendInput queuing
    const sendRes = await session.sendInput('Gunakan PostgreSQL')
    expect(sendRes.ok).toBe(true)
    expect(session.checkpoint.pendingUserInput).toBe('Gunakan PostgreSQL')
  })

  it('Scenario E3: resumeSession continues from checkpoint without restarting from zero', async () => {
    let turn = 0
    const executedTools = []

    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        return {
          content: JSON.stringify({
            thought: 'Langkah awal membaca berkas lama',
            action: { tool: 'read-file', query: 'old_schema.sql' }
          })
        }
      }
      if (turn === 2) {
        // Asks for user input
        return {
          content: JSON.stringify({
            thought: 'Memerlukan pilihan tabel pengguna',
            answer: 'Berapa jumlah tabel yang ingin dibuat?',
            is_done: false,
            task_status: 'needs_user',
            action: null
          })
        }
      }
      if (turn === 3) {
        // Resumed turn: receives user input ("Buat 3 tabel: users, orders, items")
        return {
          content: JSON.stringify({
            thought: 'User telah menentukan 3 tabel. Sekarang saya tulis skema.',
            action: { tool: 'write-file', query: 'schema.sql || CREATE TABLE users; CREATE TABLE orders; CREATE TABLE items;' }
          })
        }
      }
      // Step 4: Final completion
      return {
        content: JSON.stringify({
          thought: 'Skema berhasil ditulis lengkap',
          answer: 'Skema dengan 3 tabel berhasil dibuat di schema.sql',
          is_done: true,
          action: null
        })
      }
    }

    const session = createEngineSession({
      baseEnvironment: {
        fetchAI: mockFetchAI,
        executeTool: async (tool, query) => {
          executedTools.push(tool)
          return { ok: true, result: 'ok' }
        }
      }
    })

    // Run phase 1: pauses at step 2
    const initialResult = await session.runTask('Siapkan skema database dan simpan ke schema.sql')
    expect(initialResult.outcome).toBe('needs_user')
    expect(session.status).toBe('paused')
    expect(executedTools).toEqual(['read-file'])
    const pausedStepCount = session.checkpoint.stepCount

    // Run phase 2: resume with input
    const resumeResult = await session.resumeSession('Buat 3 tabel: users, orders, items')

    expect(resumeResult.outcome).toBe('completed')
    expect(session.status).toBe('completed')
    // Tools from phase 1 are preserved, and new tools were executed
    expect(executedTools).toEqual(['read-file', 'write-file'])
    // Step count continued past pausedStepCount
    expect(resumeResult.stepCount).toBeGreaterThan(pausedStepCount)
  })

  it('Scenario E4: dispatchEngineCommand integrates pause, send_input, and resume_session', async () => {
    let turn = 0
    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        return {
          content: JSON.stringify({
            thought: 'Tanya user',
            answer: 'Pilih nama database?',
            is_done: false,
            task_status: 'needs_user',
            action: null
          })
        }
      }
      if (turn === 2) {
        return {
          content: JSON.stringify({
            thought: 'User sudah menjawab nama db, simpan config',
            action: { tool: 'write-file', query: 'db.conf || DBNAME=prod' }
          })
        }
      }
      return {
        content: JSON.stringify({
          thought: 'Konfigurasi tersimpan',
          answer: 'Database prod berhasil dikonfigurasi di db.conf',
          is_done: true,
          action: null
        })
      }
    }

    const session = createEngineSession({
      baseEnvironment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    // Dispatch run_task
    const r1 = await dispatchEngineCommand(session, {
      type: 'run_task',
      payload: { prompt: 'Konfigurasi database dan simpan ke db.conf' }
    })
    expect(r1.outcome).toBe('needs_user')
    expect(session.status).toBe('paused')

    // Dispatch send_input
    const r2 = await dispatchEngineCommand(session, {
      type: 'send_input',
      payload: { input: 'prod' }
    })
    expect(r2.ok).toBe(true)

    // Dispatch resume_session
    const r3 = await dispatchEngineCommand(session, {
      type: 'resume_session',
      payload: {}
    })
    expect(r3.outcome).toBe('completed')
    expect(session.status).toBe('completed')
  })

  it('Scenario E5: persists checkpoint to authoritative taskStore and survives EngineSession destruction & recreation', async () => {
    let turn = 0
    const sessionId = `persist-session-${Date.now()}`
    const executedTools = []

    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        return {
          content: JSON.stringify({
            thought: 'Langkah 1: menulis skema awal',
            action: { tool: 'write-file', query: 'products.sql || CREATE TABLE products (id INT);' }
          })
        }
      }
      if (turn === 2) {
        return {
          content: JSON.stringify({
            thought: 'Perlu konfirmasi tipe ID produk dari pengguna',
            answer: 'Apakah tipe ID produk ingin UUID atau BIGINT?',
            is_done: false,
            task_status: 'needs_user',
            action: null
          })
        }
      }
      if (turn === 3) {
        return {
          content: JSON.stringify({
            thought: 'User telah memilih tipe ID, lanjutkan migrasi',
            action: { tool: 'write-file', query: 'relations.sql || ALTER TABLE products ADD COLUMN uuid UUID;' }
          })
        }
      }
      return {
        content: JSON.stringify({
          thought: 'Migrasi database selesai',
          answer: 'Skema berhasil diperbarui dengan UUID',
          is_done: true,
          action: null
        })
      }
    }

    const mockExecuteTool = async (tool, query) => {
      executedTools.push({ tool, query })
      return { ok: true, result: 'ok' }
    }

    // 1. Inisialisasi sesi pertama (sessionA)
    let sessionA = createEngineSession({
      sessionId,
      baseEnvironment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    const initialRes = await sessionA.runTask('Rancang skema database tabel produk')
    expect(initialRes.outcome).toBe('needs_user')
    expect(sessionA.status).toBe('paused')
    expect(sessionA.checkpoint).toBeTruthy()
    expect(sessionA.checkpoint.stepCount).toBeGreaterThanOrEqual(2)
    expect(executedTools).toHaveLength(1)

    // 2. Simulasi kehancuran total instance sessionA di memory (proses / lifecycle boundary)
    sessionA = null

    // 3. Buat instance EngineSession baru (sessionB) dengan sessionId yang sama
    const sessionB = createEngineSession({
      sessionId,
      baseEnvironment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    // Pada instance baru sebelum resume, checkpoint di memori lokal masih null
    expect(sessionB.checkpoint).toBeNull()

    // 4. Resume dari sessionB dengan input pengguna
    // sessionB wajib memuat checkpoint yang tersimpan dari taskStore secara otomatis
    const resumeRes = await sessionB.resumeSession('Gunakan UUID')

    expect(resumeRes.outcome).toBe('completed')
    expect(sessionB.status).toBe('completed')
    // Tools dari fase 1 (sebelum pause) tetap aman dan dieksekusi lanjutannya
    expect(executedTools).toHaveLength(2)
    expect(executedTools[0].tool).toBe('write-file')
    expect(executedTools[1].tool).toBe('write-file')
    expect(executedTools[1].query).toContain('relations.sql')
  })

  it('Scenario E6: documents boundary constraint between cross-instance recreation vs cross-process headless durability', async () => {
    // Structural assertion and contract pin:
    // 1. Cross-instance recreation is proven by Scenario E5 (shared taskStore in process).
    // 2. Cross-process durability in headless CLI is explicitly documented as PARTIAL/NOT_SUPPORTED
    //    because fake-indexeddb is strictly in-memory per Node process.
    // 3. In the Tauri GUI, Dexie is backed by the browser engine's physical IndexedDB on disk.
    const isFakeIndexedDbActive = typeof indexedDB !== 'undefined' && indexedDB._databases !== undefined
    expect(isFakeIndexedDbActive).toBe(true)

    // Verify EngineSession cleanly reports status without crashing when store is queried
    const session = createEngineSession()
    const store = await session.getStore()
    expect(store).not.toBeNull()
    expect(typeof store.getAgentTask).toBe('function')
  })

  it('Scenario E7: checkpoint persistence MUST fail closed when store write rejects', async () => {
    // When store.updateAgentTask throws an error, EngineSession MUST NOT:
    // 1. claim durable checkpoint exists
    // 2. expose status = 'paused'
    // 3. emit checkpoint.created
    // Instead it must:
    // 1. set status = 'failed'
    // 2. set checkpoint = null
    // 3. emit checkpoint.failed and session.failed
    // 4. return outcome = 'failed' with terminalReason indicating persistence failure
    const events = []
    const mockFaultyStore = {
      getAgentTask: async () => null,
      createAgentTask: async () => ({ id: 'faulty-task' }),
      updateAgentTask: async () => {
        throw new Error('Simulated disk I/O rejection / storage full')
      }
    }

    const session = createEngineSession({
      store: mockFaultyStore,
      baseEnvironment: {
        fetchAI: async () => ({
          content: JSON.stringify({
            thought: 'Menanyakan pengguna pilihan parameter',
            answer: 'Pilih mode A atau B?',
            task_status: 'needs_user',
            is_done: false
          })
        }),
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    session.subscribe((ev) => events.push(ev))

    const res = await session.runTask('Tanya pengguna mode')

    // Invariant: Failed persistence fails closed
    expect(res.outcome).toBe('failed')
    expect(res.success).toBe(false)
    expect(res.terminalReason).toContain('checkpoint-persistence-failed')
    expect(session.status).toBe('failed')
    expect(session.checkpoint).toBeNull()

    // Events must reflect persistence failure
    const failedCheckpointEv = events.find((e) => e.type === 'checkpoint.failed')
    const failedSessionEv = events.find((e) => e.type === 'session.failed')
    const createdCheckpointEv = events.find((e) => e.type === 'checkpoint.created')
    const pausedSessionEv = events.find((e) => e.type === 'session.paused')

    expect(failedCheckpointEv).toBeTruthy()
    expect(failedCheckpointEv.reason).toBe('store_write_rejected')
    expect(failedSessionEv).toBeTruthy()
    expect(createdCheckpointEv).toBeUndefined()
    expect(pausedSessionEv).toBeUndefined()

    // Attempting to resume from failed persistence MUST throw
    await expect(session.resumeSession('Coba resume')).rejects.toThrow(/Tidak ada checkpoint yang dapat di-resume/)
  })

  it('Scenario E8: pause() and sendInput() fail closed when store write rejects', async () => {
    const mockFaultyStore = {
      getAgentTask: async () => null,
      updateAgentTask: async () => {
        throw new Error('Database write error')
      }
    }

    const session = createEngineSession({
      store: mockFaultyStore
    })

    // 1. sendInput when not paused
    const resUnpaused = await session.sendInput('input')
    expect(resUnpaused.ok).toBe(false)

    // 2. pause() on running session fails closed if store write fails
    session.status = 'running'
    session.activePrompt = 'Sedang berjalan'
    const pauseOk = await session.pause('manual')
    expect(pauseOk).toBe(false)
    expect(session.status).toBe('running') // status not set to paused
    expect(session.checkpoint).toBeNull() // checkpoint not set
  })
})
