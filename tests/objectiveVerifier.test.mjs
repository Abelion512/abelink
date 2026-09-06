// Regression tests: Objective Completion & Verification Layer.
// Target: src/api/ai/objectiveVerifier.js — pure VERIFICATION state machine
// separating MODEL_CLAIM (agentDecision.js) from SYSTEM VERIFICATION.
//
// Contract pinned here:
//   - A completion claim ("is_done": true) is NOT proof of completion.
//   - Final completion = claim done AND verification verified, unless the
//     objective is conversational / has no observable criteria.
//   - Verification is task-aware: file/code/browser/os/research/communication
//     kinds get criteria; unobservable criteria are 'na', never fake proof.
//   - Unproven claims trigger a BOUNDED replan, then fail honestly.

import { describe, it, expect } from 'vitest'
import {
  VERIFICATION_STATE,
  OBJECTIVE_KINDS,
  MAX_VERIFY_REPLANS,
  classifyObjectiveKind,
  deriveSuccessCriteria,
  evaluateEvidence,
  gateCompletion,
  buildReplanObservation
} from '../src/api/ai/objectiveVerifier.js'

const exec = (tool, result) => ({ tool, fullResult: result || 'success' })

describe('classifyObjectiveKind — task-awareness', () => {
  it('conversational questions deliver text in-chat: no external verification', () => {
    expect(classifyObjectiveKind('Apa itu machine learning?')).toBe('conversational')
    expect(classifyObjectiveKind('Jelaskan cara kerja git rebase')).toBe('conversational')
    expect(classifyObjectiveKind('Buat rencana belajar 30 hari')).toBe('conversational')
  })

  it('file objective detected from artifact vocabulary', () => {
    expect(classifyObjectiveKind('Buat laporan.md berisi ringkasan penjualan')).toBe('file')
  })

  it('code objective detected from bug/fix vocabulary', () => {
    expect(classifyObjectiveKind('Perbaiki bug di parser.js dan jalankan test')).toBe('code')
  })

  it('browser objective detected from form/submit vocabulary', () => {
    expect(classifyObjectiveKind('Submit form registrasi di halaman web itu')).toBe('browser')
  })

  it('empty prompt defaults to conversational (no fake criteria)', () => {
    expect(classifyObjectiveKind('')).toBe('conversational')
  })

  it('hints.disableTools forces conversational', () => {
    expect(classifyObjectiveKind('tulis file apa saja', { disableTools: true })).toBe(
      'conversational'
    )
  })
})

describe('deriveSuccessCriteria — per-kind examples from spec §4', () => {
  it('file: existence/read-back + content conformance', () => {
    const ids = deriveSuccessCriteria('file', 'buat report.md').map((c) => c.id)
    expect(ids).toContain('artifact-exists')
    expect(ids).toContain('content-satisfies')
  })

  it('code: syntax validity always; tests only when requested', () => {
    const noTest = deriveSuccessCriteria('code', 'perbaiki bug parser').map((c) => c.id)
    expect(noTest).toContain('artifact-exists')
    expect(noTest).toContain('syntax-valid')
    expect(noTest).not.toContain('tests-pass')

    const withTest = deriveSuccessCriteria('code', 'perbaiki bug parser dan jalankan unit test')
    expect(withTest.map((c) => c.id)).toContain('tests-pass')
  })

  it('browser: confirmation page, not merely "click executed"', () => {
    const ids = deriveSuccessCriteria('browser').map((c) => c.id)
    expect(ids).toEqual(['action-confirmed'])
  })

  it('conversational: no criteria (never blocks completion)', () => {
    expect(deriveSuccessCriteria('conversational')).toEqual([])
  })

  it('research adds artifact criterion only when a file is requested', () => {
    const plain = deriveSuccessCriteria('research', 'riset pasar crypto').map((c) => c.id)
    expect(plain).not.toContain('artifact-exists')
    const withFile = deriveSuccessCriteria('research', 'riset pasar crypto, simpan laporan.md')
    expect(withFile.map((c) => c.id)).toContain('artifact-exists')
  })
})

