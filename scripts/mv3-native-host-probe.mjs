// Probe terarah: apakah chrome.runtime.sendNativeMessage ke helper token
// bekerja di Chrome yang di-launch harness? Dipanggil dari konteks POPUP
// (halaman extension) — TIDAK attach debugger ke service worker.
//
// Menjawab misteri S3c (token basi tidak pulih padahal file token baru ada):
//   - helper OK   -> kegagalan S3c ada di logika loop/resume extension.
//   - helper GAGAL -> kegagalan S3c ada di reliability helper native host.
//
// Pemakaian: bun scripts/mv3-native-host-probe.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let WebSocket
try {
  WebSocket = require('ws')
} catch {
  WebSocket = globalThis.WebSocket
}

const CHROME = process.env.ABELINK_MV3_CHROME || '/usr/bin/google-chrome'
const EXT_ID = 'kdcfgmlamndkapaiakhlplckfhmjieml'
const DEBUG_PORT = 9222
const ROOT = path.resolve(import.meta.dirname, '..')
const EXT_DIR = path.join(ROOT, 'extension')
const REAL_DATA_HOME =
  process.env.ABELINK_DATA_HOME ||
  process.env.XDG_DATA_HOME ||
  path.join(os.homedir(), '.local/share')
const ART = path.join(REAL_DATA_HOME, 'abelink-mv3-measure')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return await res.json()
  } catch {
    return null
  }
}

function wsRpc(wsUrl) {
  let seq = 0
  const pending = new Map()
  const ws = new WebSocket(wsUrl)
  ws.on('error', () => {})
  const ready = new Promise((res, rej) => {
    ws.on('open', res)
    ws.on('error', rej)
  })
  ws.on('message', (raw) => {
    let m
    try {
      m = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      clearTimeout(p.to)
      pending.delete(m.id)
      if (m.error) p.reject(new Error(m.error.message))
      else p.resolve(m.result)
    }
  })
  return {
    ready,
    call(method, params = {}, timeoutMs = 15000) {
      const id = ++seq
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => {
          pending.delete(id)
          reject(new Error('rpc timeout ' + method))
        }, timeoutMs)
        pending.set(id, { resolve, reject, to })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    close() {
      try {
        ws.close()
      } catch {}
    }
  }
}

async function main() {
  // Jalankan Chrome harness (profil terpisah, tidak ganggu profil user).
  const userDataDir = path.join(ART, 'chrome-profile-probe')
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {}
  // Replikasi kondisi harness: manifest NMH di dalam profil + env token tmp.
  const nmhDir = path.join(userDataDir, 'NativeMessagingHosts')
  fs.mkdirSync(nmhDir, { recursive: true })
  for (const [cfgDir, file] of [
    [path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts'), 'id.abelink.bridge.json'],
    [path.join(os.homedir(), '.config/google-chrome/NativeMessagingHosts'), 'id.abelink.bridge.dev.json'],
    [path.join(os.homedir(), '.config/chromium/NativeMessagingHosts'), 'id.abelink.bridge.json'],
    [path.join(os.homedir(), '.config/chromium/NativeMessagingHosts'), 'id.abelink.bridge.dev.json']
  ]) {
    try {
      const src = path.join(cfgDir, file)
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(nmhDir, file))
    } catch {}
  }
  console.log('manifest NMH disalin ke profil:', fs.readdirSync(nmhDir).join(', '))
  const chrome = spawn(
    CHROME,
    [
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--window-size=800,600'
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, ABELINK_DATA_HOME: process.env.ABELINK_PROBE_DATA_HOME || process.env.ABELINK_DATA_HOME || '' }
    }
  )
  try {
    // Muat extension.
    let loaded = false
    for (let i = 0; i < 30 && !loaded; i++) {
      await sleep(1000)
      const ver = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      if (!ver || !ver.webSocketDebuggerUrl) continue
      try {
        const rpc = wsRpc(ver.webSocketDebuggerUrl)
        await rpc.ready
        const r = await rpc.call('Extensions.loadUnpacked', { path: EXT_DIR }, 20000)
        rpc.close()
        loaded = !!(r && r.id)
      } catch {}
    }
    if (!loaded) throw new Error('loadUnpacked gagal')
    console.log('extension dimuat')

    // Kirim probe dari popup: panggil sendNativeMessage ke KEDUA flavor host
    // dan laporkan hasil mentahnya.
    const list = (await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`)) || []
    const page = list.find((t) => t.type === 'page')
    if (!page) throw new Error('tidak ada page target')
    const rpc = wsRpc(page.webSocketDebuggerUrl)
    await rpc.ready
    await rpc.call('Page.enable')
    await rpc.call('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` })
    await sleep(1500)
    const expr = `(async () => {
      const out = {}
      for (const host of ['id.abelink.bridge', 'id.abelink.bridge.dev']) {
        try {
          const res = await chrome.runtime.sendNativeMessage(host, { type: 'get-token' })
          out[host] = { ok: !!res?.ok, hasToken: !!res?.token, tokenLen: res?.token ? String(res.token).length : 0, error: res?.error || null }
        } catch (e) {
          out[host] = { threw: true, message: String(e?.message || e) }
        }
      }
      return JSON.stringify(out)
    })()`
    const r = await rpc.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 20000)
    console.log('HASIL PROBE sendNativeMessage:', r && r.result && r.result.value)
    rpc.close()
  } finally {
    try {
      chrome.kill('SIGTERM')
    } catch {}
    await sleep(1000)
    try {
      const { execSync } = await import('node:child_process')
      execSync(`pkill -f "remote-debugging-port=${DEBUG_PORT}" || true`)
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
