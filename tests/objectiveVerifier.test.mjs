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
  isIndependentlyVerified,
  escalateKindFromEvidence
} from '../src/api/ai/objectiveVerifier.js'

const exec = (tool, result) => ({ tool, fullResult: result || 'success' })

describe('isIndependentlyVerified — exemption is not evidence', () => {
  it('conversational "verified" is an EXEMPTION, never trusted evidence', () => {
    // evaluateEvidence returns verified for conversational objectives with zero
    // criteria and zero ops. Completion may accept that; trusted learning may not.
    const verdict = evaluateEvidence({ kind: 'conversational', objectiveText: 'Apa itu git?' })
    expect(verdict.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(verdict.criteria).toEqual([])
    expect(isIndependentlyVerified({ verification: verdict.state, kind: 'conversational' })).toBe(false)
  })

  it('world-state verified for a real objective kind IS evidence', () => {
    const verdict = evaluateEvidence({
      kind: 'file',
      objectiveText: 'buat laporan.md',
      tools: [exec('write-file', 'written'), exec('read-file', 'laporan isi')]
    })
    expect(verdict.state).toBe(VERIFICATION_STATE.VERIFIED)
    expect(isIndependentlyVerified({ verification: verdict.state, kind: verdict.kind })).toBe(true)
  })

  it('non-verified states never count as evidence', () => {
    for (const state of ['not_run', 'partially_verified', 'failed', 'unavailable', '']) {
      expect(isIndependentlyVerified({ verification: state, kind: 'file' })).toBe(false)
    }
  })

  it('missing or malformed input degrades to not-evidence', () => {
    expect(isIndependentlyVerified()).toBe(false)
    expect(isIndependentlyVerified({})).toBe(false)
    expect(isIndependentlyVerified({ verification: 'verified' })).toBe(true)
    expect(isIndependentlyVerified({ verification: 'VERIFIED', kind: 'file' })).toBe(false)
    expect(isIndependentlyVerified({ verification: null, kind: null })).toBe(false)
  })

  it('a model claim cannot manufacture evidence: answer text is never an input', () => {
    // Only verification + kind are read; a confident final answer changes nothing.
    const withClaim = evaluateEvidence({
      kind: 'browser',
      objectiveText: 'submit form',
      answer: 'SUCCESS! Everything submitted and confirmed, tests passed.',
      tools: [exec('browser-click', 'clicked')]
    })
    expect(withClaim.state).not.toBe(VERIFICATION_STATE.VERIFIED)
    expect(isIndependentlyVerified({ verification: withClaim.state, kind: withClaim.kind })).toBe(false)
  })
})

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

  it('R1c: klaim test hijau + artefak vitest mentah => test-evidence pass', () => {
    const r = evaluateEvidence({
      kind: 'code',
      objectiveText: 'perbaiki parser dan jalankan unit test',
      answer: 'Bug diperbaiki, semua test hijau.',
      tools: [
        exec('replace-content', 'parser diperbarui'),
        exec('run-shell', 'Test Files 3 passed (3)\n Tests 41 passed (41)')
      ]
    })
    expect(r.criteria.find((c) => c.id === 'test-evidence').state).toBe('pass')
  })

  it('R1c: klaim test hijau TANPA artefak => test-evidence unresolved (anti-hack)', () => {
    const r = evaluateEvidence({
      kind: 'code',
      objectiveText: 'perbaiki parser dan jalankan unit test',
      answer: 'Bug diperbaiki, semua test hijau dan lulus.',
      tools: [exec('replace-content', 'parser diperbarui'), exec('run-shell', 'perintah dijalankan')]
    })
    const crit = r.criteria.find((c) => c.id === 'test-evidence')
    expect(crit.state).toBe('unresolved')
    expect(crit.label).toMatch(/tanpa artefak/)
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('R1c: jawaban tanpa klaim test => test-evidence na (no regression)', () => {
    const r = evaluateEvidence({
      kind: 'code',
      objectiveText: 'perbaiki parser dan jalankan unit test',
      answer: 'Parser diperbaiki, silakan cek ulang.',
      tools: [exec('replace-content'), exec('run-shell', '3 passing, 0 failed')]
    })
    expect(r.criteria.find((c) => c.id === 'test-evidence').state).toBe('na')
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

  // RI-13: plain exec() default result is 'success' (7 chars < 50) so it no
  // longer counts as fetch proof: sources-found requires >=50 substantive
  // chars with no no-result markers. Search results must carry real content.
  it('research: sources + facts => verified; no answer => partially_verified', () => {
    const ok = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer:
        'Harga GPU saat ini berkisar Rp 10-15 juta untuk kelas high-end menurut beberapa toko.',
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: RTX 4070 Rp 9,5 juta, RTX 4080 Rp 14,2 juta dari beberapa toko'
        )
      ]
    })
    expect(ok.criteria.find((c) => c.id === 'sources-found').state).toBe('pass')
    expect(ok.state).toBe(VERIFICATION_STATE.VERIFIED)

    const thinSearch = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer:
        'Harga GPU saat ini berkisar Rp 10-15 juta untuk kelas high-end menurut beberapa toko.',
      tools: [exec('browser-search')]
    })
    expect(thinSearch.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(thinSearch.state).not.toBe(VERIFICATION_STATE.VERIFIED)

    const noAnswer = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer: '',
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: RTX 4070 Rp 9,5 juta, RTX 4080 Rp 14,2 juta dari beberapa toko'
        )
      ]
    })
    expect(noAnswer.state).toBe(VERIFICATION_STATE.PARTIALLY)
  })

  it('RI-13 repro: semantically-failed search + write/read + long answer => NOT verified', () => {
    const longAnswer =
      'Laporan riset komprehensif mengenai topik yang diminta dengan analisis mendalam, ' +
      'perbandingan beberapa sudut pandang, dan kesimpulan yang panjang lebar melebihi batas.'
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X',
      answer: longAnswer,
      tools: [
        exec(
          'browser-search',
          'Tidak ditemukan hasil pencarian web langsung untuk topik X yang diminta pengguna'
        ),
        exec('write-file', 'laporan tersimpan'),
        exec('read-file', 'isi laporan hasil riset yang cukup panjang untuk dibaca kembali')
      ]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
    const gate = gateCompletion({
      modelClaimDone: true,
      verification: r.state,
      kind: r.kind
    })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
  })

  it('research search-error poisons batch: [SEARCH-ERROR] + good op => unresolved + error label', () => {
    const longAnswer =
      'Laporan riset komprehensif mengenai topik yang diminta dengan analisis mendalam, ' +
      'perbandingan beberapa sudut pandang, dan kesimpulan yang panjang lebar melebihi batas.'
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X',
      answer: longAnswer,
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: data pasar X kuartal ini naik 12 persen menurut tiga sumber analis'
        ),
        exec(
          'browser-search',
          '[SEARCH-ERROR] router: 401 Unauthorized — perbaiki akses search sebelum menyimpulkan apapun'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(r.criteria.find((c) => c.id === 'sources-found').label).toContain('senjata riset rusak (router)')
    expect(r.criteria.find((c) => c.id === 'sources-found').label).toContain(
      'JANGAN simpulkan info tidak ada'
    )
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research genuine [NO-RESULTS] keeps current behavior: unresolved, no error label', () => {
    const longAnswer =
      'Laporan riset komprehensif mengenai topik yang diminta dengan analisis mendalam, ' +
      'perbandingan beberapa sudut pandang, dan kesimpulan yang panjang lebar melebihi batas.'
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X',
      answer: longAnswer,
      tools: [
        exec('browser-search', '[NO-RESULTS] Tidak ditemukan hasil pencarian web langsung untuk "topik X".')
      ]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(r.criteria.find((c) => c.id === 'sources-found').label).toBe(
      'Sumber ditemukan dan dibaca'
    )
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('RI-11 repro: write-file only, no search/fetch => not verified', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X',
      answer:
        'Jawaban panjang yang mengklaim hasil riset lengkap dengan banyak detail melebihi lima puluh karakter.',
      tools: [exec('write-file', 'laporan tersimpan')]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research artifact: write-only with file requested => unresolved, not verified', () => {
    const longAnswer =
      'Laporan riset komprehensif mengenai topik yang diminta dengan analisis mendalam ' +
      'dan kesimpulan yang panjang lebar melebihi batas minimum karakter.'
    const writeOnly = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X, simpan laporan.md',
      answer: longAnswer,
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: data pasar X kuartal ini naik 12 persen menurut tiga sumber analis'
        ),
        exec('write-file', 'laporan tersimpan')
      ]
    })
    expect(writeOnly.criteria.find((c) => c.id === 'artifact-exists').state).toBe('unresolved')
    expect(writeOnly.state).not.toBe(VERIFICATION_STATE.VERIFIED)

    const withReadBack = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X, simpan laporan.md',
      answer: longAnswer,
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: data pasar X kuartal ini naik 12 persen menurut tiga sumber analis'
        ),
        exec('write-file', 'laporan tersimpan'),
        exec('read-file', 'isi laporan hasil riset yang cukup panjang untuk dibaca kembali')
      ]
    })
    expect(withReadBack.criteria.find((c) => c.id === 'artifact-exists').state).toBe('pass')
    expect(withReadBack.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: wait_subagents alone is not fetch proof', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset topik X',
      answer:
        'Jawaban panjang yang mengklaim hasil riset lengkap dengan banyak detail melebihi lima puluh karakter.',
      tools: [exec('wait_subagents', 'sub-agent selesai dengan ringkasan temuan yang panjang')]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: sub-agent report via send_message counts as valid substantive sources', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset standar agen otonom',
      answer:
        'Laporan analisis arsitektur agen otonom menunjukkan kepatuhan terhadap isolasi sandbox dan protokol pesan.',
      tools: [
        exec(
          'send_message',
          '[BALASAN EVALUASI DARI SUB-AGENT (sub_123)]: Hasil Audit Arsitektur Abelink: Struktur repositori lokal berpusat pada evaluasi sandbox dan log harness harian.'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('pass')
    expect(r.criteria.find((c) => c.id === 'facts-present').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: local codebase research with read-file counts as valid source for repo objectives', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset arsitektur di repo lokal abelink',
      answer:
        'Hasil riset arsitektur repo lokal abelink menunjukkan engine sidecar dan tauri shell terhubung via stdio bridge.',
      tools: [
        exec(
          'read-file',
          'export const engineBridge = { stdio: true, bufferSize: 1024, channels: ["ai", "browser", "os"] }'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('pass')
    expect(r.criteria.find((c) => c.id === 'facts-present').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: topik mengandung kata "laporan keuangan" tanpa intent simpan TIDAK menuntut artifact', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset laporan keuangan Q3 Apple',
      answer: 'Pendapatan Apple pada kuartal 3 mencapai 85 miliar dolar menurut rilis keuangan resmi.',
      tools: [exec('browser-search', 'Apple Q3 revenue hits 85 billion dollars driven by Services segment')]
    })
    expect(r.criteria.some((c) => c.id === 'artifact-exists')).toBe(false)
    expect(r.criteria.find((c) => c.id === 'sources-found').state).toBe('pass')
    expect(r.criteria.find((c) => c.id === 'facts-present').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research: jawaban hanya permohonan maaf / pengakuan gagal >50 char TIDAK lolos facts-present', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset data pasar X',
      answer: 'Maaf, saya tidak dapat menemukan informasi yang relevan mengenai data pasar tersebut setelah mencari.',
      tools: [exec('browser-search', 'Data pasar X menunjukkan pertumbuhan positif sebesar 15 persen tahun ini')]
    })
    expect(r.criteria.find((c) => c.id === 'facts-present').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research claim-quoted: klaim bernama tanpa kutipan isi => unresolved, NOT verified', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset model AI terbaru dari Anthropic',
      answer: 'Muse 1.3 tersedia di Anthropic sebagai model terbaru yang dirilis resmi.',
      tools: [
        exec(
          'browser-navigate',
          'Navigated to https://docs.anthropic.com/claude/docs/overview-page-for-model-release'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'claim-quoted').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
    expect(buildReplanObservation(r)).toContain('Muse 1.3')
  })

  it('research claim-quoted: klaim dikutip dari browser-extract => verified', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset model AI terbaru dari Anthropic',
      answer: 'Muse 1.3 tersedia di Anthropic sebagai model terbaru yang dirilis resmi.',
      tools: [
        exec(
          'browser-navigate',
          'Navigated to https://docs.anthropic.com/claude/docs/overview-page-for-model-release'
        ),
        exec(
          'browser-extract',
          'Halaman dokumentasi Anthropic: Muse 1.3 adalah model terbaru dengan kemampuan reasoning yang ditingkatkan.'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'claim-quoted').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research claim-quoted: jawaban generik tanpa entitas => na, verified (no regression)', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset harga GPU',
      answer:
        'Harga GPU saat ini berkisar Rp 10-15 juta untuk kelas high-end menurut beberapa toko.',
      tools: [
        exec(
          'browser-search',
          'Hasil pencarian: RTX 4070 Rp 9,5 juta, RTX 4080 Rp 14,2 juta dari beberapa toko'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'claim-quoted').state).toBe('na')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research claim-quoted: sitasi [P-1: "kutipan"] cocok dengan teks observasi => verified', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset arsitektur Abelink',
      answer:
        'Sistem menggunakan model pool [P-1: "model pool multi-provider"] untuk redundansi.',
      tools: [
        exec(
          'read-file',
          'Arsitektur Abelink menggunakan model pool multi-provider dan Rust Tauri shell.'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'claim-quoted').state).toBe('pass')
    expect(r.state).toBe(VERIFICATION_STATE.VERIFIED)
  })

  it('research claim-quoted: sitasi [P-1: "kutipan palsu"] tidak cocok dengan teks observasi => unresolved', () => {
    const r = evaluateEvidence({
      kind: 'research',
      objectiveText: 'riset arsitektur Abelink',
      answer:
        'Sistem menggunakan fitur [P-1: "arsitektur monolitik electron 12"] secara default.',
      tools: [
        exec(
          'read-file',
          'Arsitektur Abelink menggunakan model pool multi-provider dan Rust Tauri shell.'
        )
      ]
    })
    expect(r.criteria.find((c) => c.id === 'claim-quoted').state).toBe('unresolved')
    expect(r.state).not.toBe(VERIFICATION_STATE.VERIFIED)
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
