// tests/strategyLib.test.mjs — thin ladder.
import { describe, it, expect } from 'vitest'
import { getNextStrategy } from '../src/api/ai/strategyLib.js'

describe('getNextStrategy ladder', () => {
  it('repeat same approach => MODIFY, still stuck => EXPLORE (or RETRIEVE when an anchor exists)', () => {
    expect(getNextStrategy(null, { repeat: 1 }).strategy).toBe('MODIFY')
    expect(getNextStrategy(null, { repeat: 3 }).strategy).toBe('EXPLORE')
    expect(getNextStrategy(null, { repeat: 3, hasPriorSuccess: true }).strategy).toBe('RETRIEVE')
  })

  it('verification blocked with prior success => RETRIEVE, without => VERIFY', () => {
    expect(
      getNextStrategy(null, { repeat: 2, verificationBlocked: true, hasPriorSuccess: true }).strategy
    ).toBe('RETRIEVE')
    expect(
      getNextStrategy(null, { repeat: 2, verificationBlocked: true, hasPriorSuccess: false }).strategy
    ).toBe('VERIFY')
  })

  it('nothing works => STOP', () => {
    expect(getNextStrategy(null, { repeat: 5 }).strategy).toBe('STOP')
  })

  it('fresh call keeps current strategy', () => {
    expect(getNextStrategy('MODIFY', { repeat: 0 }).strategy).toBe('MODIFY')
  })
})
