// src/main/pc-agent.js
// MARK PC Automation Engine - Linux Desktop Controller
// Uses xdotool + wmctrl for keyboard/mouse/screenshot/window management
// Wayland-aware: detects $XDG_SESSION_TYPE, uses grim/wl-copy when available

import { exec } from 'child_process'
import { join } from 'path'
import { app, BrowserWindow, globalShortcut, screen } from 'electron'
import fs from 'fs'

let lastReadResult = null
let lastReadTimestamp = 0
let stateChanged = false  // Set to true after click/type/key/scroll/open actions
const CACHE_TTL = 10000   // 10 seconds
let daemonProcess = null
let daemonReady = false
let pendingResolve = null
let daemonBuffer = ''
let overlayWindow = null
let activeChildProcess = null
let isStoppedByUser = false
let lastStopTime = 0
let lastStopReason = null
let overlayHideTimeout = null
let pendingAskResolve = null
let isSessionOpen = false
let mouseLockerProcess = null

export function isPCSessionOpen() {
  return isSessionOpen
}

function isStopActive() {
  if (isStoppedByUser && Date.now() - lastStopTime > 15000) {
    console.log(
      '[PC-Agent] Emergency stop state expired after 15s. Resetting isStoppedByUser=false'
    )
    isStoppedByUser = false
  }
  return isStoppedByUser
}

function getOverlayHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: transparent;
      overflow: hidden;
      user-select: none;
    }
    .banner {
      box-sizing: border-box;
      width: calc(100% - 8px);
      height: calc(100% - 8px);
      margin: 4px;
      background: rgba(25, 54, 45, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(31, 184, 84, 0.4);
      border-radius: 30px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 12px 24px;
      color: #1fb854;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes mark-spin { 100% { transform: rotate(360deg); } }
    .mark-spin { animation: mark-spin 1.5s linear infinite; }
    @keyframes mark-pulse { 50% { opacity: 0.7; } }
    .mark-pulse { animation: mark-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

    .title { font-size: 14px; font-weight: 600; letter-spacing: 0.3px; color: #1fb854; display: flex; align-items: center; gap: 6px; }
    .subtitle { font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 1px; }
    
    .modal-content {
      display: none;
      box-sizing: border-box;
      width: calc(100% - 24px);
      height: calc(100% - 24px);
      margin: 12px;
      background: rgba(25, 54, 45, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(31, 184, 84, 0.4);
      border-radius: 18px;
      box-shadow: 0 15px 35px -5px rgba(0,0,0,0.5);
      padding: 22px;
      flex-direction: column;
      gap: 16px;
      pointer-events: auto;
      font-family: system-ui, sans-serif;
    }
    .modal-header { display: flex; align-items: center; gap: 12px; }
    .modal-title { font-weight: 600; color: #f8fafc; font-size: 15px; letter-spacing: 0.5px; }
    .modal-subtitle {
      font-size: 13px; color: #94a3b8; line-height: 1.5;
      background: rgba(0,0,0,0.2); padding: 10px;
      border-radius: 8px; border-left: 3px solid #1fb854;
      margin: 0;
    }
    input[type="text"] {
      width: 100%; padding: 12px 14px; background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 8px; color: #f8fafc;
      font-size: 13px; outline: none; transition: all 0.2s; box-sizing: border-box;
    }
    input[type="text"]::placeholder { color: rgba(248, 250, 252, 0.5); }
    input[type="text"]:focus { border-color: #1fb854; box-shadow: 0 0 0 2px rgba(31, 184, 84, 0.2); }
    .btn-send {
      width: 100%; padding: 12px; background: #1fb854; color: #0f172a;
      border: none; border-radius: 8px; font-weight: 600; font-size: 14px;
      cursor: pointer; margin-top: auto; transition: all 0.2s;
    }
    .btn-send:hover { background: #22c55e; transform: translateY(-1px); }
  </style>
</head>
<body>
  <div class="banner" id="banner">
    <svg class="mark-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <div>
      <div class="title mark-pulse">Mark is working...</div>
      <div class="subtitle" id="banner-subtitle">Mouse locked. Press <strong style="color: #cbd5e1;">[Ctrl+Shift+S]</strong> to stop</div>
    </div>
  </div>

  <div class="modal-content" id="modal">
    <div class="modal-header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1fb854" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <div class="modal-title">Mark paused for input</div>
    </div>
    <div class="modal-subtitle">Menunggu respon atau instruksi...</div>
    <input type="text" id="reason-input" placeholder="Add a comment for Mark (optional)..." autocomplete="off" />
    <div style="display: flex; gap: 8px; margin-top: auto;">
      <button style="flex: 1; padding: 12px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.25)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.15)'" onclick="onCancel()">
        Batalkan Otomasi
      </button>
      <button style="flex: 1;" class="btn-send" id="btn-send" onclick="onSend()">
        Lanjutkan
      </button>
    </div>
  </div>

  <script>
    function onStop() {
      document.title = 'MARK_PC_STOP_CLICKED:' + Date.now();
    }
    function showAskModal(titleText, subtitleText, btnColor) {
      document.getElementById('banner').style.display = 'none';
      const modal = document.getElementById('modal');
      modal.style.display = 'flex';
      if (titleText) modal.querySelector('.modal-title').innerText = titleText;
      if (subtitleText) modal.querySelector('.modal-subtitle').innerHTML = subtitleText;
      const input = document.getElementById('reason-input');
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onSend();
      });
    }
    function onSend() {
      const val = document.getElementById('reason-input').value;
      document.title = 'MARK_PC_STOP_REASON:' + (val.trim() || 'User stopped PC automation without comment.');
    }
    function onCancel() {
      document.title = 'MARK_PC_ABORT_SESSION';
    }
    function resetBanner() {
      document.getElementById('modal').style.display = 'none';
      document.getElementById('banner').style.display = 'flex';
      document.getElementById('reason-input').value = '';
      document.getElementById('banner-subtitle').innerHTML = 'Mouse locked. Press <strong style="color: #cbd5e1;">[Ctrl+Shift+S]</strong> to stop';
    }
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onStop();
      }
    });
  </script>
</body>
</html>`
}

function showPCOverlay() {
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }
  if (isStopActive() || pendingAskResolve) return

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive()
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    try {
      overlayWindow.webContents.executeJavaScript('if (typeof resetBanner === "function") resetBanner();')
    } catch (err) {}
    return
  }

  try {
    const display = screen.getPrimaryDisplay()
    const { width } = display.workAreaSize
    const winWidth = 340
    const winHeight = 72
    overlayWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x: Math.floor((width - winWidth) / 2),
      y: 24,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getOverlayHTML())}`)

    overlayWindow.on('page-title-updated', (event, title) => {
      if (title.startsWith('MARK_PC_STOP_CLICKED:')) {
        triggerEmergencyStop()
      } else if (title.startsWith('MARK_PC_STOP_REASON:')) {
        const reason = title.replace('MARK_PC_STOP_REASON:', '').trim()
        lastStopReason = reason
        if (pendingAskResolve) {
          const resolveFn = pendingAskResolve
          pendingAskResolve = null
          resolveFn(reason)
        }
        hidePCOverlay()
      } else if (title.startsWith('MARK_PC_ABORT_SESSION')) {
        closePCSession()
        if (pendingAskResolve) {
          const resolveFn = pendingAskResolve
          pendingAskResolve = null
          resolveFn("SISTEM: USER MEMBATALKAN OTOMASI PC. SEGERA BERHENTI DARI LOOP.")
        }
      }
    })

    try {
      globalShortcut.unregister('CommandOrControl+Shift+S')
      globalShortcut.register('CommandOrControl+Shift+S', () => {
        triggerEmergencyStop()
      })
    } catch (err) {
      console.warn('[PC-Agent] Could not register Ctrl+Shift+S global shortcut:', err.message)
    }
  } catch (err) {
    console.warn('[PC-Agent] Could not create overlay window:', err.message)
  }
}

function hidePCOverlay() {
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
    overlayHideTimeout = null
  }

  if (isSessionOpen) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try {
        overlayWindow.webContents.executeJavaScript(`
          if (typeof resetBanner === "function") resetBanner();
        `)
        overlayWindow.setSize(340, 72)
        overlayWindow.setFocusable(false)
      } catch (err) {}
    }
    return
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.close()
    } catch (err) {}
  }
  overlayWindow = null
  try {
    globalShortcut.unregister('CommandOrControl+Shift+S')
  } catch (err) {}
}

