// Regression tests: Trajectory Supervisor Fase 1 (main loop).
// Target: src/api/ai/trajectorySupervisor.js — pure trajectory-level policy
// sitting above agentDecision (per-turn claim) and objectiveVerifier
// (completion proof). It watches attempt history across turns and proposes
// a strategy directive when the same approach repeats without progress.
//
// Locked contract pinned here:
//   - MODIFY on the 3rd repeat of one strategy key, ABANDON on the 5th,
//     silence when stepsLeft <= 7 (budget guard owns convergence).
//   - One directive per key per task (hysteresis), 2-turn cooldown, max 2
//     hint injections per task; past budget => silent ESCALATE/CONTINUE.
//   - Key = tool + NORMALIZED target: different targets never flag, trivial
//     case/whitespace variants of the same target share one key.
//   - Success on an already-succeeded key is neutral, not progress.
//   - Verify-gate active => defer (single injection slot, no collision).
//   - Never throws, hint text always <= MAX_HINT_CHARS.

import { describe, it, expect } from 'vitest'
import {
  DIRECTIVE,
  MAX_HINT_CHARS,
  createTrajectorySupervisor,
  normalizeAttemptKey
} from '../src/api/ai/trajectorySupervisor.js'

const base = { verificationState: 'not_run', stepsLeft: 20, verifyGateActive: false }

const feed = (sup, tool, query, success, extra = {}) =>
  sup.update({ tool, query, success, ...base, ...extra })

describe('normalizeAttemptKey', () => {
  it('merges trivial variants of the same target', () => {
    expect(normalizeAttemptKey('grep-search', '  Auth  ')).toBe(
      normalizeAttemptKey('Grep-Search', '"auth"')
    )
  })

  it('keeps different targets distinct', () => {
    expect(normalizeAttemptKey('read-file', 'src/a.js')).not.toBe(
      normalizeAttemptKey('read-file', 'src/b.js')
    )
  })

  it('keeps different tools distinct even on the same target', () => {
    expect(normalizeAttemptKey('read-file', 'x')).not.toBe(normalizeAttemptKey('grep-search', 'x'))
  })
})

describe('stagnation ladder', () => {
  it('same near-identical strategy 3x => MODIFY with hint, then cooldown silence', () => {
    const sup = createTrajectorySupervisor()
    expect(feed(sup, 'grep-search', 'pola auth').directive).toBe(DIRECTIVE.CONTINUE)
    expect(feed(sup, 'grep-search', 'pola  auth').directive).toBe(DIRECTIVE.CONTINUE)
    const third = feed(sup, 'grep-search', '"Pola Auth"')
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
    expect(typeof third.hintText).toBe('string')
    expect(third.hintText.length).toBeLessThanOrEqual(MAX_HINT_CHARS)
    // Cooldown: next two turns stay silent even on the same key.
    expect(feed(sup, 'grep-search', 'pola auth').directive).toBe(DIRECTIVE.CONTINUE)
    expect(feed(sup, 'grep-search', 'pola auth').directive).toBe(DIRECTIVE.CONTINUE)
  })

  it('legit exploration across different targets never flags', () => {
    const sup = createTrajectorySupervisor()
    const paths = ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js', 'src/f.js']
    for (const p of paths) {
      const r = feed(sup, 'read-file', p, true)
      expect(r.directive).toBe(DIRECTIVE.CONTINUE)
      expect(r.hintText).toBeNull()
    }
  })

  it('repeated success on an old key is neutral, not progress (no hint reset abuse)', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'list-dir', 'src', true)
    // Re-treading the same successful target counts toward the repeat run
    // (it is not fresh progress), so the 3rd consecutive hit trips MODIFY —
    // while the success registry itself never inflates.
    expect(feed(sup, 'list-dir', 'src', true).directive).toBe(DIRECTIVE.CONTINUE)
    const third = feed(sup, 'list-dir', 'src', true)
    expect(third.directive).toBe(DIRECTIVE.MODIFY)
    expect(sup.snapshot().succeededStrategies).toBe(1)
  })
})

describe('hint budget and escalation', () => {
  it('ignored hint => at most 2 injections per task, then silent ESCALATE', () => {
    const sup = createTrajectorySupervisor()
    const seen = []
    // Model ignores every hint and repeats key A, then key B.
    for (let i = 0; i < 5; i++) seen.push(feed(sup, 'grep-search', 'pola x', false))
    for (let i = 0; i < 5; i++) seen.push(feed(sup, 'run-shell', 'cmd y', false))
    // need extra repeats: cooldown turns consume iterations; drive further
    for (let i = 0; i < 4; i++) seen.push(feed(sup, 'run-shell', 'cmd y', false))
    const hints = seen.filter((r) => r.hintText)
    expect(hints.length).toBeLessThanOrEqual(2)
    expect(sup.snapshot().hintsUsed).toBeLessThanOrEqual(2)
    const last = seen[seen.length - 1]
    expect([DIRECTIVE.ESCALATE, DIRECTIVE.CONTINUE]).toContain(last.directive)
    expect(last.hintText).toBeNull()
  })

  it('ABANDON fires at the 5th repeat when MODIFY was deferred by the verify gate', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'run-shell', 'cmd b', false)
    feed(sup, 'run-shell', 'cmd b', false)
    // Repeats 3-4 coincide with an active verify gate: recorded, deferred.
    feed(sup, 'run-shell', 'cmd b', false, { verifyGateActive: true })
    feed(sup, 'run-shell', 'cmd b', false, { verifyGateActive: true })
    expect(sup.snapshot().hintsUsed).toBe(0)
    const fifth = feed(sup, 'run-shell', 'cmd b', false)
    expect(fifth.directive).toBe(DIRECTIVE.ABANDON)
    expect(fifth.hintText).toContain('Tinggalkan')
    // Hysteresis: the same key never gets a second directive.
    feed(sup, 'other-tool', 'cool 1', true)
    feed(sup, 'other-tool', 'cool 2', true)
    const sixth = feed(sup, 'run-shell', 'cmd b', false)
    expect(sixth.hintText).toBeNull()
  })
})

