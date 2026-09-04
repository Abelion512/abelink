// Tauri bridge — pengganti preload/contextBridge (fase A migrasi).
// Menyediakan objek window.api dengan signature yang sama seperti sidecar/preload/index.js,
// tapi setiap panggilan di-routing ke:
//   - Rust native command   : window-state, file-ops (cmd_fs), lite & misc (cmd_misc)
//   - node_invoke (sidecar) : sisa channel engine lama
// Event listener memakai Tauri event system (@tauri-apps/api/event).
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { splitTgAdminIds } from '../utils/telegramTargets'
import { stripDataUrlPrefix } from '../utils/dataUrl'

// ---- FB#1: router file-ops -> Rust cmd_fs ----
// Query format AI tools: "path||arg2||arg3"
function routeFsTool(toolName, query) {
  const parts = String(query ?? '')
    .split('||')
    .map((x) => x.trim())
  const ws = undefined // Rust pakai XDG workspace root sendiri
  switch (toolName) {
    case 'read-file': {
      const [, sLine, eLine] = parts
      return invoke('fs_read_file', {
        path: parts[0],
        startLine: sLine ? Number(sLine) : null,
        endLine: eLine ? Number(eLine) : null
      })
    }
    case 'write-file': {
      if (parts.length < 2)
        return Promise.resolve({ success: false, message: 'Format: path||isi_file' })
      return invoke('fs_write_file', { path: parts[0], content: parts.slice(1).join('||') })
    }
    case 'delete-file':
      return invoke('fs_delete_file', { path: parts[0] })
    case 'list-dir':
      return invoke('fs_list_dir', { path: parts[0] ?? '' })
    case 'grep-search': {
      if (parts.length < 2)
        return Promise.resolve({ success: false, message: 'Format: path_folder||keyword' })
      return invoke('fs_grep_search', { dir: parts[0], keyword: parts[1] })
    }
    case 'run-shell': {
      const [, cwd] = parts
      return invoke('tools_run_shell', { query: parts[0], cwd: cwd || null })
    }
    default:
      return null
  }
}

// rtk-style: potong output tool yang kegedean sebelum masuk konteks AI
const clampData = (data, max = 20000) => {
  if (typeof data === 'string' && data.length > max) {
    return data.slice(0, max) + `\n\n…[output dipotong ${data.length} → ${max} chars — rtk-style]`
  }
  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (typeof data[k] === 'string') data[k] = clampData(data[k], max)
    }
  }
  return data
}

