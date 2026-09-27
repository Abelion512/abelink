// tests/adaptiveStagnation.test.mjs — Phase B3: Adaptive Stagnation Ladder S0..S8 Tests.
//
// Contracts pinned here:
//   - Turns with reasoning/planning (noActionStreak) do not kill the mission at turn 3.
//   - S0..S8 ladder resolves appropriate escalation rungs based on repeat, stagnancy, and reasoning streaks.
//   - Active consumption of evaluateProgress detects repeated no-progress execution and injects ladder hints.
//   - Persistent stagnant loops are terminated cleanly when ladder ceiling (S8_STOP) is reached.

import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { runAgentLoop, MAX_NO_PROGRESS_STREAK, MAX_NO_ACTION_TERMINAL_STREAK } from '../src/api/ai/agentRunner.js'
import {
  STRATEGY_LADDER,
  LADDER_STAGES,
  resolveStagnationRung,
  getNextStrategy
} from '../src/api/ai/strategyLib.js'

describe('Adaptive Stagnation Ladder S0..S8 Contract', () => {
  it('exposes all 9 stages S0..S8 in order', () => {
    expect(LADDER_STAGES).toHaveLength(9)
    expect(LADDER_STAGES[0].stage).toBe(STRATEGY_LADDER.S0_INITIAL)
    expect(LADDER_STAGES[1].stage).toBe(STRATEGY_LADDER.S1_OBSERVE)
    expect(LADDER_STAGES[2].stage).toBe(STRATEGY_LADDER.S2_PERSIST)
    expect(LADDER_STAGES[3].stage).toBe(STRATEGY_LADDER.S3_MODIFY)
    expect(LADDER_STAGES[4].stage).toBe(STRATEGY_LADDER.S4_EXPLORE)
    expect(LADDER_STAGES[5].stage).toBe(STRATEGY_LADDER.S5_ABANDON)
    expect(LADDER_STAGES[6].stage).toBe(STRATEGY_LADDER.S6_RETRIEVE)
    expect(LADDER_STAGES[7].stage).toBe(STRATEGY_LADDER.S7_ESCALATE)
    expect(LADDER_STAGES[8].stage).toBe(STRATEGY_LADDER.S8_STOP)
  })

  it('resolves correct rungs for increasing depth', () => {
    expect(resolveStagnationRung({ repeat: 0 }).rung).toBe(0)
    expect(resolveStagnationRung({ repeat: 1 }).rung).toBe(1)
    expect(resolveStagnationRung({ repeat: 3 }).rung).toBe(3)
    expect(resolveStagnationRung({ repeat: 4 }).rung).toBe(4)
    expect(resolveStagnationRung({ repeat: 5 }).rung).toBe(5)
    expect(resolveStagnationRung({ repeat: 6 }).rung).toBe(6)
    expect(resolveStagnationRung({ repeat: 7 }).rung).toBe(7)
    expect(resolveStagnationRung({ repeat: 8 }).rung).toBe(8)
  })

  it('proves semantic progress distinctions via evaluateProgress', async () => {
    const { evaluateProgress, PROGRESS_OUTCOME } = await import('../src/api/ai/progressEvaluator.js')

    // 1. Stagnant: same tool, same query, same output
    const stagnant = evaluateProgress({
      previous: { tool: 'read-file', query: 'a.txt', success: true, result: 'content' },
      current: { tool: 'read-file', query: 'a.txt', success: true, result: 'content' }
    })
    expect(stagnant.outcome).toBe(PROGRESS_OUTCOME.STAGNANT)

    // 2. Progress: new strategy + new evidence
    const progressNew = evaluateProgress({
      previous: { tool: 'read-file', query: 'a.txt', success: true, result: 'content' },
      current: { tool: 'write-file', query: 'b.txt || new', success: true, result: 'written' }
    })
    expect(progressNew.outcome).toBe(PROGRESS_OUTCOME.PROGRESS)

    // 3. Progress: verification improved
    const progressVerif = evaluateProgress({
      previous: { tool: 'run-shell', query: 'vitest', success: true, verificationState: 'partially_verified' },
      current: { tool: 'run-shell', query: 'vitest', success: true, verificationState: 'verified' }
    })
    expect(progressVerif.outcome).toBe(PROGRESS_OUTCOME.PROGRESS)

    // 4. Regressed: execution failed without any new evidence
    const regressed = evaluateProgress({
      previous: { tool: 'read-file', query: 'a.txt', success: true, result: 'content' },
      current: { tool: 'run-shell', query: 'bad-cmd', success: false, result: '' }
    })
    expect(regressed.outcome).toBe(PROGRESS_OUTCOME.REGRESSED)
  })
})

