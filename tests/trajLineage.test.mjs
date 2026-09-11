// tests/trajLineage.test.mjs
import { describe, it, expect } from 'vitest'
import { createLineage, appendAttempt, bestAttempt, stagnationScore } from '../src/api/ai/trajLineage.js'

const att = (over = {}) => ({
  id: 1, strategy: 'DIRECT', tool: 'read-file', targetKey: 'read-file:src/a.js',
  success: true, verificationRank: 1, score: 0.4, ts: Date.now(), ...over
})

describe('trajLineage', () => {
  it('append + best picks max score, ties go to latest verified', () => {
    const lin = createLineage({ taskId: 't1', goal: 'g', objectiveKind: 'file' })
    appendAttempt(lin, att({ id: 1, score: 0.4, verificationRank: 1 }))
    appendAttempt(lin, att({ id: 2, score: 0.4, verificationRank: 3 }))
    expect(bestAttempt(lin).id).toBe(2)
  })

  it('caps sliding window at 25 attempts', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'code' })
    for (let i = 0; i < 30; i++) appendAttempt(lin, att({ id: i }))
    expect(lin.attempts.length).toBe(25)
    expect(lin.attempts[0].id).toBe(5)
  })

  it('stagnation is 0 on fresh lineage, rises when stale with unmoving verification', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'file' })
    expect(stagnationScore(lin)).toBe(0)
    appendAttempt(lin, att({ id: 1, targetKey: 'k1', verificationRank: 1 }))
    for (let i = 2; i <= 7; i++) appendAttempt(lin, att({ id: i, targetKey: 'k1', success: false, verificationRank: 1, score: 0.1 }))
    expect(stagnationScore(lin)).toBeGreaterThanOrEqual(0.6)
  })

  it('records failed and preferred keys without duplicates', () => {
    const lin = createLineage({ taskId: 't', goal: 'g', objectiveKind: 'file' })
    appendAttempt(lin, att({ id: 1, targetKey: 'k1' }))
    appendAttempt(lin, att({ id: 2, targetKey: 'k1' }))
    expect(lin.preferredKeys).toEqual(['k1'])
    lin.failedKeys.add('k1')
    expect([...lin.failedKeys]).toEqual(['k1'])
  })
})
