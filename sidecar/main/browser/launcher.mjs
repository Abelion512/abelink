// Browser auto-launch via OS — bukakan browser default user lewat fasilitas OS.
//
// Prinsip: Abelink TIDAK menebak-nebak binary browser di PATH. Cukup minta
// OS membukakan browser default (`xdg-open`, Linux-only sesuai target
// proyek). Extension Mark auto-connect sendiri saat browser dibuka
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
export async function waitForConnected(
  listSessions,
  { timeoutMs = LAUNCH_WAIT_MS, intervalMs = LAUNCH_POLL_MS, sessionId = 'default', sleep } = {}
) {
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((r) => setTimeout(r, ms))
  const pick = (sessions = []) =>
    sessions.find((s) => s.id === sessionId && s.connected) ||
    sessions.find((s) => s.id === 'default' && s.connected) ||
    sessions.find((s) => s.connected) ||
    null
  const started = Date.now()
  for (;;) {
    let sessions = []
    try {
      sessions = (await listSessions()) || []
    } catch {
      sessions = []
    }
    const hit = pick(sessions)
    if (hit) return hit
    if (Date.now() - started >= timeoutMs) return null
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
  deps = {}
} = {}) {
  try {
    const now = await waitForConnected(listSessions, { timeoutMs: 0, sessionId })
    if (now) return { ok: true, reused: true, session: now }
  } catch {
    /* lanjut ke peluncuran */
  }
  if (!autoLaunch) return { ok: false, reason: 'auto-launch-off' }
  const opened = await openInOsBrowser(url, deps)
  if (!opened.ok) return { ok: false, reason: 'launch-failed', detail: opened.error }
  const session = await waitForConnected(listSessions, { timeoutMs, sessionId })
  if (!session) return { ok: false, reason: 'no-handshake' }
  return { ok: true, reused: false, session }
}
