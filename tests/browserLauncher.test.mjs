// Tests: browser auto-launch via OS (xdg-open) + tunggu handshake.
// Target: sidecar/main/browser/launcher.mjs.
// Kontrak: opt-in (default mati), bounded wait, tidak pernah throw —
// gagal -> reason eksplisit dan caller memakai fallback lama.

import { describe, it, expect, vi } from 'vitest'
import {
  openInOsBrowser,
  waitForConnected,
  ensureBrowserUp
} from '../sidecar/main/browser/launcher.mjs'

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
