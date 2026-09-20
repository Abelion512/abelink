import { describe, expect, it } from 'vitest'
import { AUTONOMY_DOMAINS, buildAutonomyContractSection } from '../src/api/ai/autonomyContract.js'

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
})