const call = async (action, ...args) => {
  const res = await invoke('node_invoke', { action, payload: args })
  if (!res?.success) {
    const errText =
      typeof res?.error === 'string' ? res.error : res?.error?.message || 'Sidecar error'
    throw new Error(errText)
  }
  return clampData(res.data)
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

// ---------- Screenshot → Telegram (jalur NATIVE Rust, tanpa sidecar) ----------
// Kembalikan { sent, results } agar pemanggil tool AI bisa melaporkan hasil
// nyata (jumlah admin yang menerima) — dulu string tak terverifikasi.
// chatId eksplisit menang; tanpa itu broadcast ke semua admin terdaftar.
const tgScreenshotToTelegram = async (chatId) => {
  if (!(await tgConnected())) return { sent: 0, skipped: true }
  const pngDataUrl = await invoke('misc_take_screenshot')
  // misc_take_screenshot mengembalikan data URL penuh; Rust mendecode base64
  // murni — prefix harus dibuang dulu (regresi dulu: decode gagal selalu).
  const pngBase64 = stripDataUrlPrefix(pngDataUrl)
  if (!pngBase64) return { sent: 0, error: 'Screenshot gagal atau kosong' }
  const targets = chatId ? [String(chatId)] : tgAdminIdsCache.targets
  if (targets.length === 0) return { sent: 0, error: 'Tidak ada admin Telegram terdaftar' }
  const results = []
  for (const target of targets) {
    try {
      await invoke('telegram_send_photo', {
        chatId: target,
        pngBase64,
        caption: 'Layar PC (dikirim oleh Mark)'
      })
      results.push({ id: target, ok: true })
    } catch (e) {
      results.push({ id: target, ok: false, error: e?.message || String(e) })
    }
  }
  return { sent: results.filter((r) => r.ok).length, results }
}

// Pola disposed-flag: kalau unsubscribe dipanggil sebelum listen() resolve,
// unlisten hasil promise langsung dieksekusi agar tidak bocor.
const on = (channel) => (cb) => {
  let disposed = false
  let unlisten = null
  let cleanedUp = false
  listen(channel, (e) => cb(e.payload)).then((un) => {
    if (cleanedUp) return
    if (disposed) un()
    else unlisten = un
  })
  return () => {
    if (cleanedUp) return
    cleanedUp = true
    disposed = true
    unlisten?.()
  }
}

const pathForFile = (file) => (typeof file === 'string' ? file : file?.path || '')

// ---------- Telegram ----------
// Cache status koneksi bot beberapa detik agar guard tgSendMessage/tgBroadcast
// tidak menambah satu round-trip IPC (tg:get-status) di setiap pesan.
// targets: ID admin yang diparse dari config terakhir (satu sumber dengan
// splitTgAdminIds) — dipakai screenshot-to-tg saat tanpa chatId eksplisit.
let tgStatusCache = { connected: false, at: 0 }
let tgAdminIdsCache = { targets: [], at: 0 }
const TG_STATUS_TTL_MS = 5000
const tgConnected = async () => {
  const now = Date.now()
  if (now - tgStatusCache.at < TG_STATUS_TTL_MS) return tgStatusCache.connected
  try {
    const st = await call('tg:get-status')
    tgStatusCache = { connected: !!st && st.status === 'connected', at: now }
  } catch (_) {
    tgStatusCache = { connected: false, at: now }
  }
  return tgStatusCache.connected
}
// Semua unlisten Telegram dikumpulkan di sini supaya removeTgListeners benar-benar bekerja
const tgUnlisteners = []
const trackTgListener = (dispose) => {
  tgUnlisteners.push(dispose)
  return dispose
}
const onTg = (channel) => (cb) => trackTgListener(on(channel)(cb))

export const api = {
  // ---------- umum (Fase B0: langsung Rust native, tanpa node_invoke) ----------
  getPathForFile: pathForFile,
  saveTempFile: (data, name) =>
    invoke('misc_save_temp_file', { data: toPayload(data), name: name ?? null }),
  osIsX11: () => invoke('os_is_x11'),
  openExternal: (url) => invoke('misc_open_external', { url }),
  showNotification: (...args) => {
    // Dua gaya pemanggil lama di renderer: ({title, body}) ATAU (title, body) posisional.
    // Versi sidecar lama kehilangan body saat pemanggil posisional — di sini diperbaiki.
    const [a, b] = args
    const title = typeof a === 'string' ? a : a?.title
    const body = typeof b === 'string' ? b : a?.body
    return invoke('misc_show_notification', { title: title ?? null, body: body ?? null })
  },
  getDocumentsPath: () => invoke('misc_get_documents_path'),
  getLiteMode: () => invoke('misc_get_lite_mode').then((d) => d ?? { isLite: false }),
  // Konfirmasi native (rfd di Rust main thread) untuk aksi berisiko non-sidecar.
  nativeConfirm: (message) => invoke('misc_native_confirm', { message }),
  // Fetch resource web via native (validasi SSRF + tanpa CORS renderer).
  fetchWebResource: (url) => invoke('misc_fetch_web_resource', { url }),

  // ---------- Capability Manager (general-pluggable connectors) ----------
  // Referensi desain: Claude connectors/plugins (catalog -> connection ->
  // action schema -> execution -> policy -> audit). Katalog hidup di sidecar;
  // renderer hanya membaca metadata & mengeksekusi via channel.
  listCapabilities: () => call('capabilities:list'),
  inspectCapability: (connectorId) => call('capabilities:inspect', connectorId),
  capabilityGuide: (connectorId, actionId) => call('capabilities:guide', connectorId, actionId),
  executeCapability: (connectorId, actionId, args, opts) =>
    call('capabilities:execute', connectorId, actionId, args, opts || {}),
  listCapabilityConnections: () => call('capabilities:connections'),
  authorizeCapability: (connectorId, grantedScopes) =>
    call('capabilities:authorize', connectorId, grantedScopes),
  revokeCapability: (connectorId) => call('capabilities:revoke', connectorId),
  readCapabilityAudit: (limit) => call('capabilities:audit', limit),
  getSystemInfo: () => invoke('system_get_info'),
  ping: () => call('ping'),

  // ---------- AI ----------
  fetchAI: ({ messages, config, isSmallTask, jsonSchema }) =>
    invoke('node_invoke', {
      action: 'ai:fetch',
      payload: [{ messages, config, isSmallTask, jsonSchema }]
    }).then((res) => {
      if (!res?.success)
        throw Object.assign(new Error(res?.error || 'AI fetch gagal'), { code: 'AI_FETCH_ERROR' })
      return res.data
    }),
  abortFetchAI: () => call('ai:abort-fetch'),
  syncConfig: (config) => {
    // Bridge token ke native Rust (telegram_send_message/broadcast/sendPhoto).
    // Tanpa ini perintah telegram_* selalu gagal "token kosong" karena tidak ada
    // satu pun pemanggil telegram_configure sebelumnya.
    const token = String(config?.tgBotToken ?? '').trim()
    if (token) {
      invoke('telegram_configure', { token }).catch(() => {})
    }
    // Parse ID admin sekali di sini; dipakai broadcast & screenshot-to-tg.
    tgAdminIdsCache = { targets: splitTgAdminIds(config?.tgAdminIds), at: Date.now() }
    return call('sync-config', config)
  },
  // Deteksi daftar model dari endpoint custom (GET /models via sidecar).
  detectCustomModels: (endpoint, apiKey, protocol) =>
    call('ai:list-models', endpoint || '', apiKey || '', protocol || 'auto'),
  runNodeFunction: (fn, ...args) => call(fn, ...args),

  // ---------- AI status stream ----------
  onAiStatus: on('ai:status'),

  // ---------- Awareness ----------
  getActivityBuffer: () => invoke('awareness_get_buffer'),
  clearActivityBuffer: () => invoke('awareness_clear_buffer'),

  // ---------- YouTube / Music ----------
  getYoutubeTranscript: (url) => call('get-youtube-transcript', url),
  searchYoutube: (q) => call('youtube-search', q),
  searchMusic: (q) => call('search-music', q),
  textToSpeech: (text, rate, pitch) => call('tts-speak', text, rate, pitch),
  sendRemoteMusicCommand: (command, payload) => call('remote-music-command', command, payload),
  onExecuteMusicCommand: on('execute-music-command'),
  // onExecuteMusicCommandTg dihapus: emit 'execute-music-command-tg' mati
  // bersama botWindow era Electron (9923989) dan tidak punya konsumen.

  // --- YouTube Music player bridge (Electron parity) ---
  // Load YouTube URL in dedicated hidden window
  ytLoad: (url) => call('yt:load', url),
  // Show the YouTube player window
  ytShow: () => call('yt:show'),
  // Hide the YouTube player window
  ytHide: () => call('yt:hide'),
  // Send keyboard/mouse commands to YouTube player
  ytCommand: (command) => call('yt:command', command),
  // Get current track duration
  ytGetDuration: () => call('yt:get-duration'),
  // Track metadata updates from main process
  onYtTrackUpdated: on('yt:track-updated'),
  // Play/pause state sync (real video element state)
  onYtPlayState: on('yt:play-state'),
  // Native repeat mode sync (NONE/ALL/ONE)
  onYtRepeatState: on('yt:repeat-state'),
  // Screenshot → Telegram via jalur NATIVE (misc_take_screenshot +
  // telegram_send_photo). Channel sidecar lama tg:take-screenshot sudah tidak
  // punya handler sejak pembersihan electron (9923989).
  // tgDownloadMusic/tgPlayMusicUi dihapus: tanpa konsumen & tanpa backend.
  tgTakeScreenshot: (chatId) => tgScreenshotToTelegram(chatId),

  // ---------- Live audio shortcut ----------
  onLiveAudioShortcut: on('trigger-live-audio'),
  removeLiveAudioShortcut: () => {},

  // ---------- Telegram ----------
  tgStart: (token) => call('tg:start', token),
  tgStop: () => call('tg:stop'),
  tgGetStatus: () => call('tg:get-status'),
  tgGetHistory: () => call('tg:get-history'),
  onTgConnection: onTg('tg:connection'),
  onTgMessage: onTg('tg:message'),
  onTgReplySent: onTg('tg:reply-sent'),
  onTgThinking: onTg('tg:thinking'),
  onTgRequestAgentExecution: onTg('tg:request-agent-execution'),
  sendTgAgentExecutionDone: (data) => call('tg:agent-execution-done', data),
  tgSendMessage: async (chatId, text) => {
    // Skip silently if bot not configured — prevents 3x "token kosong" errors per session
    // when ApprovalContext sends status messages before user configures the bot.
    if (!(await tgConnected())) return { skipped: true }
    return invoke('telegram_send_message', { chatId, text })
  },
  tgBroadcastToAdmins: async (text) => {
    // Guard di satu titik: bot tidak terhubung = no-op sunyi, bukan rejection
    // yang menyulut unhandled promise rejection tiap giliran agen.
    if (!(await tgConnected())) return { skipped: true }
    // Broadcast lewat telegram_send_message per ID admin hasil parse config.
    // telegram_broadcast_to_admins native bergantung pada chat_ids state Rust
    // yang hanya terisi via telegram_register_admin_chat — channel yang tidak
    // pernah dipanggil renderer; loop di sini meniru perilaku broadcast sidecar.
    const targets = tgAdminIdsCache.targets
    if (targets.length === 0) return { skipped: true, reason: 'no-admin-ids' }
    const results = []
    for (const id of targets) {
      try {
        await invoke('telegram_send_message', { chatId: id, text })
        results.push({ id, ok: true })
      } catch (e) {
        results.push({ id, ok: false, error: e?.message || String(e) })
      }
    }
    return { sent: results.filter((r) => r.ok).length, results }
  },
  onTgCommandAccept: onTg('tg:command-accept'),
  onTgCommandAlways: onTg('tg:command-always'),
  onTgCommandReject: onTg('tg:command-reject'),
  removeTgListeners: () => {
    while (tgUnlisteners.length > 0) {
      try {
        tgUnlisteners.pop()()
      } catch {
        // Abaikan error cleanup individual — lanjut ke listener berikutnya
      }
    }
  },

  // ---------- Google Workspace ----------
  googleConnect: (clientId, clientSecret) => call('google:connect', clientId, clientSecret),
  googleDisconnect: () => call('google:disconnect'),
  googleStatus: () => call('google:status'),

  // ---------- Window controls (Rust native) ----------
  windowMinimize: () => invoke('window_minimize'),
  windowMaximize: () => invoke('window_maximize_toggle'),
  windowFullscreen: () => invoke('window_fullscreen_toggle'),
  windowClose: () => invoke('window_close'),
  onWindowMaximized: on('window-maximized'),
  onWindowState: on('window-state'),
  getWindowState: () => invoke('window_get_state'),

  // ---------- Native tools (AI tools) ----------
  // FB#1: file-ops langsung ke Rust (std::fs) — tidak lewat sidecar lagi
  executeNativeTool: async (toolName, query, config) => {
    const t0 = Date.now()
    let result,
      error = null
    try {
      const fsRoute = routeFsTool(toolName, query)
      result = fsRoute ?? (await call('native-tool:execute', toolName, query, config))
    } catch (e) {
      error = e.message
      throw e
    } finally {
      try {
        const h = await import('./harness')
        h.logToolCall({
          tool: toolName,
          query: String(query).slice(0, 200),
          durMs: Date.now() - t0,
          ok: !error && result?.success !== false,
          error
        })
      } catch (_) {}
    }
    return result
  },
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

  // ---------- PC automation (fase B2 — native Rust xdotool) ----------
  osRead: () => invoke('os_read'),
  osClick: (q) => invoke('os_click', { query: q }),
  osType: (text) => invoke('os_type', { text }),
  osKey: (key) => invoke('os_key', { key }),
  osScroll: (q) => invoke('os_scroll', { query: q }),
  osOpen: (path) => invoke('os_open', { query: path }),
  osListWindows: () => invoke('os_list_windows'),
  osFocusWindow: (title) => invoke('os_focus_window', { query: title }),
  osAskUser: (prompt) => invoke('os_ask', { prompt }),
  // Emergency stop (Ctrl+Shift+S) — teruskan ke sidecar pc-agent agar daemon
  // / child process otomasi PC ikut dikill, bukan hanya AI loop di renderer.
  pcEmergencyStop: () => call('os:emergency-stop'),
  onPcEmergencyStop: on('pc-emergency-stop'),

  // ---------- Skills ----------
  getSkills: () => call('skills:get-all'),
  readSkill: (name) => call('skills:read', name),
  saveSkill: (name, content) => call('skills:save', name, content),
  deleteSkill: (name) => call('skills:delete', name),
  installSkill: (sourcePath) => call('skills:install', sourcePath),
  // Buka folder store skills di file manager OS — drop folder <nama>/SKILL.md
  // ke sini, lalu auto-scan mendeteksinya saat refresh (tanpa import wizard).
  openSkillsFolder: () => call('skills:open-folder'),
  getSkillTree: () => call('skills:get-tree'),
  readSkillFile: (name, relativePath) => call('skills:read-file', name, relativePath),
  saveSkillFile: (name, relativePath, content) =>
    call('skills:save-file', name, relativePath, content),
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

  // ---------- Document parsing (RAG) ----------
  // Kontrak payload sidecar: [0] = base64 string (bisa juga numeric array), [1] = isDocx boolean.
  // ArrayBuffer dikonversi chunked btoa over Uint8Array supaya aman dari limit argumen apply.
  parseDocument: (arrayBuffer, isDocx) => {
    const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer ?? 0)
    const CHUNK = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
      )
    }
    return call('parse-document', btoa(binary), !!isDocx)
  },

  // ---------- Lite Mode & WhatsApp music ----------
  onLiteModeChanged: on('lite-mode-changed'),
  onExecuteMusicCommandWa: on('execute-music-command-wa'),

  // ---------- Dialog (Fase B5 dipercepat: rfd native di main thread Rust) ----------
  showOpenDialog: async () => {
    const selected = await invoke('misc_open_file_dialog')
    return selected ? { canceled: false, filePaths: [selected] } : { canceled: true, filePaths: [] }
  },
  // Multi-select native: batal = { canceled: true, filePaths: [] }.
  // Pemanggil TIDAK boleh fallback ke <input type=file> saat canceled,
  // agar dialog tidak terbuka dua kali (bug lama di InputBar).
  showOpenFilesDialog: async () => {
    const paths = await invoke('misc_open_files_dialog')
    const list = Array.isArray(paths) ? paths : []
    return { canceled: list.length === 0, filePaths: list }
  },
  // Metadata file/directory (size bytes, isDir, mtime) untuk preview lampiran.
  statPath: (path) => invoke('misc_stat_path', { path }),
  selectDirectory: () => invoke('misc_open_directory_dialog'),

  // ---------- Legacy memory migration (MEM) ----------
  legacyDetectProfiles: () => invoke('fs_detect_legacy_profiles'),
  legacyImportPickAndRead: async () => {
    try {
      return await invoke('fs_import_pick_and_read')
    } catch (e) {
      if (String(e).includes('__canceled__')) return null
      throw e
    }
  },

  // ---------- Screenshot (Fase B5 native — rute Rust) ----------
  takeScreenshot: () => invoke('misc_take_screenshot'),

  // ---------- Git tools (native Rust — mengganti sidecar git-service) ----------
  executeShell: (query, cwd) => invoke('tools_run_shell', { query, cwd: cwd || null }),
  gitStatus: (query) => invoke('git_status', { cwd: query || null }),
  gitDiff: (query) => invoke('git_diff', { cwd: null, range: query || null }),
  gitCommit: (query) => {
    const parts = (query || '').split('||')
    return invoke('git_commit', { message: parts[0], cwd: parts[1] || null })
  },
  gitRevert: (query) => invoke('git_revert', { target: query, cwd: null }),
  runTask: (query) => {
    const parts = (query || '').split('||')
    return invoke('run_task', { taskId: parts[0], command: parts.slice(1).join('||'), cwd: null })
  },
  readTaskOutput: (query) => {
    const parts = (query || '').split('||')
    return invoke('read_task_output', { taskId: parts[0], lines: parts[1] ? Number(parts[1]) : 40 })
  },
  killTask: (taskId) => invoke('kill_task', { taskId }),
  listTasks: () => invoke('list_tasks')
}

