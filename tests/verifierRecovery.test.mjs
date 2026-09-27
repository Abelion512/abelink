// tests/verifierRecovery.test.mjs — Phase B2: Verifier Fail-Closed & Evidence Recovery Tests.
//
// Contracts pinned here:
//   - Missing evidence triggers a targeted replan observation, not an instant kill.
//   - Intervening tool executions (targeted recovery) allow the mission to continue
//     towards eventual completion beyond rigid 2-turn replan traps.
//   - Consecutive unverified claims without intervening tool executions are strictly bounded.
//   - Internal verifier exceptions MUST NEVER fake a "completed" session outcome (fail-closed).

import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { runAgentLoop } from '../src/api/ai/agentRunner.js'
import {
  canAttemptEvidenceRecovery,
  MAX_VERIFY_REPLANS,
  VERIFICATION_STATE
} from '../src/api/ai/objectiveVerifier.js'

describe('canAttemptEvidenceRecovery helper', () => {
  it('allows recovery when productive new evidence was gathered', () => {
    expect(canAttemptEvidenceRecovery({ consecutiveRejections: 5, hasNewEvidence: true })).toBe(true)
    expect(canAttemptEvidenceRecovery({ consecutiveRejections: 10, hasNewEvidence: true })).toBe(true)
  })

  it('bounds unproven claims when no new evidence is gathered', () => {
    expect(canAttemptEvidenceRecovery({ consecutiveRejections: 1, hasNewEvidence: false })).toBe(true)
    expect(canAttemptEvidenceRecovery({ consecutiveRejections: 2, hasNewEvidence: false })).toBe(true)
    expect(canAttemptEvidenceRecovery({ consecutiveRejections: 3, hasNewEvidence: false })).toBe(false)
  })
})

