// Tests: browser-read recovery proaktif (bukan lempar manual ke user).
// Target: tryExtensionReadDom di sidecar/main/tools/browserTools.mjs.
// Kontrak: tidak ada sesi connected -> auto-launch bounded lalu retry read;
// gagal -> null (caller memakai error machine-actionable). Tidak pernah throw.

import { describe, it, expect, vi } from 'vitest'
import {
  tryExtensionReadDomForTest,
  NO_EXTENSION_HINT,
  launchBlockMessage
} from '../sidecar/main/tools/browserTools.mjs'
import { setLastUrl, getLastUrl, dropSession } from '../sidecar/main/browser/bridge-core.mjs'

const session = (id = 'default', connected = true) => ({ id, connected })

describe('tryExtensionReadDom recovery', () => {
  it('sesi connected -> read langsung tanpa launch', async () => {
    const ensureExtensionUp = vi.fn()
    const dispatchCommand = vi.fn(async () => ({ ok: true, data: 'dom' }))
    const r = await tryExtensionReadDomForTest('default', {
      core: { listSessions: () => [session()], dispatchCommand },
      ensureExtensionUp,
      dispatchCommand
    })
    expect(r).toEqual({ ok: true, data: 'dom' })
    expect(ensureExtensionUp).not.toHaveBeenCalled()
    expect(dispatchCommand).toHaveBeenCalledWith('default', 'read-dom', { sessionId: 'default' })
  })

  it('tanpa sesi -> auto-launch lalu retry read, bukan null langsung', async () => {
    const ensureExtensionUp = vi.fn(async () => session('default'))
    const dispatchCommand = vi.fn(async () => ({ ok: true, data: 'dom' }))
    const r = await tryExtensionReadDomForTest('default', {
      core: { listSessions: () => [], dispatchCommand },
      ensureExtensionUp,
      dispatchCommand
    })
    expect(ensureExtensionUp).toHaveBeenCalledWith({ sessionId: 'default' })
    expect(r).toEqual({ ok: true, data: 'dom' })
  })

  it('launch gagal -> null agar caller memakai error machine-actionable', async () => {
    const r = await tryExtensionReadDomForTest('default', {
      core: { listSessions: () => [], dispatchCommand: vi.fn() },
      ensureExtensionUp: vi.fn(async () => null),
      dispatchCommand: vi.fn()
    })
    expect(r).toBeNull()
  })

  it('tab ditutup (read null) + lastUrl ada -> navigate sekali lalu read ulang', async () => {
    const calls = []
    const dispatchCommand = vi.fn(async (sid, type, payload) => {
      calls.push(type)
      if (type === 'read-dom') return calls.filter((c) => c === 'read-dom').length > 1 ? { ok: true, data: 'dom' } : null
      if (type === 'navigate') return { ok: true, data: '{}' }
      return null
    })
    const r = await tryExtensionReadDomForTest('default', {
      core: { listSessions: () => [session()], dispatchCommand },
      ensureExtensionUp: vi.fn(),
      dispatchCommand,
      getLastUrl: () => 'https://example.com/x'
    })
    expect(r).toEqual({ ok: true, data: 'dom' })
    expect(calls).toEqual(['read-dom', 'navigate', 'read-dom'])
    expect(dispatchCommand).toHaveBeenCalledWith('default', 'navigate', { url: 'https://example.com/x', sessionId: 'default' })
  })

  it('tab ditutup tanpa lastUrl -> null tanpa navigate', async () => {
    const dispatchCommand = vi.fn(async () => null)
    const r = await tryExtensionReadDomForTest('default', {
      core: { listSessions: () => [session()], dispatchCommand },
      ensureExtensionUp: vi.fn(),
      dispatchCommand,
      getLastUrl: () => null
    })
    expect(r).toBeNull()
    expect(dispatchCommand).toHaveBeenCalledTimes(1)
  })
})

describe('lastUrl per sesi (bridge-core)', () => {
  it('set/get roundtrip, default null, terisolasi per sesi', () => {
    expect(getLastUrl('recovery-test-a')).toBeNull()
    setLastUrl('recovery-test-a', 'https://example.com/a')
    setLastUrl('recovery-test-b', 'https://example.com/b')
    expect(getLastUrl('recovery-test-a')).toBe('https://example.com/a')
    expect(getLastUrl('recovery-test-b')).toBe('https://example.com/b')
    dropSession('recovery-test-a')
    dropSession('recovery-test-b')
    expect(getLastUrl('recovery-test-a')).toBeNull()
  })
})

describe('NO_EXTENSION_HINT', () => {
  it('menunjuk langkah model, bukan perintah manual ke user', () => {
    expect(NO_EXTENSION_HINT).toMatch('browser-navigate')
    expect(NO_EXTENSION_HINT).toMatch('blocked')
    expect(NO_EXTENSION_HINT).not.toMatch('Buka browser')
    expect(NO_EXTENSION_HINT).not.toMatch('Sambungkan extension')
  })
})

describe('launchBlockMessage (E3)', () => {
  it('budget habis -> suruh berhenti + arahkan ke popup, bukan mengulang', () => {
    const m = launchBlockMessage('launch-budget-exhausted')
    expect(m).toMatch('launch-budget-exhausted')
    expect(m).toMatch('BERHENTI')
    expect(m).toMatch('Connect')
  })
  it('alasan tak dikenal -> fallback hint no-handshake', () => {
    expect(launchBlockMessage('alasan-aneh')).toMatch('Connect')
    expect(launchBlockMessage()).toMatch('Connect')
  })
})
