// e2e-browser-live.mjs — throwaway E2E driver (bukan test suite).
// Alur:
//  1. Spawn sidecar engine (child process, stdio JSON-RPC).
//  2. Launch Chrome headful + extension repo + CDP port.
//  3. Buka popup.html sebagai tab, klik pairing (token via native host).
//  4. browser:navigate + read-dom via sidecar RPC.
//  5. Screenshot tiap tahap via CDP Page.captureScreenshot.
// Jalankan: bun scripts/e2e-browser-live.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT = '/tmp/abelink-e2e'
const CDP = 9334
const PROFILE = '/tmp/abelink-ext-e2e'
fs.mkdirSync(OUT, { recursive: true })
fs.rmSync(PROFILE, { recursive: true, force: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- sidecar RPC ----------
const child = spawn('bun', [path.join(ROOT, 'sidecar', 'engine.mjs')], {
  cwd: ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
})
let reqId = 1
const pending = new Map()
let buf = ''
child.stdout.on('data', (chunk) => {
  buf += chunk.toString()
  let idx
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line || !line.startsWith('{')) continue
    try {
      const msg = JSON.parse(line)
      if (msg?.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        clearTimeout(p.timer)
        p.resolve(msg)
      }
    } catch {}
  }
})
child.stderr.on('data', (c) => {
  const s = c.toString()
  if (s.includes('BrowserBridge') || s.includes('engine:ready')) process.stderr.write('[sidecar] ' + s)
})
function rpc(action, payload, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = reqId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`RPC timeout ${action}`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ id, action, payload }) + '\n')
  })
}

// ---------- CDP ----------
async function cdpList() {
  const res = await fetch(`http://127.0.0.1:${CDP}/json/list`)
  return res.json()
}
function wsCall(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = Math.floor(Math.random() * 1e9)
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }))
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      ws.close()
      if (m.error) reject(new Error(JSON.stringify(m.error)))
      else resolve(m.result)
    }
    ws.onerror = reject
    setTimeout(() => reject(new Error('CDP timeout ' + method)), 30000)
  })
}
async function shot(wsUrl, name) {
  const r = await wsCall(wsUrl, 'Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'))
  console.log('shot:', name)
}

async function main() {
  // tunggu engine:ready
  await new Promise((resolve) => {
    const t = setInterval(async () => {
      try {
        const r = await rpc('browser:status', [])
        if (r?.success) {
          clearInterval(t)
          resolve()
        }
      } catch {}
    }, 1000)
    setTimeout(() => {
      clearInterval(t)
      resolve()
    }, 30000)
  })
  const st = await rpc('browser:status', [])
  console.log('bridge:', JSON.stringify(st?.data ?? st).slice(0, 200))

  console.log('launch brave (chromium, --load-extension diizinkan)...')
  const chrome = spawn(
    '/opt/brave.com/brave/brave',
    [
      `--user-data-dir=${PROFILE}`,
      `--load-extension=${ROOT}/extension`,
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${CDP}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true }
  )
  chrome.unref()
  let targets = []
  for (let i = 0; i < 30; i++) {
    try {
      targets = await cdpList()
      if (targets.length) break
    } catch {}
    await sleep(1000)
  }
  if (!targets.length) throw new Error('CDP tidak hidup')
  console.log('targets:', targets.map((t) => `${t.type} ${(t.url || '').slice(0, 70)}`))
  // Service worker MV3 bisa muncul belakangan: retry sampai 20 detik.
  let sw = null
  for (let i = 0; i < 20; i++) {
    const list = await cdpList()
    sw = list.find((t) => t.type === 'service_worker' && (t.url || '').includes('chrome-extension://'))
    if (sw) break
    await sleep(1000)
  }
  console.log('service worker:', sw ? sw.url.slice(0, 110) : 'TIDAK ADA')
  if (!sw) throw new Error('extension tidak ter-load')

  // buka popup sebagai tab
  const popupUrl = sw.url.replace(/\/background\.js.*$/, '/popup.html')
  const newRaw = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(popupUrl)}`, { method: 'PUT' })).text()
  let newTab
  try {
    newTab = JSON.parse(newRaw)
  } catch {
    throw new Error('CDP new-tab bukan JSON: ' + newRaw.slice(0, 120))
  }
  await sleep(2500)
  await shot(newTab.webSocketDebuggerUrl, '02-popup-open.png')
  const status = await wsCall(newTab.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `document.getElementById('status')?.textContent + ' || ' + document.getElementById('pill')?.textContent`,
  })
  console.log('popup status:', status?.result?.value)

  // klik pairing
  const clicked = await wsCall(newTab.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(async () => {
      const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
      const cands = ['Pakai', 'Connect to Abelink', 'Sambungkan'];
      for (const c of cands) {
        const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === c && !x.hidden);
        if (b) { b.click(); return 'clicked:' + c; }
      }
      return 'buttons:' + JSON.stringify(btns);
    })()`,
  })
  console.log('klik:', clicked?.result?.value)
  await sleep(5000)
  await shot(newTab.webSocketDebuggerUrl, '03-after-connect.png')

  // navigate + read-dom via sidecar
  console.log('navigate...')
  const nav = await rpc('browser:navigate', ['https://example.com', 'default'], 90000)
  console.log('nav ok:', nav?.success, '| title:', JSON.stringify(nav?.data)?.slice(0, 120))
  const rd = await rpc('browser:read-dom', ['default'], 90000)
  const elements = rd?.data?.elements?.length ?? rd?.data ? JSON.parse(typeof rd.data === 'string' ? rd.data : JSON.stringify(rd.data)).elements?.length : 0
  console.log('read-dom ok:', rd?.success, '| elements:', elements)

  // screenshot tab konten example.com via CDP
  const list2 = await cdpList()
  const page = list2.find((t) => t.type === 'page' && (t.url || '').includes('example.com'))
  if (page) await shot(page.webSocketDebuggerUrl, '04-example-com.png')
  else console.log('tab example.com tidak ketemu:', list2.map((t) => (t.url || '').slice(0, 60)))

  console.log('DONE. Lihat screenshot di', OUT)
  child.kill('SIGTERM')
  process.exit(0)
}

main().catch((e) => {
  console.error('E2E FAIL:', e.message)
  try {
    child.kill('SIGTERM')
  } catch {}
  process.exit(1)
})
