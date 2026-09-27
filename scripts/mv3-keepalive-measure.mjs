// Pengukuran MV3 keepalive di Chrome nyata — bukan unit test, bukan hermetik.
//
// Pertanyaan yang dijawab (permintaan owner, 2026-09-26):
//   1. Berapa sering service worker extension suspensi (bridge hidup vs outage)?
//   2. Apakah jalur self-heal menutup celah suspensi tanpa intervensi user?
//      S3a: SW suspensi + token valid -> alarm bangunkan -> resume -> perintah tersaji?
//      S3b: SW suspensi + token BASI (sidecar restart/regen) -> pulih sendiri?
//
// Metodologi bebas-distorsi:
//   - Extension dimuat via CDP Extensions.loadUnpacked (Chrome 137+ menghapus
//     --load-extension; sumber: developer.chrome.com blog Juni 2025 +
//     chromedevtools.github.io Extensions domain). Flag
//     --enable-unsafe-extension-debugging diperlukan.
//   - Koneksi debugger TIDAK PERNAH menempel ke service worker (Runtime/
//     Debugger domain apa pun ke target SW). Attach CDP mem-pin SW hidup dan
//     memalsukan hasil. Observasi lifecycle = polling HTTP /json/list
//     (stateless, 4 Hz, debounce 1.2s).
//   - Bridge ASLI jalan di child process pada port kanonik dev 49713
//     (flavorFromPort menangani flavor; token file XDG sementara). Aktivitas
//     inbound extension diobservasi via delta lastSeenAt (admin /sessions).
//   - "Tangan user" = chrome.runtime.sendMessage({type:'start'}) dari popup
//     asli (dievaluasi via tab target, bukan SW target) — sekali di awal.
//   - Tidak ada flag yang mengubah kebijakan suspensi platform.
//
// Pemakaian:
//   bun scripts/mv3-keepalive-measure.mjs              # run penuh (~19 menit)
//   ABELINK_MV3_QUICK=1 bun scripts/mv3-keepalive-measure.mjs  # smoke (~6 menit)
// Output: laporan JSON di <data>/abelink-mv3-measure/mv3-keepalive-report.json

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
const QUICK = !!process.env.ABELINK_MV3_QUICK
// MODE=s3only: lewati S1/S2, langsung skenario inti "dispatch saat SW suspensi"
// (bridge off -> suspensi terkonfirmasi -> bridge on + drop session + dispatch ->
// alarm bangunkan SW -> resume -> perintah tersaji?). ~4-5 menit.
const MODE = process.env.ABELINK_MV3_MODE || 'full'
const BRIDGE_PORT = 49713 // port kanonik dev — jalur pairing/resume extension asli
const ADMIN_PORT = 49002
const DEBOUNCE_MS = 1200 // dua sweep /json/list berturut tanpa SW = suspend
const EXT_ID = 'kdcfgmlamndkapaiakhlplckfhmjieml'
const DEBUG_PORT = 9222
const ROOT = path.resolve(import.meta.dirname, '..')
const EXT_DIR = path.join(ROOT, 'extension')

// REAL_DATA_HOME diambil SEBELUM env dimutasi — untuk pemulihan manifest
// native host di akhir run (pola afterAll tests/browserAuditVerify).
const REAL_DATA_HOME =
  process.env.ABELINK_DATA_HOME ||
  process.env.XDG_DATA_HOME ||
  path.join(os.homedir(), '.local/share')
const ART = path.join(REAL_DATA_HOME, 'abelink-mv3-measure')
const TMP_XDG = path.join(ART, 'xdg')
const TOKEN_FILE = path.join(TMP_XDG, 'abelink-dev', 'browser-bridge-token')

const DUR = QUICK
  ? { s1a: 40_000, s1b: 40_000, s2: 60_000, suspWait: 45_000, s3a: 90_000, s3b: 60_000, s3bWatch: 45_000 }
  : { s1a: 210_000, s1b: 210_000, s2: 300_000, suspWait: 150_000, s3a: 180_000, s3b: 100_000, s3bWatch: 120_000 }

const now = () => Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let T0 = now()

// ------------------------------------------------------------------ log
const events = []
function ev(kind, detail = '') {
  const e = { ts: now(), t: +((now() - T0) / 1000).toFixed(2), kind, detail: String(detail || '') }
  events.push(e)
  if (events.length < 4000) console.log(`[${String(e.t).padStart(8)}s] ${kind}${detail ? ' — ' + detail : ''}`)
}

