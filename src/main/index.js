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
import os from 'os'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { fetchTranscript } from 'youtube-transcript-plus'
import yts from 'yt-search'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { startTracking, stopTracking, getBuffer, flushBuffer } from './awareness/window-tracker.js'
import { NATIVE_TOOLS } from './native-tools.js'
import { loadSkills, initSkillsIPC } from './agent-skills-loader.js'
import {
  readDesktop, executeClick, executeType, executeKey, executeScroll,
  openApp, listWindows, focusWindow, askUserPC,
  captureScreenshot, ocrRegion, emergencyStop
} from './pc-agent.js'
import { initMpris, setMprisCallbacks, setMprisPlaybackStatus, updateMprisTrack, stopMpris } from './mpris-service.js'
import { getRecentTracks, getTopTracks, setApiKey as setLastfmKey } from './lastfm-service.js'
import { getMediaInfo, getMediaWithAudio, searchMedia } from './ytdl-service.js'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { loadYouTube, showPlayer, hidePlayer, isPlayerVisible, closePlayer, getPlayerUrl, setOnTrackCallback, sendKeyboardCommand, showAndNavigate } from './youtube-player.js'
import { buildCanonical, hashBody, signContent } from './agent-keyring.js'
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
      // ponytail: type:module → preload builds as index.mjs; must match or preload silently fails
      preload: join(__dirname, '../preload/index.mjs'),
      webviewTag: true,
      // ponytail: sandbox=false required for preload's require() — switch to contextBridge-only preload to enable sandbox
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  // Dev/HMR menambah listener eksternal ke webContents — naikkan kapasitas biar
  // MaxListenersExceededWarning tidak muncul (sama dengan pola di browser-agent.js)
  mainWindow.webContents.setMaxListeners(50)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        console.warn(`[SECURITY] setWindowOpenHandler blocked: ${parsed.protocol}//${parsed.host}`)
        return { action: 'deny' }
      }
      shell.openExternal(details.url)
    } catch { /* invalid URL — deny */ }
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

import { fetchAI, setGlobalConfig, getGlobalConfig, abortAllFetches, resolveVisionModel, applyLearnedHints } from './ai-bridge.js'
import { getToolCatalog, getToolDetail, getToolCatalogString, getToolCatalogForQuery, matchVoiceCommand, refreshToolCache } from './tool-registry.js'

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
ipcMain.handle('voice-fast-path', (_event, voiceText) => matchVoiceCommand(voiceText))

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
    let displayMessage = error.message
    if (error.httpStatus) {
      switch (error.httpStatus) {
        case 401:
          displayMessage = 'Kredensial AI tidak valid. Periksa API Key di halaman Configuration.'
          break
        case 404:
          if (/credential/i.test(error.message)) {
            displayMessage = 'Kredensial AI provider tidak aktif. Pastikan API Key dan provider yang dipilih sudah benar di halaman Configuration.'
          } else {
            displayMessage = 'Endpoint AI tidak ditemukan. Periksa URL endpoint di halaman Configuration.'
          }
          break
        case 429:
          displayMessage = 'Terlalu banyak permintaan. Tunggu beberapa saat, lalu coba lagi.'
          break
        case 500: case 502: case 503:
          displayMessage = 'Server AI sedang sibuk. Coba lagi nanti.'
          break
        default:
          displayMessage = `Gagal terhubung ke AI (HTTP ${error.httpStatus}). Periksa pengaturan di halaman Configuration.`
      }
    } else if (/network|fetch|econnrefused|enotfound|timeout/i.test(error.message)) {
      displayMessage = 'Gagal terhubung ke server AI. Pastikan server aktif dan dapat dijangkau dari komputer ini.'
    }
    return { error: { message: displayMessage, code: error.code } }
  }
})

ipcMain.on('ai:abort-fetch', () => {
  abortAllFetches()
})

