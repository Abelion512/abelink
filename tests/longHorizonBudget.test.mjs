// tests/longHorizonBudget.test.mjs — Phase B1 long-horizon budget ceiling & multi-window renewal tests.
import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'

import { runAgentLoop } from '../src/api/ai/agentRunner.js'
import { resolvePlanStepBudget } from '../src/api/ai/planStepBudget.js'
import { parseCliArgs } from '../bin/abelink.mjs'
import { parseTuiArgs } from '../cli/core/parser.mjs'

describe('Long-Horizon Budget & Renewal — Phase B1', () => {
  it('resolves canonical step budget for all effort levels (low, medium, high, xhigh, max, ultra)', () => {
    expect(resolvePlanStepBudget({ options: { effortLevel: 'low' } })).toBe(8)
    expect(resolvePlanStepBudget({ options: { effortLevel: 'medium' } })).toBe(24)
    expect(resolvePlanStepBudget({ options: { effortLevel: 'high' } })).toBe(48)
    expect(resolvePlanStepBudget({ options: { effortLevel: 'xhigh' } })).toBe(64)
    expect(resolvePlanStepBudget({ options: { effortLevel: 'max' } })).toBe(128)
    expect(resolvePlanStepBudget({ options: { effortLevel: 'ultra' } })).toBe(256)
  })

  it('terminates with step-budget-exhausted when budget runs out without productive progress', async () => {
    let turn = 0
    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        turn++
        return {
          content: JSON.stringify({
            thought: `Langkah stagnan ke-${turn}`,
            action: { tool: 'failing-tool', query: 'same-query' },
            is_done: false
          })
        }
      }),
      executeTool: vi.fn().mockImplementation(async () => {
        return { ok: false, result: '[ERROR] Persistent hardware fault' }
      })
    }

    const res = await runAgentLoop({
      prompt: 'Jalankan operasi yang terus gagal',
      options: {
        effort: 'low', // canonical budget = 8
        hardCeiling: 100
      },
      environment
    })

    // Misi tidak diperpanjang karena tidak ada progres produktif, mati jujur di batas window
    expect(res.outcome).toBe('failed')
    expect(res.terminalReason).toBe('step-budget-exhausted')
    expect(res.stepCount).toBe(8)
  })

  it('explicit maxTurns overrides canonical effort budget directly', async () => {
    let turn = 0
    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        turn++
        return {
          content: JSON.stringify({
            thought: `Langkah ke-${turn}`,
            action: { tool: 'ping', query: `${turn}` },
            is_done: false
          })
        }
      }),
      executeTool: vi.fn().mockImplementation(async () => ({ ok: false, result: 'err' }))
    }

    const res = await runAgentLoop({
      prompt: 'Tugas dengan batas eksplisit',
      options: {
        effort: 'ultra', // ultra normally 256
        maxTurns: 5, // user explicitly requested 5
        hardCeiling: 100
      },
      environment
    })

    expect(res.stepCount).toBe(5)
    expect(res.terminalReason).toBe('step-budget-exhausted')
  })

  it('does not have arbitrary default maxTurns 15 in parsers', () => {
    const tuiOpts = parseTuiArgs(['node', 'abelink-tui'])
    expect(tuiOpts.maxTurns).toBeUndefined()
    expect(tuiOpts.maxTurnsExplicit).toBe(false)

    const cliOpts = parseCliArgs(['node', 'abelink', 'tugas'])
    expect(cliOpts.maxTurns).toBeNull()
    expect(cliOpts.maxTurnsExplicit).toBe(false)

    // Explicit flag preserves user override
    const explicitTui = parseTuiArgs(['node', 'abelink-tui', '--max-turns', '30'])
    expect(explicitTui.maxTurns).toBe(30)
    expect(explicitTui.maxTurnsExplicit).toBe(true)

    const explicitCli = parseCliArgs(['node', 'abelink', 'tugas', '--max-turns', '50'])
    expect(explicitCli.maxTurns).toBe(50)
    expect(explicitCli.maxTurnsExplicit).toBe(true)
  })

  it('Scenario A — 50-step mission survives beyond step 15 with continuous progress', async () => {
    let currentStep = 0
    const TARGET_STEPS = 50

    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        currentStep++
        if (currentStep < TARGET_STEPS) {
          return {
            content: JSON.stringify({
              thought: `Langkah produktif ke-${currentStep}.`,
              action: { tool: 'process-item', query: `item-${currentStep}` },
              is_done: false
            })
          }
        }
        return {
          content: JSON.stringify({
            thought: 'Semua 50 langkah selesai terproses.',
            action: null,
            answer: 'Selesai 50 langkah.',
            is_done: true,
            task_status: 'done'
          })
        }
      }),
      executeTool: vi.fn().mockImplementation(async (tool, query) => {
        return { ok: true, result: `Diproses: ${query}` }
      }),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    // Default effort high (48 langkah) yang diperbarui saat habis karena produktif
    const res = await runAgentLoop({
      prompt: 'Proses 50 item secara berurutan',
      options: {
        effort: 'high', // initial budget 48
        hardCeiling: 120
      },
      environment
    })

    expect(res.stepCount).toBe(TARGET_STEPS)
    expect(res.success).toBe(true)
    expect(res.outcome).toBe('completed')
    expect(res.toolCallsCount).toBe(TARGET_STEPS - 1)
  })

  it('Scenario B — 100-step mission survives multiple budget-renewal windows', async () => {
    let currentStep = 0
    const TARGET_STEPS = 100

    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        currentStep++
        if (currentStep < TARGET_STEPS) {
          return {
            content: JSON.stringify({
              thought: `Melanjutkan pemrosesan batch ke-${currentStep}.`,
              action: { tool: 'batch-work', query: `batch-${currentStep}` },
              is_done: false
            })
          }
        }
        return {
          content: JSON.stringify({
            thought: '100 langkah selesai sempurna.',
            action: null,
            answer: 'Batch 100 langkah tuntas.',
            is_done: true,
            task_status: 'done'
          })
        }
      }),
      executeTool: vi.fn().mockImplementation(async (tool, query) => {
        return { ok: true, result: `Batch ok: ${query}` }
      }),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    // Start with low effort (budget 8) but with continuous progress it renews (+48, +48...) up to 100
    const res = await runAgentLoop({
      prompt: 'Kerjakan 100 iterasi panjang',
      options: {
        effort: 'low', // initial budget hanya 8!
        hardCeiling: 200
      },
      environment
    })

    expect(res.stepCount).toBe(TARGET_STEPS)
    expect(res.success).toBe(true)
    expect(res.outcome).toBe('completed')
    expect(res.toolCallsCount).toBe(TARGET_STEPS - 1)
  })

  it('clamps caller requested hardCeiling above 512 to SYSTEM_ABSOLUTE_HARD_CEILING (512)', async () => {
    // When hardCeiling = 1000, effective ceiling must be clamped to 512.
    // When hardCeiling = 100, effective ceiling is honored at 100.
    // When hardCeiling is not specified, effective ceiling defaults to 512.
    const mockEnv = {
      fetchAI: vi.fn().mockImplementation(async () => ({
        content: JSON.stringify({
          thought: 'Selesai pemeriksaan hard ceiling',
          answer: 'Pemeriksaan tuntas',
          is_done: true
        })
      })),
      executeTool: vi.fn().mockImplementation(async () => ({ ok: true, result: 'ok' }))
    }

    const resOver = await runAgentLoop({
      prompt: 'Pemeriksaan batas sistem 1000',
      options: { hardCeiling: 1000 },
      environment: mockEnv
    })
    expect(resOver.effectiveHardCeiling).toBe(512)

    const resBounded = await runAgentLoop({
      prompt: 'Pemeriksaan batas sistem 100',
      options: { hardCeiling: 100 },
      environment: mockEnv
    })
    expect(resBounded.effectiveHardCeiling).toBe(100)

    const resDefault = await runAgentLoop({
      prompt: 'Pemeriksaan batas default',
      options: {},
      environment: mockEnv
    })
    expect(resDefault.effectiveHardCeiling).toBe(512)
  })
})
