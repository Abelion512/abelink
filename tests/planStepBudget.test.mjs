// tests/planStepBudget.test.mjs
import { describe, it, expect } from 'vitest'
import { resolvePlanStepBudget, DEFAULT_PLAN_STEPS } from '../src/api/ai/planStepBudget.js'

describe('planStepBudget — effort-scaled plan budget', () => {
  it('defaults to 25 when no config or fallback occurs', () => {
    expect(DEFAULT_PLAN_STEPS).toBe(25)
  })

  it('resolves explicit effort levels from canonical effortSystem', () => {
    expect(resolvePlanStepBudget({ config: { effortLevel: 'low' } })).toBe(8)
    expect(resolvePlanStepBudget({ config: { effortLevel: 'medium' } })).toBe(16)
    expect(resolvePlanStepBudget({ config: { effortLevel: 'high' } })).toBe(32)
    // Complex tasks scaled to ~50-64 steps
    expect(resolvePlanStepBudget({ config: { effortLevel: 'xhigh' } })).toBe(64)
    expect(resolvePlanStepBudget({ config: { effortLevel: 'max' } })).toBe(128)
    expect(resolvePlanStepBudget({ config: { effortLevel: 'ultra' } })).toBe(256)
  })

  it('supports options.effortLevel override', () => {
    const budget = resolvePlanStepBudget({
      config: { effortLevel: 'low' },
      options: { effortLevel: 'xhigh' }
    })
    expect(budget).toBe(64)
  })

  it('supports explicit numeric options.maxSteps override', () => {
    const budget = resolvePlanStepBudget({
      config: { effortLevel: 'high' },
      options: { maxSteps: 50 }
    })
    expect(budget).toBe(50)
  })

  it('supports explicit numeric options.maxPlanSteps override', () => {
    const budget = resolvePlanStepBudget({
      options: { maxPlanSteps: 75 }
    })
    expect(budget).toBe(75)
  })

  it('resolves auto effort based on task complexity', () => {
    // Simple prompt in auto resolves to medium (16)
    const simple = resolvePlanStepBudget({
      config: { effortLevel: 'auto' },
      userInput: 'halo apa kabar'
    })
    expect(simple).toBe(16)

    // Complex task in auto resolves to high (32) or above
    const complex = resolvePlanStepBudget({
      config: { effortLevel: 'auto' },
      userInput: 'spawn_subagent untuk investigasi mendalam, riset komprehensif arsitektur kode dan buatkan laporan'
    })
    expect(complex).toBeGreaterThanOrEqual(32)
  })
})
