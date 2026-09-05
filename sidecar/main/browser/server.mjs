// Mark Browser Bridge — server HTTP lokal (Fase C3 Jalur A).
//
// Endpoint (semuanya di bawah /mark-bridge/, bind 127.0.0.1 saja):
//   GET  /mark-bridge/handshake?session=&token=  -> validasi token + info poll
//   GET  /mark-bridge/poll?session=&token=       -> long-poll, 1 perintah atau null
//   POST /mark-bridge/result?session=&token=     -> hasil eksekusi perintah
//
// Semua logika antrean ada di bridge-core.mjs; file ini murni transport HTTP:
// verifikasi token, batas ukuran body, dan JSON-safe response. Tanpa token
// valid semuanya 401; origin selain chrome-extension://*/moz-extension://
// ditolak 403 (mencegah halaman web mana pun memanggil bridge lokal).

import http from 'http'
import {
  BROWSER_BRIDGE,
  handshake,
  takeNext,
  resolveCommand,
  writeTokenFile,
  groupSession,
  getSessionGroups
} from './bridge-core.mjs'

const MAX_BODY = 1024 * 1024 // 1MB — hasil read-dom jauh di bawah ini (dipotong di core)

let server = null
let listening = false
let startError = null

const ALLOWED_ORIGIN_PREFIXES = ['chrome-extension://', 'moz-extension://']

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Body terlalu besar.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function checkOrigin(req) {
  const origin = req.headers.origin || ''
  if (!origin) return true // service worker fetch tanpa Origin pada same-origin GET
  return ALLOWED_ORIGIN_PREFIXES.some((p) => origin.startsWith(p))
}

async function route(req, res) {
  const url = new URL(req.url, `http://${BROWSER_BRIDGE.HOST}`)
  if (!url.pathname.startsWith('/mark-bridge/')) {
    return json(res, 404, { error: 'Not found.' })
  }
  if (!checkOrigin(req)) {
    return json(res, 403, { error: 'Origin tidak diizinkan.' })
  }

  const sessionId = url.searchParams.get('session') || 'default'
  const token = url.searchParams.get('token') || ''
  const endpoint = url.pathname.slice('/mark-bridge/'.length)

  if (endpoint === 'handshake' && req.method === 'GET') {
    const r = handshake(sessionId, token)
    return r.ok ? json(res, 200, r) : json(res, 401, r)
  }

  if (endpoint === 'poll' && req.method === 'GET') {
    try {
      const cmd = await takeNext(sessionId, token) // null = idle timeout
      return json(res, 200, { command: cmd })
    } catch (e) {
      return json(res, 401, { error: e.message })
    }
  }

  if (endpoint === 'group' && req.method === 'POST') {
    let parsed
    try {
      parsed = JSON.parse(await readBody(req))
    } catch (e) {
      return json(res, 400, { error: `Body JSON tidak valid: ${e.message}` })
    }
    const r = groupSession(sessionId, parsed || {})
    return r.ok ? json(res, 200, r) : json(res, 400, r)
  }

  if (endpoint === 'groups' && req.method === 'GET') {
    const r = getSessionGroups(sessionId)
    return r.ok ? json(res, 200, r) : json(res, 404, r)
  }

  if (endpoint === 'result' && req.method === 'POST') {
    let parsed
    try {
      parsed = JSON.parse(await readBody(req))
    } catch (e) {
      return json(res, 400, { error: `Body JSON tidak valid: ${e.message}` })
    }
    const r = resolveCommand(sessionId, token, parsed?.commandId, {
      ok: !!parsed?.ok,
      data: parsed?.data ?? null,
      error: parsed?.error ?? null
    })
    return r.ok ? json(res, 200, r) : json(res, 404, r)
  }

  return json(res, 404, { error: 'Endpoint tidak dikenal.' })
}

// ------------------------------------------------------------- lifecycle
// Load-when-needed: server baru hidup saat channel browser:* pertama dipakai.
export function startBrowserBridge() {
  if (listening) return { ok: true, port: BROWSER_BRIDGE.PORT }
  if (startError) return { ok: false, error: startError }

  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      route(req, res).catch((e) => {
        try {
          json(res, 500, { error: e.message })
        } catch {
          /* header sudah terkirim — tidak ada lagi yang bisa dilakukan */
        }
      })
    })
    // Long-poll butuh timeout header longgar; request utuh dibatasi core.
    server.headersTimeout = BROWSER_BRIDGE.POLL_TIMEOUT_MS + 10000
    server.requestTimeout = 0 // dikelola per-endpoint (poll 25s, command 90s)
    server.once('error', (e) => {
      startError =
        e.code === 'EADDRINUSE'
          ? `Port bridge ${BROWSER_BRIDGE.PORT} sudah dipakai (instansi Mark lain berjalan?).`
          : `Bridge gagal start: ${e.message}`
      listening = false
      resolve({ ok: false, error: startError })
    })
    server.listen(BROWSER_BRIDGE.PORT, BROWSER_BRIDGE.HOST, () => {
      listening = true
      try {
        const { file } = writeTokenFile(xdgDataDir())
        console.log(
          `[BrowserBridge] listening on ${BROWSER_BRIDGE.HOST}:${BROWSER_BRIDGE.PORT} (token: ${file})`
        )
      } catch (e) {
        console.warn('[BrowserBridge] token file gagal ditulis:', e.message)
      }
      resolve({ ok: true, port: BROWSER_BRIDGE.PORT })
    })
  })
}

export function bridgeReady() {
  return listening
}
export function stopBrowserBridge() {
  if (!server) return
  try {
    server.close()
  } catch {
    /* server sudah tertutup */
  }
  listening = false
}

function xdgDataDir() {
  return process.env.XDG_DATA_HOME || `${process.env.HOME}/.local/share`
}