describe('evaluateEvidence — VERIFICATION states from world-state proof', () => {
  it('conversational: always verified (no external state to check)', () => {
    const r = evaluateEvidence({
      kind: 'conversational',
      objectiveText: 'apa itu x?',
      answer: 'x adalah...'
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(r.criteria).toEqual([])
  })

  it('no observations at all => not_run with unresolved criteria', () => {
    const r = evaluateEvidence({ kind: 'file', objectiveText: 'buat laporan.md', tools: [] })
    expect(r.state).toBe(VERIFICATION_STATE.NOT_RUN)
    expect(r.criteria.every((c) => c.state === 'unresolved')).toBe(true)
  })

  it('file: write + read-back => verified', () => {
    const r = evaluateEvidence({
      kind: 'file',
      objectiveText: 'buat laporan.md',
      tools: [exec('write-file'), exec('read-file', 'isi laporan lengkap')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(r.criteria.find((c) => c.id === 'artifact-exists').state).toBe('pass')
  })

  it('file: write FAILED => failed (claim must not survive)', () => {
    const r = evaluateEvidence({
      kind: 'file',
      objectiveText: 'buat laporan.md',
      tools: [exec('write-file', '[ERROR] permission denied')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.FAILED)
    expect(r.criteria.find((c) => c.id === 'artifact-exists').state).toBe('fail')
  })

  it('code with test request: test output lulus proves tests-pass', () => {
    const r = evaluateEvidence({
      kind: 'code',
      objectiveText: 'perbaiki parser dan jalankan unit test',
      tools: [exec('replace-content'), exec('run-shell', '3 passing, 0 failed')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(r.criteria.find((c) => c.id === 'tests-pass').state).toBe('pass')
  })

  it('code with test request: test gagal => failed', () => {
    const r = evaluateEvidence({
      kind: 'code',
      objectiveText: 'perbaiki parser dan jalankan unit test',
      tools: [exec('replace-content'), exec('run-shell', '2 failed')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.FAILED)
  })

  it('browser: click alone (no post-action confirmation read) => unresolved, not verified', () => {
    const r = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'submit form pendaftaran',
      tools: [exec('browser-click')]
    })
    expect(r.criteria.find((c) => c.id === 'action-confirmed').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('browser: post-action read with confirmation text => verified', () => {
    const r = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'submit form pendaftaran',
      tools: [
        exec('browser-click'),
        exec('browser-read', 'Terima kasih! Data Anda berhasil dikirim.')
      ]
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(r.criteria.find((c) => c.id === 'action-confirmed').state).toBe('pass')
  })

  it('os: os-read/list proof after action => verified', () => {
    const r = evaluateEvidence({
      kind: 'os',
      objectiveText: 'buka aplikasi kalkulator',
      tools: [exec('os-search'), exec('os-list-windows', '1. Calculator')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: sources + facts => verified; no answer => partially_verified', () => {
    const ok = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer:
        'Harga GPU saat ini berkisar Rp 10-15 juta untuk kelas high-end menurut beberapa toko.',
      tools: [exec('browser-search')]
    })
    expect(ok.state).toBe(VERIFICATION_STATE.VERIFIED)

    const noAnswer = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer: '',
      tools: [exec('browser-search')]
    })
    expect(noAnswer.state).toBe(VERIFICATION_STATE.PARTIALLY)
  })

  it('communication: send confirmation => verified', () => {
    const r = evaluateEvidence({
      kind: 'communication',
      objectiveText: 'kirim pesan telegram ke admin',
      tools: [exec('tg-send', 'Message terkirim (message_id 123)')]
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('general: last tool success => verified; last tool error => failed', () => {
    const ok = evaluateEvidence({
      kind: 'general',
      objectiveText: 'x',
      tools: [exec('memory-search')]
    })
    expect(ok.state).toBe(VERIFICATION_STATE.VERIFIED)
    const bad = evaluateEvidence({
      kind: 'general',
      objectiveText: 'x',
      tools: [exec('memory-search'), exec('list-dir', '[ERROR] timeout')]
    })
    expect(bad.state).toBe(VERIFICATION_STATE.FAILED)
  })

  it('unobservable criteria are na and never fake verification', () => {
    const r = evaluateEvidence({
      kind: 'file',
      objectiveText: 'buat laporan.md',
      tools: [exec('write-file')]
    })
    // content-satisfies is not deterministically observable => na
    expect(r.criteria.find((c) => c.id === 'content-satisfies').state).toBe('na')
    // but artifact-exists is proven => verified overall
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('observation strings with inline [tool] markers are classified', () => {
    const r = evaluateEvidence({
      kind: 'file',
      objectiveText: 'buat laporan.md',
      observations: ['[TOOL write-file] success', '[TOOL read-file] isi laporan...']
    })
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('web DOM noise (word "timeout" inside content) is NOT a failure', () => {
    const r = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'baca halaman status',
      tools: [
        exec('browser-navigate'),
        exec('browser-read', 'Halaman berisi teks: default timeout is 30 seconds')
      ]
    })
    // last op is a successful read => confirmation not found => unresolved,
    // but NOT failed — generic vocabulary is not an error marker.
    expect(r.state).not.toBe(VERIFICATION_STATE.FAILED)
  })
})

describe('gateCompletion — MODEL_CLAIM x VERIFICATION', () => {
  it('claim done + verified => complete (world-state-verified)', () => {
    const g = gateCompletion({
      modelClaimDone: true,
      verification: VERIFICATION_STATE.VERIFIED,
      kind: 'file'
    })
    expect(g.complete).toBe(true)
    expect(g.replan).toBe(false)
  })

  it('claim done + partially_verified => replan (claim alone is insufficient)', () => {
    const g = gateCompletion({
      modelClaimDone: true,
      verification: VERIFICATION_STATE.PARTIALLY,
      kind: 'file'
    })
    expect(g.complete).toBe(false)
    expect(g.replan).toBe(true)
  })

  it('claim done + failed => replan demanded', () => {
    const g = gateCompletion({
      modelClaimDone: true,
      verification: VERIFICATION_STATE.FAILED,
      kind: 'file'
    })
    expect(g.complete).toBe(false)
    expect(g.replan).toBe(true)
  })

  it('conversational objective: claim alone IS sufficient (explicit exemption)', () => {
    const g = gateCompletion({
      modelClaimDone: true,
      verification: VERIFICATION_STATE.NOT_RUN,
      kind: 'conversational'
    })
    expect(g.complete).toBe(true)
  })

  it('general objective with no observable criteria: claim accepted (no fake shell test)', () => {
    const g = gateCompletion({
      modelClaimDone: true,
      verification: VERIFICATION_STATE.NOT_RUN,
      kind: 'general'
    })
    expect(g.complete).toBe(true)
    expect(g.reason).toBe('no-observable-criteria')
  })

  it('claim NOT done => nothing completes', () => {
    const g = gateCompletion({
      modelClaimDone: false,
      verification: VERIFICATION_STATE.VERIFIED,
      kind: 'file'
    })
    expect(g.complete).toBe(false)
    expect(g.reason).toBe('model-claim-not-done')
  })
})

describe('buildReplanObservation — bounded replan demand', () => {
  it('lists unproven criteria with a kind-specific verification hint', () => {
    const evidence = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'submit form',
      tools: [exec('browser-click')]
    })
    const obs = buildReplanObservation(evidence)
    expect(obs).toContain('[VERIFICATION GATE]')
    expect(obs).toContain('DITOLAK')
    expect(obs).toContain('browser-read')
  })

  it('MAX_VERIFY_REPLANS is bounded (no infinite verify loop)', () => {
    expect(MAX_VERIFY_REPLANS).toBeGreaterThanOrEqual(1)
    expect(MAX_VERIFY_REPLANS).toBeLessThanOrEqual(3)
  })

  it('OBJECTIVE_KINDS covers all classification outputs', () => {
    expect(OBJECTIVE_KINDS).toContain('conversational')
    expect(OBJECTIVE_KINDS).toContain('general')
  })
})
