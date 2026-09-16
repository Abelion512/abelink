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
  writeTokenFile,
  readTokenRecord,
  tokenPathFor,
} from '../sidecar/main/browser/bridge-core.mjs'
import {
  ensureNativeHost,
  NATIVE_HOST_NAME,
  NATIVE_HOST_NAME_DEV,
  EXTENSION_ID,
} from '../sidecar/main/browser/native-host.mjs'
import { startBrowserBridge, stopBrowserBridge } from '../sidecar/main/browser/server.mjs'
import { handlers } from '../sidecar/engine/registry.mjs'
import '../sidecar/engine/channels/browser.mjs'

const TEST_PORT = 49799
const S = 'e2e-http'
let savedPort
let savedPollTimeout

const base = () => `http://127.0.0.1:${BROWSER_BRIDGE.PORT}/abelink-bridge`
function rawGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: BROWSER_BRIDGE.PORT,
        path: '/abelink-bridge' + path,
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

describe('bridge — publish gate: path kanonik, isolasi flavor, pin ID', () => {
  it('tokenPathFor kanonik: prod <xdg>/abelink, dev <xdg>/abelink-dev (tanpa double-brand)', async () => {
    const e = {}
    const prod = tokenPathFor({ base: '/x/xdg/abelink', flavor: 'prod', env: e })
    const dev = tokenPathFor({ base: '/x/xdg/abelink-dev', flavor: 'dev', env: e })
    expect(prod.endsWith('abelink/browser-bridge-token')).toBe(true)
    expect(dev.endsWith('abelink-dev/browser-bridge-token')).toBe(true)
    expect(dev).not.toContain('abelink-dev/abelink')
    expect(prod).not.toBe(dev)
  })

  it('writeTokenFile prod lalu dev di tmp: file terpisah, isi tidak menimpa', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-gate-'))
    try {
      const prodBase = path.join(xdg, 'abelink')
      const devBase = path.join(xdg, 'abelink-dev')
      const wProd = writeTokenFile(prodBase, 'prod', {})
      const wDev = writeTokenFile(devBase, 'dev', {})
      expect(wProd.file).not.toBe(wDev.file)
      expect(readTokenRecord(prodBase, 'prod', {}).token).toBe(wProd.token)
      expect(readTokenRecord(devBase, 'dev', {}).token).toBe(wDev.token)
      expect(readTokenRecord(prodBase, 'prod', {}).token).not.toBe(wDev.token)
    } finally {
      fs.rmSync(xdg, { recursive: true, force: true })
      dropSession('default')
    }
  })

  it('ensureNativeHost prod lalu dev: dua manifest, dua host, origin pin ID', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const crypto = await import('node:crypto')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'abelink-gate-'))
    const configHome = path.join(tmp, 'config')
    fs.mkdirSync(path.join(configHome, 'google-chrome'), { recursive: true })
    try {
      const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
      const host = path.join(root, 'extension', 'native-host', 'abelink-bridge-host.mjs')
      const rProd = await ensureNativeHost({ configHome, dataHome: path.join(tmp, 'xdg', 'abelink'), sourceFile: { pathname: host } })
      const rDev = await ensureNativeHost({ configHome, dataHome: path.join(tmp, 'xdg', 'abelink-dev'), sourceFile: { pathname: host }, flavor: 'dev' })
      expect(rProd.ok).toBe(true)
      expect(rDev.ok).toBe(true)
      expect(fs.existsSync(rProd.host)).toBe(true)
      expect(fs.existsSync(rDev.host)).toBe(true)
      expect(rDev.host).not.toBe(rProd.host)
      const dir = path.join(configHome, 'google-chrome', 'NativeMessagingHosts')
      for (const name of [NATIVE_HOST_NAME, NATIVE_HOST_NAME_DEV]) {
        const body = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))
        expect(body.allowed_origins).toEqual([`chrome-extension://${EXTENSION_ID}/`])
      }
      // EXTENSION_ID = turunan sha256 key manifest (anti-drift).
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'))
      const der = Buffer.from(manifest.key, 'base64')
      const h = crypto.createHash('sha256').update(der).digest().subarray(0, 16)
      const id = [...h].map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15))).join('')
      expect(id).toBe(EXTENSION_ID)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('handshake token asing -> 401 (tidak bocor lintas sesi)', async () => {
    const s = ensureSession(S)
    const r = await get(`/handshake?session=${S}&token=${s.token}-asing`)
    expect(r.status).toBe(401)
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

describe('channel browser:reconnect — sweep + reuse/gagal jujur', () => {
  it('sesi connected ada -> reused tanpa membuka browser', async () => {
    const s = ensureSession('default')
    s.lastSeenAt = Date.now()
    const res = await handlers['browser:reconnect']([])
    expect(res.success).toBe(true)
    expect(res.data.ok).toBe(true)
    expect(res.data.reused).toBe(true)
  })

  it('sesi mati disapu -> auto-launch-off memberi reason jujur', async () => {
    dropSession('default')
    dropSession(S) // sesi e2e lain masih connected -> drop agar jalur gagal teruji
    ensureSession('recon-dead')
    getSession('recon-dead').lastSeenAt = Date.now() - BROWSER_BRIDGE.SESSION_TTL_MS - 1000
    setBrowserConfig({ autoLaunch: false })
    const res = await handlers['browser:reconnect']([])
    expect(res.success).toBe(true)
    expect(res.data.ok).toBe(false)
    expect(res.data.reason).toBe('auto-launch-off')
    expect(res.data.dropped).toContain('recon-dead')
    expect(getSession('recon-dead')).toBeNull()
    setBrowserConfig({ autoLaunch: true })
    dropSession('default')
  })
})

describe('channel browser:action — aksi tanpa abelinkId dan parse aman', () => {
  it('screenshot tanpa abelinkId lolos dispatch dan mengembalikan string base64 utuh', async () => {
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

  it('extract tanpa abelinkId lolos dispatch dan mengembalikan text polos', async () => {
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

  it('back dan forward tanpa abelinkId lolos dispatch', async () => {
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

