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

  it('detectInstalledAgents memfilter binary yang ada via checker', async () => {
    const mockChecker = async (bin) => {
      return bin.includes('claude') || bin.includes('hermes')
    }

    const detected = await detectInstalledAgents({ fileChecker: mockChecker })
    const ids = detected.map((d) => d.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('hermes')
    expect(ids).not.toContain('codex')
  })

  it('buildCodingCommand menyusun perintah non-interactive dengan nice dan sandbox branch', () => {
    const result = buildCodingCommand({
      agentId: 'claude',
      prompt: 'Perbaiki bug koneksi AI',
      workdir: '/media/abelion/Isaf/ican/project/mark-agent-linux',
      branch: 'auto/fix-connection'
    })

    expect(result.command).toContain("cd '/media/abelion/Isaf/ican/project/mark-agent-linux'")
    expect(result.command).toContain('git checkout -B auto/fix-connection')
    expect(result.command).toContain('nice -n 10')
    expect(result.command).toContain('--dangerously-skip-permissions')
    expect(result.command).toContain('Perbaiki bug koneksi AI')
    expect(result.agent.id).toBe('claude')
  })
})
