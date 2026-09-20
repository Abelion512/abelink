import { describe, it, expect } from 'vitest'
import { popupStatus } from '../extension/popup-status.mjs'
describe('popupStatus', () => {
  it('probe ok tapi loop mati = bukan tersambung', () => {
    expect(popupStatus({ running: false, lastError: null }).pill).not.toBe('tersambung')
  })
  it('loop jalan = tersambung', () => {
    expect(popupStatus({ running: true, lastError: null }).pill).toBe('tersambung')
  })
  it('loop mati + lastError = terputus dengan teks error', () => {
    const s = popupStatus({ running: false, lastError: 'Token ditolak (401)' })
    expect(s.pill).toBe('terputus')
    expect(s.text).toMatch(/Token ditolak/)
  })
  it('loop mati tanpa error = menunggu', () => {
    expect(popupStatus({ running: false, lastError: null }).pill).toBe('menunggu')
  })
})
