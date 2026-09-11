// tests/planStepBudget.test.mjs
import { describe, it, expect } from 'vitest'
import { resolvePlanStepBudget, DEFAULT_PLAN_STEPS } from '../src/api/ai/planStepBudget.js'
import { createLineage, appendAttempt, MAX_LINEAGE_ATTEMPTS } from '../src/api/ai/trajLineage.js'

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

describe('trajLineage — scaled lineage window', () => {
  const att = (i) => ({
    id: i,
    strategy: 'DIRECT',
    tool: 'read-file',
    targetKey: `read-file:test-${i}.txt`,
    success: true,
    verificationRank: 1,
    score: 0.5
  })

  it('preserves default sliding window cap at 25', () => {
    const lin = createLineage({ taskId: 't-default' })
    expect(lin.maxAttempts).toBe(MAX_LINEAGE_ATTEMPTS)
    for (let i = 1; i <= 35; i++) {
      appendAttempt(lin, att(i))
    }
    expect(lin.attempts.length).toBe(25)
    expect(lin.attempts[0].id).toBe(11)
  })

  it('scales sliding window with maxAttempts for 50-step complex task', () => {
    const scaledBudget = 64
    const lin = createLineage({ taskId: 't-complex', maxAttempts: scaledBudget })
    expect(lin.maxAttempts).toBe(64)

    // Append 50 attempts
    for (let i = 1; i <= 50; i++) {
      appendAttempt(lin, att(i))
    }
    // All 50 attempts are retained without truncation
    expect(lin.attempts.length).toBe(50)
    expect(lin.attempts[0].id).toBe(1)
    expect(lin.attempts[49].id).toBe(50)

    // Exceeding 64 caps at 64
    for (let i = 51; i <= 70; i++) {
      appendAttempt(lin, att(i))
    }
    expect(lin.attempts.length).toBe(64)
    expect(lin.attempts[0].id).toBe(7)
  })
})
