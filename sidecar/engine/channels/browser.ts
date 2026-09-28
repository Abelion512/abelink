// Channel: browser automation (Fase C3 Jalur A — ekstensi browser + bridge).
//
// Lima channel lama (`browser:navigate/read-dom/action/close/show`) kini
// benar-benar dieksekusi: perintah diantrekan ke ekstensi Abelink yang terpasang
// di Chrome/Chromium user lewat `main/browser/server.mjs` (long-poll HTTP
// lokal, token auth). Tanpa ekstensi -> error eksplisit berisi petunjuk
// pemasangan (fail-fast, bukan sukses palsu).
//
// Kontrak response TIDAK berubah dari era stub:
//   navigate  (url, sessionId)        -> { title, url, elements: [...] }
//   read-dom  (sessionId)             -> { title, url, elements: [...] }
//   action    ({abelinkId, action, value}, sessionId) -> hasil aksi / read-dom ulang
//   close     (sessionId | 'all')     -> pesan sukses
//   show      (sessionId)             -> tab difokuskan
// Argumen ke-2+ tetap spread oleh registry `on()` (payload array).
//
// W1-4 (js-to-ts-spec.md): rename + tipe. Kontrak bridge (long-poll, token,
// port 49712/49713) BEKU; fail-fast + hint pemasangan tidak berubah.

import { on, emit } from '../registry.ts'
import * as server from '../../main/browser/server.mjs'
import * as bridgeCore from '../../main/browser/bridge-core.mjs'
import { BROWSER_BRIDGE } from '../../main/browser/bridge-core.mjs'

// Modul bridge ber-JSDoc minimal: kontrak dipertahankan sebagai tipe lokal,
// pemakaian di file ini melalui namespace cast type-only (terhapus saat
// runtime — pemanggilan fungsi identik dengan asli).
type BridgeResult = { ok: boolean; data?: unknown; error?: string }
type BridgeCoreModule = {
  dispatchCommand: (sessionId: string, type: string, payload: unknown) => Promise<BridgeResult>
  dropSession: (id: string) => unknown
  ensureSession: (id: string) => boolean
  getSession: (id: string) => { id: string } | null
  getBrowserConfig: () => { autoCloseTabs?: boolean; autoLaunch?: boolean }
  listSessions: () => Array<{ id: string; connected?: boolean }>
  setLastUrl: (id: string, url: string) => void
  getLastUrl: (id: string) => string | undefined
  sweepSessions: () => number
}
type ServerModule = {
  startBrowserBridge: () => Promise<{ ok: boolean; error?: string }>
  bridgeReady: () => boolean
  stopBrowserBridge: () => void
}
const core = bridgeCore as unknown as BridgeCoreModule
const srv = server as unknown as ServerModule

// Petunjuk pemasangan dilumat ke SEMUA error channel agar pesan AI/user
// selalu berujung pada langkah yang bisa dikerjakan.
const SETUP_HINT = ' (Petunjuk pemasangan: extension/README.md di repo ini)'

async function ensureBridge(): Promise<boolean> {
  const r = await srv.startBrowserBridge()
  if (!r.ok) throw new Error(r.error + SETUP_HINT)
  return true
}

async function run(sessionId: string, type: string, payload: unknown): Promise<BridgeResult> {
  try {
    return await core.dispatchCommand(sessionId, type, payload)
  } catch (e) {
    throw new Error(String((e as Error)?.message || e) + SETUP_HINT)
  }
}

// -------------------------------------------------------------- read-dom
on('browser:read-dom', async (sessionId: unknown = 'default') => {
  await ensureBridge()
  core.ensureSession(sessionId as string)
  const res = await run(sessionId as string, 'read-dom', {})
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal membaca DOM.')
  return JSON.parse(res.data as string)
})

