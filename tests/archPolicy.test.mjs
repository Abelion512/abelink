import { describe, it, expect } from 'vitest'
import { getArchPolicy, archTerminalReason } from '../src/api/ai/archPolicy.js'

describe('archPolicy truth-table', () => {
  it('vanilla disables supervisor + gate, trusts the claim', () => {
    expect(getArchPolicy('vanilla')).toEqual({
      arch: 'vanilla',
      supervisorEnabled: false,
      verifyGateEnabled: false,
      completionClaimTrusted: true
    })
  })

  it('basic enables supervisor + gate, distrusts the claim', () => {
    expect(getArchPolicy('basic')).toEqual({
      arch: 'basic',
      supervisorEnabled: true,
      verifyGateEnabled: true,
      completionClaimTrusted: false
    })
  })

  it('unknown/empty values fall back to basic (production default)', () => {
    for (const v of [undefined, null, '', 'avo', 'BASIC-typo', 42]) {
      const p = getArchPolicy(v)
      expect(p.arch).toBe('basic')
      expect(p.supervisorEnabled).toBe(true)
      expect(p.verifyGateEnabled).toBe(true)
    }
  })

  it('arch names are case-insensitive', () => {
    expect(getArchPolicy('VANILLA').arch).toBe('vanilla')
    expect(getArchPolicy(' Basic ').supervisorEnabled).toBe(true)
  })

  it('terminal reason: skipped-vanilla vs gate state', () => {
    expect(archTerminalReason(getArchPolicy('vanilla'), 'world-state-verified')).toBe(
      'verify:skipped-vanilla'
    )
    expect(archTerminalReason(getArchPolicy('basic'), 'world-state-verified')).toBe(
      'verify:world-state-verified'
    )
    expect(archTerminalReason(getArchPolicy('basic'), '')).toBe('verify:unknown')
    expect(archTerminalReason(null, 'x')).toBe('verify:skipped-vanilla')
  })
})
