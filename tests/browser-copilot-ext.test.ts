import { describe, it, expect } from 'vitest'
import { shouldOverlay } from '../extension/overlay-policy.mjs'
describe('shouldOverlay', () => {
  it('tidak pasang veil saat await-user', () => {
    expect(shouldOverlay({ awaitingUser: true, overlayStopped: false })).toBe(false)
  })
  it('pasang veil saat kerja normal', () => {
    expect(shouldOverlay({ awaitingUser: false, overlayStopped: false })).toBe(true)
  })
  it('tetap hormati overlayStopped', () => {
    expect(shouldOverlay({ awaitingUser: false, overlayStopped: true })).toBe(false)
    expect(shouldOverlay({ awaitingUser: true, overlayStopped: true })).toBe(false)
  })
})