// --------------------------------------------------------------- timeline
let swUpAt = 0
let swAbsentSince = 0
let swSuspendCount = 0
let swWakeCount = 0
const suspendSpans = []
const inboundTs = [] // ts perubahan lastSeenAt sesi default (poll/handshake 200/result)
let lastSeenSeen = 0
let firstInboundAt = 0

function swSuspendedNow() {
  return swAbsentSince > 0 && now() - swAbsentSince >= DEBOUNCE_MS
}

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return await res.json()
  } catch {
    return null
  }
}

// --------------------------------------------------------- chrome launch
function launchChrome() {
  const userDataDir = path.join(ART, 'chrome-profile')
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {}
  // FAITHFUL HARNESS: Chrome mencari manifest native messaging host di
  // <user-data-dir>/NativeMessagingHosts (bukan path default ~/.config/...)
  // — bukti probe mv3-native-host-probe.mjs. Salin manifest asli agar helper
  // token terjangkau, dan arahkan ABELINK_DATA_HOME ke file token TMP agar
  // wrapper dev membaca token harness (bukan token dev prod user).
  const nmhDir = path.join(userDataDir, 'NativeMessagingHosts')
  fs.mkdirSync(nmhDir, { recursive: true })
  for (const [cfgDir, file] of [
    [path.join(os.homedir(), '.config/google-chrome'), 'id.abelink.bridge.json'],
    [path.join(os.homedir(), '.config/google-chrome'), 'id.abelink.bridge.dev.json'],
    [path.join(os.homedir(), '.config/chromium'), 'id.abelink.bridge.json'],
    [path.join(os.homedir(), '.config/chromium'), 'id.abelink.bridge.dev.json']
  ]) {
    try {
      const src = path.join(cfgDir, file)
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(nmhDir, file))
    } catch {}
  }
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-breakpad',
    '--disable-session-crashed-bubble',
    '--noerrdialogs',
    '--metrics-recording-off',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-features=Translate,MediaRouter',
    '--window-size=1280,800',
    '--window-position=40,40'
  ]
  const child = spawn(CHROME, args, {
    stdio: 'ignore',
    env: {
      ...process.env,
      // Wrapper dev membaca ABELINK_DATA_HOME lebih dulu (devTokenPy) ->
      // helper token di harness mengembalikan token TMP harness.
      ABELINK_DATA_HOME: path.join(TMP_XDG, 'abelink-dev')
    }
  })
  child.on('error', (e) => ev('CHROME_ERROR', e.message))
  return child
}

// CDP helper: satu koneksi WS, call berurut dengan id counter.
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

async function loadExtension() {
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    const ver = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
    if (!ver || !ver.webSocketDebuggerUrl) continue
    try {
      const rpc = wsRpc(ver.webSocketDebuggerUrl)
      await rpc.ready
      const r = await rpc.call('Extensions.loadUnpacked', { path: EXT_DIR }, 20000)
      rpc.close()
      if (r && r.id) {
        ev('EXTENSION_LOADED', `id ${r.id}`)
        return true
      }
    } catch (e) {
      if (i >= 29) ev('LOAD_FAIL', e.message)
    }
  }
  return false
}

// Kirim {type:'start'} dari konteks extension: navigasi tab ke popup.html
// asli lalu evaluate sendMessage. Tidak menyentuh SW target.
async function startLoopViaPopup(token) {
  const list = (await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`)) || []
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('tidak ada page target')
  const rpc = wsRpc(page.webSocketDebuggerUrl)
  await rpc.ready
  try {
    await rpc.call('Page.enable')
    await rpc.call('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` })
    await sleep(1500)
    const expr = `chrome.runtime.sendMessage({ type: 'start', token: ${JSON.stringify(token)}, session: 'default', port: ${BRIDGE_PORT} }).then(r => JSON.stringify(r)).catch(e => 'ERR:' + e.message)`
    const r = await rpc.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 20000)
    const val = r && r.result && r.result.value
    ev('START_MSG', String(val))
    return String(val || '').includes('"ok":true')
  } finally {
    rpc.close()
  }
}

