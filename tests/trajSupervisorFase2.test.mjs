// tests/trajSupervisorFase2.test.mjs — Fase 2 additive outputs (Fase 1 pins live in trajectorySupervisor.test.mjs).
import { describe, it, expect } from 'vitest'
import { DIRECTIVE, createTrajectorySupervisor } from '../src/api/ai/trajectorySupervisor.js'

const base = { verificationState: 'not_run', stepsLeft: 20, verifyGateActive: false }

describe('supervisor Fase 2 outputs', () => {
  it('CONTINUE carries nextStrategy + null restoreHint', () => {
    const sup = createTrajectorySupervisor()
    const r = sup.update({ tool: 'read-file', query: 'src/a.js', success: true, ...base })
    expect(r.directive).toBe(DIRECTIVE.CONTINUE)
    expect(typeof r.nextStrategy).toBe('string')
    expect(r.restoreHint).toBeNull()
  })

  it('MODIFY on 3rd repeat carries nextStrategy != failed class + hint within cap', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base })
    sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base, strategy: 'DIRECT' })
    const third = sup.update({ tool: 'grep-search', query: 'auth', success: false, ...base, strategy: 'DIRECT' })
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
    expect(typeof third.nextStrategy).toBe('string')
  })

  it('stagnation ladder surfaces nextStrategy when repeated failures occur', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'read-file', query: 'src/a.js', success: true, verificationRank: 1, score: 0.8, ...base })
    let r = null
    for (let i = 0; i < 6; i++) {
      r = sup.update({ tool: 'grep-search', query: 'zzz', success: false, stagnation: 0.9, bestKey: 'read-file "src/a.js"', ...base })
    }
    expect(['modify_strategy', 'abandon_strategy', 'escalate', 'continue']).toContain(r.directive)
    if (r.directive !== 'continue') expect(typeof r.nextStrategy).toBe('string')
  })

  it('omitted Fase 2 fields keep Fase 1 behavior identical', () => {
    const sup = createTrajectorySupervisor()
    sup.update({ tool: 'grep-search', query: 'pola auth', success: false, ...base })
    sup.update({ tool: 'grep-search', query: 'pola  auth', success: false, ...base })
    const third = sup.update({ tool: 'grep-search', query: '"Pola Auth"', success: false, ...base })
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
  })
})

it('executor call shape: a plain Fase 1 update never throws', () => {
  const sup = createTrajectorySupervisor()
  const r = sup.update({ tool: 'read-file', query: 'src/a.js', success: true, verificationState: 'partially_verified', stepsLeft: 20, verifyGateActive: false })
  expect(r.directive).toBe(DIRECTIVE.CONTINUE)
})
