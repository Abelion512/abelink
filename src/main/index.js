import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  Notification,
  desktopCapturer
} from 'electron'
import { join } from 'path'
import path from 'path'
import fs from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { fetchTranscript } from 'youtube-transcript-plus'
import yts from 'yt-search'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { startTracking, stopTracking, getBuffer, flushBuffer } from './awareness/window-tracker.js'
import { NATIVE_TOOLS } from './native-tools.js'
import { loadSkills, initSkillsIPC } from './agent-skills-loader.js'
import { initMpris, setMprisCallbacks, setMprisPlaybackStatus, updateMprisTrack, stopMpris } from './mpris-service.js'
import { getRecentTracks, getTopTracks, setApiKey as setLastfmKey } from './lastfm-service.js'
import { getMediaInfo, getMediaWithAudio, searchMedia } from './ytdl-service.js'
import { ElectronBlocker } from '@cliqz/adblocker-electron'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

// Headless/SSH detection: disable GPU if no display server available (Linux)
if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')

let mainWindow = null
let tray = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.on('remote-music-command', (_event, command, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('execute-music-command', command, payload)
  }
})

ipcMain.on('mpris:update-track', (_event, track, playing) => {
  try { updateMprisTrack(track, playing) } catch {}
})
ipcMain.on('mpris:set-status', (_event, playing) => {
  try { setMprisPlaybackStatus(playing) } catch {}
})

import { fetchAI, setGlobalConfig, abortAllFetches, resolveVisionModel } from './ai-bridge.js'
import { getToolCatalog, getToolDetail, getToolCatalogString, getToolCatalogForQuery, refreshToolCache } from './tool-registry.js'

ipcMain.on('sync-config', (_event, config) => {
  setGlobalConfig(config)
  if (config.lastfmApiKey) setLastfmKey(config.lastfmApiKey)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated')
  }
})

// ========== TOOL REGISTRY IPC ==========
ipcMain.handle('tool-catalog', () => getToolCatalogString())
ipcMain.handle('tool-catalog-query', (_event, query, maxResults) => getToolCatalogForQuery(query, maxResults))
ipcMain.handle('tool-detail', (_event, toolName) => {
  const detail = getToolDetail(toolName)
  return detail ? { name: detail.name, category: detail.category, description: detail.description, l1: detail.l1 } : null
})
ipcMain.on('tool-refresh', () => refreshToolCache())

ipcMain.handle('native-tool:execute', async (_event, toolName, query) => {
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { success: false, error: 'Tool tidak ditemukan' }
  try {
    const result = await tool.handler(query)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('native-tool:needs-approval', (_event, toolName, query) => {
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { needsApproval: false }
  const needs = typeof tool.needsApproval === 'function' ? tool.needsApproval(query) : tool.needsApproval
  return {
    needsApproval: needs,
    message: needs && tool.approvalMessage ? tool.approvalMessage(query) : null
  }
})

ipcMain.handle('ai:fetch', async (_event, data) => {
  const { messages, config, isSmallTask, jsonSchema } = data
  try {
    const onStatus = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:status', msg)
      }
    }
    return await fetchAI(messages, config, undefined, isSmallTask, jsonSchema, null, onStatus)
  } catch (error) {
    return { error: { message: error.message, code: error.code } }
  }
})

ipcMain.on('ai:abort-fetch', () => {
  abortAllFetches()
})

if (is.dev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'mark-dev'))
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

import {
  startWhatsappBot,
  stopWhatsappBot,
  getConnectionStatus,
  logoutWhatsapp,
  uiMessageHistory
} from './whatsapp/baileys-service.js'

ipcMain.on('wa:start', () => startWhatsappBot(mainWindow))
ipcMain.on('wa:stop', () => stopWhatsappBot())
ipcMain.handle('wa:get-status', () => getConnectionStatus())
ipcMain.handle('wa:get-history', () => uiMessageHistory)

ipcMain.handle('parse-document', async (_event, arrayBuffer, isDocx) => {
  try {
    const buffer = Buffer.from(arrayBuffer)
    if (isDocx) {
      const result = await mammoth.extractRawText({ buffer })
      return result.value
    } else {
      const parser = new PDFParse({ data: buffer })
      const data = await parser.getText()
      return data.text
    }
  } catch (error) {
    console.error('Failed to parse document:', error)
    throw new Error('Gagal mem-parsing dokumen: ' + error.message)
  }
})
ipcMain.handle('wa:logout', async () => await logoutWhatsapp())

import { loadPlugins, initPluginIPC } from './plugins/plugin-loader.js'
import { navigateTo, readDOM, executeAction, closeBrowser, showBrowser } from './browser-agent.js'