// Post-mortem: baca status extension (running/lastError) via popup asli.
// Jalur messaging biasa — TIDAK attach debugger ke service worker.
async function probeStatus() {
  const list = (await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`)) || []
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('tidak ada page target')
  const rpc = wsRpc(page.webSocketDebuggerUrl)
  await rpc.ready
  try {
    await rpc.call('Page.enable')
    await rpc.call('Page.navigate', { url: `chrome-extension://${EXT_ID}/popup.html` })
    await sleep(1200)
    const expr = `chrome.runtime.sendMessage({ type: 'status' }).then(r => JSON.stringify(r)).catch(e => 'ERR:' + e.message)`
    const r = await rpc.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, 15000)
    const val = r && r.result && r.result.value
    try {
      return JSON.parse(val)
    } catch {
      return { raw: val }
    }
  } finally {
    rpc.close()
  }
}

// --------------------------------------------------------- timeline loop
async function watchLoop(isRunning) {
  while (isRunning()) {
    const [list, version, admin] = await Promise.all([
      getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`),
      getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`),
      getJson(`http://127.0.0.1:${ADMIN_PORT}/sessions`)
    ])
    // Aktivitas inbound (poll/handshake-200/result) = lastSeenAt naik.
    const def = (admin && admin.sessions || []).find((s) => s.id === 'default')
    if (def && def.lastSeenAt > lastSeenSeen) {
      lastSeenSeen = def.lastSeenAt
      if (!firstInboundAt) firstInboundAt = now()
      inboundTs.push(now())
    }
    if (!version) {
      if (!swAbsentSince) swAbsentSince = now()
      swUpAt = 0
      await sleep(250)
      continue
    }
    const sw = (list || []).find(
      (t) => t.type === 'service_worker' && String(t.url || '').startsWith(`chrome-extension://${EXT_ID}/`)
    )
    if (sw) {
      if (!swUpAt) {
        swUpAt = now()
        swWakeCount++
        ev('SW_WOKE', `wake #${swWakeCount}`)
        if (swAbsentSince) {
          suspendSpans.push({ from: swAbsentSince, to: now(), ms: now() - swAbsentSince })
          swAbsentSince = 0
        }
      }
    } else {
      if (swUpAt && !swAbsentSince) {
        swAbsentSince = now()
        swSuspendCount++
        ev('SW_SUSPECT_SUSPENDED', `#${swSuspendCount}`)
      }
      swUpAt = 0
    }
    await sleep(250)
  }
}

// ------------------------------------------------------------- reporting
function summarize(label, sinceTs) {
  const spans = suspendSpans.filter((s) => s.from >= sinceTs)
  const totalSuspend = spans.reduce((a, s) => a + s.ms, 0)
  const windowMs = now() - sinceTs
  const inb = inboundTs.filter((t) => t >= sinceTs)
  const gaps = []
  for (let i = 1; i < inb.length; i++) gaps.push(inb[i] - inb[i - 1])
  return {
    label,
    window_s: +(windowMs / 1000).toFixed(1),
    suspend_events: spans.length,
    suspend_total_s: +(totalSuspend / 1000).toFixed(1),
    suspend_pct: windowMs > 0 ? +((totalSuspend / windowMs) * 100).toFixed(1) : null,
    wake_events: spans.length,
    inbound_requests: inb.length,
    inbound_gap_avg_s: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000).toFixed(2) : null,
    inbound_gap_max_s: gaps.length ? +(Math.max(...gaps) / 1000).toFixed(2) : null
  }
}

const FINISH = { forwarder: null, child: null, code: 0 }

