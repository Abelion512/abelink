// Child process untuk pengukuran MV3 (dipanggil scripts/mv3-keepalive-measure.mjs).
// Menjalankan server bridge ASLI (sidecar/main/browser/server.ts) di port
// internal, plus satu port admin kecil agar parent bisa:
//   - start/stop bridge (simulasi sidecar hidup/mati = outage nyata),
//   - drop session + regenerate token file (kasus terburuk token basi),
//   - dispatch perintah browser nyata dan mengukur latensi penyajian,
//   - membaca listSessions().
// Flavor dev (port 49713) dipakai agar jalur pairing/resume extension asli
// (KNOWN_PORTS + native host dev) ikut terukur — port kustom ditolak
// setPairing() dan akan mematahkan pengukuran jalur wake.
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import {
  writeTokenFile,
  tokenFilePath,
  dropSession,
  listSessions,
  getSession,
  dispatchCommand
} from '../sidecar/main/browser/bridge-core.ts'
import { startBrowserBridge, stopBrowserBridge } from '../sidecar/main/browser/server.ts'

const ADMIN_PORT = Number(process.env.ABELINK_MV3_ADMIN_PORT || 49002)
// Sink TCP untuk mode 'hold': accept koneksi tapi TIDAK PERNAH menjawab —
// mensimulasikan bridge setengah-terbuka (crash di tengah respons / sleep).
// Poll extension yang masuk menggantung tanpa resolusi -> tanpa aktivitas
// event -> timer idle MV3 tidak tereset -> SW suspensi DI TENGAH POLL.
let sinkServer = null
function closeSink() {
  return new Promise((resolve) => {
    if (!sinkServer) return resolve()
    try {
      sinkServer.close(() => resolve())
      sinkServer = null
    } catch {
      sinkServer = null
      resolve()
    }
  })
}

// Seed file token sesi 'default' flavor dev (identik dengan startBrowserBridge
// dev: xdgDataDir('dev') -> XDG/abelink-dev). writeTokenFile juga menyemai
// session 'default' di memori dengan token file.
writeTokenFile(process.env.XDG_DATA_HOME, 'dev', process.env)

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 1e6) {
        req.destroy()
        resolve('{}')
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || '{}'))
    req.on('error', () => resolve('{}'))
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  try {
    if (req.method === 'POST' && url.pathname === '/start-bridge') {
      await closeSink() // bebaskan port bila mode hold aktif
      const r = await startBrowserBridge()
      return json(res, 200, r)
    }
    if (req.method === 'POST' && url.pathname === '/stop-bridge') {
      await closeSink()
      stopBrowserBridge()
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/hold-bridge') {
      // Tutup server HTTP asli (stop accept), lalu buka sink yang menerima
      // koneksi dan diam. PENTING: server.close() async (drain long-poll
      // <=25s) -> port belum bebas seketika -> bind sink dengan RETRY sampai
      // sukses (bug run sebelumnya: EADDRINUSE senyap -> hold tak pernah aktif).
      stopBrowserBridge()
      await closeSink()
      const port = Number(process.env.ABELINK_BRIDGE_PORT || 49713)
      const bound = await new Promise((resolve) => {
        let tries = 0
        const tryListen = () => {
          tries++
          const s = net.createServer((sock) => {
            // Sengaja tidak menulis apa pun dan tidak menghancurkan socket.
            sock.on('error', () => {})
          })
          sinkServer = s
          s.once('error', (e) => {
            if (e && e.code === 'EADDRINUSE' && tries < 120) setTimeout(tryListen, 500)
            else resolve(false)
          })
          s.listen(port, '127.0.0.1', () => resolve(true))
        }
        tryListen()
      })
      if (!bound) return json(res, 500, { ok: false, error: 'sink gagal bind port bridge' })
      return json(res, 200, { ok: true, held: true })
    }
    if (req.method === 'POST' && url.pathname === '/drop-session') {
      const b = JSON.parse(await readBody(req))
      const ok = dropSession(b.id || 'default')
      if (b.regenToken) {
        // Regenerate file token: token yang dipegang extension jadi basi ->
        // poll/handshake berikutnya 401 -> jalur pemulihan nyata diuji.
        try {
          fs.unlinkSync(tokenFilePath(process.env.XDG_DATA_HOME, 'dev', process.env))
        } catch {}
        writeTokenFile(process.env.XDG_DATA_HOME, 'dev', process.env)
      }
      return json(res, 200, { ok })
    }
    if (req.method === 'GET' && url.pathname === '/sessions') {
      const pend = (getSession('default') || {}).pending
      return json(res, 200, { ok: true, sessions: listSessions(), pendingDefault: pend ? pend.length : 0 })
    }
    if (req.method === 'POST' && url.pathname === '/dispatch') {
      const b = JSON.parse(await readBody(req))
      const t0 = Date.now()
      try {
        // Resolve HANYA saat extension asli mengirim hasil (atau timeout jujur).
        const result = await dispatchCommand(b.session || 'default', b.type || 'read-dom', b.payload ?? {})
        return json(res, 200, { ok: true, result, latency_ms: Date.now() - t0 })
      } catch (e) {
        return json(res, 200, { ok: false, error: String(e?.message || e), latency_ms: Date.now() - t0 })
      }
    }
    return json(res, 404, { error: 'unknown' })
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) })
  }
})

server.listen(ADMIN_PORT, '127.0.0.1', () => {
  console.log(`[mv3-child] admin siap :${ADMIN_PORT}`)
})

process.on('SIGTERM', () => {
  try {
    stopBrowserBridge()
  } catch {}
  try {
    server.close()
  } catch {}
  process.exit(0)
})
process.on('SIGINT', () => process.exit(0))