describe('Scenario D: Adaptive Stagnation & Non-Action Streak Handling', () => {
  it('Case A: 8 reasoning turns survive via progressive reasoning, escalate to S7_ESCALATE, and complete upon action', async () => {
    // Model takes 8 turns of progressive planning before executing a tool at turn 9.
    // In legacy implementations with rigid turn limits, this would have aborted at turn 3 or 8.
    // Under the refined ladder, progressive reasoning escalates through S3_MODIFY and S7_ESCALATE,
    // and when action executes at turn 9, the streak resets to 0 and the mission completes.
    let turn = 0
    const executedTools = []

    const mockFetchAI = async () => {
      turn++
      // Turns 1..8: Progressive reasoning / decomposition (INTENT.CONTINUE with distinct thoughts)
      if (turn <= 8) {
        return {
          content: JSON.stringify({
            thought: `Fase perencanaan arsitektur langkah ${turn}: mengurai modul ${turn}`,
            answer: `Hasil analisis mendalam bagian ${turn}`,
            is_done: false,
            task_status: 'in_progress',
            action: null
          })
        }
      }
      // Turn 9: Model executes action
      if (turn === 9) {
        return {
          content: JSON.stringify({
            thought: 'Rencana implementasi 8 tahap selesai, eksekusi tool penulisan sekarang',
            action: { tool: 'write-file', query: 'done.txt || implementasi tuntas' }
          })
        }
      }
      // Turn 10: Model claims verified completion
      return {
        content: JSON.stringify({
          thought: 'Tugas selesai dan diverifikasi',
          answer: 'Semua berhasil diselesaikan dan bukti tersimpan di done.txt',
          is_done: true,
          action: null
        })
      }
    }

    const result = await runAgentLoop({
      prompt: 'Rencanakan arsitektur sistem 8 langkah dan simpan ke done.txt',
      options: { maxTurns: 15 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: async (tool, query) => {
          executedTools.push({ tool, query })
          return { ok: true, result: 'File done.txt successfully written.' }
        }
      }
    })

    expect(result.outcome).toBe('completed')
    expect(result.stepCount).toBeGreaterThanOrEqual(9)
    expect(executedTools.map((t) => t.tool)).toEqual(['write-file'])
    // History must contain both S3_MODIFY and S7_ESCALATE ladder hints
    const historyText = result.history.map((m) => m.content).join('\n')
    expect(historyText).toContain('[STAGNATION LADDER: S3_MODIFY]')
    expect(historyText).toContain('[STAGNATION LADDER: S7_ESCALATE]')
  })

  it('Case B: semantic repetition in reasoning triggers adaptive ladder escalation', async () => {
    // Model repeats the exact same reasoning thought.
    // Consecutive identical reasoning triggers ladder escalation (S1 -> S3 -> S7 -> S8).
    let turn = 0
    const mockFetchAI = async () => {
      turn++
      return {
        content: JSON.stringify({
          thought: 'Menunggu proses latar belakang tanpa perubahan',
          answer: 'Status masih sama seperti sebelumnya',
          is_done: false,
          task_status: 'in_progress',
          action: null
        })
      }
    }

    const result = await runAgentLoop({
      prompt: 'Pantau proses latar belakang',
      options: { maxTurns: 10 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: async () => ({ ok: true, result: 'ok' })
      }
    })

    expect(result.outcome).toBe('failed')
    expect(result.terminalReason).toBe('no-progress-streak-exhausted')
    expect(result.stepCount).toBe(MAX_NO_ACTION_TERMINAL_STREAK)

    const historyText = result.history.map((m) => m.content).join('\n')
    expect(historyText).toContain('[STAGNATION LADDER: S3_MODIFY]')
    expect(historyText).toContain('[STAGNATION LADDER: S7_ESCALATE]')
  })

  it('Case C: strategy shift and new evidence resets stagnation streak', async () => {
    // Step 1: Tool execution
    // Step 2: Tool execution identical to Step 1 (stagnant, streak = 1)
    // Step 3: Tool execution identical to Step 1 (stagnant, streak = 2)
    // Step 4: Model changes strategy with new tool and new result -> evaluateProgress reports PROGRESS!
    // Streak resets to 0.
    let turn = 0
    const mockFetchAI = async () => {
      turn++
      if (turn <= 3) {
        return {
          content: JSON.stringify({
            thought: 'Mencoba membaca config lama',
            action: { tool: 'read-file', query: 'config.json' }
          })
        }
      }
      if (turn === 4) {
        return {
          content: JSON.stringify({
            thought: 'Config gagal, ubah strategi dengan memeriksa env',
            action: { tool: 'read-file', query: '.env' }
          })
        }
      }
      return {
        content: JSON.stringify({
          thought: 'Env terkonfirmasi, selesai',
          answer: 'Konfigurasi env terverifikasi',
          is_done: true,
          action: null
        })
      }
    }

    const mockExecuteTool = async (tool, query) => {
      if (query === 'config.json') {
        return { ok: true, result: '{"error": "not found"}' }
      }
      if (query === '.env') {
        return { ok: true, result: 'APP_ENV=production' }
      }
      return { ok: true, result: 'ok' }
    }

    const result = await runAgentLoop({
      prompt: 'Temukan konfigurasi lingkungan',
      options: { maxTurns: 10 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    expect(result.outcome).toBe('completed')
  })

  it('Case D: persistent repetition across strategies reaches terminal stop S8_STOP', async () => {
    // Model persistently executes the exact same tool and query 8 times without progress.
    // evaluateProgress returns STAGNANT on every repeat.
    // Reaching 8 stagnant evaluations triggers terminal stop S8_STOP (stagnation-loop-exhausted).
    let turns = 0
    const mockFetchAI = async () => {
      turns++
      return {
        content: JSON.stringify({
          thought: 'Mengulang pembacaan file yang sama tanpa perubahan strategi',
          action: { tool: 'read-file', query: 'stuck.txt' }
        })
      }
    }

    const mockExecuteTool = async () => ({
      ok: true,
      result: 'stuck-content'
    })

    const result = await runAgentLoop({
      prompt: 'Periksa stuck.txt',
      options: { maxTurns: 20 },
      environment: {
        fetchAI: mockFetchAI,
        executeTool: mockExecuteTool
      }
    })

    expect(result.outcome).toBe('failed')
    expect(result.terminalReason).toBe('stagnation-loop-exhausted')
    expect(result.stepCount).toBeLessThanOrEqual(10)
    const historyText = result.history.map((m) => m.content).join('\n')
    expect(historyText).toContain('[STAGNATION LADDER: S3_MODIFY]')
  })
})
