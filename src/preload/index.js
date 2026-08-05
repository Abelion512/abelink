import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  fetchAI: (params) => ipcRenderer.invoke('ai:fetch', params),
  getModelHints: (modelName) => ipcRenderer.invoke('ai:model-hints', modelName),
  abortFetchAI: () => ipcRenderer.send('ai:abort-fetch'),
  syncConfig: (config) => ipcRenderer.send('sync-config', config),
  runNodeFunction: (data) => ipcRenderer.invoke('execute-node-task', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  getActivityBuffer: () => ipcRenderer.invoke('awareness:get-buffer'),
  clearActivityBuffer: () => ipcRenderer.send('awareness:clear-buffer'),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getYoutubeTranscript: (url) => ipcRenderer.invoke('get-youtube-transcript', url),
  getYoutubeData: (url) => ipcRenderer.invoke('youtube-embed-data', url),
  searchYoutube: (query) => ipcRenderer.invoke('youtube-search', query),
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  textToSpeech: (text, rate, pitch) => ipcRenderer.invoke('tts-speak', text, rate, pitch),
  onAiStatus: (callback) => {
    ipcRenderer.removeAllListeners('ai:status')
    ipcRenderer.on('ai:status', (event, message) => callback(message))
  },
  onLiveAudioShortcut: (callback) => ipcRenderer.on('trigger-live-audio', () => callback()),
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
  onExecuteMusicCommandWa: (callback) => {
    ipcRenderer.removeAllListeners('execute-music-command-wa')
    ipcRenderer.on('execute-music-command-wa', (event, command, payload) => callback(command, payload))
  },
  sendWaReady: undefined,
  waStart: () => ipcRenderer.send('wa:start'),
  waStop: () => ipcRenderer.send('wa:stop'),
  waGetStatus: () => ipcRenderer.invoke('wa:get-status'),
  waGetHistory: () => ipcRenderer.invoke('wa:get-history'),
  waLogout: () => ipcRenderer.invoke('wa:logout'),
  onWaQr: (cb) => ipcRenderer.on('wa:qr', (_, data) => cb(data)),
  onWaConnection: (cb) => ipcRenderer.on('wa:connection', (_, status) => cb(status)),
  onWaMessage: (cb) => ipcRenderer.on('wa:message', (_, data) => cb(data)),
  onWaReplySent: (cb) => ipcRenderer.on('wa:reply-sent', (_, data) => cb(data)),
  onWaThinking: (cb) => ipcRenderer.on('wa:thinking', (_, data) => cb(data)),
  onWaRequestWebSearch: (cb) => ipcRenderer.on('wa:request-web-search', (_, data) => cb(data)),
  sendWaSearchResult: (id, result) => ipcRenderer.send('wa:web-search-result', { id, result }),
  onWaAdminRequest: (cb) => {
    ipcRenderer.removeAllListeners('wa:admin-request')
    ipcRenderer.on('wa:admin-request', (_, data) => cb(data))
  },
  onWaRequestAgentExecution: (cb) => {
    ipcRenderer.removeAllListeners('wa:request-agent-execution')
    ipcRenderer.on('wa:request-agent-execution', (_, data) => cb(data))
  },
  sendWaAgentExecutionDone: (data) => ipcRenderer.send('wa:agent-execution-done', data),
  sendWaMessage: (jid, text) => ipcRenderer.invoke('wa:send-message', { jid, text }),
  
  // RAG Parsing
  parseDocument: (arrayBuffer, isDocx) => ipcRenderer.invoke('parse-document', arrayBuffer, isDocx),

  waTakeScreenshot: (jid, msgId) => ipcRenderer.send('wa:trigger-screenshot', { jid, msgId }),
  waDownloadMusic: (jid, msgId, query) => ipcRenderer.send('wa:trigger-music-download', { jid, msgId, query }),
  waPlayMusicUi: (command, query) => ipcRenderer.send('wa:trigger-music-ui', { command, query }),
  getPlugins: () => ipcRenderer.invoke('plugin:get-list'),
  executeNativeTool: (toolName, query) => ipcRenderer.invoke('native-tool:execute', toolName, query),
  checkToolApproval: (toolName, query) => ipcRenderer.invoke('native-tool:needs-approval', toolName, query),
  executePlugin: (action, query) => ipcRenderer.invoke('plugin:execute', action, query),
  openPluginFolder: () => ipcRenderer.invoke('plugin:open-folder'),
  openSpecificFolder: (path) => ipcRenderer.invoke('plugin:open-specific-folder', path),
  reloadPlugins: () => ipcRenderer.invoke('plugin:reload'),
  createPlugin: (payload) => ipcRenderer.invoke('plugin:create', payload),
  togglePlugin: (name, isEnabled) => ipcRenderer.invoke('plugin:toggle', name, isEnabled),
  deletePlugin: (name) => ipcRenderer.invoke('plugin:delete', name),
  removeWaListeners: () => {
    ['wa:qr', 'wa:connection', 'wa:message', 'wa:reply-sent', 'wa:thinking', 'wa:request-web-search', 'wa:admin-request', 'wa:request-agent-execution']
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

  // Agent Skills
  getAgentSkills: () => ipcRenderer.invoke('agent-skills:get-list'),
  getAgentSkillContent: (name) => ipcRenderer.invoke('agent-skills:get-content', name),
  reloadAgentSkills: () => ipcRenderer.invoke('agent-skills:reload'),
  createAgentSkill: (skillDef) => ipcRenderer.invoke('create-agent-skill', skillDef),
  onSkillsUpdated: (callback) => {
    ipcRenderer.removeAllListeners('agent-skills:updated')
    ipcRenderer.on('agent-skills:updated', () => callback())
  },

  // MPRIS D-Bus
  updateMprisTrack: (track, playing) => ipcRenderer.send('mpris:update-track', track, playing),
  setMprisPlaybackStatus: (playing) => ipcRenderer.send('mpris:set-status', playing),

  // Last.fm integration - listening history
  getRecentTracks: (user) => ipcRenderer.invoke('lastfm:get-recent', user),
  getTopTracks: (user) => ipcRenderer.invoke('lastfm:get-top', user),
  lastfmUpdateNowPlaying: (track, artist, album) => ipcRenderer.invoke('lastfm:update-now-playing', track, artist, album),
  lastfmScrobble: (track, artist, timestamp, album) => ipcRenderer.invoke('lastfm:scrobble', track, artist, timestamp, album),
  lastfmGetSessionKey: (username, password, apiKey, sharedSecret) => ipcRenderer.invoke('lastfm:get-session-key', username, password, apiKey, sharedSecret),

  // yt-dlp integration - metadata + audio from YT, TikTok, SoundCloud
  getYtdlInfo: (url) => ipcRenderer.invoke('ytdl:get-info', url),
  getYtdlAudio: (url) => ipcRenderer.invoke('ytdl:get-audio', url),
  searchYtdl: (query, limit) => ipcRenderer.invoke('ytdl:search', query, limit),

  // Vision model routing (registry-based)
  resolveVisionModel: (role) => ipcRenderer.invoke('vision:resolve-model', role),
  getModelEndpoint: (modelId) => ipcRenderer.invoke('vision:get-endpoint', modelId),

  // Config cache invalidation
  onConfigUpdated: (callback) => {
    ipcRenderer.removeAllListeners('config-updated')
    ipcRenderer.on('config-updated', () => callback())
  },

  // Session Knowledge
  saveSessionKnowledge: (knowledge) => ipcRenderer.invoke('save-session-knowledge', knowledge),

  // Tool Registry — Progressive Disclosure + Vector Discovery
  getToolCatalog: () => ipcRenderer.invoke('tool-catalog'),
  getToolCatalogForQuery: (query, maxResults) => ipcRenderer.invoke('tool-catalog-query', query, maxResults),
  getToolDetail: (name) => ipcRenderer.invoke('tool-detail', name),
  refreshTools: () => ipcRenderer.send('tool-refresh'),
  matchVoiceCommand: (text) => ipcRenderer.invoke('voice-fast-path', text),

  // Linux PC Agent (Desktop Automation)
  osRead: () => ipcRenderer.invoke('os:read'),
  osClick: (query) => ipcRenderer.invoke('os:click', query),
  osType: (text) => ipcRenderer.invoke('os:type', text),
  osKey: (combo) => ipcRenderer.invoke('os:key', combo),
  osScroll: (query) => ipcRenderer.invoke('os:scroll', query),
  osOpen: (name) => ipcRenderer.invoke('os:open', name),
  osListWindows: () => ipcRenderer.invoke('os:list-windows'),
  osFocusWindow: (title) => ipcRenderer.invoke('os:focus-window', title),
  osAskUser: (question) => ipcRenderer.invoke('os:ask-user', question),
  osScreenshot: (path) => ipcRenderer.invoke('os:screenshot', path),
  osOcrRegion: (x, y, w, h) => ipcRenderer.invoke('os:ocr-region', x, y, w, h),
  osEmergencyStop: () => ipcRenderer.invoke('os:emergency-stop'),

  // YouTube Player (BrowserWindow)
  ytLoad: (url) => ipcRenderer.invoke('yt:load', url),
  ytShow: () => ipcRenderer.invoke('yt:show'),
  showPlayer: () => ipcRenderer.invoke('yt:show'), // alias
  ytHide: () => ipcRenderer.invoke('yt:hide'),
  ytIsVisible: () => ipcRenderer.invoke('yt:is-visible'),
  ytGetUrl: () => ipcRenderer.invoke('yt:get-url'),
  ytClose: () => ipcRenderer.invoke('yt:close'),
  ytCommand: (command) => ipcRenderer.invoke('yt:command', command),
  ytGetDuration: () => ipcRenderer.invoke('yt:get-duration'),
  onYtTrackUpdated: (callback) => {
    ipcRenderer.removeAllListeners('yt:track-updated')
    ipcRenderer.on('yt:track-updated', (_event, track) => callback(track))
  }
}

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
