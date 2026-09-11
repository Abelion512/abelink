// tests/scoring.test.mjs
import { describe, it, expect } from 'vitest'
import { scoreAttempt, RANK_OF } from '../src/api/ai/scoring.js'

describe('scoreAttempt', () => {
  it('verified + new key + perfect window scores 1', () => {
    expect(scoreAttempt({ verificationRank: 3, isNewSuccessKey: true, toolSuccessRate: 1 })).toBe(1)
  })

  it('failed attempt scores 0 regardless of novelty', () => {
    expect(scoreAttempt({ verificationRank: 0, isNewSuccessKey: true, toolSuccessRate: 1 })).toBeCloseTo(0.5, 5)
  })

  it('pins rank map to objectiveVerifier semantics', () => {
    expect(RANK_OF).toEqual({ failed: 0, not_run: 1, unavailable: 1, partially_verified: 2, verified: 3 })
  })

  it('clamps out-of-range inputs to 0..1', () => {
    expect(scoreAttempt({ verificationRank: 99, isNewSuccessKey: true, toolSuccessRate: 5 })).toBe(1)
    expect(scoreAttempt({ verificationRank: -4, isNewSuccessKey: false, toolSuccessRate: -2 })).toBe(0)
  })
})
