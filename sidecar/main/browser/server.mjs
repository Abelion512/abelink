// Abelink Browser Bridge — server HTTP lokal (Fase C3 Jalur A).
//
// Endpoint (semuanya di bawah /abelink-bridge/, bind 127.0.0.1 saja):
//   GET  /abelink-bridge/handshake?session=&token=  -> validasi token + info poll
//   GET  /abelink-bridge/poll?session=&token=       -> long-poll, 1 perintah atau null
//   POST /abelink-bridge/result?session=&token=     -> hasil eksekusi perintah
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
  getSessionGroups,
  getSession,
  tokenOk,
  tokenRejectReason,
  TOKEN_REJECT_STALE,
  flavorFromPort
} from './bridge-core.mjs'
import { EXTENSION_ID } from './native-host.mjs'
import { brandDir } from '../utils/dataHome.mjs'

const MAX_BODY = 1024 * 1024 // 1MB — hasil read-dom jauh di bawah ini (dipotong di core)

let server = null
let listening = false
let startError = null

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

function checkHost(req) {
  const host = req.headers.host || ''
  const hostname = host.split(':')[0].toLowerCase()
  return hostname === '127.0.0.1' || hostname === 'localhost'
}

function checkOrigin(req) {
  const origin = req.headers.origin || ''
  if (origin) {
    return origin === `chrome-extension://${EXTENSION_ID}`
  }
  // Tolak jika request browser ditandai cross-site oleh web page
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'none' && fetchSite !== 'same-origin') {
    return false
  }
  return true
}

async function route(req, res) {
  const url = new URL(req.url, `http://${BROWSER_BRIDGE.HOST}`)
  if (!url.pathname.startsWith('/abelink-bridge/')) {
    return json(res, 404, { error: 'Not found.' })
  }
  if (!checkHost(req)) {
    return json(res, 400, { error: 'Host header tidak valid (DNS rebinding protection).' })
  }
  if (!checkOrigin(req)) {
    return json(res, 403, { error: 'Origin tidak diizinkan.' })
  }

  const sessionId = url.searchParams.get('session') || 'default'
  const token = url.searchParams.get('token') || ''
  const endpoint = url.pathname.slice('/abelink-bridge/'.length)

  if (endpoint === 'handshake' && req.method === 'GET') {
    const r = handshake(sessionId, token)
    if (r.ok) return json(res, 200, r)
    // E2: bedakan sebab 401 agar popup/poll tahu aksi yang tepat
    // (ambil via helper vs tempel manual) — bukan "sambungkan ulang" generik.
    return json(res, 401, { ...r, reason: tokenRejectReason(sessionId, token) })
  }

  if (endpoint === 'poll' && req.method === 'GET') {
    try {
      const cmd = await takeNext(sessionId, token) // null = idle timeout
      return json(res, 200, { command: cmd })
    } catch (e) {
      return json(res, 401, { error: e.message, reason: tokenRejectReason(sessionId, token) })
    }
  }

  if (endpoint === 'group' && req.method === 'POST') {
    const s = getSession(sessionId)
    if (!tokenOk(s, token))
      return json(res, 401, { error: 'Token tidak cocok.', reason: tokenRejectReason(sessionId, token) })
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
    const s = getSession(sessionId)
    if (!tokenOk(s, token))
      return json(res, 401, { error: 'Token tidak cocok.', reason: tokenRejectReason(sessionId, token) })
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
          ? `Port bridge ${BROWSER_BRIDGE.PORT} sudah dipakai (instansi Abelink lain berjalan?).`
          : `Bridge gagal start: ${e.message}`
      listening = false
      resolve({ ok: false, error: startError })
    })
    server.listen(BROWSER_BRIDGE.PORT, BROWSER_BRIDGE.HOST, () => {
      listening = true
      const flavor = flavorFromPort(BROWSER_BRIDGE.PORT)
      try {
        const { file } = writeTokenFile(xdgDataDir(flavor), flavor)
        console.log(
          `[BrowserBridge] listening on ${BROWSER_BRIDGE.HOST}:${BROWSER_BRIDGE.PORT} (flavor: ${flavor}, token: ${file})`
        )
      } catch (e) {
        console.warn('[BrowserBridge] token file gagal ditulis:', e.message)
      }
      // Helper token tanpa copas (best-effort; tidak menggagalkan bridge).
      // Teruskan flavor dari port (49713=dev) agar hanya file flavor-nya ditulis.
      import('./native-host.mjs')
        .then((m) => m.ensureNativeHost({ flavor }))
        .then((r) => {
          if (r?.ok) console.log('[BrowserBridge] native host siap:', JSON.stringify(r.installed))
        })
        .catch((e) => console.warn('[BrowserBridge] native host dilewati:', e.message))
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

function xdgDataDir(flavor = flavorFromPort(BROWSER_BRIDGE.PORT)) {
  // Prod: brandDir() = resolveDataHome()+/abelink (canonical, sesuai PR #12).
  // Dev: ABELINK_DATA_HOME bila di-set; fallback XDG/home + abelink-dev.
  if (flavor !== 'dev') return brandDir()
  const over = (process.env.ABELINK_DATA_HOME || '').trim()
  if (over) return over
  const xdg = process.env.XDG_DATA_HOME || `${process.env.HOME}/.local/share`
  return `${xdg}/abelink-dev`
}
