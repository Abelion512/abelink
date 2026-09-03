// Channel: browser automation (Fase C3 Jalur A — ekstensi browser + bridge).
//
// Lima channel lama (`browser:navigate/read-dom/action/close/show`) kini
// benar-benar dieksekusi: perintah diantrekan ke ekstensi Mark yang terpasang
// di Chrome/Chromium user lewat `main/browser/server.mjs` (long-poll HTTP
// lokal, token auth). Tanpa ekstensi -> error eksplisit berisi petunjuk
// pemasangan (fail-fast, bukan sukses palsu).
//
// Kontrak response TIDAK berubah dari era stub:
//   navigate  (url, sessionId)        -> { title, url, elements: [...] }
//   read-dom  (sessionId)             -> { title, url, elements: [...] }
//   action    ({markId, action, value}, sessionId) -> hasil aksi / read-dom ulang
//   close     (sessionId | 'all')     -> pesan sukses
//   show      (sessionId)             -> tab difokuskan
// Argumen ke-2+ tetap spread oleh registry `on()` (payload array).

import { on } from '../registry.mjs'
import { startBrowserBridge, bridgeReady, stopBrowserBridge } from '../../main/browser/server.mjs'
import {
  dispatchCommand,
  dropSession,
  ensureSession,
  listSessions
} from '../../main/browser/bridge-core.mjs'
import { BROWSER_BRIDGE } from '../../main/browser/bridge-core.mjs'

// Petunjuk pemasangan dilumat ke SEMUA error channel agar pesan AI/user
// selalu berujung pada langkah yang bisa dikerjakan.
const SETUP_HINT = ' (Petunjuk pemasangan: extension/README.md di repo ini)'

async function ensureBridge() {
  const r = await startBrowserBridge()
  if (!r.ok) throw new Error(r.error + SETUP_HINT)
  return true
}

async function run(sessionId, type, payload) {
  try {
    return await dispatchCommand(sessionId, type, payload)
  } catch (e) {
    throw new Error(String(e?.message || e) + SETUP_HINT)
  }
}

// -------------------------------------------------------------- read-dom
on('browser:read-dom', async (sessionId = 'default') => {
  await ensureBridge()
  ensureSession(sessionId)
  const res = await run(sessionId, 'read-dom', {})
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal membaca DOM.')
  return JSON.parse(res.data)
})

// -------------------------------------------------------------- navigate
on('browser:navigate', async (url, sessionId = 'default') => {
  await ensureBridge()
  ensureSession(sessionId)
  const target = String(url || '').trim()
  if (!target) throw new Error('URL navigasi kosong.')
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    throw new Error(`URL tidak valid: '${target}'. Sertakan skema (mis. https://...)`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Skema '${parsed.protocol}' tidak diizinkan (hanya http/https).`)
  }
  const res = await run(sessionId, 'navigate', { url: parsed.toString() })
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal navigasi.')
  return JSON.parse(res.data)
})

// ---------------------------------------------------------------- action
// data: { markId, action: click|type|scroll|press|select, value?, url? }
// Aksi destruktif (submit) tetap dibatasi di sisi tool AI (`browser-click`
// dst. di node-tools) lewat approval; channel ini level rendah.
on('browser:action', async (data, sessionId = 'default') => {
  await ensureBridge()
  ensureSession(sessionId)
  if (!data || typeof data !== 'object') throw new Error('Payload aksi browser tidak valid.')
  const { markId, action, value, url } = data
  if (!markId && !['scroll', 'press'].includes(action)) {
    throw new Error('Aksi butuh markId elemen (dari browser:read-dom).')
  }
  const res = await run(sessionId, 'act', { markId, action, value, url })
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal mengeksekusi aksi.')
  return JSON.parse(res.data)
})

// ----------------------------------------------------------------- close
on('browser:close', async (sessionId = 'default') => {
  await ensureBridge()
  if (sessionId === 'all') {
    for (const { id } of listSessions()) dropSession(id)
    return 'Semua sesi browser ditutup.'
  }
  const had = ensureSession(sessionId) && dropSession(sessionId)
  return had
    ? `Sesi browser '${sessionId}' ditutup.`
    : `Sesi '${sessionId}' tidak dikenal (tidak ada yang ditutup).`
})

// ------------------------------------------------------------------ show
on('browser:show', async (sessionId = 'default') => {
  await ensureBridge()
  ensureSession(sessionId)
  const res = await run(sessionId, 'show', {})
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal memfokuskan tab.')
  return 'Tab difokuskan.'
})

// -------------------------------------------------- health (diagnostik UI)
on('browser:status', async () => {
  await ensureBridge()
  return {
    ready: bridgeReady(),
    port: BROWSER_BRIDGE.PORT,
    sessions: listSessions()
  }
})

// Bersih-bersih saat proses mati (dipanggil engine.mjs via export di sini).
export function shutdownBrowserChannels() {
  stopBrowserBridge()
}
