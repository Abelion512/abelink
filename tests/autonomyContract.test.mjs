import { describe, expect, it } from 'vitest'
import { AUTONOMY_DOMAINS, AGENTIC_PROTOCOL_VERSION, buildAutonomyContractSection } from '../src/api/ai/autonomyContract.js'

describe('autonomyContract', () => {
  it('supports cross-domain runtime guidance', () => {
    expect(AUTONOMY_DOMAINS).toEqual(['research', 'browser', 'os_automation', 'code', 'learning', 'general'])
    expect(buildAutonomyContractSection({ domain: 'browser', stepsLeft: 12 })).toContain('BROWSER:')
    expect(buildAutonomyContractSection({ domain: 'learning' })).toContain('LEARNING:')
  })

  it('preserves evidence and learning boundaries', () => {
    const section = buildAutonomyContractSection({ domain: 'research' })
    expect(section).toContain('A different tool call is not automatically progress.')
    expect(section).toContain('SELF-LEARNING BOUNDARY')
    expect(section).toContain('CONTEXT BOUNDARY')
  })

  it('v1.1 carries failure-memory rules from real harness trajectories', () => {
    expect(AGENTIC_PROTOCOL_VERSION).toBe('1.1')
    for (const domain of AUTONOMY_DOMAINS) {
      const section = buildAutonomyContractSection({ domain })
      expect(section).toContain('MEMORY PROOF')
      expect(section).toContain('RESEARCH COMPLETION')
      expect(section).toContain('BROWSER READ SUFFICIENCY')
      expect(section).toContain('THINKING IS NOT ACTING')
      expect(section).toContain('BLOCKED NEEDS A NAME')
      expect(section).toContain('GENERAL AGENTIC RUNTIME CONTRACT v1.1')
    }
  })
})