// -------------------------------------------------------------- navigate
on('browser:navigate', async (url: unknown, sessionId: unknown = 'default') => {
  await ensureBridge()
  core.ensureSession(sessionId as string)
  const target = String(url || '').trim()
  if (!target) throw new Error('URL navigasi kosong.')
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    throw new Error(`URL tidak valid: '${target}'. Sertakan skema (mis. https://...)`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Skema '${parsed.protocol}' tidak diizinkan (hanya http/https).`)
  }
  const res = await run(sessionId as string, 'navigate', { url: parsed.toString() })
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal navigasi.')
  core.setLastUrl(sessionId as string, parsed.toString())
  return JSON.parse(res.data as string)
})

// ---------------------------------------------------------------- action
// data: { abelinkId, action: click|type|scroll|press|select, value?, url? }
// Aksi destruktif (submit) tetap dibatasi di sisi tool AI (`browser-click`
// dst. di node-tools) lewat approval; channel ini level rendah.
on('browser:action', async (data: unknown, sessionId: unknown = 'default') => {
  await ensureBridge()
  core.ensureSession(sessionId as string)
  if (!data || typeof data !== 'object') throw new Error('Payload aksi browser tidak valid.')
  const { abelinkId, action, value, url } = data as { abelinkId?: string; action?: string; value?: unknown; url?: string }
  const NO_ABELINK_ID_ACTIONS = [
    'scroll',
    'press',
    'screenshot',
    'download',
    'extract',
    'snapshot',
    'wait-for',
    'script',
    'back',
    'forward',
    'reload',
    'go-back',
    'go-forward',
    'overlay-show',
    'overlay-hide'
  ]
  if (!abelinkId && !NO_ABELINK_ID_ACTIONS.includes(action as string)) {
    throw new Error('Aksi butuh abelinkId elemen (dari browser:read-dom).')
  }
  const res = await run(sessionId as string, 'act', { abelinkId, action, value, url })
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal mengeksekusi aksi.')
  if (typeof res.data === 'string') {
    try {
      return JSON.parse(res.data)
    } catch {
      return res.data
    }
  }
  return res.data
})

// ----------------------------------------------------------------- close
// Menutup sesi: tandai task selesai di extension (judul grup -> ✅, tutup
// tab grup bila config browserAutoCloseTabs aktif), lalu drop sesi sidecar.
// Bounded: tanpa extension yang terhubung tidak menunggu COMMAND_TIMEOUT
// penuh — penandaan grup tidak boleh menggagalkan penutupan sesi.
const TASK_DONE_WAIT_MS = 2000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function finishSessionTask(sessionId: string, status = 'done') {
  const { autoCloseTabs } = core.getBrowserConfig()
  try {
    await Promise.race([
      run(sessionId, 'task-done', { status, autoClose: !!autoCloseTabs }).catch(() => null),
      sleep(TASK_DONE_WAIT_MS),
    ])
  } catch {
    /* penutupan sesi tidak boleh gagal karena penandaan grup */
  }
}

on('browser:close', async (sessionId: unknown = 'default') => {
  await ensureBridge()
  if (sessionId === 'all') {
    for (const { id } of core.listSessions()) {
      await finishSessionTask(id)
      core.dropSession(id)
    }
    return 'Semua sesi browser ditutup.'
  }
  if (core.getSession(sessionId as string)) await finishSessionTask(sessionId as string)
  const had = core.ensureSession(sessionId as string) && core.dropSession(sessionId as string)
  return had
    ? `Sesi browser '${sessionId}' ditutup.`
    : `Sesi '${sessionId}' tidak dikenal (tidak ada yang ditutup).`
})

// ------------------------------------------------------------------ show
on('browser:show', async (sessionId: unknown = 'default') => {
  await ensureBridge()
  core.ensureSession(sessionId as string)
  const res = await run(sessionId as string, 'show', {})
  if (!res.ok) throw new Error(res.error || 'Ekstensi gagal memfokuskan tab.')
  return 'Tab difokuskan.'
})

// -------------------------------------------------- health (diagnostik UI)
on('browser:status', async () => {
  await ensureBridge()
  return {
    ready: srv.bridgeReady(),
    port: BROWSER_BRIDGE.PORT,
    sessions: core.listSessions()
  }
})

// --------------------------------------- reconnect (tombol UI Capabilities)
// Satu pintu manual: sweep sesi mati -> status segar -> bila belum ada sesi
// connected dan autoLaunch aktif, bukakan browser OS (bounded) lalu coba lagi.
// Tidak pernah throw; gagal -> { ok:false, reason } untuk ditampilkan jujur
// di UI (termasuk launch-budget-exhausted dari throttle launcher).
on('browser:reconnect', async () => {
  try {
    await ensureBridge()
    const dropped = core.sweepSessions()
    const pick = (arr: Array<{ id: string; connected?: boolean }> = []) =>
      arr.find((s) => s.id === 'default' && s.connected) ||
      arr.find((s) => s.connected) ||
      null
    const sessions = core.listSessions()
    const hit = pick(sessions)
    if (hit) return { ok: true, reused: true, session: hit.id, dropped }
    if (!core.getBrowserConfig()?.autoLaunch) {
      return { ok: false, reason: 'auto-launch-off', dropped }
    }
    // Launcher ber-JSDoc sempit (url/onStatus hanya null) — anotasi ulang via
    // interface lokal, cast type-only, runtime persis asli.
    type LauncherModule = {
      ensureBrowserUp: (opts: {
        url?: unknown
        sessionId?: string
        autoLaunch?: boolean
        listSessions?: unknown
        onStatus?: (m: unknown) => void
      }) => Promise<{ ok: boolean; reused?: boolean; session?: { id: string }; reason?: string }>
    }
    const launcher = (await import('../../main/browser/launcher.mjs')) as unknown as LauncherModule
    const r = await launcher.ensureBrowserUp({
      url: core.getLastUrl('default'),
      sessionId: 'default',
      autoLaunch: true,
      listSessions: core.listSessions,
      onStatus: (m: unknown) => { try { emit('browser:status', m) } catch {} }
    })
    if (r.ok) return { ok: true, reused: !!r.reused, session: r.session?.id || 'default', dropped }
    return { ok: false, reason: r.reason || 'no-handshake', dropped }
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message || String(e) }
  }
})

// Bersih-bersih saat proses mati (dipanggil engine.ts via export di sini).
export function shutdownBrowserChannels() {
  srv.stopBrowserBridge()
}

// Auto-start browser bridge saat sidecar engine hidup (di luar test environment):
// token siap dan native host terpasang di Chrome/Chromium tanpa menunggu AI dipanggil.
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  srv.startBrowserBridge().catch((e) => {
    console.warn('[BrowserBridge] auto-start failed:', (e as Error).message)
  })
}