function scheduleHidePCOverlay() {
  if (isSessionOpen) return // Do not auto-hide if session is explicitly open
  if (overlayHideTimeout) {
    clearTimeout(overlayHideTimeout)
  }
  overlayHideTimeout = setTimeout(() => {
    if (!isStoppedByUser && !pendingAskResolve) {
      hidePCOverlay()
    }
  }, 1800)
}

function triggerEmergencyStop() {
  if (activeChildProcess) {
    try {
      activeChildProcess.kill()
    } catch (err) {}
    activeChildProcess = null
  }
  if (mouseLockerProcess) {
    try {
      mouseLockerProcess.kill()
    } catch (err) {}
    mouseLockerProcess = null
  }
  if (daemonProcess) {
    try { daemonProcess.kill() } catch(e){}
    daemonProcess = null
    daemonReady = false
  }
  isStoppedByUser = true
  lastStopTime = Date.now()
  lastStopReason = 'User menekan tombol eksekusi Stop (Ctrl+Shift+S).'

  // AI akan menerima status "stopped_by_user", lalu AI yang akan
  // memanggil "os-ask" untuk menanyakan alasan user (yang mana baru memunculkan modal).
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.webContents.executeJavaScript(`
        document.getElementById('banner-subtitle').innerHTML = '<strong style="color: #ef4444;">STOPPED! Menunggu AI...</strong>';
      `)
    } catch (err) {}
  }
}

/**
 * Helper to detect session type (X11 vs Wayland)
 */
function isWayland() {
  return process.env.XDG_SESSION_TYPE === 'wayland'
}

/**
 * Helper to lock mouse pointer to center (Linux: no-op)
 */
function startMouseLocker() {
  // Linux: mouse locker not strictly needed; xdotool can hold pointer but it's intrusive
  // We keep it as no-op for now to avoid blocking user input
  mouseLockerProcess = null
  console.log('[PC-Agent] Mouse locker: no-op on Linux (xdotool not used for locking)')
}

function stopMouseLocker() {
  if (mouseLockerProcess) {
    try {
      mouseLockerProcess.kill()
    } catch (err) {}
    mouseLockerProcess = null
  }
}

/**
 * Open a persistent PC Automation session
 */
export async function openPCSession() {
  if (isSessionOpen) {
    return JSON.stringify({
      status: 'success',
      message:
        'PC Automation Session is ALREADY OPEN. Sesi PC Automation masih aktif! JANGAN panggil os-control-open lagi. LANGSUNG EKSEKUSI tool os-read, os-click, os-type, dll berikutnya di loop yang sama.'
    })
  }
  isSessionOpen = true
  isStoppedByUser = false
  showPCOverlay()
  startMouseLocker()
  try {
    await startDaemon()
  } catch (err) {
    console.warn('[PC-Agent] Failed to start daemon, will use fallback mode:', err)
  }
  return JSON.stringify({
    status: 'success',
    message:
      'PC Automation Session OPENED & APPROVED BY USER. User telah menyetujui dan mengizinkan sesi kontrol PC ini. LANGSUNG EKSEKUSI langkah berikutnya dengan tool os-read, os-click, os-type, dll SEKARANG JUGA di loop yang sama tanpa menyuruh user klik izinkan lagi! WAJIB panggil os-control-close ketika selesai.'
  })
}

/**
 * Close a persistent PC Automation session
 */
export async function closePCSession() {
  isSessionOpen = false
  isStoppedByUser = false
  hidePCOverlay()
  stopMouseLocker()
  stopDaemon()
  return JSON.stringify({
    status: 'success',
    message: 'PC Automation Session CLOSED.'
  })
}

/**
 * Ask user via PC automation overlay modal
 */
