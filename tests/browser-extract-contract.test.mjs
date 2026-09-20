import { describe, it, expect } from 'vitest'
import { resolveExtractQuery } from '../sidecar/main/tools/extract-query.mjs'

describe('resolveExtractQuery', () => {
  it('query kosong tanpa sesi/lastUrl = error eksplisit', () => {
    const r = resolveExtractQuery('', { hasSession: false, lastUrl: null })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/URL penuh atau sesi extension/)
  })
  it('query kosong + lastUrl = pakai lastUrl', () => {
    const r = resolveExtractQuery('', { hasSession: false, lastUrl: 'https://chatgpt.com' })
    expect(r).toMatchObject({ ok: true, url: 'https://chatgpt.com' })
  })
  it('query berisi URL = pakai URL itu', () => {
    const r = resolveExtractQuery('https://example.com/a', { hasSession: false, lastUrl: null })
    expect(r).toMatchObject({ ok: true, url: 'https://example.com/a' })
  })
  it('ada sesi = serahkan ke extension (url null)', () => {
    const r = resolveExtractQuery('', { hasSession: true, lastUrl: null })
    expect(r).toMatchObject({ ok: true, url: null, via: 'extension' })
  })
})
