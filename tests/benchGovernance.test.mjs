// benchGovernance.test.mjs — Task 4 regression lock.
//
// The bench loop (evaluation/abelink-adapter.mjs) executes the arch axis via
// getArchPolicy + the REAL governance modules (objectiveVerifier,
// trajectorySupervisor). This test pins the decision rule the loop implements,
// without spawning a sidecar or calling an LLM:
//
//   - a completion claim with zero tool evidence MUST demand a bounded replan
//     under basic, and MUST be trusted at first sight under vanilla;
//   - replan budget is bounded by MAX_VERIFY_REPLANS;
//   - the supervisor fires a hint on the 3rd repeat (the signal the loop
//     injects as the next observation).
//
// If the loop ever stops calling the real modules, the contract below still
// describes the required behavior — update the loop, not this test.

import { describe, it, expect } from 'vitest'
import { getArchPolicy } from '../src/api/ai/archPolicy.js'
import {
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation,
  MAX_VERIFY_REPLANS
} from '../src/api/ai/objectiveVerifier.js'
import { createTrajectorySupervisor, DIRECTIVE } from '../src/api/ai/trajectorySupervisor.js'

// Mirror of the loop's claim-handling rule in runAbelinkAgent:
// basic → gate + bounded replan; vanilla → trust the claim (control arm).
function handleClaim({ arch, evidence }) {
  const policy = getArchPolicy(arch)
  const gate = gateCompletion({
    modelClaimDone: true,
    verification: evidence.state,
    kind: evidence.kind
  })
  if (policy.verifyGateEnabled && !gate.complete) {
    return { action: 'replan', budget: MAX_VERIFY_REPLANS, reason: gate.reason }
  }
  return { action: 'stop', reason: policy.verifyGateEnabled ? gate.reason : 'verify:skipped-vanilla' }
}

describe('bench governance wiring contract', () => {
  it('claim with zero evidence: basic replans, vanilla stops', () => {
    const evidence = evaluateEvidence({
      kind: 'file',
      objectiveText: 'Buat laporan.md',
      answer: 'Sudah saya buat laporan lengkap.',
      tools: []
    })
    expect(evidence.state).not.toBe('verified')

    const basic = handleClaim({ arch: 'basic', evidence })
    expect(basic.action).toBe('replan')
    expect(basic.budget).toBe(MAX_VERIFY_REPLANS)

    const vanilla = handleClaim({ arch: 'vanilla', evidence })
    expect(vanilla.action).toBe('stop')
    expect(vanilla.reason).toBe('verify:skipped-vanilla')
  })

  it('replan observation names the unproven criteria', () => {
    const evidence = evaluateEvidence({
      kind: 'file',
      objectiveText: 'Buat laporan.md',
      answer: 'Sudah.',
      tools: []
    })
    const obs = buildReplanObservation(evidence)
    expect(obs).toMatch(/VERIFICATION GATE/)
    expect(obs.length).toBeGreaterThan(50)
  })

  it('supervisor fires a hint on the 3rd repeat (loop injects it)', () => {
    const sup = createTrajectorySupervisor()
    const base = {
      verificationState: 'not_run',
      stepsLeft: 20,
      verifyGateActive: false,
      observation: 'ok',
      result: 'ok'
    }
    expect(sup.update({ tool: 'read-file', query: 'a', success: true, ...base }).directive).toBe(
      DIRECTIVE.CONTINUE
    )
    expect(sup.update({ tool: 'read-file', query: 'a', success: true, ...base }).directive).toBe(
      DIRECTIVE.CONTINUE
    )
    const third = sup.update({ tool: 'read-file', query: 'a', success: true, ...base })
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
    expect(typeof third.hintText).toBe('string')
  })

  it('verified evidence stops both arms (no spurious replan)', () => {
    const evidence = evaluateEvidence({
      kind: 'file',
      objectiveText: 'Buat laporan.md',
      answer: 'Laporan tersimpan.',
      tools: [
        { tool: 'write-file', fullResult: '[ok] written' },
        { tool: 'read-file', fullResult: 'isi laporan lengkap terbaca kembali' }
      ]
    })
    expect(evidence.state).toBe('verified')
    expect(handleClaim({ arch: 'basic', evidence }).action).toBe('stop')
    expect(handleClaim({ arch: 'vanilla', evidence }).action).toBe('stop')
  })
})
