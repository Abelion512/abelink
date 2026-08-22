import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return file?.name || '' }
  },
  saveTempFile: (arrayBuffer, fileName) => ipcRenderer.invoke('save-temp-file', arrayBuffer, fileName),
  showOpenDialog: () => ipcRenderer.invoke('dialog:open-file'),
  fetchAI: (params) => ipcRenderer.invoke('ai:fetch', params),
  abortFetchAI: () => ipcRenderer.send('ai:abort-fetch'),
  syncConfig: (config) => ipcRenderer.send('sync-config', config),
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  getActivityBuffer: () => ipcRenderer.invoke('awareness:get-buffer'),
  getDocumentsPath: () => ipcRenderer.invoke('app:get-documents-path'),
  clearActivityBuffer: () => ipcRenderer.send('awareness:clear-buffer'),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url),
  searchYoutube: (query) => ipcRenderer.invoke('youtube-search', query),
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  textToSpeech: (text, rate, pitch) => ipcRenderer.invoke('tts-speak', text, rate, pitch),
  onAiStatus: (callback) => {
    ipcRenderer.removeAllListeners('ai:status')
    ipcRenderer.on('ai:status', (event, message) => callback(message))
  },
  onLiveAudioShortcut: (callback) => ipcRenderer.on('trigger-live-audio', (event, action) => callback(event, action)),
  removeLiveAudioShortcut: () => ipcRenderer.removeAllListeners('trigger-live-audio'),
  getPreloadPath: (filename) => {
    const path = require('path')
    const url = require('url')
    return url.pathToFileURL(path.join(__dirname, filename)).href
  },
  sendRemoteMusicCommand: (command, payload) => ipcRenderer.send('remote-music-command', command, payload),
  onExecuteMusicCommand: (callback) => {
    ipcRenderer.removeAllListeners('execute-music-command')
    ipcRenderer.on('execute-music-command', (event, command, payload) => callback(command, payload))
  },
  onExecuteMusicCommandTg: (callback) => {
    ipcRenderer.removeAllListeners('execute-music-command-tg')
    ipcRenderer.on('execute-music-command-tg', (event, command, payload) => callback(command, payload))
  },
  tgStart: (token) => ipcRenderer.send('tg:start', token),
  tgStop: () => ipcRenderer.send('tg:stop'),
  tgGetStatus: () => ipcRenderer.invoke('tg:get-status'),
  tgGetHistory: () => ipcRenderer.invoke('tg:get-history'),
  onTgConnection: (cb) => ipcRenderer.on('tg:connection', (_, status) => cb(status)),
  onTgMessage: (cb) => ipcRenderer.on('tg:message', (_, data) => cb(data)),
  onTgReplySent: (cb) => ipcRenderer.on('tg:reply-sent', (_, data) => cb(data)),
  onTgThinking: (cb) => ipcRenderer.on('tg:thinking', (_, data) => cb(data)),
  onTgRequestAgentExecution: (cb) => {
    ipcRenderer.removeAllListeners('tg:request-agent-execution')
    ipcRenderer.on('tg:request-agent-execution', (_, data) => cb(data))
  },
  sendTgAgentExecutionDone: (data) => ipcRenderer.send('tg:agent-execution-done', data),
  tgSendMessage: (chatId, text) => ipcRenderer.invoke('tg:send-message', { chatId, text }),
  tgBroadcastToAdmins: (text) => ipcRenderer.send('tg:broadcast-to-admins', text),
  
  // RAG Parsing
  parseDocument: (arrayBuffer, isDocx) => ipcRenderer.invoke('parse-document', arrayBuffer, isDocx),

  // Google Workspace
  googleConnect: (clientId, clientSecret) => ipcRenderer.invoke('google:connect', clientId, clientSecret),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  googleStatus: () => ipcRenderer.invoke('google:status'),

  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (event, isMaximized) => callback(isMaximized))
  },

  tgTakeScreenshot: (chatId) => ipcRenderer.send('tg:trigger-screenshot', { chatId }),
  tgDownloadMusic: (chatId, query) => ipcRenderer.send('tg:trigger-music-download', { chatId, query }),
  tgPlayMusicUi: (command, query) => ipcRenderer.send('tg:trigger-music-ui', { command, query }),
  getPlugins: () => ipcRenderer.invoke('plugin:get-list'),
  executeNativeTool: (toolName, query, config) => ipcRenderer.invoke('native-tool:execute', toolName, query, config),
  checkToolApproval: (toolName, query) => ipcRenderer.invoke('native-tool:needs-approval', toolName, query),
  executePlugin: (action, query) => ipcRenderer.invoke('plugin:execute', action, query),
  openPluginFolder: () => ipcRenderer.invoke('plugin:open-folder'),
  openSpecificFolder: (path) => ipcRenderer.invoke('plugin:open-specific-folder', path),
  reloadPlugins: () => ipcRenderer.invoke('plugin:reload'),
  createPlugin: (payload) => ipcRenderer.invoke('plugin:create', payload),
  togglePlugin: (name, isEnabled) => ipcRenderer.invoke('plugin:toggle', name, isEnabled),
  deletePlugin: (name) => ipcRenderer.invoke('plugin:delete', name),
  removeTgListeners: () => {
    ['tg:connection', 'tg:message', 'tg:reply-sent', 'tg:thinking']
      .forEach(ch => ipcRenderer.removeAllListeners(ch))
  },
  
  // Browser Automation
  browserNavigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  browserReadDom: () => ipcRenderer.invoke('browser:read-dom'),
  browserAction: (data) => ipcRenderer.invoke('browser:action', data),
  browserClose: () => ipcRenderer.invoke('browser:close'),
  onBrowserPreview: (cb) => {
    ipcRenderer.removeAllListeners('browser:preview')
    ipcRenderer.on('browser:preview', (_, data) => cb(data))
  },
  showBrowserWindow: () => ipcRenderer.send('browser:show'),
  osRead: () => ipcRenderer.invoke('os:read'),
  osClick: (query) => ipcRenderer.invoke('os:click', query),
  osType: (query) => ipcRenderer.invoke('os:type', query),
  osKey: (combo) => ipcRenderer.invoke('os:key', combo),
  osScroll: (query) => ipcRenderer.invoke('os:scroll', query),
  osOpen: (target) => ipcRenderer.invoke('os:open', target),
  osListWindows: () => ipcRenderer.invoke('os:list-windows'),
  osFocusWindow: (title) => ipcRenderer.invoke('os:focus-window', title),
  osAskUser: (query) => ipcRenderer.invoke('os:ask-user', query)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
