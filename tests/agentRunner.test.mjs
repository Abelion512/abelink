import { describe, it, expect, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { runAgentLoop } from '../src/api/ai/agentRunner.js'

describe('agentRunner — Framework-Agnostic ReAct Loop', () => {
  it('throws error if prompt or executeTool is missing', async () => {
    await expect(runAgentLoop({ prompt: '', environment: {} })).rejects.toThrow(/prompt/)
    await expect(runAgentLoop({ prompt: 'test', environment: null })).rejects.toThrow(/executeTool/)
  })

  it('completes conversation task without tools', async () => {
    const environment = {
      fetchAI: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          thought: 'Saya akan menjawab sapaan user.',
          answer: 'Halo! Ada yang bisa saya bantu?',
          is_done: true,
          action: null,
          intermediate_answer: null,
          suggested_mode: 'direct',
          task_status: 'done',
          objective: null,
          mood: 'joy',
          active_topic: 'Sapaan',
          memory: null
        })
      }),
      executeTool: vi.fn(),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    const res = await runAgentLoop({
      prompt: 'Halo Abelink',
      options: { maxTurns: 5 },
      environment
    })

    expect(res.success).toBe(true)
    expect(res.outcome).toBe('completed')
    expect(res.reply).toBe('Halo! Ada yang bisa saya bantu?')
    expect(res.stepCount).toBe(1)
    expect(res.toolCallsCount).toBe(0)
  })

  it('executes tool and replans based on observation', async () => {
    let callCount = 0
    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            content: JSON.stringify({
              thought: 'Saya perlu membaca file config.',
              action: { tool: 'read-file', query: 'config.json' },
              is_done: false,
              intermediate_answer: 'Membaca config...',
              suggested_mode: 'ephemeral',
              task_status: 'in_progress',
              objective: 'Membaca config',
              mood: 'neutral',
              active_topic: 'Config',
              memory: null
            })
          }
        }
        return {
          content: JSON.stringify({
            thought: 'File terbaca, tugas selesai.',
            answer: 'Konfigurasi menunjukkan port 8080.',
            is_done: true,
            action: null,
            intermediate_answer: null,
            suggested_mode: 'direct',
            task_status: 'done',
            objective: null,
            mood: 'joy',
            active_topic: 'Config',
            memory: null
          })
        }
      }),
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        result: '{"port": 8080}'
      }),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    const res = await runAgentLoop({
      prompt: 'Berapa port di config.json?',
      options: { maxTurns: 5 },
      environment
    })

    expect(res.success).toBe(true)
    expect(res.stepCount).toBe(2)
    expect(res.toolCallsCount).toBe(1)
    expect(environment.executeTool).toHaveBeenCalledWith(
      'read-file',
      'config.json',
      expect.objectContaining({ step: 1 })
    )
    expect(res.reply).toContain('port 8080')
  })

  it('terminates when step budget is exhausted without infinite loop', async () => {
    const environment = {
      fetchAI: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          thought: 'Terus mencoba tanpa henti.',
          action: { tool: 'list-dir', query: '.' },
          is_done: false,
          intermediate_answer: 'Mencoba lagi...',
          suggested_mode: 'ephemeral',
          task_status: 'in_progress',
          objective: 'Cari file',
          mood: 'neutral',
          active_topic: 'Cari',
          memory: null
        })
      }),
      executeTool: vi.fn().mockResolvedValue({
        ok: false,
        result: '[ERROR] Failed'
      }),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    const res = await runAgentLoop({
      prompt: 'Cari file x',
      options: { maxTurns: 3 },
      environment
    })

    expect(res.success).toBe(false)
    expect(res.terminalReason).toBe('step-budget-exhausted')
    expect(res.stepCount).toBeGreaterThanOrEqual(3)
  })

  it('handles tool execution errors gracefully and reports blocked or error state correctly', async () => {
    let turns = 0
    const environment = {
      fetchAI: vi.fn().mockImplementation(async () => {
        turns++
        if (turns === 1) {
          return {
            content: JSON.stringify({
              thought: 'Coba baca file yang tidak ada.',
              action: { tool: 'read-file', query: 'nonexistent.txt' },
              is_done: false,
              intermediate_answer: 'Mencoba baca file...',
              suggested_mode: 'ephemeral',
              task_status: 'in_progress',
              objective: 'Baca file',
              mood: 'neutral',
              active_topic: 'Baca',
              memory: null
            })
          }
        }
        return {
          content: JSON.stringify({
            thought: 'File tidak ada dan akses tidak diizinkan.',
            answer: 'File tidak dapat ditemukan dan akses tidak diizinkan.',
            is_done: false,
            action: null,
            intermediate_answer: null,
            suggested_mode: 'direct',
            task_status: 'blocked',
            objective: null,
            mood: 'neutral',
            active_topic: 'Baca',
            memory: null
          })
        }
      }),
      executeTool: vi.fn().mockRejectedValue(new Error('ENOENT file not found')),
      onThought: vi.fn(),
      onStep: vi.fn()
    }

    const res = await runAgentLoop({
      prompt: 'Baca file nonexistent.txt',
      options: { maxTurns: 5 },
      environment
    })

    expect(res.outcome).toBe('blocked')
    expect(res.toolCallsCount).toBe(1)
    expect(res.executedTools[0].success).toBe(false)
    expect(res.executedTools[0].result).toContain('ENOENT')
    expect(res.reply).toContain('tidak diizinkan')
  })
})
