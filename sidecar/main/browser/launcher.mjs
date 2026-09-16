// Browser auto-launch via OS — bukakan browser default user lewat fasilitas OS.
//
// Prinsip: Abelink TIDAK menebak-nebak binary browser di PATH. Cukup minta
// OS membukakan browser default (`xdg-open`, Linux-only sesuai target
// proyek). Extension Abelink auto-connect sendiri saat browser dibuka
// (tryAutoResume di background.js: onStartup + alarm keepalive), lalu
// sidecar menunggu handshake bounded di sini.
//
// Keamanan & privasi:
// - Aktif via config `browserAutoLaunch` (default AKTIF per kehendak owner:
//   agen harus otomatis; user mematikan via toggle Capabilities bila tidak
//   mau browsernya dibukakan). Tanpa itu, perilaku lama dipertahankan
//   (fail-fast + fallback).
// - Tidak mengunduh/menginstal apa pun; hanya membuka browser user.
// - Executor di-inject lewat `deps` agar bisa di-unit-test tanpa OS.

export const LAUNCH_WAIT_MS = 20000
export const LAUNCH_POLL_MS = 500

// Rem tab-storm: tanpa ini tiap tool gagal = satu xdg-open baru sampai OOM.
// Cooldown 60s + maks 3 peluncuran per jendela per sesi + single in-flight
// (peluncuran bersamaan digabung). Lewat batas -> reason eksplisit, caller
// memberi blocked jujur ("klik Connect di popup") alih-alih tab ke-N.
export const LAUNCH_COOLDOWN_MS = 60000
export const LAUNCH_MAX_PER_WINDOW = 3
// Budget global lintas sesi: tiap subagen punya sessionId sendiri sehingga
// budget per-sesi saja tidak menghentikan tab-storm (3N xdg-open/menit).
// Lewat batas global -> reason eksplisit tanpa memanggil xdg-open.
export const LAUNCH_GLOBAL_MAX_PER_WINDOW = 6
const launchState = new Map()
const globalLaunchAttempts = []
export const __resetLaunchThrottleForTest = () => {
  launchState.clear()
  globalLaunchAttempts.length = 0
}
const nowMs = (deps) => (typeof deps?.now === 'function' ? deps.now() : Date.now())

// Jalankan perintah OS dan kembalikan { ok, stdout, error }. Default memakai
// execFile Node; test meng-inject versi palsu.
export async function runOs(cmd, args, { execFile } = {}) {
  try {
    let ef = execFile
    if (typeof ef !== 'function') {
      const cp = await import('node:child_process')
      ef = cp.execFile
    }
    const out = await new Promise((resolve, reject) => {
      ef(cmd, args, { timeout: 15000 }, (err, stdout, stderr) =>
        err ? reject(err) : resolve(String(stdout || stderr || ''))
      )
    })
    return { ok: true, stdout: out.trim() }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// Bukakan URL (atau blank) di browser default OS. Best-effort, tidak throw.
export async function openInOsBrowser(url, deps = {}) {
  const target = String(url || 'about:blank').trim() || 'about:blank'
  const r = await runOs('xdg-open', [target], deps)
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'xdg-open gagal' }
}

// Tunggu sampai ada sesi connected (poll bounded).
// Transparansi 20s: onStatus dipanggil tiap ~5s agar user melihat progres
// ("Menunggu handshake extension (n/20s)…") alih-alih diam lalu gagal.
export async function waitForConnected(
  listSessions,
  { timeoutMs = LAUNCH_WAIT_MS, intervalMs = LAUNCH_POLL_MS, sessionId = 'default', sleep, onStatus } = {}
) {
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((r) => setTimeout(r, ms))
  const tell = typeof onStatus === 'function' ? onStatus : null
  const pick = (sessions = []) =>
    sessions.find((s) => s.id === sessionId && s.connected) ||
    sessions.find((s) => s.id === 'default' && s.connected) ||
    sessions.find((s) => s.connected) ||
    null
  const started = Date.now()
  const totalS = Math.max(1, Math.round(timeoutMs / 1000))
  let lastTick = -1
  for (;;) {
    let sessions = []
    try {
      sessions = (await listSessions()) || []
    } catch {
      sessions = []
    }
    const hit = pick(sessions)
    if (hit) return hit
    const elapsed = Date.now() - started
    if (elapsed >= timeoutMs) return null
    // Tick tiap ~5 detik (atau tiap poll bila timeout pendek di test).
    const tick = Math.floor(elapsed / 5000)
    if (tick !== lastTick && tell) {
      lastTick = tick
      try {
        tell(`Menunggu handshake extension (${Math.min(totalS, Math.round(elapsed / 1000))}/${totalS}s)… Buka browser bila belum terbuka, pastikan extension Abelink aktif.`)
      } catch {}
    }
    await wait(intervalMs)
  }
}

// Orkestrasi satu pintu: sesi connected ada -> pakai; tidak ada + autoLaunch
// aktif -> minta OS membukakan browser (URL bila ada), tunggu handshake
// extension bounded. Tidak pernah throw; gagal -> { ok:false, reason } dan
// caller memakai fallback lama (fetch polos / error eksplisit).
export async function ensureBrowserUp({
  url = null,
  sessionId = 'default',
  autoLaunch = false,
  listSessions,
  timeoutMs = LAUNCH_WAIT_MS,
  deps = {},
  onStatus = null
} = {}) {
  try {
    const now = await waitForConnected(listSessions, { timeoutMs: 0, sessionId, onStatus })
    if (now) return { ok: true, reused: true, session: now }
  } catch {
    /* lanjut ke peluncuran */
  }
  if (!autoLaunch) return { ok: false, reason: 'auto-launch-off' }
  if (typeof onStatus === 'function') {
    try { onStatus('Membuka browser default OS…') } catch {}
  }
  return throttledLaunch({ url, sessionId, listSessions, timeoutMs, deps, onStatus })
}

// Peluncuran ber-rem: gabung in-flight, batasi budget per jendela cooldown.
async function throttledLaunch({ url, sessionId, listSessions, timeoutMs, deps, onStatus = null }) {
  const t = nowMs(deps)
  let st = launchState.get(sessionId)
  if (!st) {
    st = { attempts: [], inflight: null }
    launchState.set(sessionId, st)
  }
  st.attempts = st.attempts.filter((ts) => t - ts < LAUNCH_COOLDOWN_MS)
  const freshGlobal = globalLaunchAttempts.filter((ts) => t - ts < LAUNCH_COOLDOWN_MS)
  globalLaunchAttempts.length = 0
  globalLaunchAttempts.push(...freshGlobal)
  if (st.inflight) return st.inflight
  if (st.attempts.length >= LAUNCH_MAX_PER_WINDOW) {
    return { ok: false, reason: 'launch-budget-exhausted' }
  }
  if (globalLaunchAttempts.length >= LAUNCH_GLOBAL_MAX_PER_WINDOW) {
    return { ok: false, reason: 'launch-budget-exhausted' }
  }
  st.attempts.push(t)
  globalLaunchAttempts.push(t)
  const p = (async () => {
    try {
      const opened = await openInOsBrowser(url, deps)
      if (!opened.ok) return { ok: false, reason: 'launch-failed', detail: opened.error }
      const session = await waitForConnected(listSessions, { timeoutMs, sessionId, onStatus })
      if (!session) return { ok: false, reason: 'no-handshake' }
      launchState.delete(sessionId) // sukses = budget reset
      return { ok: true, reused: false, session }
    } finally {
      const cur = launchState.get(sessionId)
      if (cur) cur.inflight = null
    }
  })()
  st.inflight = p
  return p
}
