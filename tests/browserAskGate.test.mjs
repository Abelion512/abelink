// Evidence gate browser-ask: tanpa bukti login wall = replan, bukan terminal.
import { describe, it, expect, vi } from 'vitest'
import { executeSingleTool, hasLoginWallEvidence } from '../src/hooks/agent/plan/toolDispatcher.js'

const baseCtx = (over = {}) => ({
  targetSetChatData: vi.fn(),
  currentSignal: null,
  config: {},
  requestApproval: null,
  requestUserInput: vi.fn(async () => ({ confirmed: true, comment: 'ok' })),
  targetPushProcess: vi.fn(),
  pluginProcessId: null,
  loopMessages: [],
  ...over
})

describe('hasLoginWallEvidence', () => {
  it('alasan menyebut login/captcha lolos', () => {
    expect(hasLoginWallEvidence('butuh login google', [])).toBe(true)
    expect(hasLoginWallEvidence('ada captcha cloudflare', [])).toBe(true)
  })

  it('observasi terakhir berindikator lolos', () => {
    expect(
      hasLoginWallEvidence('lanjutkan', [{ role: 'user', content: '[OBSERVATION] halaman login google' }])
    ).toBe(true)
  })

  it('tanpa bukti di mana pun = gagal', () => {
    expect(hasLoginWallEvidence('lanjutkan debat', [])).toBe(false)
    expect(
      hasLoginWallEvidence('lanjutkan', [{ role: 'user', content: '[OBSERVATION] artikel terbaca' }])
    ).toBe(false)
  })
})

describe('browser-ask-user gate', () => {
  it('ditolak tanpa bukti (loop lanjut, bukan terminal)', async () => {
    const ctx = baseCtx()
    const r = await executeSingleTool('browser-ask-user', 'lanjutkan debat', ctx)
    expect(r.rejected).toBe(false)
    expect(r.resultString).toMatch('DITOLAK-HUMAN-LOOP')
    expect(ctx.requestUserInput).not.toHaveBeenCalled()
  })

  it('lolos dengan bukti observasi -> minta input user', async () => {
    const ctx = baseCtx({
      loopMessages: [{ role: 'user', content: '[OBSERVATION] form login akun muncul, captcha' }]
    })
    const r = await executeSingleTool('browser-ask-user', 'login dulu', ctx)
    expect(ctx.requestUserInput).toHaveBeenCalled()
    expect(r.resultString).toMatch('LAPORAN USER')
  })

  it('ask-user non-browser tidak digerbang', async () => {
    const ctx = baseCtx()
    const r = await executeSingleTool('ask-user', 'apa warna favoritmu?', ctx)
    expect(ctx.requestUserInput).toHaveBeenCalled()
    expect(r.resultString).toMatch('LAPORAN USER')
  })
})

describe('os-control session flag', () => {
  it('tutup-buta bisa digerbang: default tertutup, terbuka setelah open sukses', async () => {
    const { markOsControlSession, isOsControlSessionOpen } = await import(
      '../src/hooks/agent/plan/toolDispatcher.js'
    )
    expect(isOsControlSessionOpen('flag-test-sesi')).toBe(false)
    markOsControlSession('flag-test-sesi', true)
    expect(isOsControlSessionOpen('flag-test-sesi')).toBe(true)
    markOsControlSession('flag-test-sesi', false)
    expect(isOsControlSessionOpen('flag-test-sesi')).toBe(false)
  })
})
