import { describe, it, expect } from 'vitest'
import { StepBudget } from '../src/api/ai/effortSystem.js'
import { wrapUpNotice } from '../src/api/ai/budgetNotice.js'

describe('StepBudget', () => {
  it('consume/refund math', () => {
    const b = new StepBudget(10)
    b.consume(3)
    expect(b.used).toBe(3)
    expect(b.remaining).toBe(7)
    b.refund(1)
    expect(b.used).toBe(2)
    expect(b.remaining).toBe(8)
  })

  it('refund tidak boleh negatif', () => {
    const b = new StepBudget(10)
    b.consume(2)
    b.refund(5)
    expect(b.used).toBe(0)
    expect(b.remaining).toBe(10)
  })

  it('isExhausted saat habis', () => {
    const b = new StepBudget(2)
    expect(b.isExhausted).toBe(false)
    b.consume(2)
    expect(b.isExhausted).toBe(true)
  })

  it('isPastWarnLevel(0.8) benar', () => {
    const b = new StepBudget(10)
    b.consume(7)
    expect(b.isPastWarnLevel(0.8)).toBe(false)
    b.consume(1)
    expect(b.isPastWarnLevel(0.8)).toBe(true)
  })
})

describe('wrapUpNotice', () => {
  it('notice saat remaining/total <= 0.2 dan remaining > 0', () => {
    const n = wrapUpNotice(2, 10)
    expect(typeof n).toBe('string')
    expect(n).toContain('[SYSTEM / BUDGET]')
    expect(n).toContain('2')
  })

  it('null saat masih cukup', () => {
    expect(wrapUpNotice(5, 10)).toBeNull()
  })

  it('null saat habis', () => {
    expect(wrapUpNotice(0, 10)).toBeNull()
  })
})
