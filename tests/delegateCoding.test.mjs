import { describe, it, expect, vi, beforeEach } from 'vitest'
import { core_tools } from '../src/api/tools/core-tools.js'
import { runAgentTool } from '../src/hooks/agent/plan/agentTools.js'

describe('delegate_coding integration', () => {
  let mockExecuteNativeTool

  beforeEach(() => {
    mockExecuteNativeTool = vi.fn().mockImplementation(async (tool, query) => {
      if (tool === 'run-bash' && query?.startsWith('which')) {
        return '/usr/bin/opencode'
      }
      return { success: true }
    })

    globalThis.window = {
      api: {
        executeNativeTool: mockExecuteNativeTool
      }
    }
  })

  it('terdaftar di core_tools dengan deskripsi lengkap', () => {
    expect(core_tools['delegate_coding']).toBeTruthy()
    expect(core_tools['delegate_coding']).toContain('opencode')
    expect(core_tools['delegate_coding']).toContain('hermes')
    expect(core_tools['delegate_coding']).toContain('auto/...')
  })

  it('menolak query jika instruksi kosong', async () => {
    const res = await runAgentTool('delegate_coding', 'opencode||', {})
    expect(res).toBeDefined()
    expect(res.success).toBe(false)
    expect(res.error).toContain('Instruksi tugas coding tidak boleh kosong')
  })

  it('menolak query jika tidak ada agent terpasang', async () => {
    globalThis.window.api.executeNativeTool = vi.fn().mockResolvedValue('')
    const res = await runAgentTool('delegate_coding', 'opencode||Refactor X||auto/test', {})
    expect(res).toBeDefined()
    expect(res.success).toBe(false)
    expect(res.error).toContain('Tidak ditemukan CLI coding agent')
  })

  it('menghormati penolakan approval dari user', async () => {
    const mockRequestApproval = vi.fn().mockResolvedValue(false)
    const ctx = {
      requestApproval: mockRequestApproval,
      workspaceRoot: '/mock/workspace'
    }

    const res = await runAgentTool('delegate_coding', 'opencode||Refactor feature X||auto/refactor', ctx)
    expect(res).toBeDefined()
    expect(mockRequestApproval).toHaveBeenCalled()
    expect(res.success).toBe(false)
    expect(res.error).toContain('User menolak')
  })

  it('meluncurkan background task saat user approve', async () => {
    const mockRequestApproval = vi.fn().mockResolvedValue(true)
    const ctx = {
      requestApproval: mockRequestApproval,
      workspaceRoot: '/mock/workspace'
    }

    const res = await runAgentTool('delegate_coding', 'opencode||Perbaiki bug ABC||auto/fix-abc', ctx)
    expect(res).toBeDefined()
    expect(mockRequestApproval).toHaveBeenCalled()
    expect(mockExecuteNativeTool).toHaveBeenCalledWith(
      'run-task',
      expect.stringContaining('auto/fix-abc'),
      expect.objectContaining({ workspaceRoot: '/mock/workspace' })
    )
    expect(res.success).toBe(true)
    expect(res.data).toContain('TUGAS KODING BERHASIL DIDELEGASIKAN')
    expect(res.data).toContain('auto/fix-abc')
  })
})
