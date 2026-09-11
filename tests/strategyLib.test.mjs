// tests/strategyLib.test.mjs
import { describe, it, expect } from 'vitest'
import { STRATEGIES, rankNextStrategy } from '../src/api/ai/strategyLib.js'

const base = { failedKeys: [], preferredKeys: [], attemptedStrategies: [], verificationRank: 1, stagnation: 0, hasProofTool: false }

describe('rankNextStrategy', () => {
  it('exposes exactly the 6 locked strategies', () => {
    expect([...STRATEGIES].sort()).toEqual(['BACKTRACK', 'DECOMPOSE', 'DIRECT', 'EXPLORE', 'RETRIEVE_MEMORY', 'VERIFY'].sort())
  })

  it('prefers RETRIEVE when a preferred key exists', () => {
    const r = rankNextStrategy({ ...base, preferredKeys: ['read-file:src/a.js'] })
    expect(r.strategy).toBe('RETRIEVE_MEMORY')
  })

  it('never returns a strategy whose key class failed', () => {
    const r = rankNextStrategy({ ...base, failedKeys: ['DIRECT'], attemptedStrategies: ['DIRECT'] })
    expect(r.strategy).not.toBe('DIRECT')
  })

  it('BACKTRACK when stagnation high', () => {
    const r = rankNextStrategy({ ...base, stagnation: 0.8 })
    expect(r.strategy).toBe('BACKTRACK')
  })

  it('VERIFY when rank is unverified and a proof tool exists', () => {
    const r = rankNextStrategy({ ...base, verificationRank: 1, hasProofTool: true })
    expect(r.strategy).toBe('VERIFY')
  })
})