async function admin(method, p, body, timeoutMs = 15000) {
  const res = await fetch(`http://127.0.0.1:${ADMIN_PORT}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  })
  return res.json().catch(() => null)
}

// Tunggu SW terkonfirmasi suspensi (absen >= DEBOUNCE) maksimal waitMs.
async function waitSuspended(waitMs) {
  const deadline = now() + waitMs
  while (now() < deadline) {
    if (swSuspendedNow()) return true
    await sleep(500)
  }
  return false
}

// ------------------------------------------------------------- laporan
function writeReport(extra = {}) {
  const totalSuspend = suspendSpans.reduce((a, s) => a + s.ms, 0)
  const gapsAll = []
  for (let i = 1; i < inboundTs.length; i++) gapsAll.push(inboundTs[i] - inboundTs[i - 1])
  const report = {
    kind: 'abelink-mv3-keepalive-measurement',
    mode: MODE,
    date: new Date().toISOString(),
    chrome: CHROME,
    quick: QUICK,
    debounce_ms: DEBOUNCE_MS,
    bridge_port: BRIDGE_PORT,
    extension_id: EXT_ID,
    method:
      'CDP Extensions.loadUnpacked + /json/list sweep 4Hz (tanpa attach debugger ke SW); bridge asli port dev 49713 di child process; inbound = delta lastSeenAt',
    total: {
      window_s: +((now() - T0) / 1000).toFixed(1),
      suspend_events: swSuspendCount,
      wake_events: swWakeCount,
      suspend_total_s: +(totalSuspend / 1000).toFixed(1),
      inbound_requests: inboundTs.length,
      inbound_gap_avg_s: gapsAll.length ? +(gapsAll.reduce((a, b) => a + b, 0) / gapsAll.length / 1000).toFixed(2) : null,
      inbound_gap_max_s: gapsAll.length ? +(Math.max(...gapsAll) / 1000).toFixed(2) : null,
      ...extra
    },
    phases: [...arguments[1] || []],
    suspend_spans: suspendSpans.map((s) => ({
      from_s: +((s.from - T0) / 1000).toFixed(1),
      to_s: +((s.to - T0) / 1000).toFixed(1),
      ms: s.ms
    })),
    inbound_ts_s: inboundTs.map((t) => +((t - T0) / 1000).toFixed(2)),
    events
  }
  fs.writeFileSync(path.join(ART, 'mv3-keepalive-report.json'), JSON.stringify(report, null, 2))
  console.log('\n=== RINGKASAN ===')
  console.log(JSON.stringify(report.total, null, 2))
  console.log('artefak:', path.join(ART, 'mv3-keepalive-report.json'))
  return report
}

// =====================================================================
async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome tidak ditemukan:', CHROME)
    process.exit(1)
  }
  fs.mkdirSync(ART, { recursive: true })
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true })

  // Mutasi env HANYA untuk child (bridge) + Chrome (wrapper native host).
  process.env.XDG_DATA_HOME = TMP_XDG
  process.env.ABELINK_MV3_ADMIN_PORT = String(ADMIN_PORT)
  // Port bridge kanonik dev: bridge-core membaca env ini (default 49712).
  process.env.ABELINK_BRIDGE_PORT = String(BRIDGE_PORT)

  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'mv3-measure-bridge-child.mjs')], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  FINISH.child = child
  child.stdout.on('data', (d) => process.stdout.write('[child] ' + d))
  child.stderr.on('data', (d) => process.stdout.write('[child:err] ' + d))

  let adminUp = false
  for (let i = 0; i < 50 && !adminUp; i++) {
    await sleep(200)
    adminUp = (await getJson(`http://127.0.0.1:${ADMIN_PORT}/sessions`)) !== null
  }
  if (!adminUp) throw new Error('child admin tidak siap')

  // Bridge HIDUP sebelum S1 (bug run pertama: lupa start -> handshake unreachable).
  const up = await admin('POST', '/start-bridge')
  if (!up || up.ok !== true) throw new Error('bridge gagal start: ' + JSON.stringify(up))
  ev('BRIDGE_UP', `port ${BRIDGE_PORT} (dev)`)

  // Baca token dari file dev (ditulis startBrowserBridge via writeTokenFile).
  let token = ''
  for (let i = 0; i < 50 && !token; i++) {
    await sleep(200)
    try {
      const rec = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
      token = rec.token || ''
    } catch {}
  }
  if (!token) throw new Error('file token tidak muncul di ' + TOKEN_FILE)
  ev('TOKEN_FILE', path.relative(ART, TOKEN_FILE))

  const chrome = launchChrome()
  const loaded = await loadExtension()
  if (!loaded) throw new Error('loadUnpacked gagal')

  const running = { v: true }
  watchLoop(() => running.v)

  // ------------------------------------------- MODE s3only: skenario inti
  if (MODE === 's3only') {
    // S0 sanity: bridge hidup, loop poll jalan (inbound > 0).
    const startOk = await startLoopViaPopup(token)
    if (!startOk) ev('S0_START_WARN', 'start message tidak ok')
    const s0 = now()
    await sleep(30000)
    const m0 = summarize('S0-sanity-bridge-up', s0)
    if (!m0.inbound_requests) throw new Error('S0 gagal: loop tidak poll (inbound=0)')
    ev('S0_OK', `inbound ${m0.inbound_requests}, gap max ${m0.inbound_gap_max_s}s`)
    // Outage via HOLD: sink TCP menerima koneksi tapi tak menjawab -> poll
    // menggantung (kasus nyata: sleep/crash di tengah respons) -> tanpa
    // aktivitas event -> SW suspensi DI TENGAH POLL.
    await admin('POST', '/hold-bridge')
    // Verifikasi hold BENAR-BENAR aktif: koneksi ke bridge harus MENGGANTUNG
    // (bukan ditolak cepat). Jika ditolak/diijinkan cepat -> hold gagal.
    let holdVerified = false
    try {
      await fetch(`http://127.0.0.1:${BRIDGE_PORT}/abelink-bridge/handshake?session=x&token=y`, {
        signal: AbortSignal.timeout(3000)
      })
      ev('HOLD_WARN', 'koneksi dijawab cepat — hold TIDAK aktif')
    } catch (e) {
      holdVerified = e && e.name === 'TimeoutError'
      ev(holdVerified ? 'HOLD_VERIFIED' : 'HOLD_FAIL', e && e.name === 'TimeoutError' ? 'koneksi menggantung (benar)' : `gagal ${e?.name}: ${e?.message}`)
    }
    ev('OUTAGE_FOR_SUSPEND', 'bridge hold (poll menggantung), tunggu suspensi terkonfirmasi')
    const susp = await waitSuspended(150000)
    ev('PRE_DISPATCH', `${susp ? 'SW suspensi terkonfirmasi' : 'SW tidak suspensi (dispatch saat hidup)'} | holdVerified=${holdVerified}`)
    // Bridge on (nyata) + session drop + dispatch SAAT SW masih suspensi.
    // drop-session tanpa regen: ensureSession('default') re-seed token FILE
    // (kunci self-heal) -> token extension tetap valid.
    await admin('POST', '/start-bridge')
    await admin('POST', '/drop-session', { id: 'default' })
    const tS = now()
    const disp = await admin(
      'POST',
      '/dispatch',
      { session: 'default', type: 'read-dom', payload: { probe: 'suspended-wake' } },
      110000 // > COMMAND_TIMEOUT_MS (90s) agar admin fetch tidak keburu abort
    )
    const lat = now() - tS
    const served = !!(disp && disp.ok === true && disp.result)
    ev(served ? 'S3S_SERVED' : 'S3S_TIMEOUT', `latensi ${lat}ms — ${JSON.stringify(disp).slice(0, 200)}`)
    // Bila perintah pertama kedaluwarsa (kontrak 90s vs alarm 60s + suspensi
    // 30s), dispatch ulang SEKALI: sesi kini hidup, harus tersaji di poll
    // berikutnya (~<=26s) -> membuktikan pulih setelah siklus pertama.
    let disp2 = null
    let lat2 = null
    if (!served) {
      const t2 = now()
      disp2 = await admin('POST', '/dispatch', { session: 'default', type: 'read-dom', payload: { probe: 'suspended-wake-2' } }, 60000)
      lat2 = now() - t2
      const served2 = !!(disp2 && disp2.ok === true && disp2.result)
      ev(served2 ? 'S3S2_SERVED' : 'S3S2_TIMEOUT', `latensi ${lat2}ms — ${JSON.stringify(disp2).slice(0, 160)}`)
    }
    await sleep(4000)
    const mS = summarize('S3-suspended-wake', s0)
    mS.dispatched_while_suspended = susp
    mS.hold_verified = holdVerified
    mS.served = served
    mS.latency_ms = lat
    mS.dispatch_response = disp
    if (disp2) {
      mS.redispatch_served = !!(disp2.ok === true && disp2.result)
      mS.redispatch_latency_ms = lat2
    }
    console.log('S3s:', JSON.stringify(mS))
    // --------------------------------------------- S3c: token BASI + pulih?
    // Regen token file (token extension jadi basi) + drop + dispatch + tunggu.
    // Post-mortem: baca lastError extension via popup (status message) supaya
    // jalur kegagalan terbaca langsung, bukan ditebak.
    ev('S3C', 'regen token file + drop + dispatch (token extension BASI)')
    await admin('POST', '/drop-session', { id: 'default', regenToken: true })
    const tC = now()
    const dispC = await admin('POST', '/dispatch', { session: 'default', type: 'read-dom', payload: { probe: 's3c-stale' } }, 120000)
    const latC = now() - tC
    const servedC = !!(dispC && dispC.ok === true && dispC.result)
    ev(servedC ? 'S3C_SERVED' : 'S3C_TIMEOUT', `latensi ${latC}ms — ${JSON.stringify(dispC).slice(0, 160)}`)
    await sleep(20000) // beri waktu loop/resume mencoba pulih
    // Post-mortem status extension (jalur popup asli, bukan SW attach).
    let statusMsg = null
    try {
      statusMsg = await probeStatus()
      ev('S3C_STATUS', JSON.stringify(statusMsg).slice(0, 300))
    } catch (e) {
      ev('S3C_STATUS_FAIL', e.message)
    }
    // Cek pemulihan pasca S3c (inbound sukses baru).
    let recC = 0
    for (let i = 0; i < 24; i++) {
      const a = await getJson(`http://127.0.0.1:${ADMIN_PORT}/sessions`)
      const def = (a && a.sessions || []).find((s) => s.id === 'default')
      if (def && def.lastSeenAt > tC && now() - def.lastSeenAt < 3000) {
        recC = now() - tC
        break
      }
      await sleep(2500)
    }
    ev(recC ? 'S3C_RECOVERED' : 'S3C_NOT_RECOVERED', recC ? `pulih ${recC}ms` : 'tidak pulih tanpa intervensi')
    const mC = summarize('S3c-token-stale', tC)
    mC.served = servedC
    mC.latency_ms = latC
    mC.recovered_after_ms = recC || null
    mC.extension_status = statusMsg
    console.log('S3c:', JSON.stringify(mC))
    writeReport({ self_heal_suspended_wake: mS, self_heal_token_stale: mC }, [m0, mS, mC])
    running.v = false
    return
  }

  // ----------------------------------------------------- S1 steady-state
  const s1Start = now()
  ev('S1_START', 'steady-state: bridge hidup, loop poll aktif')
  const startOk = await startLoopViaPopup(token)
  if (!startOk) ev('S1_START_WARN', 'start message tidak ok (cek [child] log)')
  await sleep(DUR.s1a)
  const m1 = summarize('S1a-bridge-alive', s1Start)
  console.log('S1a:', JSON.stringify(m1))

  // ------------------------------------------------ S1b outage pendek
  ev('S1B_OUTAGE', `stop bridge ${DUR.s1b / 1000}s`)
  await admin('POST', '/stop-bridge')
  const s1bStart = now()
  await sleep(DUR.s1b)
  const m2 = summarize('S1b-bridge-down', s1bStart)
  console.log('S1b:', JSON.stringify(m2))

  // ------------------------------------------------ S2 outage panjang
  ev('S2_OUTAGE', `outage berlanjut ${DUR.s2 / 1000}s`)
  const s2Start = now()
  await sleep(DUR.s2)
  const m3 = summarize('S2-outage-continued', s2Start)
  console.log('S2:', JSON.stringify(m3))

  // ------------------------------------------------ S3a self-heal token valid
  ev('S3A', 'start bridge + drop session (token file TETAP) + tunggu SW suspensi')
  await admin('POST', '/start-bridge')
  await admin('POST', '/drop-session', { id: 'default' }) // tanpa regen: token file masih valid
  const suspendedA = await waitSuspended(DUR.suspWait)
  ev('S3A_PRE_DISPATCH', suspendedA ? 'SW suspensi terkonfirmasi' : 'SW tidak terkonfirmasi suspensi')
  const tA = now()
  const dispA = await admin(
    'POST',
    '/dispatch',
    { session: 'default', type: 'read-dom', payload: { probe: 's3a' } },
    Math.max(100000, DUR.s3a + 30000) // > COMMAND_TIMEOUT_MS (90s) agar admin fetch tidak keburu abort
  )
  const latA = now() - tA
  // "Tersaji" = dispatch resolve dengan objek hasil APAPUN (ok true/false
  // sama-sama bukti perintah sampai ke extension dan hasil dikirim balik).
  const servedA = !!(dispA && dispA.ok === true && dispA.result)
  ev(servedA ? 'S3A_SERVED' : 'S3A_TIMEOUT', `latensi ${latA}ms — ${JSON.stringify(dispA).slice(0, 200)}`)
  const mA = summarize('S3a-token-valid', tA - DUR.s3a)
  mA.dispatched_while_suspended = suspendedA
  mA.served = servedA
  mA.latency_ms = latA
  console.log('S3a:', JSON.stringify(mA))

  // ------------------------------------------------ S3b token basi + suspensi
  ev('S3B', 'drop session + regen token file (token extension BASI) + tunggu SW suspensi')
  await admin('POST', '/drop-session', { id: 'default', regenToken: true })
  const suspendedB = await waitSuspended(DUR.suspWait)
  ev('S3B_PRE_DISPATCH', suspendedB ? 'SW suspensi terkonfirmasi' : 'SW tidak terkonfirmasi suspensi')
  const tB = now()
  const dispB = await admin(
    'POST',
    '/dispatch',
    { session: 'default', type: 'read-dom', payload: { probe: 's3b' } },
    Math.max(100000, DUR.s3b + 30000)
  )
  const latB = now() - tB
  const servedB = !!(dispB && dispB.ok === true && dispB.result)
  ev(servedB ? 'S3B_SERVED' : 'S3B_TIMEOUT', `latensi ${latB}ms — ${JSON.stringify(dispB).slice(0, 200)}`)
  // Observasi pasca-timeout: apakah loop PERNAH pulih sendiri (inbound baru)?
  const watchDeadline = now() + DUR.s3bWatch
  let recoveredAt = 0
  while (now() < watchDeadline) {
    const a = await getJson(`http://127.0.0.1:${ADMIN_PORT}/sessions`)
    const def = (a && a.sessions || []).find((s) => s.id === 'default')
    // Inbound sukses pertama SETELAH dispatch = loop pulih (401 tak mengubah
    // lastSeenAt, jadi kenaikan di atas tB hanya terjadi bila poll 200).
    if (def && def.lastSeenAt > tB && now() - def.lastSeenAt < 3000) {
      recoveredAt = now()
      break
    }
    await sleep(500)
  }
  ev(recoveredAt ? 'S3B_RECOVERED' : 'S3B_NOT_RECOVERED', recoveredAt ? `pulih ${((recoveredAt - tB) / 1000).toFixed(1)}s setelah dispatch` : 'tidak pulih tanpa intervensi')
  const mB = summarize('S3b-token-stale', tB - DUR.s3b)
  mB.dispatched_while_suspended = suspendedB
  mB.served = servedB
  mB.latency_ms = latB
  mB.recovered_after_s = recoveredAt ? +((recoveredAt - tB) / 1000).toFixed(1) : null
  console.log('S3b:', JSON.stringify(mB))

  // ------------------------------------------------------------- final
  writeReport({ self_heal: { a_token_valid: mA, b_token_stale: mB } }, [m1, m2, m3, mA, mB])

  running.v = false
}

