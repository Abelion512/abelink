import { describe, it, expect } from 'vitest'
import { BUDGET_RENEW_STEPS, shouldRenewBudget, renewBudgetWindow } from '../src/api/ai/planStepBudget.js'

const okTool = { status: 'done', fullResult: 'hasil kerja nyata' }
const failTool = { status: 'done', fullResult: '[ERROR] gagal total' }

describe('shouldRenewBudget', () => {
  it('renews on recent productive tools', () => {
    expect(shouldRenewBudget({ recentTools: [failTool, okTool] })).toBe(true)
  })

  it('renews on verification movement alone', () => {
    expect(shouldRenewBudget({ recentTools: [failTool], verificationMoved: true })).toBe(true)
  })

  it('stops honest when stagnant (no signal)', () => {
    expect(shouldRenewBudget({ recentTools: [failTool] })).toBe(false)
    expect(shouldRenewBudget({ recentTools: [] })).toBe(false)
  })

  it('stops when breaker open even if tools look productive', () => {
    expect(shouldRenewBudget({ recentTools: [okTool], breakerOpen: true })).toBe(false)
  })

  it('stops on supervisor ABANDON/ESCALATE', () => {
    expect(shouldRenewBudget({ recentTools: [okTool], supervisorDirective: 'abandon_strategy' })).toBe(false)
    expect(shouldRenewBudget({ recentTools: [okTool], supervisorDirective: 'escalate' })).toBe(false)
    expect(shouldRenewBudget({ recentTools: [okTool], supervisorDirective: 'modify_strategy' })).toBe(true)
  })

  it('ignores not-executed batch-halt entries', () => {
    expect(shouldRenewBudget({ recentTools: [{ status: 'not-executed', fullResult: 'x' }] })).toBe(false)
  })
})

describe('renewBudgetWindow', () => {
  it('adds one renewal window', () => {
    expect(renewBudgetWindow(100, 512)).toBe(100 + BUDGET_RENEW_STEPS)
  })

  it('clamps at the hard ceiling', () => {
    expect(renewBudgetWindow(500, 512)).toBe(512)
    expect(renewBudgetWindow(512, 512)).toBe(512)
  })
})