describe('Scenario C: Verifier Recovery & Fail-Closed Guardrails', () => {
  it('Scenario C1: missing evidence triggers replan -> targeted recovery -> eventual completion', async () => {
    // A code task with tests requested:
    // Step 1: Model writes the fix
    // Step 2: Model claims done prematurely (verifier rejects: tests-pass unresolved)
    // Step 3: Model performs targeted recovery by running the test suite
    // Step 4: Model claims done again with test output evidence -> completed!
    let turn = 0
    const executedTools = []

    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        return {
          content: JSON.stringify({
            thought: 'Saya akan menulis perbaikan',
            action: { tool: 'write-file', query: 'calc.js || export function calc() { return 42; }' }
          })
        }
      }
      if (turn === 2) {
        // Premature completion claim without test evidence
        return {
          content: JSON.stringify({
            thought: 'Kode sudah ditulis, saya selesai',
            answer: 'Perbaikan selesai dibuat',
            is_done: true,
            action: null
          })
        }
      }
      if (turn === 3) {
        // Model receives [VERIFICATION GATE] and executes run-shell to run unit tests
        return {
          content: JSON.stringify({
            thought: 'Verifier menolak karena test belum dibuktikan. Saya jalankan test.',
            action: { tool: 'run-shell', query: 'vitest run' }
          })
        }
      }
      // turn >= 4: Model claims done again after running tests
      return {
        content: JSON.stringify({
          thought: 'Sudah diverifikasi dengan bukti test lulus',
          answer: 'Semua unit test lulus: 1 passed (exit code 0).',
          is_done: true,
          action: null
        })
      }
    }

    const mockExecuteTool = async (tool, query) => {
      executedTools.push({ tool, query })
      if (tool === 'write-file') return { ok: true, result: 'File calc.js successfully updated.' }
      if (tool === 'run-shell') return { ok: true, result: 'Tests: 1 passed, all tests passing. Exit 0.' }
      return { ok: true, result: 'ok' }
    }

    const result = await runAgentLoop({
      prompt: 'Perbaiki calc.js dan buktikan unit test lulus',
      options: { maxTurns: 10 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    expect(result.outcome).toBe('completed')
    expect(result.stepCount).toBeGreaterThanOrEqual(4)
    expect(executedTools.map((t) => t.tool)).toEqual(['write-file', 'run-shell'])
    expect(result.terminalReason).toContain('verify:world-state-verified')
  })

  it('Scenario C2: multi-step targeted recovery survives beyond old MAX_VERIFY_REPLANS trap', async () => {
    // Model needs multiple recovery cycles, each accompanied by a new tool execution.
    // In the old implementation, verifyReplanCount >= 2 killed the mission at replan 2.
    // In continuous recovery, each new tool resets the consecutive unproven rejection counter.
    let turn = 0
    const toolsCalled = []

    const mockFetchAI = async () => {
      turn++
      // Cycle 1: edit code -> premature done (replan 1 because test is requested)
      if (turn === 1) {
        return { content: JSON.stringify({ thought: 'write step', action: { tool: 'write-file', query: 'calc.js || code' } }) }
      }
      if (turn === 2) {
        return { content: JSON.stringify({ thought: 'done 1', answer: 'done 1', is_done: true, action: null }) }
      }
      // Cycle 2: read back file (new evidence) -> premature done (replan 2 because test still not run)
      if (turn === 3) {
        return { content: JSON.stringify({ thought: 'read step', action: { tool: 'read-file', query: 'calc.js' } }) }
      }
      if (turn === 4) {
        return { content: JSON.stringify({ thought: 'done 2', answer: 'done 2', is_done: true, action: null }) }
      }
      // Cycle 3: run test (new evidence, satisfies test criteria) -> verified
      if (turn === 5) {
        return { content: JSON.stringify({ thought: 'test step', action: { tool: 'run-shell', query: 'vitest run' } }) }
      }
      return {
        content: JSON.stringify({
          thought: 'all verified',
          answer: 'Semua perbaikan tuntas dan 5 tests passed.',
          is_done: true,
          action: null
        })
      }
    }

    const mockExecuteTool = async (tool) => {
      toolsCalled.push(tool)
      if (tool === 'write-file') return { ok: true, result: 'written' }
      if (tool === 'read-file') return { ok: true, result: 'code valid' }
      if (tool === 'run-shell') return { ok: true, result: 'Tests: 5 passed (5). All tests passing.' }
      return { ok: true, result: 'ok' }
    }

    const result = await runAgentLoop({
      prompt: 'Perbaiki calc.js dan jalankan unit test sampai lulus',
      options: { maxTurns: 10 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    expect(result.outcome).toBe('completed')
    expect(toolsCalled).toEqual(['write-file', 'read-file', 'run-shell'])
  })

  it('Scenario C3: consecutive unproven claims without actions terminate as failed', async () => {
    // Model repeatedly claims done without executing any tools.
    // Should be bounded by consecutive unproven claims and fail honestly.
    const mockFetchAI = async () => ({
      content: JSON.stringify({
        thought: 'Saya merasa sudah selesai tanpa aksi',
        answer: 'Selesai tanpa bukti',
        is_done: true,
        action: null
      })
    })

    const result = await runAgentLoop({
      prompt: 'Tulis dokumen laporan.md dan simpan',
      options: { maxTurns: 10 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    expect(result.outcome).toBe('failed')
    expect(result.terminalReason).toContain('verify-')
  })

  it('Scenario C4: persistent verifier exception MUST NOT fake completion (fail-closed)', async () => {
    // Simulate persistent internal verifier exception by passing a throwing tool descriptor
    const mockFetchAI = async () => ({
      content: JSON.stringify({
        thought: 'Selesai',
        answer: 'Laporan tuntas dibuat di laporan.md',
        is_done: true,
        action: null
      })
    })

    // Force internal exception in executedTools map by passing getter that always throws
    const throwingTool = {
      get tool() {
        throw new Error('Simulated internal verifier fault')
      },
      result: 'test'
    }

    const result = await runAgentLoop({
      prompt: 'Analisis dan buat laporan.md',
      options: {
        maxTurns: 5,
        initialExecutedTools: [throwingTool]
      },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    // Fail-closed contract: MUST fail honestly with verification-error, NEVER faking 'completed'
    expect(result.outcome).toBe('failed')
    expect(result.terminalReason).toContain('verification-error:Simulated internal verifier fault')
  })

  it('Scenario C5: transient verifier exception recovers and completes on subsequent verified attempt', async () => {
    // Verifier encounters a transient internal glitch on turn 1, but recovers on turn 2.
    // Invariant: Verifier error != instant fatal kill, but also != completed.
    // It gives a bounded recovery chance, informs the agent, and completes if subsequent check succeeds.
    let turn = 0
    let transientFaultTriggered = false

    const mockFetchAI = async () => {
      turn++
      if (turn === 1) {
        return {
          content: JSON.stringify({
            thought: 'Klaim awal selesai',
            answer: 'File catatan.txt sudah dibuat.',
            is_done: true,
            action: null
          })
        }
      }
      return {
        content: JSON.stringify({
          thought: 'Mencoba verifikasi ulang setelah transient error',
          answer: 'File catatan.txt berhasil diverifikasi dengan bukti.',
          is_done: true,
          action: null
        })
      }
    }

    let accessCount = 0
    const transientTool = {
      get tool() {
        accessCount++
        if (accessCount === 1) {
          transientFaultTriggered = true
          throw new Error('Transient verifier parsing glitch')
        }
        return 'write-file'
      },
      result: 'File catatan.txt successfully created.'
    }

    const result = await runAgentLoop({
      prompt: 'Buat berkas catatan.txt',
      options: {
        maxTurns: 5,
        initialExecutedTools: [transientTool]
      },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    expect(transientFaultTriggered).toBe(true)
    expect(result.outcome).toBe('completed')
    const historyText = result.history.map((m) => m.content).join('\n')
    expect(historyText).toContain('[VERIFICATION ERROR]')
    expect(historyText).toContain('Transient verifier parsing glitch')
  })
})
