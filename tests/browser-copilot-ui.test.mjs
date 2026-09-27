import { describe, it, expect, vi } from 'vitest'
import { executeSingleTool } from '../src/hooks/agent/plan/toolDispatcher.js'
import {
  buildBrowserResume,
  isBrowserResumeRequest,
  BROWSER_RESUME_RE
} from '../src/hooks/agent/plan/browserResume.js'

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

describe('browser-ask unified modal path', () => {
  it('browser-ask tanpa bukti login wall = DITOLAK (sama seperti browser-ask-user)', async () => {
    const ctx = baseCtx()
    const r = await executeSingleTool('browser-ask', 'lanjutkan debat', ctx)
    expect(r.rejected).toBe(false)
    expect(r.resultString).toMatch('DITOLAK-HUMAN-LOOP')
    expect(ctx.requestUserInput).not.toHaveBeenCalled()
  })

  it('browser-ask dengan bukti -> modal -> [LAPORAN USER]', async () => {
    const ctx = baseCtx({
      loopMessages: [{ role: 'user', content: '[OBSERVATION] form login akun muncul' }]
    })
    const r = await executeSingleTool('browser-ask', 'login dulu', ctx)
    expect(ctx.requestUserInput).toHaveBeenCalled()
    expect(r.resultString).toMatch('LAPORAN USER')
  })

  it('modal dibatalkan user -> [DIBATALKAN]', async () => {
    const ctx = baseCtx({
      loopMessages: [{ role: 'user', content: '[OBSERVATION] captcha muncul' }],
      requestUserInput: vi.fn(async () => ({ confirmed: false, comment: '' }))
    })
    const r = await executeSingleTool('browser-ask', 'captcha', ctx)
    expect(r.resultString).toMatch('DIBATALKAN')
  })
})

describe('browser resume helpers', () => {
  it('isBrowserResumeRequest: "lanjutkan" = true', () => {
    expect(isBrowserResumeRequest('lanjutkan')).toBe(true)
    expect(isBrowserResumeRequest('tolong lanjutkan bro')).toBe(true)
    expect(isBrowserResumeRequest('berapa harga rtx?')).toBe(false)
  })

  it('buildBrowserResume: browser-read tab SAMA, bukan navigate', () => {
    const r = buildBrowserResume({ sessionId: 's1', tabId: 9, url: 'https://x.test', goal: 'baca' })
    expect(r.resumeAction).toMatchObject({ tool: 'browser-read' })
    expect(r.resumeAction.tool).not.toBe('browser-navigate')
    expect(r.resumeAction.query).not.toMatch(/^https?:\/\//)
    expect(r.observation).toMatch('[RESUME]')
  })

  it('BROWSER_RESUME_RE exported + stabil', () => {
    expect(BROWSER_RESUME_RE instanceof RegExp).toBe(true)
    expect('LANJUTKAN'.match(BROWSER_RESUME_RE)).toBeTruthy()
  })
})
