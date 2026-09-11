import { describe, it, expect } from 'vitest'
import {
  getErrorSignature,
  isRepairAllowed,
  recordRepairAttempt,
  createSelfRepairMission,
  MAX_REPAIR_ATTEMPTS
} from '../src/api/ai/selfHealingEngine.js'

describe('selfHealingEngine', () => {
  it('getErrorSignature menormalkan error stack', () => {
    const err = new Error('Socket disconnected')
    err.stack = 'Error: Socket disconnected\n    at fetch (ai-bridge.js:120:15)\n    at Object.run (planning.js:45:10)'
    const sig = getErrorSignature(err)
    expect(sig).toContain('Socket disconnected')
    expect(sig).toContain('ai-bridge.js')
  })

  it('circuit breaker membatasi percobaan maksimal 2x per signature', () => {
    const sig = 'custom_err_test_circuit'
    expect(isRepairAllowed(sig)).toBe(true)

    recordRepairAttempt(sig)
    expect(isRepairAllowed(sig)).toBe(true)

    recordRepairAttempt(sig)
    // Setelah 2x attempt, harus dilarang
    expect(isRepairAllowed(sig)).toBe(false)
  })

  it('createSelfRepairMission menghasilkan sandbox branch dan instruksi valid', () => {
    const err = new Error('Null pointer exception di taskStore')
    const mission = createSelfRepairMission({
      error: err,
      contextInfo: { module: 'taskStore' },
      agentId: 'claude'
    })

    expect(mission.allowed).toBe(true)
    expect(mission.branch).toMatch(/^auto\/fix-runtime-/)
    expect(mission.prompt).toContain('Null pointer exception di taskStore')
    expect(mission.command).toContain('git checkout -B auto/fix-runtime-')
  })
})
