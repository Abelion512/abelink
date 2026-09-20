import { describe, it, expect } from 'vitest'
import { popupStatus } from '../extension/popup-status.mjs'

describe('popupStatus', () => {
  it('probe ok tapi loop mati = bukan tersambung', () => {
    expect(popupStatus({ running: false, lastError: null }).pill).not.toBe('tersambung')
  })
  it('loop jalan = tersambung', () => {
    expect(popupStatus({ running: true, lastError: null }).pill).toBe('tersambung')
  })
})
