// Tauri bridge — pengganti preload/contextBridge (fase A migrasi).
// Menyediakan objek window.api dengan signature yang sama seperti sidecar/preload/index.js,
// tapi setiap panggilan di-routing ke:
//   - Rust native command   : window-state, dsb. (fase B)
//   - node_invoke (sidecar) : semua channel engine lama
// Event listener memakai Tauri event system (@tauri-apps/api/event).
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const call = async (action, ...args) => {
  const res = await invoke('node_invoke', { action, payload: args })
  if (!res?.success) throw new Error(res?.error || 'Sidecar error')
  return res.data
}
const callSafe = async (action, ...args) => {
  try {
    return await call(action, ...args)
  } catch (err) {
    console.warn(`[tauri-bridge] ${action}:`, err.message)
    return null
  }
}

// channel yang butuh akses file/OS → dikirim sebagai path string, bukan ArrayBuffer
const toPayload = (v) => {
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v))
  return v
}

const on = (channel) => (cb) => {
  let unlisten = null
  listen(channel, (e) => cb(e.payload)).then((un) => (unlisten = un))
  return () => unlisten?.()
}

const pathForFile = (file) => (typeof file === 'string' ? file : file?.path || '')

export const api = {
  // ---------- umum ----------
  getPathForFile: pathForFile,
  saveTempFile: (data, name) => call('save-temp-file', toPayload(data), name),
  openExternal: (url) => call('open-external', url),
  showNotification: (payload) => call('show-notification', payload),
  getDocumentsPath: () => call('app:get-documents-path'),
  getLiteMode: () => call('system:get-lite-mode').then((d) => d ?? { isLite: false }),
  ping: () => call('ping'),

  // ---------- AI ----------
  fetchAI: ({ messages, config, isSmallTask, jsonSchema }) =>
    invoke('node_invoke', {
      action: 'ai:fetch',
      payload: [{ messages, config, isSmallTask, jsonSchema }]
    }).then((res) => {
      if (!res?.success) throw Object.assign(new Error(res?.error || 'AI fetch gagal'), { code: 'AI_FETCH_ERROR' })
      return res.data
    }),
  abortFetchAI: () => call('ai:abort-fetch'),
  syncConfig: (config) => call('sync-config', config),
  runNodeFunction: (fn, ...args) => call(fn, ...args),

  // ---------- AI status stream ----------
  onAiStatus: on('ai:status'),

  // ---------- Awareness ----------
  getActivityBuffer: () => call('awareness:get-buffer'),
  clearActivityBuffer: () => call('awareness:clear-buffer'),

  // ---------- YouTube / Music ----------
  getYoutubeTranscript: (url) => call('get-youtube-transcript', url),
  searchYoutube: (q) => call('youtube-search', q),
  searchMusic: (q) => call('search-music', q),
  textToSpeech: (text, rate, pitch) => call('tts-speak', text, rate, pitch),
  sendRemoteMusicCommand: (command, payload) => call('remote-music-command', command, payload),
  onExecuteMusicCommand: on('execute-music-command'),
  onExecuteMusicCommandTg: (cb) =>
    on('execute-music-command-tg')((command, payload) => cb(command, payload)),
  tgTakeScreenshot: () => callSafe('tg:take-screenshot'),
  tgDownloadMusic: () => callSafe('tg:download-music'),
  tgPlayMusicUi: () => callSafe('tg:play-music-ui'),

  // ---------- Live audio shortcut ----------
  onLiveAudioShortcut: on('trigger-live-audio'),
  removeLiveAudioShortcut: () => {},

  // ---------- Telegram ----------
  tgStart: (token) => call('tg:start', token),
  tgStop: () => call('tg:stop'),
  tgGetStatus: () => call('tg:get-status'),
  tgGetHistory: () => call('tg:get-history'),
  onTgConnection: on('tg:connection'),
  onTgMessage: on('tg:message'),
  onTgReplySent: on('tg:reply-sent'),
  onTgThinking: on('tg:thinking'),
  onTgRequestAgentExecution: on('tg:request-agent-execution'),
  sendTgAgentExecutionDone: (data) => call('tg:agent-execution-done', data),
  tgSendMessage: (chatId, text) => call('tg:send-message', { chatId, text }),
  tgBroadcastToAdmins: (text) => call('tg:broadcast-to-admins', text),
  onTgCommandAccept: on('tg:command-accept'),
  onTgCommandAlways: on('tg:command-always'),
  onTgCommandReject: on('tg:command-reject'),
  removeTgListeners: () => {
    ;['tg:connection', 'tg:message', 'tg:reply-sent', 'tg:thinking'].forEach(() => {})
  },

  // ---------- Google Workspace ----------
  googleConnect: (clientId, clientSecret) => call('google:connect', clientId, clientSecret),
  googleDisconnect: () => call('google:disconnect'),
  googleStatus: () => call('google:status'),

  // ---------- Window controls (Rust native — fase B; v1 no-op aman) ----------
  windowMinimize: () => invoke('window_minimize').catch(() => {}),
  windowMaximize: () => invoke('window_maximize_toggle').catch(() => {}),
  windowFullscreen: () => invoke('window_fullscreen_toggle').catch(() => {}),
  windowClose: () => invoke('window_close').catch(() => {}),
  onWindowMaximized: on('window-maximized'),
  onWindowState: on('window-state'),
  getWindowState: () => invoke('window_get_state').catch(() => ({ isMaximized: false, isFullScreen: false })),

  // ---------- Native tools (AI tools) ----------
  executeNativeTool: (toolName, query, config) => call('native-tool:execute', toolName, query, config),
  checkToolApproval: (toolName, query) => call('native-tool:needs-approval', toolName, query),

  // ---------- Plugins (sidecar loader lama — fase C4 pindah Web Worker) ----------
  getPlugins: () => call('plugins:list'),
  executePlugin: (action, query) => call('plugin:execute', action, query),
  openPluginFolder: () => call('plugin:open-folder'),
  openSpecificFolder: (path) => call('plugin:open-specific-folder', path),
  reloadPlugins: () => call('plugin:reload'),
  createPlugin: (payload) => call('plugin:create', payload),
  togglePlugin: (name, isEnabled) => call('plugin:toggle', name, isEnabled),
  deletePlugin: (name) => call('plugin:delete', name),

  // ---------- Browser agent (fase C3) ----------
  browserNavigate: (url, sessionId = 'default') => call('browser:navigate', url, sessionId),
  browserReadDom: (sessionId = 'default') => call('browser:read-dom', sessionId),
  browserAction: (data, sessionId = 'default') => call('browser:action', data, sessionId),
  browserClose: (sessionId = 'default') => call('browser:close', sessionId),
  onBrowserPreview: on('browser:preview'),
  showBrowserWindow: (sessionId = 'default') => call('browser:show', sessionId),

  // ---------- PC automation (fase B6) ----------
  osRead: (...a) => call('os:read', ...a),
  osClick: (...a) => call('os:click', ...a),
  osType: (...a) => call('os:type', ...a),
  osKey: (...a) => call('os:key', ...a),
  osScroll: (...a) => call('os:scroll', ...a),
  osOpen: (...a) => call('os:open', ...a),
  osListWindows: () => call('os:list-windows'),
  osFocusWindow: (title) => call('os:focus-window', title),
  osAskUser: (prompt) => call('os:ask-user', prompt),

  // ---------- Skills ----------
  getSkills: () => call('skills:get-all'),
  readSkill: (name) => call('skills:read', name),
  saveSkill: (name, content) => call('skills:save', name, content),
  deleteSkill: (name) => call('skills:delete', name),
  installSkill: (sourcePath) => call('skills:install', sourcePath),
  getSkillTree: () => call('skills:get-tree'),
  readSkillFile: (name, relativePath) => call('skills:read-file', name, relativePath),
  saveSkillFile: (name, relativePath, content) => call('skills:save-file', name, relativePath, content),
  createSkillItem: (name, type, itemName) => call('skills:create-item', name, type, itemName),
  deleteSkillItem: (name, relativePath) => call('skills:delete-item', name, relativePath),
  renameSkillItem: (name, oldPath, newPath) => call('skills:rename-item', name, oldPath, newPath),
  onSkillsUpdated: on('skills-updated'),

  // ---------- Workspace RAG ----------
  workspaceIndex: (workspaceRoot) => call('workspace:index', workspaceRoot),
  workspaceQuery: (workspaceRoot, queryText, topK = 4) =>
    call('workspace:query', { workspaceRoot, queryText, topK }),
  workspaceGetMemory: (workspaceRoot) => call('workspace:get-memory', workspaceRoot),
  workspaceSaveMemory: (workspaceRoot, memoryData) =>
    call('workspace:save-memory', { workspaceRoot, memoryData }),
  workspaceEnsure: (workspaceRoot) => call('workspace:ensure', workspaceRoot),

  // ---------- Dialog ----------
  showOpenDialog: async (options = {}) => {
    const selected = await call('dialog:open-file')
    return selected ? { canceled: false, filePaths: [selected] } : { canceled: true, filePaths: [] }
  },
  selectDirectory: async () => await call('dialog:open-directory'),

  // ---------- Screenshot (fase B5 — crate screenshots) ----------
  takeScreenshot: () => call('take-screenshot')
}

// Pasang sebelum modul lain dieksekusi (dipanggil paling atas di main.jsx)
export function installTauriBridge() {
  window.api = api
  window.electron = undefined
}

installTauriBridge()
