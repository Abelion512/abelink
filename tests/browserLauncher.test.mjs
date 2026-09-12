// Tests: browser auto-launch via OS (xdg-open) + tunggu handshake.
// Target: sidecar/main/browser/launcher.mjs.
// Kontrak: opt-in (default mati), bounded wait, tidak pernah throw —
// gagal -> reason eksplisit dan caller memakai fallback lama.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  openInOsBrowser,
  waitForConnected,
  ensureBrowserUp,
  __resetLaunchThrottleForTest
} from '../sidecar/main/browser/launcher.mjs'

beforeEach(() => {
  __resetLaunchThrottleForTest()
})

const noSleep = () => Promise.resolve()
const connected = (id = 'default') => [{ id, connected: true, lastSeenAt: Date.now() }]

describe('openInOsBrowser', () => {
  it('memanggil xdg-open dengan URL', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(null, '', ''))
    const r = await openInOsBrowser('https://example.com', { execFile })
    expect(r.ok).toBe(true)
    expect(execFile).toHaveBeenCalledOnce()
    expect(execFile.mock.calls[0][0]).toBe('xdg-open')
    expect(execFile.mock.calls[0][1]).toEqual(['https://example.com'])
  })

  it('tanpa URL memakai about:blank', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(null, '', ''))
    await openInOsBrowser(null, { execFile })
    expect(execFile.mock.calls[0][1]).toEqual(['about:blank'])
  })

  it('xdg-open gagal -> launch gagal, bukan throw', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(new Error('command not found')))
    const r = await openInOsBrowser('https://example.com', { execFile })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})

describe('ensureBrowserUp', () => {
  it('sesi connected ada -> dipakai ulang tanpa membuka apa pun', async () => {
    const execFile = vi.fn()
    const r = await ensureBrowserUp({
      autoLaunch: true,
      listSessions: async () => connected(),
      deps: { execFile }
    })
    expect(r.ok).toBe(true)
    expect(r.reused).toBe(true)
    expect(execFile).not.toHaveBeenCalled()
  })

  it('autoLaunch mati -> alasan eksplisit, tidak membuka browser', async () => {
    const execFile = vi.fn()
    const r = await ensureBrowserUp({
      autoLaunch: false,
      listSessions: async () => [],
      deps: { execFile }
    })
    expect(r).toEqual({ ok: false, reason: 'auto-launch-off' })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('browser dibuka lalu handshake muncul -> ok', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(null, '', ''))
    let calls = 0
    const r = await ensureBrowserUp({
      url: 'https://example.com',
      autoLaunch: true,
      listSessions: async () => (++calls >= 2 ? connected() : []),
      timeoutMs: 5000,
      deps: { execFile }
    })
    expect(execFile).toHaveBeenCalledOnce()
    expect(r.ok).toBe(true)
    expect(r.reused).toBe(false)
  })

  it('handshake tak kunjung datang -> no-handshake (bounded)', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(null, '', ''))
    const r = await ensureBrowserUp({
      autoLaunch: true,
      listSessions: async () => [],
      timeoutMs: 30,
      deps: { execFile }
    })
    expect(r).toEqual({ ok: false, reason: 'no-handshake' })
  })

  it('listSessions melempar pun tidak throw', async () => {
    const r = await ensureBrowserUp({
      autoLaunch: true,
      listSessions: async () => {
        throw new Error('boom')
      },
      timeoutMs: 30,
      deps: { execFile: vi.fn((c, a, o, cb) => cb(null, '', '')) }
    })
    expect(r.ok).toBe(false)
  })

  it('gagal beruntun -> budget habis, stop buka tab (anti tab-storm)', async () => {
    const execFile = vi.fn((cmd, args, opts, cb) => cb(null, '', ''))
    const opts = {
      autoLaunch: true,
      sessionId: 'storm-test',
      listSessions: async () => [],
      timeoutMs: 20,
      deps: { execFile }
    }
    expect((await ensureBrowserUp(opts)).reason).toBe('no-handshake')
    expect((await ensureBrowserUp(opts)).reason).toBe('no-handshake')
    expect((await ensureBrowserUp(opts)).reason).toBe('no-handshake')
    // ke-4: tidak ada xdg-open lagi
    const before = execFile.mock.calls.length
    expect((await ensureBrowserUp(opts)).reason).toBe('launch-budget-exhausted')
    expect(execFile.mock.calls.length).toBe(before)
  })

  it('peluncuran bersamaan digabung (single in-flight)', async () => {
    let resolveExec
    const execFile = vi.fn(
      (cmd, args, opts, cb) =>
        new Promise((res) => {
          resolveExec = () => {
            cb(null, '', '')
            res()
          }
        })
    )
    const opts = {
      autoLaunch: true,
      sessionId: 'inflight-test',
      listSessions: async () => [],
      timeoutMs: 30,
      deps: { execFile }
    }
    const p1 = ensureBrowserUp(opts)
    const p2 = ensureBrowserUp(opts)
    // beri kesempatan microtask mencapai execFile sebelum resolve
    await new Promise((r) => setTimeout(r, 20))
    resolveExec()
    await Promise.all([p1, p2])
    expect(execFile).toHaveBeenCalledOnce()
  })
})

describe('waitForConnected', () => {
  it('memilih sesi target dulu, lalu default, lalu mana pun', async () => {
    const sessions = [
      { id: 'other', connected: true },
      { id: 'default', connected: true }
    ]
    expect((await waitForConnected(async () => sessions, { timeoutMs: 10 })).id).toBe('default')
    expect(
      (await waitForConnected(async () => [{ id: 'sub_1', connected: true }], { timeoutMs: 10, sessionId: 'sub_1' })).id
    ).toBe('sub_1')
    expect(await waitForConnected(async () => [], { timeoutMs: 10 })).toBeNull()
  })
})