describe('retrieve_pattern', () => {
  it('stuck key with an earlier success elsewhere => RETRIEVE referencing it', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'read-file', 'src/known.js', true)
    feed(sup, 'grep-search', 'pola z', false)
    feed(sup, 'grep-search', 'pola z', false)
    const third = feed(sup, 'grep-search', 'pola z', false)
    expect(third.directive).toBe(DIRECTIVE.RETRIEVE)
    expect(third.hintText).toContain('known.js')
  })
})

describe('precedence and silence rules', () => {
  it('verify-gate active => record silently, defer the hint', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'grep-search', 'pola q', false)
    feed(sup, 'grep-search', 'pola q', false)
    const deferred = feed(sup, 'grep-search', 'pola q', false, { verifyGateActive: true })
    expect(deferred.directive).toBe(DIRECTIVE.CONTINUE)
    expect(deferred.hintText).toBeNull()
    expect(sup.snapshot().hintsUsed).toBe(0)
  })

  it('thin budget (stepsLeft <= 7) => silent, budget guard owns convergence', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'grep-search', 'pola w', false, { stepsLeft: 20 })
    feed(sup, 'grep-search', 'pola w', false, { stepsLeft: 20 })
    const thin = feed(sup, 'grep-search', 'pola w', false, { stepsLeft: 7 })
    expect(thin.directive).toBe(DIRECTIVE.CONTINUE)
    expect(thin.hintText).toBeNull()
    expect(sup.snapshot().hintsUsed).toBe(0)
  })

  it('verification moving toward proven states => CONTINUE, never a hint', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'write-file', 'out.md', true)
    feed(sup, 'read-file', 'out.md', true)
    const r = feed(sup, 'read-file', 'out.md', true, {
      verificationState: 'partially_verified'
    })
    expect(r.directive).toBe(DIRECTIVE.CONTINUE)
    expect(r.hintText).toBeNull()
  })
})

describe('semantic tripwire (conservative)', () => {
  it('many successful tools, verification stuck, re-treading => one MODIFY', () => {
    const sup = createTrajectorySupervisor()
    const targets = ['a', 'b', 'c', 'd', 'e']
    for (const t of targets) feed(sup, 'read-file', t, true)
    expect(sup.snapshot().successes).toBe(5)
    // Re-tread old ground: last 3 hit already-succeeded keys.
    feed(sup, 'read-file', 'a', true)
    feed(sup, 'read-file', 'b', true)
    const trip = feed(sup, 'read-file', 'c', true)
    expect(trip.directive).toBe(DIRECTIVE.MODIFY)
    expect(trip.hintText).toContain('verifikasi')
    // Once per task: further re-treading stays silent.
    const again = feed(sup, 'read-file', 'a', true)
    expect(again.hintText).toBeNull()
  })

  it('fresh exploration with successes => no semantic false-fire', () => {
    const sup = createTrajectorySupervisor()
    const targets = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const t of targets) {
      const r = feed(sup, 'read-file', t, true)
      expect(r.hintText).toBeNull()
    }
  })
})

describe('additive contract', () => {
  it('never throws on garbage input, degrades to CONTINUE', () => {
    const sup = createTrajectorySupervisor()
    expect(sup.update(null).directive).toBe(DIRECTIVE.CONTINUE)
    expect(sup.update({}).directive).toBe(DIRECTIVE.CONTINUE)
    expect(sup.update({ tool: 42, query: { nested: true } }).directive).toBe(
      DIRECTIVE.CONTINUE
    )
  })

  it('reset() restores a fresh task state', () => {
    const sup = createTrajectorySupervisor()
    feed(sup, 'grep-search', 'pola r', false)
    feed(sup, 'grep-search', 'pola r', false)
    feed(sup, 'grep-search', 'pola r', false)
    expect(sup.snapshot().hintsUsed).toBe(1)
    sup.reset()
    expect(sup.snapshot()).toEqual({
      attempts: 0,
      successes: 0,
      hintsUsed: 0,
      cooldownLeft: 0,
      succeededStrategies: 0,
      failedStrategies: 0
    })
  })
})
