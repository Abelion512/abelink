// Tests: verifikasi teks anti-stale-ID pada browser-click.
// Target: parseClickTarget + elementTextMatches di
// sidecar/main/tools/browserTools.mjs (pure, tanpa browser sungguhan;
// actionFn di extension/background.js berjalan di konteks halaman sehingga
// logika pencocokannya di-mirror ke elementTextMatches agar unit-testable).
// Kontrak query: `akN` (jalur lama) atau `akN||teks-yang-diharapkan`.

import { describe, it, expect } from 'vitest'
import { parseClickTarget, elementTextMatches } from '../sidecar/main/tools/browserTools.mjs'

// Duck-type pengganti DOM Element (actionFn memakai innerText.slice(0,120),
// getAttribute('aria-label'), dan value).
const el = (over = {}) => ({
  innerText: '',
  getAttribute: () => null,
  value: '',
  ...over
})

describe('parseClickTarget', () => {
  it('tanpa || -> id utuh, expected kosong', () => {
    expect(parseClickTarget('ak3')).toEqual({ id: 'ak3', expected: '' })
  })

  it('dengan ||teks -> id + expected ter-trim', () => {
    expect(parseClickTarget('ak3|| Beli sekarang ')).toEqual({ id: 'ak3', expected: 'Beli sekarang' })
  })

  it('|| berikutnya bagian dari expected', () => {
    expect(parseClickTarget('ak1||a||b')).toEqual({ id: 'ak1', expected: 'a||b' })
  })

  it('akN||kosong -> expected kosong (jalur lama)', () => {
    expect(parseClickTarget('ak2||')).toEqual({ id: 'ak2', expected: '' })
  })
})

describe('elementTextMatches', () => {
  it('hit pada innerText', () => {
    expect(elementTextMatches(el({ innerText: 'Beli Sekarang' }), 'beli sekarang')).toBe(true)
  })

  it('miss -> false (pemicu error browser-read-ulang)', () => {
    expect(elementTextMatches(el({ innerText: 'Batal' }), 'beli')).toBe(false)
  })

  it('case-insensitive dua arah', () => {
    expect(elementTextMatches(el({ innerText: 'BELI' }), 'beli')).toBe(true)
    expect(elementTextMatches(el({ innerText: 'beli' }), 'BELI')).toBe(true)
  })

  it('fallback aria-label', () => {
    const e = el({ innerText: '', getAttribute: (n) => (n === 'aria-label' ? 'Tutup dialog' : null) })
    expect(elementTextMatches(e, 'tutup')).toBe(true)
  })

  it('fallback value (input/button)', () => {
    expect(elementTextMatches(el({ innerText: '', value: 'Kirim' }), 'kirim')).toBe(true)
  })

  it('expected kosong -> true (tanpa biaya, jalur lama)', () => {
    expect(elementTextMatches(el({ innerText: 'apapun' }), '')).toBe(true)
    expect(elementTextMatches(null, '')).toBe(true)
  })

  it('el null dengan expected -> false', () => {
    expect(elementTextMatches(null, 'x')).toBe(false)
  })
})
