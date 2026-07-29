// src/main/youtube-player.js — Dedicated YouTube BrowserWindow
// Replaces <webview>. Uses persistent partition session shared with browser-agent.
// Pattern from pear-desktop (th-ch/youtube-music): BrowserWindow + UA spoofing

import { BrowserWindow } from 'electron'

let ytWindow = null
let ytUrl = null

// Callback to send track info to renderer
let onTrackCallback = null
export function setOnTrackCallback(fn) { onTrackCallback = fn }

// Get the Chrome-masquerading User-Agent
function getChromeUA() {
  const platform = process.platform
  if (platform === 'win32') return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
  if (platform === 'darwin') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
  return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'
}

function getOrCreateWindow() {
  if (ytWindow && !ytWindow.isDestroyed()) return ytWindow

  const originalUA = BrowserWindow.defaultSession?.userAgent || 'Mozilla/5.0'
  const chromeUA = getChromeUA()

  ytWindow = new BrowserWindow({
    width: 480,
    height: 360,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000',
    resizable: true,
    webPreferences: {
      partition: 'persist:mark-browser',
      sandbox: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    }
  })

  // UA SPOOFING
  ytWindow.webContents.userAgent = chromeUA

  // Restore real Electron UA only for Google login pages
  ytWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
    if (details.url.startsWith('https://accounts.google.com')) {
      details.requestHeaders['User-Agent'] = originalUA
    }
    cb({ requestHeaders: details.requestHeaders })
  })

  // REMOVE CSP
  ytWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    if (details.responseHeaders) {
      delete details.responseHeaders['content-security-policy']
      delete details.responseHeaders['Content-Security-Policy']
      delete details.responseHeaders['content-security-policy-report-only']
    }
    cb({ responseHeaders: details.responseHeaders })
  })

  // Handle OAuth popups
  ytWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://accounts.google.com/') || url.includes('google.com/signin')) {
      ytWindow.loadURL(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Track info from page title
  ytWindow.webContents.on('page-title-updated', (_e, title) => {
    if (title && !title.includes('YouTube')) {
      const parts = title.split(' - ')
      if (parts.length >= 2 && onTrackCallback) {
        onTrackCallback({ title: parts[0], artist: parts.slice(1).join(' - '), fullTitle: title })
      }
    }
  })

  ytWindow.on('closed', () => { ytWindow = null })

  return ytWindow
}

export function loadYouTube(url) {
  ytUrl = url
  const win = getOrCreateWindow()
  if (win) win.loadURL(url)
}

export function showPlayer() {
  const win = getOrCreateWindow()
  if (win) win.show()
}

export function hidePlayer() {
  if (ytWindow && !ytWindow.isDestroyed()) ytWindow.hide()
}

export function isPlayerVisible() {
  return ytWindow && !ytWindow.isDestroyed() && ytWindow.isVisible()
}

export function getPlayerUrl() {
  return ytUrl
}

export function closePlayer() {
  if (ytWindow && !ytWindow.isDestroyed()) {
    ytWindow.close()
    ytWindow = null
  }
}
