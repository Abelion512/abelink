import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { parseNavigateQuery } from '../sidecar/main/browser/nav-query.mjs'
import {
  ensureSession,
  dropSession,
  dispatchCommand,
  takeNext,
  resolveCommand,
  getLastUrl,
  getFocusedTab,
  BROWSER_BRIDGE
} from '../sidecar/main/browser/bridge-core.mjs'

describe('parseNavigateQuery', () => {
  it('default tidak adopt tab user', () => {
    expect(parseNavigateQuery('https://chatgpt.com')).toMatchObject({ url: 'https://chatgpt.com', adoptUserTab: false })
  })
  it('flag eksplisit mengizinkan', () => {
    expect(parseNavigateQuery('https://chatgpt.com||adoptUserTab').adoptUserTab).toBe(true)
  })
  it('flag tidak merusak ekstraksi URL', () => {
    expect(parseNavigateQuery('buka https://chatgpt.com||adoptUserTab').url).toBe('https://chatgpt.com')
  })
  it('query tanpa URL = url kosong', () => {
    expect(parseNavigateQuery('bukan url sama sekali')).toMatchObject({ url: '', adoptUserTab: false })
  })
})

describe('fokus-tab per sesi + tanpa drain lintas-sesi', () => {
  const A = 'tabid-sess-a'
  const B = 'tabid-sess-b'
  const T = (s) => ensureSession(s).token
  beforeEach(() => {
    dropSession(A)
    dropSession(B)
    dropSession('default')
    ensureSession(A)
    ensureSession(B)
    ensureSession('default')
  })
  afterAll(() => {
    dropSession(A)
    dropSession(B)
    dropSession('default')
  })

  it('navigate sukses merekam focusedTab + lastUrl sesi itu', async () => {
    const p = dispatchCommand(A, 'navigate', { url: 'https://example.com/a' })
    const cmd = await takeNext(A, T(A))
    const data = JSON.stringify({ title: 'A', url: 'https://example.com/a', _group: { tabId: 42, reused: false } })
    expect(resolveCommand(A, T(A), cmd.id, { ok: true, data }).ok).toBe(true)
    await expect(p).resolves.toMatchObject({ ok: true })
    expect(getLastUrl(A)).toBe('https://example.com/a')
    expect(getFocusedTab(A)).toMatchObject({ tabId: 42, url: 'https://example.com/a' })
    expect(getFocusedTab(B)).toBeNull()
  })

  it('takeNext sesi default TIDAK menguras antrean sesi lain', async () => {
    const orig = BROWSER_BRIDGE.POLL_TIMEOUT_MS
    BROWSER_BRIDGE.POLL_TIMEOUT_MS = 30
    try {
      const p = dispatchCommand(B, 'navigate', { url: 'https://example.com/sub' })
      const cmdDefault = await takeNext('default', T('default'))
      expect(cmdDefault).toBeNull()
      const cmdB = await takeNext(B, T(B))
      expect(cmdB.type).toBe('navigate')
      expect(cmdB.payload?.url).toBe('https://example.com/sub')
      resolveCommand(B, T(B), cmdB.id, { ok: true, data: 'ok' })
      await p
    } finally {
      BROWSER_BRIDGE.POLL_TIMEOUT_MS = orig
    }
  })
})
