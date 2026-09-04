import { describe, it, expect } from 'vitest'
import { estimateEffort, resolveEffortLevel } from '../src/api/ai/effortEstimator'

// Estimator effort = kontrak transparansi: keputusan auto harus punya skor +
// alasan (bisa di-eval), dan pilihan eksplisit user TIDAK boleh ditimpa.

describe('estimateEffort', () => {
  it('sapaan sederhana = low tanpa sinyal', () => {
    const r = estimateEffort('halo bro apa kabar')
    expect(r.effort).toBe('low')
    expect(r.score).toBe(0)
  })

  it('spawn_subagent menaikkan skor ke high', () => {
    const r = estimateEffort(
      'spawn_subagent untuk riset kompetitor, lalu buatkan laporan analisis data'
    )
    expect(r.effort).toBe('high')
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('tugas menengah = medium', () => {
    const r = estimateEffort('buatkan game kecil di file html')
    expect(r.effort).toBe('medium')
  })

  it('prompt panjang menambah skor (maks +2)', () => {
    const long = 'tolong analisis data penjualan ini ' + 'x'.repeat(2400)
    const r = estimateEffort(long)
    expect(r.score).toBeGreaterThanOrEqual(2)
  })

  it('transparan selalu ada', () => {
    const r = estimateEffort('cari terbaru di internet soal harga market')
    expect(r.transparent).toContain('effort=')
  })
})

describe('resolveEffortLevel', () => {
  it('pilihan eksplisit user TIDAK ditimpa', () => {
    const r = resolveEffortLevel({ effortLevel: 'high' }, 'halo saja')
    expect(r.auto).toBe(false)
    expect(r.effort).toBe('high')
  })

  it('default tanpa config = low', () => {
    const r = resolveEffortLevel({}, 'halo')
    expect(r.effort).toBe('low')
  })

  it('auto menaikkan hanya untuk tugas kompleks', () => {
    const simple = resolveEffortLevel({ effortLevel: 'auto' }, 'halo bro')
    expect(simple.effort).toBe('low')
    expect(simple.auto).toBe(true)

    const complex = resolveEffortLevel(
      { effortLevel: 'auto' },
      'spawn_subagent untuk audit arsitektur dan migrasi kode menyeluruh'
    )
    expect(complex.effort).toBe('high')
    expect(complex.transparent).toContain('[auto]')
  })
})