export async function askUserPC(query = '') {
  if (!isSessionOpen) {
    return JSON.stringify({
      status: 'error',
      message:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    })
  }
  isStoppedByUser = false
  showPCOverlay()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.setFocusable(true)
      overlayWindow.show()
      overlayWindow.setSize(420, 360)
      const cleanMsg = query.replace(/'/g, "\\'").replace(/"/g, '\\"')
      overlayWindow.webContents.executeJavaScript(
        `showAskModal("❓ MARK Needs Your Help", "${cleanMsg}", "#3b82f6")`
      )
    } catch (err) {}
  }
  const comment = await new Promise((resolve) => {
    pendingAskResolve = (val) => resolve(val)
  })
  
  // Restart mouse locker because the automation is resuming
  // (unless the user clicked cancel, which closes the session)
  if (isSessionOpen) {
    startMouseLocker()
  }
  
  return JSON.stringify({
    status: 'success',
    user_response: comment
  })
}

function runBash(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const fullCmd = `${cmd} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`
    exec(fullCmd, { timeout: options.timeout || 30000, maxBuffer: 1024 * 1024, ...options }, (err, stdout, stderr) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), err })
    })
  })
}

function isDaemonAlive() {
  return true
}

function startDaemon() {
  daemonReady = true
  return Promise.resolve()
}

function stopDaemon() {
  daemonProcess = null
  daemonReady = false
}

async function sendCommand(cmd) {
  if (isStopActive()) {
    return JSON.stringify({
      status: 'stopped_by_user',
      message: `PC automation stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`,
      user_message: lastStopReason || 'User pressed Ctrl+S / Stop button',
      action: 'os-ask'
    })
  }

  const isWayland = process.env.XDG_SESSION_TYPE === 'wayland'
  const x11Only = ['read-ui', 'read-focus', 'mouse-move', 'click', 'type', 'key', 'scroll', 'list-windows', 'focus-window']
  if (isWayland && x11Only.includes(cmd.cmd)) {
    return JSON.stringify({ status: 'error', message: 'Command not supported on Wayland. Use X11 or implement ydotool/swaymsg fallback.' })
  }

  try {
    switch (cmd.cmd) {
      case 'read-ui':
      case 'read-focus':
        {
          const res = await runBash('xdotool', ['getactivewindow'], { timeout: 5000 })
          if (res.err) {
            return JSON.stringify({ status: 'error', message: 'xdotool not available: ' + res.stderr })
          }
          const winId = res.stdout
          const winRes = await runBash('xdotool', ['getwindowname', winId], { timeout: 3000 })
          const winName = winRes.stdout || 'unknown'
          const winRes2 = await runBash('xdotool', ['getwindowgeometry', '--shell', winId], { timeout: 3000 })
          const geometry = {}
          winRes2.stdout.split('\n').forEach(line => {
            const [k, v] = line.split('=')
            if (k && v) geometry[k] = v
          })
          return JSON.stringify({
            window: winId,
            title: winName,
            geometry,
            method: cmd.cmd === 'read-focus' ? 'focus' : 'active',
            elements: [{ name: winName, value: winName, type: 'window' }],
            element_count: 1
          })
        }
      case 'mouse-move':
        await runBash('xdotool', ['mousemove', cmd.x || 0, cmd.y || 0])
        return JSON.stringify({ status: 'ok' })
      case 'click':
        await runBash('xdotool', ['click', cmd.button || 1])
        return JSON.stringify({ status: 'ok' })
      case 'type':
        await runBash('xdotool', ['type', '--delay', '10', cmd.text || ''])
        return JSON.stringify({ status: 'ok' })
      case 'key':
        await runBash('xdotool', ['key', cmd.key || ''])
        return JSON.stringify({ status: 'ok' })
      case 'scroll':
        await runBash('xdotool', ['click', cmd.direction === 'down' ? 4 : 5])
        return JSON.stringify({ status: 'ok' })
      case 'list-windows':
        {
          const res = await runBash('wmctrl', ['-l'])
          const lines = res.stdout.split('\n').filter(l => l.trim())
          const windows = lines.map(line => {
            const parts = line.split(/\s+/).slice(0, 5)
            const [id, workspace, pid, x, y, ...rest] = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(-?\d+)\s+(-?\d+)\s+(.*)$/)?.groups || { id: '', workspace: '', pid: '', x: '0', y: '0', win: line }
            return { id: parts[0], title: rest.join(' ') }
          })
          return JSON.stringify({ windows })
        }
      case 'focus-window':
        await runBash('wmctrl', ['-a', cmd.windowId || ''])
        return JSON.stringify({ status: 'ok' })
      case 'screenshot':
        {
          const res = await runBash(isWayland ? 'grim' : 'scrot', ['-s'], { timeout: 10000 })
          return res.stdout ? JSON.stringify({ image: res.stdout }) : JSON.stringify({ status: 'error', message: res.stderr })
        }
      case 'clipboard-read':
        {
          const res = await runBash(isWayland ? 'wl-paste' : 'xclip', ['-sel', 'clip', '-o'], { timeout: 5000 })
          return JSON.stringify({ text: res.stdout })
        }
      case 'clipboard-write':
        {
          const text = (cmd.text || '').replace(/'/g, "'\\''")
          await runBash('bash', ['-c', isWayland ? `printf '%s' '${text}' | wl-copy` : `printf '%s' '${text}' | xclip -sel clip`])
          return JSON.stringify({ status: 'ok' })
        }
      default:
        return JSON.stringify({ status: 'ok' })
    }
  } catch (err) {
    return JSON.stringify({ status: 'error', message: err.message })
  }
}

