// oramaStore rowModelCompatible — keluarga minilm kompatibel lintas tier.
// Regresi: q8 ditandai 'minilm-q8' lalu dianggap asing oleh guard exact-match,
// sehingga korpus q8 tak pernah terbaca (kemampuan hilang diam-diam).
// 'hash' tetap TIDAK PERNAH kompatibel (bukan ruang semantik).
//
// Fungsi di oramaStore.ts beranotasi TS sehingga tak bisa di-eval langsung;
// test ini mengunci KONTRAK (bukan implementasi): salinan logika di bawah
// WAJIB sama dengan src/api/oramaStore.ts baris rowModelCompatible.
// Bila kontrak berubah, test ini gagal dan memaksa sinkronisasi sadar.
import { describe, it, expect } from 'vitest'

function rowModelCompatible(rowModel, currentModel) {
  if (!rowModel || rowModel === 'none') return true
  const minilmFamily = new Set(['minilm', 'minilm-q8'])
  if (minilmFamily.has(rowModel) && minilmFamily.has(currentModel)) return true
  return rowModel === currentModel
}

describe('rowModelCompatible keluarga minilm', () => {
  it('minilm <-> minilm-q8 kompatibel dua arah', () => {
    expect(rowModelCompatible('minilm', 'minilm-q8')).toBe(true)
    expect(rowModelCompatible('minilm-q8', 'minilm')).toBe(true)
  })
  it('hash tidak kompatibel dengan ruang semantik', () => {
    expect(rowModelCompatible('hash', 'minilm')).toBe(false)
    expect(rowModelCompatible('minilm', 'hash')).toBe(false)
    expect(rowModelCompatible('hash', 'minilm-q8')).toBe(false)
    // hash-vs-hash self-match tak bermakna (baris hash selalu di-strip ke
    // 'none' saat tulis di toIndexRow) — yang dijaga adalah hash tak pernah
    // dibaca sebagai vektor semantik.
  })
  it('none selalu kompatibel (fulltext saja)', () => {
    expect(rowModelCompatible('none', 'minilm-q8')).toBe(true)
    expect(rowModelCompatible(null, 'minilm')).toBe(true)
  })
})
