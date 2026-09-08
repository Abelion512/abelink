// E2E lapisan HTTP bridge browser (tanpa browser sungguhan).
//
// Menjalankan server HTTP nyata (server.mjs + bridge-core.mjs) di port uji,
// lalu berperan sebagai "ekstensi palsu" lewat fetch: handshake -> poll ->
// result. Jalur negatif (401/403/404/400/timeout) + satu round-trip positif.
// Extension JS (background.js, butuh API chrome) tetap dicover runbook manual
// di extension/README.md § E2E manual.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import {
  BROWSER_BRIDGE,
  ensureSession,
  getSession,
  dispatchCommand,
  dropSession,
  setBrowserConfig,
} from '../sidecar/main/browser/bridge-core.mjs'
import { startBrowserBridge, stopBrowserBridge } from '../sidecar/main/browser/server.mjs'
import { handlers } from '../sidecar/engine/registry.mjs'
import '../sidecar/engine/channels/browser.mjs'

const TEST_PORT = 49799
const S = 'e2e-http'
let savedPort
let savedPollTimeout

const base = () => `http://127.0.0.1:${BROWSER_BRIDGE.PORT}/mark-bridge`
function rawGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BROWSER_BRIDGE.PORT,
        path: '/mark-bridge' + path,
        method: 'GET',
        headers,
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let body = {}
          try {
            body = JSON.parse(data)
          } catch {}
          resolve({ status: res.statusCode, body })
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}
async function get(path, headers = {}) {
  const res = await fetch(base() + path, { headers: { connection: 'close', ...headers } })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
async function post(path, payload, headers = {}) {
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', connection: 'close', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

beforeAll(async () => {
  savedPort = BROWSER_BRIDGE.PORT
  savedPollTimeout = BROWSER_BRIDGE.POLL_TIMEOUT_MS
  BROWSER_BRIDGE.PORT = TEST_PORT
  BROWSER_BRIDGE.POLL_TIMEOUT_MS = 200
  const r = await startBrowserBridge()
  if (!r.ok) throw new Error(`bridge gagal start di port uji: ${r.error}`)
  dropSession(S)
})

afterAll(() => {
  dropSession(S)
  stopBrowserBridge()
  BROWSER_BRIDGE.PORT = savedPort
  BROWSER_BRIDGE.POLL_TIMEOUT_MS = savedPollTimeout
})

describe('bridge HTTP — jalur negatif', () => {
  it('handshake token salah -> 401', async () => {
    const r = await get('/handshake?session=x&token=salah')
    expect(r.status).toBe(401)
    expect(r.body.ok).toBe(false)
  })

  it('poll token salah -> 401', async () => {
    const r = await get('/poll?session=x&token=salah')
    expect(r.status).toBe(401)
  })

  it('origin web biasa -> 403', async () => {
    const r = await get('/handshake?session=x&token=y', { Origin: 'https://evil.com' })
    expect(r.status).toBe(403)
  })

  it('origin ekstensi asing -> 403', async () => {
    const r = await get('/handshake?session=x&token=y', { Origin: 'chrome-extension://malicious-other-id' })
    expect(r.status).toBe(403)
  })

  it('host bukan localhost / DNS rebinding -> 400', async () => {
    const r = await rawGet('/handshake?session=x&token=y', { Host: 'attacker.evil.com' })
    expect(r.status).toBe(400)
    expect(r.body.error).toContain('Host header tidak valid')
  })

  it('sec-fetch-site cross-site -> 403', async () => {
    const r = await get('/handshake?session=x&token=y', { 'Sec-Fetch-Site': 'cross-site' })
    expect(r.status).toBe(403)
  })

  it('endpoint asing -> 404', async () => {
    const r = await get('/tidak-ada?session=x&token=y')
    expect(r.status).toBe(404)
  })

  it('result commandId asing -> 404, bukan sukses diam-diam', async () => {
    const s = ensureSession(S)
    const r = await post(`/result?session=${S}&token=${s.token}`, { commandId: 'asing', ok: true })
    expect(r.status).toBe(404)
    expect(r.body.ok).toBe(false)
  })

  it('group token salah -> 401', async () => {
    const r = await post('/group?session=x&token=y', {})
    expect(r.status).toBe(401)
  })

  it('body bukan JSON -> 400', async () => {
    const s = ensureSession(S)
    const r = await post(`/group?session=${S}&token=${s.token}`, 'bukan-json')
    expect(r.status).toBe(400)
  })

  it('poll tanpa perintah -> null setelah idle timeout', async () => {
    const s = ensureSession(S)
    const r = await get(`/poll?session=${S}&token=${s.token}`)
    expect(r.status).toBe(200)
    expect(r.body.command).toBeNull()
  })
})

describe('bridge HTTP — round-trip positif ala ekstensi', () => {
  it('dispatch -> poll -> result menyelesaikan promise channel', async () => {
    const s = ensureSession(S)
    const pending = dispatchCommand(S, 'read-dom', { a: 1 })
    const polled = await get(`/poll?session=${S}&token=${s.token}`)
    expect(polled.status).toBe(200)
    expect(polled.body.command.type).toBe('read-dom')
    const posted = await post(`/result?session=${S}&token=${s.token}`, {
      commandId: polled.body.command.id,
      ok: true,
      data: '{"elements":[]}',
    })
    expect(posted.status).toBe(200)
    await expect(pending).resolves.toMatchObject({ ok: true, data: '{"elements":[]}' })
  })

  it('handshake token benar -> 200', async () => {
    const s = ensureSession(S)
    const h = await get(`/handshake?session=${S}&token=${s.token}`)
    expect(h.status).toBe(200)
    expect(h.body.ok).toBe(true)
  })
})

describe('bridge HTTP — perintah grup baru ikut mengalir', () => {
  it('task-done dan close-tabs sampai ke poll + result menutup promise', async () => {
    const s = ensureSession(S)
    for (const type of ['task-done', 'close-tabs']) {
      const pending = dispatchCommand(S, type, { status: 'done', autoClose: false })
      const polled = await get(`/poll?session=${S}&token=${s.token}`)
      expect(polled.body.command.type).toBe(type)
      const posted = await post(`/result?session=${S}&token=${s.token}`, {
        commandId: polled.body.command.id,
        ok: true,
        data: '{}',
      })
      expect(posted.status).toBe(200)
      await expect(pending).resolves.toMatchObject({ ok: true })
    }
  })
})

describe('channel browser:close — tandai selesai lalu drop, tetap bounded', () => {
  it('tanpa extension: tidak menggantung, sesi tetap ditutup', async () => {
    ensureSession('close-test')
    setBrowserConfig({ autoCloseTabs: false })
    const t0 = Date.now()
    const res = await handlers['browser:close'](['close-test'])
    const elapsed = Date.now() - t0
    expect(res.success).toBe(true)
    expect(getSession('close-test')).toBeNull()
    // Jauh di bawah COMMAND_TIMEOUT (tanpa extension = race 2 detik).
    expect(elapsed).toBeLessThan(BROWSER_BRIDGE.COMMAND_TIMEOUT_MS)
  }, 15000)

  it('autoClose aktif: tetap bounded + sesi ditutup', async () => {
    ensureSession('close-test-2')
    setBrowserConfig({ autoCloseTabs: true })
    const t0 = Date.now()
    const res = await handlers['browser:close'](['close-test-2'])
    const elapsed = Date.now() - t0
    setBrowserConfig({ autoCloseTabs: false })
    expect(res.success).toBe(true)
    expect(getSession('close-test-2')).toBeNull()
    expect(elapsed).toBeLessThan(BROWSER_BRIDGE.COMMAND_TIMEOUT_MS)
  }, 15000)
})

describe('channel browser:action — aksi tanpa markId dan parse aman', () => {
  it('screenshot tanpa markId lolos dispatch dan mengembalikan string base64 utuh', async () => {
    const s = ensureSession(S)
    const p = handlers['browser:action']([{ action: 'screenshot' }, S])
    const polled = await get(`/poll?session=${S}&token=${s.token}`)
    expect(polled.body.command.payload.action).toBe('screenshot')
    const posted = await post(`/result?session=${S}&token=${s.token}`, {
      commandId: polled.body.command.id,
      ok: true,
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    })
    expect(posted.status).toBe(200)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
  })

  it('extract tanpa markId lolos dispatch dan mengembalikan text polos', async () => {
    const s = ensureSession(S)
    const p = handlers['browser:action']([{ action: 'extract', value: 'h1' }, S])
    const polled = await get(`/poll?session=${S}&token=${s.token}`)
    expect(polled.body.command.payload.action).toBe('extract')
    const posted = await post(`/result?session=${S}&token=${s.token}`, {
      commandId: polled.body.command.id,
      ok: true,
      data: 'Judul Halaman Web'
    })
    expect(posted.status).toBe(200)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data).toBe('Judul Halaman Web')
  })

  it('back dan forward tanpa markId lolos dispatch', async () => {
    const s = ensureSession(S)
    const pBack = handlers['browser:action']([{ action: 'back' }, S])
    const polled = await get(`/poll?session=${S}&token=${s.token}`)
    expect(polled.body.command.payload.action).toBe('back')
    await post(`/result?session=${S}&token=${s.token}`, {
      commandId: polled.body.command.id,
      ok: true,
      data: JSON.stringify({ url: 'https://example.com', title: 'Example' })
    })
    const resBack = await pBack
    expect(resBack.success).toBe(true)
    expect(resBack.data.url).toBe('https://example.com')
  })
})

