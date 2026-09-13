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
  buildReplanObservation,
  escalateKindFromEvidence
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

  it('teks saja tidak cukup untuk situs asing: tanpa daftar nama, jujur general', () => {
    expect(classifyObjectiveKind('buka travelsoka lalu cek ulang detailnya')).toBe('general')
  })

  it('pola linguistik umum tetap browser: buka + URL/situs/web', () => {
    expect(classifyObjectiveKind('buka https://example.com dan cek harga')).toBe('browser')
    expect(classifyObjectiveKind('buka situs itu dan cari info kontak')).toBe('browser')
  })

  it('os/file guards survive the browser site pattern', () => {
    expect(classifyObjectiveKind('buka aplikasi kalkulator')).toBe('os')
    expect(classifyObjectiveKind('buka file laporan.md')).toBe('file')
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

  it('general multi-action: 1 sukses = progres, bukan bukti selesai', () => {
    const one = evaluateEvidence({
      kind: 'general',
      objectiveText: 'cek memori lalu rapikan folder arsip',
      tools: [exec('memory-search')]
    })
    expect(one.criteria.find((c) => c.id === 'multi-step-progress').state).toBe('unresolved')
    expect(one.state).not.toBe(VERIFICATION_STATE.VERIFIED)
    const gate = gateCompletion({ modelClaimDone: true, verification: one.state, kind: 'general' })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
  })

  it('general multi-action: 0 tool = belum ada bukti (bukan NOT_RUN)', () => {
    const none = evaluateEvidence({
      kind: 'general',
      objectiveText: 'cek memori lalu rapikan folder arsip',
      tools: []
    })
    expect(none.state).toBe(VERIFICATION_STATE.UNAVAILABLE)
    const gate = gateCompletion({ modelClaimDone: true, verification: none.state, kind: 'general' })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
  })

  it('general multi-action: 2 sukses => verified', () => {
    const two = evaluateEvidence({
      kind: 'general',
      objectiveText: 'cek memori lalu rapikan folder arsip',
      tools: [exec('memory-search'), exec('list-dir', 'arsip/')]
    })
    expect(two.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('eskalasi bukti: general + interaksi browser = lensa browser; navigate saja tidak', () => {
    expect(escalateKindFromEvidence('general', [{ tool: 'browser-click' }])).toBe('browser')
    expect(escalateKindFromEvidence('general', [{ tool: 'browser-navigate' }])).toBe('general')
    expect(escalateKindFromEvidence('general', [{ tool: 'browser-read' }])).toBe('general')
    expect(escalateKindFromEvidence('general', [{ tool: 'read-file' }])).toBe('general')
    expect(escalateKindFromEvidence('file', [{ tool: 'browser-click' }])).toBe('file')
    expect(escalateKindFromEvidence('conversational', [{ tool: 'browser-navigate' }])).toBe(
      'conversational'
    )
  })

  it('komposisi lapangan: navigate saja tidak menuntut konfirmasi interaksi', () => {
    const prompt = 'buka travelsoka lalu cek ulang detailnya'
    expect(classifyObjectiveKind(prompt)).toBe('general')
    const evidence = evaluateEvidence({
      objectiveText: prompt,
      tools: [
        exec(
          'browser-navigate',
          'Travelsoka terbuka: judul halaman, daftar penerbangan dan harga tersedia'
        )
      ]
    })
    // Tetap general (tanpa eskalasi browser), dan satu aksi pada objective
    // multi-langkah = progres (partially) dengan replan lanjutan — bukan
    // tuntutan konfirmasi interaksi, bukan klaim selesai.
    expect(evidence.kind).toBe('general')
    expect(evidence.criteria.map((c) => c.id)).not.toContain('action-confirmed')
    expect(evidence.state).toBe(VERIFICATION_STATE.PARTIALLY)
    const gate = gateCompletion({
      modelClaimDone: true,
      verification: evidence.state,
      kind: evidence.kind
    })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
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

describe('browser read-class verification — substantive content, not vocabulary', () => {
  it('1. scrape/extract dengan data nyata => verified', () => {
    const r = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'scrape harga GPU dari halaman web itu',
      tools: [
        exec('browser-navigate', 'Halaman katalog terbuka: daftar produk dan harga tampil'),
        exec(
          'browser-extract',
          '[{"nama":"RTX 4070","harga":"Rp 9.500.000"},{"nama":"RTX 4080","harga":"Rp 14.200.000"}]'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'action-confirmed').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('2. read-class kosong/trivial => unresolved, bukan verified gratis', () => {
    const empty = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'scrape harga GPU dari halaman web itu',
      tools: [exec('browser-navigate', 'Halaman katalog terbuka'), exec('browser-extract', '')]
    })
    expect(empty.criteria.find((c) => c.id === 'action-confirmed').state).toBe('unresolved')
    expect(empty.state).not.toBe(VERIFICATION_STATE.VERIFIED)

    const trivial = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'baca halaman status',
      tools: [exec('browser-navigate', 'OK')]
    })
    expect(trivial.criteria.find((c) => c.id === 'action-confirmed').state).toBe('unresolved')
    expect(trivial.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('3. click tanpa bukti konfirmasi => tetap blocked/unavailable', () => {
    const r = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'submit form registrasi di halaman web itu',
      tools: [
        exec('browser-navigate', 'Halaman form terbuka dengan kolom nama dan email'),
        exec('browser-click', 'Elemen ak3 diklik, DOM terbaru dikembalikan tanpa pesan status')
      ]
    })
    expect(r.criteria.find((c) => c.id === 'action-confirmed').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
    const gate = gateCompletion({ modelClaimDone: true, verification: r.state, kind: r.kind })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
  })

  it('4. general: navigate + write + read-back => verified via kriteria general', () => {
    const r = evaluateEvidence({
      kind: 'general',
      objectiveText: 'kumpulkan info lalu simpan ringkasan',
      tools: [
        exec('browser-navigate', 'Halaman sumber terbuka dengan artikel lengkap'),
        exec('write-file', 'file tersimpan'),
        exec('read-file', 'ringkasan hasil pengumpulan info')
      ]
    })
    expect(r.kind).toBe('general')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('5. navigate insidental tidak mengeskalasi kriteria browser', () => {
    const r = evaluateEvidence({
      kind: 'general',
      objectiveText: 'kumpulkan info lalu simpan ringkasan',
      tools: [
        exec('browser-navigate', 'Halaman sumber terbuka dengan artikel lengkap'),
        exec('write-file', 'file tersimpan'),
        exec('read-file', 'ringkasan hasil pengumpulan info')
      ]
    })
    expect(r.kind).toBe('general')
    expect(r.criteria.map((c) => c.id)).not.toContain('action-confirmed')
  })

  it('5b. general satu-langkah: navigate berisi data => verified tanpa kosakata konfirmasi', () => {
    const r = evaluateEvidence({
      kind: 'general',
      objectiveText: 'cek harga tiket hari ini',
      tools: [
        exec(
          'browser-navigate',
          'Halaman maskapai terbuka: daftar jadwal penerbangan dan harga tiket tampil'
        )
      ]
    })
    expect(r.kind).toBe('general')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('6. campuran: navigate + click + write/read-back => interaksi tetap butuh konfirmasi', () => {
    const r = evaluateEvidence({
      kind: 'general',
      objectiveText: 'isi form lalu simpan hasilnya',
      tools: [
        exec('browser-navigate', 'Halaman form terbuka dengan kolom input lengkap'),
        exec('browser-click', 'Elemen ak1 diklik, DOM terbaru tanpa pesan konfirmasi'),
        exec('write-file', 'file tersimpan'),
        exec('read-file', 'hasil isian form')
      ]
    })
    expect(r.kind).toBe('browser')
    expect(r.criteria.find((c) => c.id === 'action-confirmed').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('7. passthrough NOT_RUN general tanpa kriteria observabel tetap utuh', () => {
    const r = evaluateEvidence({ kind: 'general', objectiveText: 'x', tools: [] })
    expect(r.state).toBe(VERIFICATION_STATE.NOT_RUN)
    const g = gateCompletion({ modelClaimDone: true, verification: r.state, kind: 'general' })
    expect(g.complete).toBe(true)
    expect(g.reason).toBe('no-observable-criteria')
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

  it('replan untuk klaim prematur menunjuk ask-choice, bukan pertanyaan teks', () => {
    const evidence = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'buka situs itu dan lanjutkan percakapan sebelumnya',
      tools: [exec('browser-navigate', 'Halaman terbuka')]
    })
    const obs = buildReplanObservation(evidence)
    expect(obs).toContain('[VERIFICATION GATE]')
    expect(obs).toContain('ask-choice')
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
