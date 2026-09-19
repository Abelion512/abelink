import { describe, it, expect, vi } from 'vitest'
import { waitWithTimeout } from '../src/hooks/agent/plan/waitHelper.js'

describe('waitWithTimeout', () => {
  it('check done seketika -> done', async () => {
    const r = await waitWithTimeout({
      timeoutMs: 1000,
      intervalMs: 10,
      check: async () => ({ done: true, value: 42 })
    })
    expect(r.status).toBe('done')
    expect(r.value).toBe(42)
    expect(r.checks).toBe(1)
  })

  it('tidak pernah done -> timeout dengan elapsed>=timeout', async () => {
    const r = await waitWithTimeout({
      timeoutMs: 50,
      intervalMs: 10,
      check: async () => ({ done: false })
    })
    expect(r.status).toBe('timeout')
    expect(r.elapsedMs).toBeGreaterThanOrEqual(50)
    expect(r.checks).toBeGreaterThan(1)
  })

  it('signal aborted -> aborted', async () => {
    const ctl = new AbortController()
    ctl.abort()
    const r = await waitWithTimeout({
      timeoutMs: 1000,
      intervalMs: 10,
      signal: ctl.signal,
      check: async () => ({ done: false })
    })
    expect(r.status).toBe('aborted')
    expect(r.checks).toBe(0)
  })

  it('check melempar -> tidak throw, akhirnya timeout, lastError tercatat', async () => {
    const err = new Error('boom')
    const r = await waitWithTimeout({
      timeoutMs: 50,
      intervalMs: 10,
      check: async () => {
        throw err
      }
    })
    expect(r.status).toBe('timeout')
    expect(r.lastError).toBe(err)
  })

  it('failed flag -> failed', async () => {
    const r = await waitWithTimeout({
      timeoutMs: 1000,
      intervalMs: 10,
      check: async () => ({ done: false, failed: true, value: 'x' })
    })
    expect(r.status).toBe('failed')
    expect(r.value).toBe('x')
  })

  it('onTick dipanggil tiap poll yang belum selesai', async () => {
    const onTick = vi.fn()
    let n = 0
    await waitWithTimeout({
      timeoutMs: 300,
      intervalMs: 20,
      onTick,
      check: async () => ({ done: ++n >= 3 })
    })
    expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