main()
  .catch((e) => {
    console.error('FATAL', e)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      if (!fs.existsSync(path.join(ART, 'mv3-keepalive-report.json'))) {
        fs.writeFileSync(
          path.join(ART, 'mv3-keepalive-report.json'),
          JSON.stringify({ kind: 'abelink-mv3-keepalive-measurement', incomplete: true, events }, null, 2)
        )
      }
    } catch {}
    try {
      const { execSync } = await import('node:child_process')
      try {
        execSync(`pkill -f "remote-debugging-port=${DEBUG_PORT}" || true`)
      } catch {}
      try {
        execSync(`pkill -f "mv3-measure-bridge-child" || true`)
      } catch {}
    } catch {}
    try {
      // Pemulihan manifest native host ke data home ASLI (env parent masih
      // menunjuk TMP_XDG — kirim eksplisit; pola afterAll browserAuditVerify).
      const { ensureNativeHost } = await import('../sidecar/main/browser/native-host.mjs')
      await ensureNativeHost({ dataHome: REAL_DATA_HOME, flavor: 'prod' })
      await ensureNativeHost({ dataHome: REAL_DATA_HOME, flavor: 'dev' })
      ev('NATIVE_HOST_RESTORED', 'manifest prod+dev menunjuk data home asli')
    } catch (e) {
      console.error('cleanup native host gagal:', e.message)
    }
    try {
      fs.rmSync(TMP_XDG, { recursive: true, force: true })
    } catch {}
    console.log('selesai.')
    process.exit(FINISH.code || process.exitCode || 0)
  })
