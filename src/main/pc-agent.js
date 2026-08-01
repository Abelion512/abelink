// src/main/pc-agent.js — Linux PC Agent Engine
// Uses AT-SPI + xdotool + Tesseract for zero-vision-cost desktop automation
// IPC surface matches upstream's os-* tools

import { spawn } from 'child_process'
import { join } from 'path'
import { BrowserWindow } from 'electron'

const AGENT_SCRIPT = join(__dirname, 'linux-agent.sh')
const READ_SCRIPT = join(__dirname, 'read-ui.py')
const OCR_SCRIPT = join(__dirname, 'screenshot-ocr.py')

let overlayWindow = null
let isSessionOpen = false
let isStoppedByUser = false
let lastStopTime = 0
let pendingAskResolve = null

function isStopActive() {
  if (isStoppedByUser && Date.now() - lastStopTime > 15000) {
    isStoppedByUser = false
  }
  return isStoppedByUser
}

function runScript(script, args = []) {
  return new Promise((resolve, reject) => {
    if (isStopActive()) return reject(new Error('EMERGENCY_STOP'))
    const proc = spawn(script, args, { shell: false, timeout: 30000 })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => stdout += d.toString())
    proc.stderr.on('data', d => stderr += d.toString())
    proc.on('close', code => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `exit ${code}`))
    })
    proc.on('error', reject)
  })
}

function runPython(script, args = []) {
  return runScript('python3', [script, ...args]).then(out => {
    try { return JSON.parse(out) } catch { return { raw: out } }
  })
}

export async function openPCSession() {
  isSessionOpen = true
  isStoppedByUser = false
  console.log('[PC-Agent] Session opened')
  return { success: true }
}

export async function closePCSession() {
  isSessionOpen = false
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
  return { success: true }
}

export async function readDesktop() {
  const result = await runPython(READ_SCRIPT, ['--active-only'])
  return result
}

export async function executeClick(query = '') {
  const trimmed = String(query).trim()
  if (trimmed.startsWith('@')) {
    return { result: `reference:${trimmed}`, note: 'use os:read first for coordinates' }
  }
  const coords = trimmed.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n))
  const [x, y] = coords.length >= 2 ? coords : [0, 0]
  const result = await runScript(AGENT_SCRIPT, ['click', String(x || 0), String(y || 0)])
  return { result }
}

export async function executeType(text = '') {
  if (!text.trim()) return { result: 'type:empty' }
  const result = await runScript(AGENT_SCRIPT, ['type', text])
  return { result }
}

export async function executeKey(combo = '') {
  if (!combo.trim()) return { result: 'key:missing-combo' }
  const result = await runScript(AGENT_SCRIPT, ['key', combo])
  return { result }
}

export async function executeScroll(query = 'down') {
  const parts = String(query).trim().split(/\s+/)
  const count = parseInt(parts[0], 10)
  const direction = parts.length >= 2 ? parts[1] : (isNaN(count) ? parts[0] || 'down' : 'down')
  const scrollCount = isNaN(count) ? 1 : count
  const scrollDir = ['up', 'down'].includes(direction) ? direction : 'down'
  const result = await runScript(AGENT_SCRIPT, ['scroll', scrollDir, String(scrollCount)])
  return { result }
}

export async function openApp(appName) {
  // sanitize: only allow alphanumeric, dots, hyphens, underscores
  const sanitized = String(appName || '').replace(/[^a-zA-Z0-9._\-\/]/g, '')
  if (!sanitized) return { error: 'Invalid app name' }
  // Try xdg-open first, fallback to gtk-launch — both via spawn, no shell
  for (const cmd of ['xdg-open', 'gtk-launch']) {
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(cmd, [sanitized], { timeout: 5000, shell: false, stdio: 'ignore' })
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
        proc.on('error', reject)
      })
      return { result: 'opened' }
    } catch { /* try next */ }
  }
  return { error: `Cannot open: ${appName}` }
}

export async function listWindows() {
  const result = await runScript(AGENT_SCRIPT, ['window-list'])
  const lines = result.split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/, 4)
    return { id: parts[0], desktop: parts[1], pid: parts[2], title: parts.slice(3).join(' ') || line }
  })
  return lines
}

export async function focusWindow(title = '') {
  if (!title.trim()) return { result: 'focus:missing-title' }
  const result = await runScript(AGENT_SCRIPT, ['window-focus', title])
  return { result }
}

export async function captureScreenshot(path) {
  const result = await runPython(OCR_SCRIPT, ['--save', path || '/tmp/mark-screenshot.png'])
  return result
}

export async function ocrRegion(x, y, w, h) {
  const result = await runPython(OCR_SCRIPT, ['--region', String(x), String(y), String(w), String(h)])
  return result
}

export async function askUserPC(question = '') {
  return new Promise((resolve) => {
    pendingAskResolve = resolve
    overlayWindow = new BrowserWindow({
      width: 500, height: 300,
      alwaysOnTop: true, frame: false,
      transparent: true, resizable: false,
      webPreferences: { sandbox: true }
    })
    overlayWindow.webContents.setMaxListeners(50)
    const overlayHtml = [
      '<!DOCTYPE html><html><body style="background:rgba(25,54,45,0.95);backdrop-filter:blur(12px);border-radius:20px;margin:8px;padding:20px;color:#1fb854;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100vh-16px);">',
      '<h3 style="margin-bottom:16px;color:white">MARK membutuhkan input Anda</h3>',
      '<p style="color:#94a3b8;margin-bottom:16px;text-align:center">' + question.replace(/[<]/g, '&lt;') + '</p>',
      '<input id="a" autofocus style="width:80%;padding:10px;border-radius:12px;border:1px solid #1fb854;background:rgba(0,0,0,0.3);color:white;margin-bottom:12px;font-size:14px" placeholder="Ketik jawaban...">',
      '<div style="display:flex;gap:8px">',
      '<button onclick="done()" style="padding:8px 24px;border-radius:12px;background:#1fb854;color:black;border:none;cursor:pointer;font-weight:600">Kirim</button>',
      '<button onclick="cancel()" style="padding:8px 24px;border-radius:12px;background:#333;color:#94a3b8;border:none;cursor:pointer">Batal</button>',
      '</div>',
      '<scr' + 'ipt>',
      "document.getElementById('a').addEventListener('keydown',e=>{if(e.key==='Enter')done()})",
      "function done(){document.title='MARK_UNBLOCK_DONE:'+document.getElementById('a').value}",
      "function cancel(){document.title='MARK_UNBLOCK_DONE:__CANCEL__'}",
      '</scr' + 'ipt>',
      '</body></html>'
    ].join('\n')
    overlayWindow.loadURL('data:text/html,' + encodeURIComponent(overlayHtml))
    overlayWindow.show()
    overlayWindow.on('page-title-updated', (e, title) => {
      if (title.startsWith('MARK_UNBLOCK_DONE:')) {
        e.preventDefault()
        const answer = title.substring(18)
        overlayWindow.close()
        overlayWindow = null
        if (answer === '__CANCEL__') resolve({ cancelled: true })
        else resolve({ answer })
      }
    })
  })
}

export function emergencyStop() {
  isStoppedByUser = true
  lastStopTime = Date.now()
  console.log('[PC-Agent] Emergency stop triggered')
  return { stopped: true }
}