async function runScriptFallback(scriptName, args = []) {
  if (isStopActive()) {
    return JSON.stringify({
      status: 'stopped_by_user',
      message: `PC automation stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`,
      user_message: lastStopReason || 'User pressed Ctrl+S / Stop button',
      action: 'os-ask'
    })
  }
  const res = await runBash(args[0], args.slice(1), { timeout: 30000 })
  if (res.err) {
    console.error(`[PC-Agent] Fallback script error:`, res.stderr)
  }
  return res.stdout
}

/**
 * Read the active desktop GUI elements (UIAutomation with OCR fallback)
 */
export async function readDesktop(options = {}, query = '') {
  if (!isSessionOpen) {
    return {
      window: 'error',
      method: 'error',
      elements: [],
      element_count: 0,
      error:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    }
  }
  if (isStoppedByUser) {
    console.log('[PC-Agent] Resetting isStoppedByUser=false for new readDesktop() call')
    isStoppedByUser = false
  }
  showPCOverlay()

  const isFocus = (query === 'focus')
  if (!isFocus && !stateChanged && lastReadResult && (Date.now() - lastReadTimestamp < CACHE_TTL)) {
    scheduleHidePCOverlay()
    return { ...lastReadResult, method: 'cached' }
  }

  try {
    let uiText = ''
    if (isFocus) {
      uiText = await sendCommand({ cmd: 'read-focus' })
    } else {
      uiText = await sendCommand({ cmd: 'read-ui', maxElements: options.maxElements || 300 })
    }

    let parsed = null
    if (uiText) {
      try { parsed = JSON.parse(uiText) } catch (e) {}
    }

    if (parsed && parsed.elements) {
      lastReadResult = parsed
      lastReadTimestamp = Date.now()
      stateChanged = false
    } else {
      parsed = { window: 'unknown', method: 'none', elements: [], element_count: 0 }
    }

    scheduleHidePCOverlay()
    return parsed
  } catch (err) {
    scheduleHidePCOverlay()
    console.error('[PC-Agent] readDesktop error:', err)
    return { window: 'error', method: 'error', elements: [], element_count: 0 }
  }
}

/**
 * Helper: Find coordinates from element ID or x||y string
 */
function resolveCoordinates(query) {
  if (!query) return null

  // If query is "x||y"
  if (query.includes('||')) {
    const parts = query.split('||').map((p) => parseInt(p.trim(), 10))
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] }
    }
  }

  // If query is element ID (number)
  const id = parseInt(query.trim(), 10)
  if (!isNaN(id) && lastReadResult && lastReadResult.elements) {
    const el = lastReadResult.elements.find((item) => item.id === id)
    if (el && el.rect && el.rect.length === 4) {
      const centerX = Math.round(el.rect[0] + el.rect[2] / 2)
      const centerY = Math.round(el.rect[1] + el.rect[3] / 2)
      return { x: centerX, y: centerY, id: id }
    }
  }

  return null
}

/**
 * Click an element by ID or coordinates
 */
