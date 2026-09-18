// Auto-close browser hanya pada outcome 'completed'.
// failed/blocked/needs_user/self_terminated menyimpan tab untuk inspeksi
// (sejajar semantik extension: sesi error tidak pernah auto-close).
import { describe, it, expect } from 'vitest'
import { shouldAutoCloseBrowser } from '../src/hooks/agent/useAbelinkPlan.js'

describe('shouldAutoCloseBrowser', () => {
  it('completed -> true', () => {
    expect(shouldAutoCloseBrowser('completed')).toBe(true)
  })

  it('failed -> false', () => {
    expect(shouldAutoCloseBrowser('failed')).toBe(false)
  })

  it('blocked -> false', () => {
    expect(shouldAutoCloseBrowser('blocked')).toBe(false)
  })

  it('needs_user -> false', () => {
    expect(shouldAutoCloseBrowser('needs_user')).toBe(false)
  })

  it('self_terminated/undefined -> false', () => {
    expect(shouldAutoCloseBrowser('self_terminated')).toBe(false)
    expect(shouldAutoCloseBrowser(undefined)).toBe(false)
  })
})
