// B1: snapshot konten + wait-for + extract-tanpa-selector.
// Extension JS (background.js) butuh API chrome — dicover runbook manual.
// Di sini: channel allowlist (snapshot/wait-for tanpa abelinkId) + handler
// sidecar (browser-snapshot/wait-for terdaftar, extract jalan tanpa query).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { handlers } from '../sidecar/engine/registry.mjs'
import { browserTools } from '../sidecar/main/tools/browserTools.mjs'
import { setBrowserConfig } from '../sidecar/main/browser/bridge-core.mjs'
import '../sidecar/engine/channels/browser.mjs'

// Matikan auto-launch: tanpa extension, handler harus gagal-cepat jujur
// (tanpa buka browser sungguhan + tunggu 20 detik).
beforeAll(() => setBrowserConfig({ autoLaunch: false }))
afterAll(() => setBrowserConfig({ autoLaunch: true }))

describe('channel browser:action allowlist (B1)', () => {
  it('snapshot + wait-for tanpa abelinkId tidak ditolak di channel', async () => {
    // Tanpa sesi/token valid, run() gagal — tapi BUKAN karena abelinkId.
    // Buktikan: pesan error bukan "butuh abelinkId elemen".
    for (const action of ['snapshot', 'wait-for', 'extract']) {
      let msg = ''
      try {
        await handlers.get('browser:action')({ action, value: 'x' }, 'no-such-session-xyz')
      } catch (e) {
        msg = String(e?.message || e)
      }
      expect(msg).not.toMatch(/butuh abelinkId/i)
    }
  })
})

describe('handler sidecar snapshot/wait-for (B1)', () => {
  it('browser-snapshot terdaftar dan gagal jujur tanpa extension', async () => {
    const h = browserTools['browser-snapshot']
    expect(h).toBeTruthy()
    const r = await h.handler('', { sessionId: 'no-such-session-xyz' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/tidak tersambung|extension/i)
  })

  it('browser-wait-for butuh teks query', async () => {
    const h = browserTools['browser-wait-for']
    expect(h).toBeTruthy()
    const r = await h.handler('', { sessionId: 'no-such-session-xyz' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/teks/i)
  })

  it('browser-wait-for gagal jujur tanpa extension', async () => {
    const h = browserTools['browser-wait-for']
    const r = await h.handler('Soal No', { sessionId: 'no-such-session-xyz' })
    expect(r.success).toBe(false)
  })
})
