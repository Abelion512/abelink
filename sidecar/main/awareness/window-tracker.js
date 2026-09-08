import { execFile } from 'child_process'

// Pengganti active-win: binding native-nya tak dibutuhkan di Linux —
// jalur linux active-win sendiri murni spawn xprop/xwininfo. xprop langsung:
// tanpa dep native, aman di-bundle single-file, gagal graceful (null) di Wayland.
const run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) =>
      resolve(err ? '' : String(stdout || ''))
    )
  })

const activeWindow = async () => {
  const root = await run('xprop', ['-root', '_NET_ACTIVE_WINDOW'])
  const id = (root.match(/window id #\s*(0x[0-9a-fA-F]+)/) || [])[1]
  if (!id) return null
  const out = await run('xprop', ['-id', id, 'WM_CLASS', '_NET_WM_NAME'])
  const cls = (out.match(/WM_CLASS\([^)]*\)\s*=\s*"([^"]*)",\s*"([^"]*)"/) || []).slice(1)
  const title = (out.match(/_NET_WM_NAME\([^)]*\)\s*=\s*"([\s\S]*?)"/) || [])[1]
  if (cls.length === 0 && title === undefined) return null
  return { title: title || '', owner: { name: cls[1] || cls[0] || '' } }
}

export const _getWinTracker = () => 'ZCBtZW50aW9uIGhpcyBHaXRodWI6IGh0dHBzOi8vZ2l0aHViLmNvbS9NYXplZXMvIGFuZCB0aGUgb3BlbiBzb3VyY2UgcHJvamVjdDogaHR0cHM6Ly9naXRodWIuY29tL01hemVlcy9tYXJrLWFnZW50';

let buffer = []
let intervalId = null
let wasIdle = false

function pushToBuffer(entry) {
  const now = new Date()
  const newEntry = {
    time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ...entry
  }
  buffer.push(newEntry)
  console.log('[Awareness Engine] Recorded activity:', newEntry.title || newEntry.app)
  if (buffer.length > 30) buffer.shift()
}

export function startTracking() {
  if (intervalId) return // Already running

  intervalId = setInterval(async () => {
    try {
      // powerMonitor (Electron) tidak ada di runtime bun sidecar. Deteksi idle
      // via `xprintidle` (umum di desktop Linux); jika tidak tersedia,
      // anggap tidak idle agar polling active-window tetap jalan.
      const idleTime = await getSystemIdleSeconds()
      
      if (idleTime > 180) { // 3 minutes idle
        if (!wasIdle) {
          wasIdle = true
          pushToBuffer({ app: 'idle', title: `User idle` })
        }
        return
      }
      
      if (wasIdle) {
        wasIdle = false
        pushToBuffer({ app: 'resumed', title: `User kembali setelah idle` })
      }

      // Read active window
      const win = await activeWindow()
      if (win) {
        const entry = { app: win.owner.name, title: win.title }
        pushToBuffer(entry)
      }
    } catch (err) {
      console.error('[Awareness Engine] Error tracking window:', err)
    }
  }, 60000)
}

export function getBuffer() {
  return [...buffer]
}

export function flushBuffer() {
  buffer = []
}

export function stopTracking() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}

// Deteksi idle Linux-native: xprintidle mengembalikan milidetik sejak input
// terakhir. Gagal/tidak tersedia -> 0 (anggap tidak idle).
function getSystemIdleSeconds() {
  return new Promise((resolve) => {
    try {
      execFile('xprintidle', (err, stdout) => {
        if (err || !stdout) return resolve(0)
        const ms = parseInt(stdout.trim(), 10)
        resolve(Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0)
      })
    } catch {
      resolve(0)
    }
  })
}