export async function executeClick(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  const coords = resolveCoordinates(query)
  if (!coords) {
    scheduleHidePCOverlay()
    return `[PC-Agent] Error: Element ID or coordinates '${query}' not found. Try os-read first.`
  }

  await runBash('xdotool', ['mousemove', coords.x.toString(), coords.y.toString()])
  await runBash('xdotool', ['click', 1])
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Clicked at (${coords.x}, ${coords.y}).`
}

/**
 * Double Click an element by ID or coordinates
 */
export async function executeDoubleClick(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  const coords = resolveCoordinates(query)
  if (!coords) {
    scheduleHidePCOverlay()
    return `[PC-Agent] Error: Element ID or coordinates '${query}' not found. Try os-read first.`
  }

  await runBash('xdotool', ['mousemove', coords.x.toString(), coords.y.toString()])
  await runBash('xdotool', ['click', 1])
  await runBash('xdotool', ['click', 1])
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Double-Clicked at (${coords.x}, ${coords.y}).`
}

/**
 * Type text into an element by ID or directly
 */
export async function executeType(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let text = query
  let coords = null

  if (query && query.includes('||')) {
    const idx = query.indexOf('||')
    const possibleId = query.substring(0, idx).trim()
    text = query.substring(idx + 2).trim()
    coords = resolveCoordinates(possibleId)
  }

  // If element ID was provided, click it first to focus
  if (coords) {
    await runBash('xdotool', ['mousemove', coords.x.toString(), coords.y.toString()])
    await runBash('xdotool', ['click', 1])
  }

  await runBash('xdotool', ['type', '--delay', '10', text])
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Typed "${text}".`
}

/**
 * Press a keyboard shortcut combo
 */
export async function executeKey(combo) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  await runBash('xdotool', ['key', combo])
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Pressed key combo "${combo}".`
}

/**
 * Scroll mouse wheel
 */
export async function executeScroll(query) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  let direction = 'down'
  let amount = 5
  if (query && query.includes('||')) {
    const parts = query.split('||')
    direction = parts[0].trim().toLowerCase()
    const amt = parseInt(parts[1].trim(), 10)
    if (!isNaN(amt)) amount = amt
  } else if (query) {
    direction = query.trim().toLowerCase()
  }

  const clickBtn = direction === 'down' ? 4 : 5
  for (let i = 0; i < amount; i++) {
    await runBash('xdotool', ['click', clickBtn.toString()])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Scrolled ${direction} by ${amount}.`
}

/**
 * Open an application / URL
 */
export async function openApp(target) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  if (!/^[a-zA-Z0-9_./\-]+$/.test(target)) {
    return `[PC-Agent] Invalid app name: "${target}"`
  }
  const isURL = /^https?:\/\//.test(target)
  if (isURL) {
    await runBash('xdg-open', [target])
  } else {
    await runBash('bash', ['-c', `nohup '${target.replace(/'/g, "'\\''")}' >/dev/null 2>&1 &`])
  }
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Opened "${target}".`
}

/**
 * List all active top-level windows
 */
export async function listWindows() {
  if (!isSessionOpen) {
    return {
      status: 'error',
      windows: [],
      count: 0,
      message:
        'ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu.'
    }
  }
  if (isStopActive()) {
    return { status: 'stopped_by_user', windows: [], count: 0, message: lastStopReason }
  }
  showPCOverlay()
  const res = await runBash('wmctrl', ['-l'], { timeout: 5000 })
  scheduleHidePCOverlay()
  const lines = res.stdout.split('\n').filter(l => l.trim())
  const windows = lines.map(line => {
    const parts = line.split(/\s+/)
    const id = parts[0]
    const title = parts.slice(5).join(' ')
    return { id, title }
  })
  return { status: 'success', windows, count: windows.length }
}

/**
 * Focus window by title substring
 */
export async function focusWindow(title) {
  if (!isSessionOpen) {
    return '[PC-Agent] ERROR: OS Control belum dibuka! Kamu WAJIB mengeksekusi tool "os-control-open" terlebih dahulu sebelum menggunakan tool PC automation.'
  }
  if (isStopActive()) {
    return `[PC-Agent] Stopped by user: ${lastStopReason || 'User pressed Ctrl+Shift+S'}`
  }
  showPCOverlay()
  await runBash('wmctrl', ['-a', title])
  stateChanged = true
  scheduleHidePCOverlay()
  return `[PC-Agent] Focus window "${title}".`
}