// Browser Automation IPCs
ipcMain.handle('browser:navigate', async (_event, url) => {
  try { return await navigateTo(url) }
  catch (e) { return `[ERROR] Gagal membuka ${url}: ${e.message}` }
})
ipcMain.handle('browser:read-dom', async (_event) => {
  try { return await readDOM() }
  catch (e) { return `[ERROR] Gagal membaca DOM: ${e.message}` }
})
ipcMain.handle('browser:action', async (_event, data) => {
  try { return await executeAction(data) }
  catch (e) { return `[ERROR] Gagal eksekusi action: ${e.message}` }
})
ipcMain.handle('browser:close', (_event) => {
  return closeBrowser()
})
ipcMain.on('browser:show', () => {
  showBrowser()
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mark.agent')

  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true
    })
  } else {
    app.setLoginItemSettings({
      openAtLogin: false,
      openAsHidden: false
    })
  }

  initPluginIPC()
  loadSkills()
  initSkillsIPC()

  // Spoof Referer/Origin on all sessions that load YouTube so requests look like
  // they originate from youtube.com itself. Electron partitions do NOT inherit
  // webRequest interceptors from defaultSession.
  const ytFixSessions = [
    session.defaultSession,
    session.fromPartition('persist:youtube'),
    session.fromPartition('persist:mark-browser')
  ]
  for (const s of ytFixSessions) {
    s.webRequest.onBeforeSendHeaders(
      { urls: ['https://www.youtube.com/*'] },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://www.youtube.com'
        details.requestHeaders['Origin'] = 'https://www.youtube.com'
        callback({ requestHeaders: details.requestHeaders })
      }
    )
  }

  try {
    const ytSession = session.fromPartition('persist:youtube')
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    blocker.enableBlockingInSession(ytSession)
    blocker.enableBlockingInSession(session.defaultSession)
    console.log('[Adblock] Brave-style adblocker aktif')
  } catch (e) {
    console.error('[Adblock] Gagal init:', e.message)
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen']
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      callback(false)
    }
  })

  createWindow()

  loadPlugins().then(() => console.log('[Plugins] Manifests loaded')).catch(e => console.error('[Plugins] Failed:', e))

  initMpris()
  setMprisCallbacks({
    onPlayPause: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('execute-music-command', 'toggle')
    },
    onNext: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('execute-music-command', 'next')
    },
    onPrevious: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('execute-music-command', 'prev')
    },
    onStop: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('execute-music-command', 'stop')
    }
  })

  startWhatsappBot(mainWindow)

  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Mark AI Assistant')

  const safeShow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  }
  const safeSend = (channel, ...args) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Buka Mark', click: safeShow },
    {
      label: 'Monitor WhatsApp',
      click: () => { safeShow(); safeSend('navigate', '/whatsapp-bot') }
    },
    {
      label: 'Matikan WhatsApp Bot',
      click: () => stopWhatsappBot()
    },
    {
      label: 'Ngobrol Sekarang (Live Audio)',
      click: () => { safeShow(); safeSend('trigger-live-audio') }
    },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => { app.isQuitting = true; app.quit() }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', safeShow)

  globalShortcut.register('CommandOrControl+Alt+M', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.send('trigger-live-audio')
    }
  })

  ipcMain.handle('awareness:get-buffer', () => getBuffer())
  ipcMain.on('awareness:clear-buffer', () => flushBuffer())

  ipcMain.handle('take-screenshot', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      })
      if (sources.length > 0) {
        return sources.map(source => ({
          name: source.name,
          data: source.thumbnail.toDataURL()
        }))
      }
      return []
    } catch (error) {
      console.error('Failed to take screenshot:', error)
      return null
    }
  })

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('show-notification', (_event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: icon }).show()
    }
  })

  ipcMain.handle('execute-node-task', async (_event, data) => {
    console.log('Menerima data dari UI:', data)
    return `Berhasil memproses: ${data}`
  })

  ipcMain.handle('open-external', async (_event, url) => {
    shell.openExternal(url)
  })

  ipcMain.handle('get-youtube-transcript', async (_event, url) => {
    try {
      const transcript = await fetchTranscript(url)
      const textTranscript = transcript
        .filter((_, index) => index % 2 === 0)
        .map((item) => {
          const minutes = Math.floor(item.offset / 60)
            .toString()
            .padStart(2, '0')
          const seconds = Math.floor(item.offset % 60)
            .toString()
            .padStart(2, '0')
          return `[${minutes}:${seconds}] ${item.text}`
        })
        .join('\n')
      return textTranscript
    } catch (error) {
      console.error('Gagal ambil transkrip YT:', error.message)
      return ''
    }
  })

  ipcMain.handle('youtube-search', async (_event, query) => {
    try {
      const ytData = await yts(query)
      const video = ytData.videos.slice(0, 4)
      return video.map((item) => ({
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        title: item.title,
        author: item.author.name
      }))
    } catch (error) {
      console.error('Gagal search YT:', error.message)
      return []
    }
  })

  let globalTTS = null

  ipcMain.handle('tts-speak', async (_event, text, rate, pitch) => {
    try {
      if (!globalTTS) {
        globalTTS = new MsEdgeTTS()
        await globalTTS.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS)
      }

      const formattedRate = `${rate || 0}%`
      const formattedPitch = `${pitch || 0}Hz`

      const tmpPath = path.join(app.getPath('temp'), 'mark-tts-folder')
      if (!fs.existsSync(tmpPath)) {
        fs.mkdirSync(tmpPath, { recursive: true })
      }
      const { audioFilePath } = await globalTTS.toFile(tmpPath, text, {
        rate: formattedRate,
        pitch: formattedPitch
      })
      const audioData = fs.readFileSync(audioFilePath)
      const base64Audio = `data:audio/mp3;base64,${audioData.toString('base64')}`

      fs.unlinkSync(audioFilePath)

      return base64Audio
    } catch (error) {
      console.error('Gagal generate suara Mark:', error)
      return null
    }
  })

  ipcMain.handle('search-music', async (_event, query) => {
    try {
      const { videos } = await yts(query)
      const results = videos.slice(0, 5).map((v) => ({
        id: v.videoId,
        title: v.title,
        artist: v.author?.name || 'Unknown',
        album: 'Single',
        duration: v.duration.seconds,
        thumbnail: v.image?.replace(/=w\d+-h\d+.*$/, '=w1080-h1080-l90-rj')?.replace(/\?sqp=.*$/, '') || ''
      }))
      return results
    } catch (error) {
      console.error('Mark gagal mencari lagu:', error.message)
      return []
    }
  })

  ipcMain.handle('lastfm:get-recent', async (_event, user) => {
    return getRecentTracks(user || 'abelionz')
  })
  ipcMain.handle('lastfm:get-top', async (_event, user) => {
    return await getTopTracks(user || 'abelionz')
  })

  ipcMain.handle('ytdl:get-info', async (_event, url) => {
    return await getMediaInfo(url)
  })
  ipcMain.handle('ytdl:get-audio', async (_event, url) => {
    return await getMediaWithAudio(url)
  })
  ipcMain.handle('ytdl:search', async (_event, query, limit) => {
    return await searchMedia(query, limit || 5)
  })

  // ===== VISION MODEL ROUTING (Registry-based) =====
  ipcMain.handle('vision:resolve-model', (_event, role) => {
    const conf = globalConfig || {}
    const comboName = conf.customModel || 'mark'
    // resolveVisionModel is imported from ai-bridge at top of file
    return resolveVisionModel(comboName, role)
  })

  ipcMain.handle('vision:get-endpoint', (_event, modelId) => {
    const conf = globalConfig || {}
    const activeProvider = conf.aiProvider || 'lmstudio'
    const customEndpoint = conf.customEndpoint?.replace(/\/+$/, '') || 'http://localhost:1234'
    const customApiKey = conf.customApiKey || ''

    if (activeProvider === 'custom' && customEndpoint) {
      const base = customEndpoint
      const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
      const headers = { 'Content-Type': 'application/json' }
      if (customApiKey) {
        if (customEndpoint.includes('anthropic.com')) {
          headers['x-api-key'] = customApiKey
          headers['anthropic-version'] = '2023-06-01'
        } else {
          headers['Authorization'] = `Bearer ${customApiKey}`
        }
      }
      return { url, headers }
    }
    // LM Studio default
    return { url: 'http://localhost:1234/v1/chat/completions', headers: { 'Content-Type': 'application/json' } }
  })

  // ===== WEBVIEW ANTI-DETECTION (YouTube) =====
  // Auto-attach to ALL webviews via did-attach-webview
  // Injects navigator.webdriver=false at dom-ready, before page scripts execute
  mainWindow.webContents.on('did-attach-webview', (_event, wc) => {
    const antiDetectScript = `
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
        if (navigator.__proto__) delete navigator.__proto__.webdriver;
        if (!window.chrome) window.chrome = {};
        window.chrome.runtime = window.chrome.runtime || {};
        window.chrome.loadTimes = function(){};
        window.chrome.csi = function(){};
      } catch(e) {}
    `
    wc.on('dom-ready', () => {
      wc.executeJavaScript(antiDetectScript).catch(() => {})
    })
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  startTracking()
})

app.on('will-quit', async () => {
  abortAllFetches()
  stopTracking()
  stopMpris()
  stopWhatsappBot()
  try { await closeBrowser() } catch {}
  if (tray) tray.destroy()
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform === 'linux') {
    app.isQuitting = true
    app.quit()
  }
})

const cleanExit = () => {
  app.isQuitting = true
  if (tray) tray.destroy()
  app.exit(0)
}
process.on('SIGINT', cleanExit)
process.on('SIGTERM', cleanExit)
process.on('SIGHUP', cleanExit)
