import { exec } from 'child_process'
import util from 'util'
import { powerMonitor } from 'electron'

const execPromise = util.promisify(exec)
const IS_WIN = process.platform === 'win32'
const IS_LINUX = process.platform === 'linux'
const IS_MAC = process.platform === 'darwin'

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

/**
 * Get active window info in a cross-platform way.
 * - macOS/Windows: uses active-win (imported lazily, throws on Linux)
 * - Linux: falls back to xdotool spawn
 */
async function getActiveWindow() {
  if (IS_LINUX) {
    try {
      const { stdout } = await execPromise(
        'xdotool getactivewindow getwindowname 2>/dev/null'
      )
      const title = stdout.split('\n').filter(Boolean)[0] || ''
      let app = 'unknown'
      try {
        const { stdout: cls } = await execPromise(
          'xdotool getactivewindow getclass 2>/dev/null'
        )
        app = cls.split('\n').filter(Boolean)[0] || 'unknown'
      } catch {}
      return { title, owner: { name: app } }
    } catch {
      console.warn('[Awareness Engine] xdotool not available. Install it: sudo apt install xdotool')
      return null
    }
  }

  // macOS / Windows — use active-win
  try {
    const activeWindow = await import('active-win')
    return await activeWindow.default()
  } catch (err) {
    console.error('[Awareness Engine] active-win failed:', err.message)
    return null
  }
}

export function startTracking() {
  if (intervalId) return // Already running

  intervalId = setInterval(async () => {
    try {
      // Check idle time first
      const idleTime = powerMonitor.getSystemIdleTime()
      
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
      const win = await getActiveWindow()
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
