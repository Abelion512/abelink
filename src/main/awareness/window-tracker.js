import { exec } from 'child_process'
import util from 'util'
import { powerMonitor } from 'electron'

const execPromise = util.promisify(exec)

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
  try { console.log('[Awareness Engine] Recorded activity:', newEntry.title || newEntry.app) } catch {}
  if (buffer.length > 30) buffer.shift()
}

/**
 * Detect the Linux desktop environment / compositor.
 * Returns one of: 'x11', 'gnome', 'kde', 'sway', 'hyprland', 'unknown'
 */
function detectLinuxDesktop() {
  const sessionType = (process.env.XDG_SESSION_TYPE || '').toLowerCase()
  const currentDesktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase()
  const waylandDisplay = process.env.WAYLAND_DISPLAY || ''

  // Explicit X11 session
  if (sessionType === 'x11') return 'x11'

  // No display at all (headless)
  if (!sessionType && !waylandDisplay && !process.env.DISPLAY) return 'unknown'

  // Wayland sessions — match compositor
  if (sessionType === 'wayland' || waylandDisplay) {
    if (currentDesktop.includes('gnome') || currentDesktop.includes('gnome-classic')) return 'gnome'
    if (currentDesktop.includes('kde') || currentDesktop.includes('plasma')) return 'kde'
    if (currentDesktop.includes('sway')) return 'sway'
    if (currentDesktop.includes('hyprland')) return 'hyprland'
    // Some compositors don't set XDG_CURRENT_DESKTOP — try process list
    return 'wayland-unknown'
  }

  // Fallback: X11 assumed if DISPLAY is set
  if (process.env.DISPLAY) return 'x11'

  return 'unknown'
}

/**
 * Get active window title & app on Linux via compositor-specific tool.
 */
export async function getLinuxActiveWindow() {
  const de = detectLinuxDesktop()

  // --- X11 (or XWayland fallback) ---
  if (de === 'x11') {
    try {
      const { stdout } = await execPromise('xdotool getactivewindow getwindowname 2>/dev/null')
      const title = stdout.split('\n').filter(Boolean)[0] || ''
      let app = 'unknown'
      try {
        const { stdout: cls } = await execPromise('xdotool getactivewindow getclass 2>/dev/null')
        app = cls.split('\n').filter(Boolean)[0] || 'unknown'
      } catch {}
      return { title, owner: { name: app } }
    } catch {
      console.warn('[Awareness Engine] xdotool not available. Install: sudo apt install xdotool')
      return null
    }
  }

  // --- GNOME Wayland (via DBus) ---
  if (de === 'gnome') {
    try {
      const { stdout } = await execPromise(
        `dbus-send --print-reply --dest=org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Eval 'string:global.display.focus_window?.title || ""' 2>/dev/null`
      )
      // Parse the string result from DBus reply
      const match = stdout.match(/string\s+"(.+)"$|string\s+"(.*)"$/m)
      const title = match ? (match[1] || match[2] || '') : ''
      return { title, owner: { name: 'gnome-shell' } }
    } catch {
      console.warn('[Awareness Engine] GNOME DBus window query failed.')
      // Fallback: try xdotool (XWayland compat)
      try {
        const { stdout } = await execPromise('xdotool getactivewindow getwindowname 2>/dev/null')
        const title = stdout.split('\n').filter(Boolean)[0] || ''
        return { title, owner: { name: 'xwayland-fallback' } }
      } catch {}
      return null
    }
  }

  // --- KDE Wayland (via qdbus or dbus) ---
  if (de === 'kde') {
    try {
      // Try qdbus first (usually more available on KDE)
      const { stdout } = await execPromise(
        `qdbus org.kde.KWin /KWin activeWindowTitle 2>/dev/null || ` +
        `dbus-send --print-reply --dest=org.kde.KWin /KWin org.kde.kwin.ActiveWindow.title 2>/dev/null`
      )
      const title = stdout.split('\n').filter(Boolean)[0] || ''
      return { title, owner: { name: 'kwin' } }
    } catch {
      console.warn('[Awareness Engine] KDE DBus window query failed.')
      return null
    }
  }

  // --- Sway (via swaymsg) ---
  if (de === 'sway') {
    try {
      const { stdout } = await execPromise('swaymsg -t get_tree 2>/dev/null')
      const tree = JSON.parse(stdout)
      // Walk tree to find focused node
      function findFocused(node) {
        if (node.focused) return node
        if (node.nodes) for (const n of node.nodes) { const f = findFocused(n); if (f) return f }
        if (node.floating_nodes) for (const n of node.floating_nodes) { const f = findFocused(n); if (f) return f }
        return null
      }
      const focused = findFocused(tree)
      if (focused) {
        return { title: focused.name || '', owner: { name: focused.app_id || focused.window_properties?.class || 'sway' } }
      }
    } catch {
      console.warn('[Awareness Engine] swaymsg failed.')
    }
    return null
  }

  // --- Hyprland (via hyprctl) ---
  if (de === 'hyprland') {
    try {
      const { stdout } = await execPromise('hyprctl activewindow -j 2>/dev/null')
      const data = JSON.parse(stdout)
      if (data && data.title) {
        return { title: data.title, owner: { name: data.class || 'hyprland' } }
      }
    } catch {
      console.warn('[Awareness Engine] hyprctl failed.')
    }
    return null
  }

  // --- Unknown Wayland compositor ---
  if (de === 'wayland-unknown') {
    // Try swaymsg (generic Wayland JSON protocol), then hyprctl, then xdotool fallback
    for (const cmd of [
      ['swaymsg -t get_tree 2>/dev/null', (out) => {
        const tree = JSON.parse(out)
        function f(n) { if (n.focused) return n; if (n.nodes) for (const c of n.nodes) { const r = f(c); if (r) return r }; return null }
        const focused = f(tree)
        return focused ? { title: focused.name || '', owner: { name: focused.app_id || 'wayland' } } : null
      }],
      ['hyprctl activewindow -j 2>/dev/null', (out) => {
        const d = JSON.parse(out)
        return d?.title ? { title: d.title, owner: { name: d.class || 'hyprland' } } : null
      }]
    ]) {
      try {
        const { stdout } = await execPromise(cmd[0])
        const result = cmd[1](stdout)
        if (result) return result
      } catch {}
    }
    console.warn('[Awareness Engine] Unknown Wayland compositor. No window tracking available.')
    return null
  }

  return null
}

/**
 * Get active window info — Linux only.
 */
async function getActiveWindow() {
  return getLinuxActiveWindow()
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
          pushToBuffer({ app: 'idle', title: 'User idle' })
        }
        return
      }

      if (wasIdle) {
        wasIdle = false
        pushToBuffer({ app: 'resumed', title: 'User kembali setelah idle' })
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
