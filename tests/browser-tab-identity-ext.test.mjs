import { describe, it, expect } from 'vitest'
import { resolveSessionTab } from '../extension/tab-identity.mjs'

describe('resolveSessionTab', () => {
  it('tolak primer yang URL-nya berubah dari focusedUrl sesi', () => {
    const r = resolveSessionTab({
      tab: { id: 1, url: 'https://lain.example/' },
      focusedUrl: 'https://chatgpt.com/',
    })
    expect(r.use).toBe(false)
    expect(r.reason).toMatch(/berubah/)
  })
  it('terima primer http yang URL-nya cocok', () => {
    const r = resolveSessionTab({
      tab: { id: 1, url: 'https://chatgpt.com/' },
      focusedUrl: 'https://chatgpt.com/',
    })
    expect(r.use).toBe(true)
  })
  it('sesi baru tanpa focusedUrl tetap boleh pakai tab grupnya', () => {
    const r = resolveSessionTab({ tab: { id: 1, url: 'https://x.example/' }, focusedUrl: null })
    expect(r.use).toBe(true)
  })
  it('beda hash saja = masih halaman sama', () => {
    const r = resolveSessionTab({
      tab: { id: 1, url: 'https://chatgpt.com/#a' },
      focusedUrl: 'https://chatgpt.com/#b',
    })
    expect(r.use).toBe(true)
  })
  it('primer non-http ditolak', () => {
    const r = resolveSessionTab({ tab: { id: 1, url: 'chrome://newtab/' }, focusedUrl: null })
    expect(r.use).toBe(false)
  })
})