// Pasang sebelum modul lain dieksekusi (dipanggil paling atas di main.jsx)
export function installTauriBridge() {
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

  if (!isTauri) {
    // Mode browser (vite dibuka tanpa shell Tauri): API native tidak ada.
    // Pasang stub ramah — tanpa dinding error, cukup satu peringatan.
    let warned = false
    const warnOnce = () => {
      if (!warned) {
        warned = true
        console.warn(
          '[tauri-bridge] Mode browser: API native nonaktif. Jalankan `bun tauri dev` untuk app penuh.'
        )
      }
    }
    const noop = async () => {
      warnOnce()
      return null
    }
    window.api = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (typeof key === 'string' && key.startsWith('on')) {
            return (cb) => {
              warnOnce()
              return () => {}
            }
          }
          warnOnce()
          return noop
        }
      }
    )

    // Ganti seluruh halaman dengan papan pengumuman — tab browser BUKAN app.
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;background:#0b0f0c;color:#e5e7eb;display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:2rem;z-index:999999">
        <div style="max-width:560px;border:1px solid #2a3a2f;border-radius:16px;padding:2rem;background:#101713">
          <h1 style="margin:0 0 .5rem;font-size:1.3rem;color:#4ade80">MARK berjalan di window terpisah</h1>
          <p style="margin:0 0 1rem;line-height:1.6;opacity:.85">
            Tab browser ini hanya <b>preview frontend</b> — tanpa API native, tanpa engine.
          </p>
          <p style="margin:0 0 .5rem">Jalankan aplikasi asli dari folder proyek:</p>
          <pre style="background:#0b0f0c;border:1px solid #2a3a2f;border-radius:8px;padding:.75rem 1rem;overflow:auto"><code>bun tauri dev</code></pre>
          <p style="margin:.75rem 0 0;opacity:.6;font-size:.85rem">Window berjudul <b>MARK</b> akan muncul terpisah dari browser ini.</p>
        </div>
      </div>
      <div id="root" style="display:none"></div>`
    return
  }

  window.api = api
  window.electron = undefined

  // Frameless drag: konversi style -webkit-app-region: drag -> data-tauri-drag-region
  const upgrade = (root) =>
    root
      .querySelectorAll?.('[style*="-webkit-app-region: drag"], [style*="-webkit-app-region:drag"]')
      .forEach((el) => {
        el.removeAttribute('style')
        el.setAttribute('data-tauri-drag-region', '')
        el.style.setProperty('-webkit-app-region', 'no-drag')
      })
  const mo = new MutationObserver(() => {
    document.querySelectorAll('[data-tauri-drag-region]').forEach((el) => {
      if (!el.dataset.dragWired) {
        el.dataset.dragWired = '1'
        el.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest('button, input, textarea, a')) return
          window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging')
        })
      }
    })
    upgrade(document.body)
  })
  document.addEventListener('DOMContentLoaded', () => {
    upgrade(document.body)
    mo.observe(document.body, { childList: true, subtree: true })
  })
}

installTauriBridge()
