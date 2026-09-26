import { describe, it, expect } from 'vitest'
import {
  AGENT_CANDIDATES,
  detectInstalledAgents,
  buildCodingCommand
} from '../src/api/ai/codingAgentBridge.js'

describe('codingAgentBridge', () => {
  it('AGENT_CANDIDATES memuat 4 CLI agent utama', () => {
    const ids = AGENT_CANDIDATES.map((a) => a.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('hermes')
    expect(ids).toContain('codex')
    expect(ids).toContain('opencode')
  })

  it('PREFERRED_CODING_AGENTS dikunci ke opencode+hermes', async () => {
    const { PREFERRED_CODING_AGENTS } = await import('../src/api/ai/codingAgentBridge.js')
    // Keputusan owner (dikunci ulang 2026-09-26): hanya dua agen ini yang boleh
    // dipilih runtime; codex/claude tetap terdaftar sebagai referensi saja.
    expect(PREFERRED_CODING_AGENTS).toEqual(['opencode', 'hermes'])
  })

  it('detectInstalledAgents memfilter binary yang ada via checker', async () => {
    const mockChecker = async (bin) => {
      return bin.includes('opencode') || bin.includes('hermes')
    }

    const detected = await detectInstalledAgents({ fileChecker: mockChecker })
    const ids = detected.map((d) => d.id)
    expect(ids).toContain('opencode')
    expect(ids).toContain('hermes')
    expect(ids).not.toContain('codex')
    expect(ids).not.toContain('claude')
  })

  it('codex/claude TIDAK terdeteksi walau binary-nya ada (locked)', async () => {
    const mockChecker = async (bin) => /codex|claude/.test(bin)
    const detected = await detectInstalledAgents({ fileChecker: mockChecker })
    expect(detected.map((d) => d.id)).toEqual([])
  })

  it('buildCodingCommand menyusun perintah non-interactive dengan nice dan sandbox branch', () => {
    const result = buildCodingCommand({
      agentId: 'claude',
      prompt: 'Perbaiki bug koneksi AI',
      workdir: '/media/abelion/Isaf/ican/project/abelink',
      branch: 'auto/fix-connection'
    })

    expect(result.command).toContain("cd '/media/abelion/Isaf/ican/project/abelink'")
    expect(result.command).toContain('git checkout -B auto/fix-connection')
    expect(result.command).toContain('nice -n 10')
    expect(result.command).toContain('--dangerously-skip-permissions')
    expect(result.command).toContain('Perbaiki bug koneksi AI')
    expect(result.agent.id).toBe('claude')
  })
})
