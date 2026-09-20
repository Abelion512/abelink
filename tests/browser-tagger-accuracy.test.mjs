import { describe, it, expect } from 'vitest'
// Helper murni yang diekstrak dari taggerFn: diberi daftar elemen semu,
// harus mengembalikan yang di dalam <main> lebih dulu, maks 200.
import { rankTaggerElements } from '../extension/tagger-rank.mjs'
describe('rankTaggerElements', () => {
  it('main-first, cap 200', () => {
    const els = [
      { text: 'nav-link', inMain: false },
      { text: 'isi artikel', inMain: true },
    ]
    expect(rankTaggerElements(els)[0].text).toBe('isi artikel')
  })
  it('cap 200 elemen', () => {
    const els = Array.from({ length: 250 }, (_, i) => ({ text: `el-${i}`, inMain: false }))
    expect(rankTaggerElements(els)).toHaveLength(200)
  })
  it('stabil untuk non-main (urutan dokumen dipertahankan)', () => {
    const els = [
      { text: 'a', inMain: false },
      { text: 'b', inMain: false },
      { text: 'c', inMain: true },
    ]
    const out = rankTaggerElements(els).map((e) => e.text)
    expect(out).toEqual(['c', 'a', 'b'])
  })
})