// AUTO-LEARN: renderer meminta hints per-model (dari observasi di trackModelUsage)
ipcMain.handle('ai:model-hints', (_event, modelName) => {
  if (!modelName || typeof modelName !== 'string') return {}
  try {
    return applyLearnedHints(modelName.trim())
  } catch (e) {
    console.warn('[ModelHints] Failed:', e.message)
    return {}
  }
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
ipcMain.handle('create-agent-skill', async (_event, skillDef) => {
  try {
    const { name, description, content, origin, platforms = [], tags = [] } = skillDef
    if (!name || !content) throw new Error('name and content required')
    if (!['mark-generated', 'user'].includes(origin)) {
      throw new Error(`origin must be 'mark-generated' or 'user', got '${origin}'`)
    }

    const safeName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!safeName) throw new Error('name produces empty safeName after sanitization')
    const projectSkills = path.join(process.cwd(), '.agents', 'skills')
    const userSkills = path.join(os.homedir(), '.agents', 'skills')
    const targetBase = fs.existsSync(projectSkills) ? projectSkills : userSkills
    const skillDir = path.join(targetBase, safeName)
    const skillPath = path.join(skillDir, 'SKILL.md')

    // Don't overwrite unless same origin
    if (fs.existsSync(skillPath)) {
      const existing = fs.readFileSync(skillPath, 'utf8')
      const originMatch = existing.match(/^origin:\s*(.+)$/m)
      const existingOrigin = originMatch?.[1]?.trim()
      if (existingOrigin !== origin) {
        throw new Error(`Skill '${safeName}' exists with origin '${existingOrigin}'. Cannot overwrite with '${origin}'.`)
      }
    }

    // WATERMARK v2: sign mark-generated skills at creation
    const provider = origin === 'mark-generated' ? 'mark-ai' : 'user'
    let signatureLine = ''
    if (origin === 'mark-generated') {
      // Body as loader will extract: frontmatter ends with '---\n', file = frontmatter + '\n' + content
      // loader: lines.slice(endIdx+1).join('\n') → '\n' + content
      const bodyHash = hashBody('\n' + content)
      const canonical = buildCanonical({ name: safeName, watermark: 'v5.0.0', origin, provider, bodyHash })
      signatureLine = `\nmark-signature: ${signContent(canonical)}`
    }

    const platformStr = platforms.length > 0 ? `\nplatforms: [${platforms.join(', ')}]` : ''
    const tagsStr = tags.length > 0 ? `\ntags: [${tags.join(', ')}]` : ''
    const frontmatter = `---
name: ${safeName}
description: ${description || ''}
watermark: v5.0.0
origin: ${origin}
provider: ${provider}${signatureLine}${platformStr}${tagsStr}
---
`
    const fullContent = frontmatter + '\n' + content
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(skillPath, fullContent, 'utf8')
    console.log(`[create-agent-skill] Created: ${skillPath} (origin: ${origin}${signatureLine ? ', signed' : ', unsigned'})`)
    return { success: true, path: skillPath, name: safeName }
  } catch (err) {
    console.error('[create-agent-skill] Failed:', err.message)
    return { success: false, error: err.message }
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.mark.agent')

  // Wire YouTube BrowserWindow track callback → renderer
  setOnTrackCallback((track) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('yt:track-updated', track)
    }
  })

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
    const markBrowserSession = session.fromPartition('persist:mark-browser')
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    blocker.enableBlockingInSession(ytSession)
    blocker.enableBlockingInSession(markBrowserSession)
    blocker.enableBlockingInSession(session.defaultSession)
    console.log('[Adblock] Brave-style adblocker aktif (persist:youtube + persist:mark-browser + default)')
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

  // WhatsApp bot: opt-in only — user starts via tray menu or IPC
  // Auto-start removed for security: bot can send messages on behalf of user

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
      label: 'Hidupkan WhatsApp Bot',
      click: () => startWhatsappBot(mainWindow)
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

  // PC Agent emergency stop: Ctrl+Shift+S
  globalShortcut.register('Control+Shift+S', () => {
    console.log('[PC-Agent] Emergency stop triggered via Ctrl+Shift+S')
    emergencyStop()
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

  // ===== SESSION KNOWLEDGE AUTO-SAVE =====
  ipcMain.handle('save-session-knowledge', async (_event, knowledge) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0]
      const dir = join(os.homedir(), '.mark', 'knowledge', 'sessions', dateStr)
      fs.mkdirSync(dir, { recursive: true })
      const fileName = `${knowledge.session.topic.replace(/\s+/g, '-').toLowerCase()}.json`
      const filePath = join(dir, fileName)
      fs.writeFileSync(filePath, JSON.stringify(knowledge, null, 2))
      console.log(`[Knowledge] Saved session knowledge: ${filePath}`)
      return { saved: true, path: filePath }
    } catch (err) {
      console.error('[Knowledge] Failed to save session knowledge:', err.message)
      return { saved: false, error: err.message }
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
    try {
      const parsed = new URL(url)
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
        console.warn(`[SECURITY] open-external blocked: ${parsed.protocol}//${parsed.host}`)
        return { blocked: true }
      }
      shell.openExternal(url)
    } catch {
      console.warn(`[SECURITY] open-external blocked (invalid URL): ${url?.slice(0, 100)}`)
    }
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
    return getRecentTracks(user || getGlobalConfig()?.lastfmUser || '')
  })
  ipcMain.handle('lastfm:get-top', async (_event, user) => {
    return await getTopTracks(user || getGlobalConfig()?.lastfmUser || '')
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
    const conf = getGlobalConfig() || {}
    const comboName = conf.customModel || 'mark'
    // resolveVisionModel is imported from ai-bridge at top of file
    return resolveVisionModel(comboName, role)
  })

  ipcMain.handle('vision:get-endpoint', (_event, modelId) => {
    const conf = getGlobalConfig() || {}
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

  // ===== YOUTUBE PLAYER (BrowserWindow, not webview) =====
  ipcMain.handle('yt:load', (_e, url) => { loadYouTube(url); return { success: true } })
  ipcMain.handle('yt:show', () => { showPlayer(); return { success: true } })
  ipcMain.handle('yt:hide', () => { hidePlayer(); return { success: true } })
  ipcMain.handle('yt:is-visible', () => isPlayerVisible())
  ipcMain.handle('yt:get-url', () => getPlayerUrl())
  ipcMain.handle('yt:close', () => { closePlayer(); return { success: true } })
  ipcMain.handle('yt:command', (_e, command) => { sendKeyboardCommand(command); return { success: true } })

  // ===== LINUX PC AGENT IPC =====
  ipcMain.handle('os:read', () => readDesktop())
  ipcMain.handle('os:click', (_e, query) => executeClick(query))
  ipcMain.handle('os:type', (_e, text) => executeType(text))
  ipcMain.handle('os:key', (_e, combo) => executeKey(combo))
  ipcMain.handle('os:scroll', (_e, query) => executeScroll(query))
  ipcMain.handle('os:open', (_e, name) => openApp(name))
  ipcMain.handle('os:list-windows', () => listWindows())
  ipcMain.handle('os:focus-window', (_e, title) => focusWindow(title))
  ipcMain.handle('os:ask-user', (_e, question) => askUserPC(question))
  ipcMain.handle('os:screenshot', (_e, path) => captureScreenshot(path))
  ipcMain.handle('os:ocr-region', (_e, x, y, w, h) => ocrRegion(x, y, w, h))
  ipcMain.handle('os:emergency-stop', () => emergencyStop())

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
