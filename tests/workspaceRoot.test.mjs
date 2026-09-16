// WS-1: workspaceRoot plumbing contract.
// Renderer promises workspace-aware file ops; the bridge must forward the
// session root instead of landing on the XDG root. Minimal mock style
// (mirrors delegateCoding.test.mjs: window.api stub + pure helpers).
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgentTool } from '../src/hooks/agent/plan/agentTools.js'
import { buildCodingCommand } from '../src/api/ai/codingAgentBridge.js'

describe('workspaceRoot plumbing (WS-1)', () => {
  let calls

  beforeEach(() => {
    calls = []
    globalThis.window = {
      api: {
        executeNativeTool: vi.fn(async (tool, query, config) => {
          calls.push({ tool, query, config })
          if (tool === 'run-bash' && String(query || '').startsWith('which')) {
            return '/usr/bin/opencode'
          }
          return { success: true }
        })
      }
    }
  })

  it('spawn_subagent menyimpan workspaceRoot ctx ke record', async () => {
    const { subagentStore } = await import('../src/api/subagent/subagentStore.js')
    await subagentStore.createSubagent({
      name: 'T',
      role: 'R',
      goal: 'G',
      workspaceRoot: '/proj/a'
    })
    const all = await subagentStore.listSubagents()
    expect(all[all.length - 1].workspaceRoot).toBe('/proj/a')
    await subagentStore.deleteSubagent(all[all.length - 1].id)
  })

  it('buildCodingCommand memakai workdir sebagai cd prefix', () => {
    const { command } = buildCodingCommand({
      agentId: 'opencode',
      prompt: 'fix X',
      workdir: '/proj/a',
      branch: 'auto/t1'
    })
    expect(command.startsWith("cd '/proj/a' && ")).toBe(true)
  })

  it('delegate_coding meneruskan workspaceRoot ctx ke run-task config', async () => {
    const ctx = { requestApproval: async () => true, workspaceRoot: '/proj/a' }
    const res = await runAgentTool('delegate_coding', 'opencode||Perbaiki X||auto/t1', ctx)
    expect(res.success).toBe(true)
    const spawn = calls.find((c) => c.tool === 'run-task')
    expect(spawn).toBeTruthy()
    expect(spawn.config?.workspaceRoot).toBe('/proj/a')
  })

  it('delegate_coding fallback cwd "." tanpa ctx workspaceRoot', async () => {
    const ctx = { requestApproval: async () => true }
    const res = await runAgentTool('delegate_coding', 'opencode||Perbaiki X||auto/t1', ctx)
    expect(res.success).toBe(true)
    const spawn = calls.find((c) => c.tool === 'run-task')
    expect(spawn).toBeTruthy()
    expect(spawn.config?.workspaceRoot).toBe('.')
  })
})
