// Tauri bridge — pengganti preload/contextBridge (fase A migrasi).
// Menyediakan objek window.api dengan signature yang sama seperti sidecar/preload/index.js,
// tapi setiap panggilan di-routing ke:
//   - Rust native command   : window-state, file-ops (cmd_fs), lite & misc (cmd_misc)
//   - node_invoke (sidecar) : sisa channel engine lama
// Event listener memakai Tauri event system (@tauri-apps/api/event).
//
// W2-1 (js-to-ts-spec.md): rename + tipe — file .ts PERTAMA di src/** (memicu
// pembuatan tsconfig.renderer.json, B-20). Tipe payload union per aksi belum
// lengkap: facade dianotasi pragmatis, Window['api'] diambil dari typeof api.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { splitTgAdminIds } from '../utils/telegramTargets'
import { stripDataUrlPrefix } from '../utils/dataUrl'
import { friendlyAiFetchError, type AiBridgeResponse } from './ai/fetchError'

/** Config yang mengalir ke tool calls (subset yang dibaca bridge). */
type ToolConfig = {
  workspaceRoot?: string | null
  turnId?: string
  sessionId?: string
  turn?: unknown
} & Record<string, unknown>

/** Bentuk frame respons node_invoke (registry.ts sidecar). */
type NodeInvokeResult = {
  success?: unknown
  data?: unknown
  error?: unknown
} | null

type UnlistenFn = () => void
type OnFn = (cb: (payload: unknown) => void) => UnlistenFn

// ---- FB#1: router file-ops -> Rust cmd_fs ----
// Query format AI tools: "path||arg2||arg3"
// workspaceRoot (absolute project dir) travels in config — Rust confines
// every path to it via resolve_contained (canonicalize + prefix check);
// null falls back to the XDG workspace root.
function routeFsTool(
  toolName: string,
  query: unknown,
  config: ToolConfig | null | undefined
): Promise<unknown> | null {
  const parts = String(query ?? '')
    .split('||')
    .map((x) => x.trim())
  const ws = (config?.workspaceRoot as string | null | undefined) ?? null
  switch (toolName) {
    case 'read-file': {
      const [, sLine, eLine] = parts
      return invoke('fs_read_file', {
        path: parts[0],
        startLine: sLine ? Number(sLine) : null,
        endLine: eLine ? Number(eLine) : null,
        workspaceRoot: ws
      })
    }
    case 'write-file': {
      if (parts.length < 2)
        return Promise.resolve({ success: false, message: 'Format: path||isi_file' })
      return invoke('fs_write_file', {
        path: parts[0],
        content: parts.slice(1).join('||'),
        workspaceRoot: ws
      })
    }
    case 'delete-file':
      return invoke('fs_delete_file', { path: parts[0], workspaceRoot: ws })
    case 'list-dir':
      return invoke('fs_list_dir', { path: parts[0] ?? '', workspaceRoot: ws })
    case 'grep-search': {
      if (parts.length < 2)
        return Promise.resolve({ success: false, message: 'Format: path_folder||keyword' })
      return invoke('fs_grep_search', { dir: parts[0], keyword: parts[1], workspaceRoot: ws })
    }
    case 'run-shell': {
      const [, cwd] = parts
      return invoke('tools_run_shell', { query: parts[0], cwd: cwd || null, workspaceRoot: ws })
    }
    default:
      return null
  }
}

// rtk-style: potong output tool yang kegedean sebelum masuk konteks AI.
// Payload media (data-URL audio/gambar) JANGAN dipotong: dipotong = korup
// (atob/Image melempar InvalidCharacterError — bug tes suara Config).
const clampData = (data: unknown, max = 20000): unknown => {
  if (typeof data === 'string') {
    if (/^data:(audio|image)\//.test(data)) return data
    if (data.length > max) {
      return data.slice(0, max) + `\n\n…[output dipotong ${data.length} → ${max} chars — rtk-style]`
    }
    return data
  }
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>
    for (const k of Object.keys(rec)) {
      if (typeof rec[k] === 'string') rec[k] = clampData(rec[k], max)
    }
  }
  return data
}

const isAutomationAction = (action: unknown): boolean => {
  if (typeof action !== 'string') return false
  return (
    action.startsWith('browser:') ||
    action.startsWith('os:') ||
    action === 'run-shell' ||
    action === 'run-bash' ||
    action.startsWith('tools_run_shell')
  )
}

const call = async (action: string, ...args: unknown[]): Promise<unknown> => {
  const isAuto = isAutomationAction(action)
  if (isAuto && typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('abelink:automation-start', { detail: { action } }))
  }
  try {
    const res = (await invoke('node_invoke', { action, payload: args })) as NodeInvokeResult
    if (!res?.success) {
      const errText =
        typeof res?.error === 'string'
          ? res.error
          : (res?.error as { message?: string } | undefined)?.message || 'Sidecar error'
      throw new Error(errText)
    }
    return clampData(res.data)
  } finally {
    if (isAuto && typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('abelink:automation-end', { detail: { action } }))
    }
  }
}
// channel yang butuh akses file/OS → dikirim sebagai path string, bukan ArrayBuffer
const toPayload = (v: unknown): unknown => {
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v))
  return v
}

type TgShotResult = {
  sent: number
  skipped?: boolean
  error?: string
  results?: Array<{ id: string; ok: boolean; error?: string }>
}

// ---------- Screenshot → Telegram (jalur NATIVE Rust, tanpa sidecar) ----------
// Kembalikan { sent, results } agar pemanggil tool AI bisa melaporkan hasil
// nyata (jumlah admin yang menerima) — dulu string tak terverifikasi.
// chatId eksplisit menang; tanpa itu broadcast ke semua admin terdaftar.
const tgScreenshotToTelegram = async (chatId: unknown): Promise<TgShotResult> => {
  if (!(await tgConnected())) return { sent: 0, skipped: true }
  const pngDataUrl = (await invoke('misc_take_screenshot')) as string
  // misc_take_screenshot mengembalikan data URL penuh; Rust mendecode base64
  // murni — prefix harus dibuang dulu (regresi dulu: decode gagal selalu).
  const pngBase64 = stripDataUrlPrefix(pngDataUrl)
  if (!pngBase64) return { sent: 0, error: 'Screenshot gagal atau kosong' }
  const targets = chatId ? [String(chatId)] : tgAdminIdsCache.targets
  if (targets.length === 0) return { sent: 0, error: 'Tidak ada admin Telegram terdaftar' }
  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const target of targets) {
    try {
      await invoke('telegram_send_photo', {
        chatId: target,
        pngBase64,
        caption: 'Layar PC (dikirim oleh Abelink)'
      })
      results.push({ id: target, ok: true })
    } catch (e) {
      results.push({ id: target, ok: false, error: (e as Error)?.message || String(e) })
    }
  }
  return { sent: results.filter((r) => r.ok).length, results }
}

// Pola disposed-flag: kalau unsubscribe dipanggil sebelum listen() resolve,
// unlisten hasil promise langsung dieksekusi agar tidak bocor.
const on =
  (channel: string): OnFn =>
  (cb) => {
    let disposed = false
    let unlisten: UnlistenFn | null = null
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

const pathForFile = (file: unknown): string =>
  typeof file === 'string' ? file : (file as { path?: string })?.path || ''

// ---------- Telegram ----------
// Cache status koneksi bot beberapa detik agar guard tgSendMessage/tgBroadcast
// tidak menambah satu round-trip IPC (tg:get-status) di setiap pesan.
// targets: ID admin yang diparse dari config terakhir (satu sumber dengan
// splitTgAdminIds) — dipakai screenshot-to-tg saat tanpa chatId eksplisit.
let tgStatusCache = { connected: false, at: 0 }
let tgAdminIdsCache = { targets: [] as string[], at: 0 }
const TG_STATUS_TTL_MS = 5000
const tgConnected = async (): Promise<boolean> => {
  const now = Date.now()
  if (now - tgStatusCache.at < TG_STATUS_TTL_MS) return tgStatusCache.connected
  try {
    const st = (await call('tg:get-status')) as { status?: string } | null
    tgStatusCache = { connected: !!st && st.status === 'connected', at: now }
  } catch (_) {
    tgStatusCache = { connected: false, at: now }
  }
  return tgStatusCache.connected
}
// Semua unlisten Telegram dikumpulkan di sini supaya removeTgListeners benar-benar bekerja
const tgUnlisteners: UnlistenFn[] = []
const tgChannelUnlisteners = new Map<string, UnlistenFn>()
const trackTgListener = (channel: string, dispose: UnlistenFn): UnlistenFn => {
  if (tgChannelUnlisteners.has(channel)) {
    try {
      tgChannelUnlisteners.get(channel)?.()
    } catch {}
  }
  tgChannelUnlisteners.set(channel, dispose)
  tgUnlisteners.push(dispose)
  return () => {
    try {
      dispose()
    } finally {
      if (tgChannelUnlisteners.get(channel) === dispose) {
        tgChannelUnlisteners.delete(channel)
      }
    }
  }
}
const onTg = (channel: string): OnFn => (cb) => trackTgListener(channel, on(channel)(cb))

export const api = {
  // ---------- umum (Fase B0: langsung Rust native, tanpa node_invoke) ----------
  getPathForFile: pathForFile,
  saveTempFile: (data: unknown, name: unknown) =>
    invoke('misc_save_temp_file', { data: toPayload(data), name: name ?? null }),
  osIsX11: () => invoke('os_is_x11'),
  openExternal: (url: string) => invoke('misc_open_external', { url }),
  showNotification: (...args: unknown[]) => {
    // Dua gaya pemanggil lama di renderer: ({title, body}) ATAU (title, body) posisional.
    // Versi sidecar lama kehilangan body saat pemanggil posisional — di sini diperbaiki.
    const [a, b] = args
    const title = typeof a === 'string' ? a : (a as { title?: string } | null)?.title
    const body = typeof b === 'string' ? b : (a as { body?: string } | null)?.body
    return invoke('misc_show_notification', { title: title ?? null, body: body ?? null })
  },
  getDocumentsPath: () => invoke('misc_get_documents_path'),
  getLiteMode: () => invoke<{ isLite: boolean; totalRAMGB?: number | null }>('misc_get_lite_mode').then((d) => d ?? { isLite: false }),
  // Salin folder extension ter-bundel ke data dir (pengguna binary tanpa repo).
  ensureExtensionFiles: () => invoke('misc_ensure_extension_files'),
  // Buka folder di file manager desktop
  openFolder: (path: string) => invoke('misc_open_folder', { path }),
  // Konfirmasi native (rfd di Rust main thread) untuk aksi berisiko non-sidecar.
  nativeConfirm: (message: string) => invoke<boolean>('misc_native_confirm', { message }),
  // Fetch resource web via native (validasi SSRF + tanpa CORS renderer).
  fetchWebResource: (url: string) => invoke('misc_fetch_web_resource', { url }),

  // ---------- Capability Manager (general-pluggable connectors) ----------
  // Referensi desain: Claude connectors/plugins (catalog -> connection ->
  // action schema -> execution -> policy -> audit). Katalog hidup di sidecar;
  // renderer hanya membaca metadata & mengeksekusi via channel.
  listCapabilities: () => call('capabilities:list'),
  inspectCapability: (connectorId: string) => call('capabilities:inspect', connectorId),
  capabilityGuide: (connectorId: string, actionId: string) =>
    call('capabilities:guide', connectorId, actionId),
  executeCapability: (connectorId: string, actionId: string, args: unknown, opts: unknown) =>
    call('capabilities:execute', connectorId, actionId, args, opts || {}),
  listCapabilityConnections: () => call('capabilities:connections'),
  authorizeCapability: (connectorId: string, grantedScopes: string[]) =>
    call('capabilities:authorize', connectorId, grantedScopes),
  revokeCapability: (connectorId: string) => call('capabilities:revoke', connectorId),
  readCapabilityAudit: (limit: unknown, offset: unknown) =>
    call('capabilities:audit', limit, offset),
  registerCustomConnectors: (list: unknown[]) => call('capabilities:register-custom', list || []),
  listCapabilityRegistry: () => call('capabilities:registry'),
  installCapabilityBundle: (bundle: unknown) => call('capabilities:bundle-install', bundle || {}),
  listCapabilityBundles: () => call('capabilities:bundle-list'),
  removeCapabilityBundle: (id: string) => call('capabilities:bundle-remove', id),
  getSystemInfo: () => invoke('system_get_info'),
  ping: () => call('ping'),

  // ---------- AI ----------
  fetchAI: ({
    messages,
    config,
    isSmallTask,
    jsonSchema,
    stream
  }: {
    messages: unknown
    config: unknown
    isSmallTask?: unknown
    jsonSchema?: unknown
    stream?: unknown
  }) =>
    invoke('node_invoke', {
      action: 'ai:fetch',
      payload: [{ messages, config, isSmallTask, jsonSchema, stream: !!stream }]
    }).then((res) => {
      const r = res as NodeInvokeResult
      if (!r?.success) {
        // Pesan ramah + informatif (fetchError.ts): menyebut sebab & aksi,
        // bukan "AI fetch gagal" yang buta.
        const msg = friendlyAiFetchError(r as AiBridgeResponse)
        throw Object.assign(new Error(msg), {
          code: (r?.error as { code?: string } | undefined)?.code || 'AI_FETCH_ERROR'
        })
      }
      return r.data
    }),
  abortFetchAI: () => call('ai:abort-fetch'),
  syncConfig: (config: Record<string, unknown>) => {
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
  // Hapus token + admin dari memori Rust (rotasi credential / disconnect penuh).
  tgForget: () => invoke('telegram_forget'),
  // Deteksi daftar model dari endpoint custom (GET /models via sidecar).
  detectCustomModels: (endpoint: string, apiKey: string, protocol: string) =>
    call('ai:list-models', endpoint || '', apiKey || '', protocol || 'auto'),
  runNodeFunction: (fn: string, ...args: unknown[]) => call(fn, ...args),

  // ---------- AI status stream ----------
  onAiStatus: on('ai:status'),
  // Browser bridge status (watchdog Fase C3): string progres launch/reconnect
  // (pola ai:status). Objek status lengkap via runNodeFunction('browser:status').
  onBrowserStatus: on('browser:status'),
  // Token stream opt-in (WS-2): tanpa subscriber tidak ada yang berubah;
  // core.js fetchAI memasang listener ini hanya bila onToken diberikan.
  onAiToken: on('ai:token'),

  // ---------- Awareness ----------
  getActivityBuffer: () => invoke('awareness_get_buffer'),
  clearActivityBuffer: () => invoke('awareness_clear_buffer'),

  // ---------- YouTube / Music ----------
  getYoutubeTranscript: (url: string) => call('get-youtube-transcript', url),
  searchYoutube: (q: string) => call('youtube-search', q),
  searchMusic: (q: string) => call('search-music', q),
  textToSpeech: (text: string, rate: unknown, pitch: unknown) =>
    call('tts-speak', text, rate, pitch),
  // Alias objek untuk tombol Uji Suara (VoiceVideoSection): backend mengembalikan
  // data-URL string; dibungkus { audioBase64 } agar konsisten satu facade.
  speakTTS: async ({ text, rate, pitch }: { text?: unknown; rate?: unknown; pitch?: unknown } = {}) => {
    const dataUrl = await call('tts-speak', text, rate, pitch)
    if (!dataUrl) return null
    // Prefix MIME apa pun (mp3/mpeg/wav + parameter) dilucuti generik +
    // whitespace dibuang; sisa yang bukan base64 murni = korup -> null
    // (atob di pemanggil melempar InvalidCharacterError bila lolos).
    const raw = String(dataUrl).replace(/^data:audio\/[^;]+(?:;[^;,]+)*;base64,/, '').replace(/\s+/g, '')
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
      console.warn('[tauri-bridge] speakTTS: payload audio bukan base64 murni, dibuang')
      return null
    }
    return { audioBase64: raw }
  },
  sendRemoteMusicCommand: (command: string, payload: unknown) =>
    call('remote-music-command', command, payload),
  onExecuteMusicCommand: on('execute-music-command'),
  // onExecuteMusicCommandTg dihapus: emit 'execute-music-command-tg' mati
  // bersama botWindow era Electron (9923989) dan tidak punya konsumen.

  // --- YouTube Music player bridge (Tauri Native) ---
  ytLoad: (url: string) => invoke('music_player_play_url', { url }),
  ytShow: () => invoke('music_player_show'),
  ytHide: () => invoke('music_player_hide'),
  ytToggle: () => invoke('music_player_toggle'),
  ytCommand: (command: string) => invoke('music_player_command', { command }),
  ytGetDuration: () => call('yt:get-duration'),
  onYtTrackUpdated: on('ytm-track-changed'),
  onYtWindowState: on('ytm-window-state'),
  // Screenshot → Telegram via jalur NATIVE (misc_take_screenshot +
  // telegram_send_photo). Channel sidecar lama tg:take-screenshot sudah tidak
  // punya handler sejak pembersihan electron (9923989).
  // tgDownloadMusic/tgPlayMusicUi dihapus: tanpa konsumen & tanpa backend.
  tgTakeScreenshot: (chatId: unknown) => tgScreenshotToTelegram(chatId),

  // ---------- Live audio shortcut ----------
  onLiveAudioShortcut: on('trigger-live-audio'),
  removeLiveAudioShortcut: (): void => {},

  // ---------- Telegram ----------
  tgStart: (token: string) => call('tg:start', token),
  tgStop: () => call('tg:stop'),
  tgGetStatus: () => call('tg:get-status'),
  tgGetHistory: () => call('tg:get-history'),
  onTgConnection: onTg('tg:connection'),
  onTgMessage: onTg('tg:message'),
  onTgReplySent: onTg('tg:reply-sent'),
  onTgThinking: onTg('tg:thinking'),
  onTgRequestAgentExecution: onTg('tg:request-agent-execution'),
  sendTgAgentExecutionDone: (data: unknown) => call('tg:agent-execution-done', data),
  tgSendMessage: async (chatId: string, text: string) => {
    // Skip silently if bot not configured — prevents 3x "token kosong" errors per session
    // when ApprovalContext sends status messages before user configures the bot.
    if (!(await tgConnected())) return { skipped: true }
    return invoke('telegram_send_message', { chatId, text })
  },
  tgBroadcastToAdmins: async (text: string) => {
    // Guard di satu titik: bot tidak terhubung = no-op sunyi, bukan rejection
    // yang menyulut unhandled promise rejection tiap giliran agen.
    if (!(await tgConnected())) return { skipped: true }
    // Broadcast lewat telegram_send_message per ID admin hasil parse config.
    // telegram_broadcast_to_admins native bergantung pada chat_ids state Rust
    // yang hanya terisi via telegram_register_admin_chat — channel yang tidak
    // pernah dipanggil renderer; loop di sini meniru perilaku broadcast sidecar.
    const targets = tgAdminIdsCache.targets
    if (targets.length === 0) return { skipped: true, reason: 'no-admin-ids' }
    const results: Array<{ id: string; ok: boolean; error?: string }> = []
    for (const id of targets) {
      try {
        await invoke('telegram_send_message', { chatId: id, text })
        results.push({ id, ok: true })
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error)?.message || String(e) })
      }
    }
    return { sent: results.filter((r) => r.ok).length, results }
  },
  onTgCommandAccept: onTg('tg:command-accept'),
  onTgCommandAlways: onTg('tg:command-always'),
  onTgCommandReject: onTg('tg:command-reject'),
  removeTgListeners: (): void => {
    while (tgUnlisteners.length > 0) {
      try {
        tgUnlisteners.pop()?.()
      } catch {
        // Abaikan error cleanup individual — lanjut ke listener berikutnya
      }
    }
  },

  // ---------- Google Workspace ----------
  googleConnect: (clientId: string, clientSecret: string) =>
    call('google:connect', clientId, clientSecret),
  googleDisconnect: () => call('google:disconnect'),
  googleStatus: () => call('google:status'),

  // ---------- Window controls (Rust native) ----------
  windowMinimize: () => invoke('window_minimize'),
  windowMaximize: () => invoke('window_maximize_toggle'),
  windowFullscreen: () => invoke('window_fullscreen_toggle'),
  windowClose: () => invoke('window_close'),
  windowSetMode: (mode: string) => invoke('window_set_mode', { mode }),
  onWindowModeChanged: on('window-mode-changed'),
  onWindowMaximized: on('window-maximized'),
  onWindowState: on('window-state'),
  getWindowState: () => invoke('window_get_state'),

  // ---------- Native tools (AI tools) ----------
  // FB#1: file-ops langsung ke Rust (std::fs) — tidak lewat sidecar lagi
  executeNativeTool: async (toolName: string, query: unknown, config: ToolConfig | null | undefined) => {
    const t0 = Date.now()
    let result: unknown
    let error: string | null = null
    try {
      const fsRoute = routeFsTool(toolName, query, config)
      result = fsRoute ?? (await call('native-tool:execute', toolName, query, config))
    } catch (e) {
      error = (e as Error).message
      throw e
    } finally {
      try {
        const h = await import('./harness')
        let resultSummary: string | null = null
        try {
          resultSummary = JSON.stringify(result)?.slice(0, 2000) ?? null
        } catch (_) {}
        h.logToolCall({
          tool: toolName,
          query: String(query).slice(0, 200),
          durMs: Date.now() - t0,
          ok: !error && (result as { success?: unknown } | null | undefined)?.success !== false,
          error,
          resultSummary,
          // Jejak tak pernah sessionId null: config.turnId bila ada,
          // else 'system' (panggilan teardown langsung, bukan loop ReAct).
          sessionId: config?.turnId ?? config?.sessionId ?? 'system',
          turn: config?.turn ?? null
        })
      } catch (_) {}
    }
    return result
  },
  checkToolApproval: (toolName: string, query: unknown) =>
    call('native-tool:needs-approval', toolName, query),

  // ---------- Approval policy per family (ask/session/always) ----------
  approvalPolicyGet: () => invoke('approval_policy_get'),
  approvalPolicySet: (family: string, policy: string) =>
    invoke('approval_policy_set', { family, policy }),
  approvalPolicyResetSession: () => invoke('approval_policy_reset_session'),

  // ---------- Plugins (sidecar loader lama — fase C4 pindah Web Worker) ----------
  getPlugins: () => call('plugins:list'),
  executePlugin: (action: string, query: unknown) => call('plugin:execute', action, query),
  openPluginFolder: () => call('plugin:open-folder'),
  openSpecificFolder: (path: string) => call('plugin:open-specific-folder', path),
  reloadPlugins: () => call('plugin:reload'),
  createPlugin: (payload: unknown) => call('plugin:create', payload),
  togglePlugin: (name: string, isEnabled: boolean) => call('plugin:toggle', name, isEnabled),
  deletePlugin: (name: string) => call('plugin:delete', name),
  installPluginFromGit: (repoUrl: string) => call('plugin:install-git', repoUrl),

  // ---------- Browser agent (fase C3) ----------
  browserNavigate: (url: string, sessionId: string = 'default') =>
    call('browser:navigate', url, sessionId),
  browserReadDom: (sessionId: string = 'default') => call('browser:read-dom', sessionId),
  browserAction: (data: unknown, sessionId: string = 'default') =>
    call('browser:action', data, sessionId),
  // Shortcut aksi browser granular. Kontrak payload ekstensi (background.js):
  // { action, abelinkId, value } — argumen SELALU lewat field `value`, karena
  // handler ekstensi mendestruktur { abelinkId, action, value }. (Fix review PR #26.)
  browserClick: (elementId: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'click', abelinkId: elementId }, sessionId),
  browserType: (elementId: string, text: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'type', abelinkId: elementId, value: text }, sessionId),
  browserScroll: (direction: string, amount: number, sessionId: string = 'default') =>
    call('browser:action', { action: 'scroll', value: { direction, amount } }, sessionId),
  browserExtract: (selector: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'extract', value: selector }, sessionId),
  browserScript: (script: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'script', value: script }, sessionId),
  browserScreenshot: (fileName: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'screenshot', value: fileName }, sessionId),
  browserDownload: (url: string, fileName: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'download', value: { url, fileName } }, sessionId),
  browserAskUser: (prompt: string, sessionId: string = 'default') =>
    call('browser:action', { action: 'ask', value: prompt }, sessionId),
  browserClose: (sessionId: string = 'default') => call('browser:close', sessionId),
  onBrowserPreview: on('browser:preview'),
  showBrowserWindow: (sessionId: string = 'default') => call('browser:show', sessionId),

  // ---------- PC automation (fase B2 — native Rust xdotool) ----------
  osRead: () => invoke('os_read'),
  osClick: (q: string) => invoke('os_click', { query: q }),
  osType: (text: string) => invoke('os_type', { text }),
  osKey: (key: string) => invoke('os_key', { key }),
  osScroll: (q: string) => invoke('os_scroll', { query: q }),
  osOpen: (path: string) => invoke('os_open', { query: path }),
  osListWindows: () => invoke('os_list_windows'),
  osFocusWindow: (title: string) => invoke('os_focus_window', { query: title }),
  osAskUser: (prompt: string) => invoke('os_ask', { prompt }),
  // Emergency stop (Ctrl+Shift+S) — teruskan ke sidecar pc-agent agar daemon
  // / child process otomasi PC ikut dikill, bukan hanya AI loop di renderer.
  pcEmergencyStop: () => call('os:emergency-stop'),
  onPcEmergencyStop: on('pc-emergency-stop'),
  // Watchdog eksternal Fase 2 (Rust): { kind, action }. Dengar untuk hentikan
  // misi graceful — izin sesi sudah dicabut di sisi Rust saat event ini tiba.
  onWatchdogBreach: on('watchdog-breach'),
  // Mission scope Fase 3 (Rust): nonaktif secara default. Set eksplisit per
  // misi ({ dirs: [abs], tools: [...]|null }); clear di akhir misi.
  missionScopeSet: (dirs: string[], tools: string[] | null) =>
    invoke('mission_scope_set', { dirs, tools: tools ?? null }),
  missionScopeClear: () => invoke('mission_scope_clear'),
  missionScopeGet: () => invoke('mission_scope_get'),

  // ---------- Skills ----------
  getSkills: () => call('skills:get-all'),
  readSkill: (name: string, relativePath?: string) => call('skills:read', name, relativePath),
  getSkillManifest: (name: string) => call('skills:get-manifest', name),
  saveSkill: (name: string, content: string) => call('skills:save', name, content),
  deleteSkill: (name: string) => call('skills:delete', name),
  installSkill: (sourcePath: string) => call('skills:install', sourcePath),
  // Buka folder store skills di file manager OS — drop folder <nama>/SKILL.md
  // ke sini, lalu auto-scan mendeteksinya saat refresh (tanpa import wizard).
  openSkillsFolder: () => call('skills:open-folder'),
  getSkillTree: () => call('skills:get-tree'),
  readSkillFile: (name: string, relativePath: string) =>
    call('skills:read-file', name, relativePath),
  saveSkillFile: (name: string, relativePath: string, content: string) =>
    call('skills:save-file', name, relativePath, content),
  createSkillItem: (name: string, type: string, itemName: string) =>
    call('skills:create-item', name, type, itemName),
  deleteSkillItem: (name: string, relativePath: string) =>
    call('skills:delete-item', name, relativePath),
  renameSkillItem: (name: string, oldPath: string, newPath: string) =>
    call('skills:rename-item', name, oldPath, newPath),
  onSkillsUpdated: on('skills-updated'),

  // ---------- Workspace RAG ----------
  workspaceIndex: (workspaceRoot: string) => call('workspace:index', workspaceRoot),
  workspaceQuery: (workspaceRoot: string, queryText: string, topK = 4) =>
    call('workspace:query', { workspaceRoot, queryText, topK }),
  workspaceGetMemory: (workspaceRoot: string) => call('workspace:get-memory', workspaceRoot),
  workspaceSaveMemory: (workspaceRoot: string, memoryData: unknown) =>
    call('workspace:save-memory', { workspaceRoot, memoryData }),
  workspaceEnsure: (workspaceRoot: string) => call('workspace:ensure', workspaceRoot),

  // ---------- Document parsing (RAG) ----------
  // Kontrak payload sidecar: [0] = base64 string (bisa juga numeric array), [1] = isDocx boolean.
  // ArrayBuffer dikonversi chunked btoa over Uint8Array supaya aman dari limit argumen apply.
  parseDocument: (arrayBuffer: ArrayBuffer | Uint8Array | null | undefined, isDocx: unknown) => {
    const bytes =
      arrayBuffer instanceof Uint8Array
        ? arrayBuffer
        : arrayBuffer
          ? new Uint8Array(arrayBuffer)
          : new Uint8Array(0)
    const CHUNK = 0x8000
    const parts: string[] = []
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(
        btoa(
          String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[]
          )
        )
      )
    }
    return call('parse-document', parts.join(''), !!isDocx)
  },

  // ---------- Lite Mode & WhatsApp music ----------
  onLiteModeChanged: on('lite-mode-changed'),
  onExecuteMusicCommandWa: on('execute-music-command-wa'),

  // ---------- Dialog (Fase B5 dipercepat: rfd native di main thread Rust) ----------
  showOpenDialog: async () => {
    const selected = (await invoke('misc_open_file_dialog')) as string | null | undefined
    return selected ? { canceled: false, filePaths: [selected] } : { canceled: true, filePaths: [] }
  },
  // Multi-select native: batal = { canceled: true, filePaths: [] }.
  // Pemanggil TIDAK boleh fallback ke <input type=file> saat canceled,
  // agar dialog tidak terbuka dua kali (bug lama di InputBar).
  showOpenFilesDialog: async () => {
    const paths = (await invoke('misc_open_files_dialog')) as unknown
    const list = Array.isArray(paths) ? (paths as string[]) : []
    return { canceled: list.length === 0, filePaths: list }
  },
  // Metadata file/directory (size bytes, isDir, mtime) untuk preview lampiran.
  statPath: (path: string) => invoke<[number, boolean]>('misc_stat_path', { path }),
  selectDirectory: () => invoke('misc_open_directory_dialog'),

  // ---------- Legacy memory migration (MEM) ----------
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
  // Isi file biner sebagai data URL base64 (lampiran gambar → vision payload).
  readFileBase64: (path: string | null | undefined) =>
    invoke('misc_read_file_base64', {
      path: String(path ?? '').replace(/^file:\/\//, '')
    }),

  // ---------- Git tools (native Rust — mengganti sidecar git-service) ----------
  executeShell: (query: string, cwd: string | null) =>
    invoke('tools_run_shell', { query, cwd: cwd || null }),
  gitStatus: (query: string) => invoke('git_status', { cwd: query || null }),
  gitDiff: (query: string) => invoke('git_diff', { cwd: null, range: query || null }),
  gitCommit: (query: string) => {
    const parts = (query || '').split('||')
    return invoke('git_commit', { message: parts[0], cwd: parts[1] || null })
  },
  gitRevert: (query: string) => invoke('git_revert', { target: query, cwd: null }),
  runTask: (query: string) => {
    const parts = (query || '').split('||')
    return invoke('run_task', { taskId: parts[0], command: parts.slice(1).join('||'), cwd: null })
  },
  readTaskOutput: (query: string) => {
    const parts = (query || '').split('||')
    return invoke('read_task_output', { taskId: parts[0], lines: parts[1] ? Number(parts[1]) : 40 })
  },
  killTask: (taskId: string) => invoke('kill_task', { taskId }),
  listTasks: () => invoke('list_tasks')
}

// Window augmentation: konsumen (main.jsx, hooks) menerima tipe penuh facade
// tanpa dupleksasi tanda tangan 150+ method. __TAURI_INTERNALS__ = global Tauri.
declare global {
  interface Window {
    api: typeof api
    electron: unknown
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
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
            return (_cb: unknown) => {
              warnOnce()
              return () => {}
            }
          }
          warnOnce()
          return noop
        }
      }
    ) as unknown as typeof api

    // Ganti seluruh halaman dengan papan pengumuman — tab browser BUKAN app.
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;background:#0b0f0c;color:#e5e7eb;display:flex;align-items:center;justify-content:center;font-family:system-ui;padding:2rem;z-index:999999">
        <div style="max-width:560px;border:1px solid #2a3a2f;border-radius:16px;padding:2rem;background:#101713">
          <h1 style="margin:0 0 .5rem;font-size:1.3rem;color:#0a84ff">ABELINK berjalan di window terpisah</h1>
          <p style="margin:0 0 1rem;line-height:1.6;opacity:.85">
            Tab browser ini hanya <b>preview frontend</b> — tanpa API native, tanpa engine.
          </p>
          <p style="margin:0 0 .5rem">Jalankan aplikasi asli dari folder proyek:</p>
          <pre style="background:#0b0f0c;border:1px solid #2a3a2f;border-radius:8px;padding:.75rem 1rem;overflow:auto"><code>bun tauri dev</code></pre>
          <p style="margin:.75rem 0 0;opacity:.6;font-size:.85rem">Window berjudul <b>ABELINK</b> akan muncul terpisah dari browser ini.</p>
        </div>
      </div>
      <div id="root" style="display:none"></div>`
    return
  }

  ;(api as { startResizeDragging?: (direction: string) => Promise<unknown> | undefined }).startResizeDragging = (
    direction: string
  ) => {
    return window.__TAURI_INTERNALS__?.invoke('plugin:window|start_resize_dragging', { direction })
  }

  window.api = api
  window.electron = undefined

  // Frameless drag & resize: Event delegation di tingkat document agar
  // SEMUA halaman dan rute otomatis bisa di-drag tanpa terputus lifecycle SPA.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    // Elemen interaktif DILARANG memicu drag agar click, focus, dan selection selalu tembus
    if (
      (e.target as Element).closest(
        'button, input, textarea, a, select, [role="button"], .no-drag, [data-no-drag], [style*="no-drag"]'
      )
    ) {
      return
    }
    const dragEl = (e.target as Element).closest('[data-tauri-drag-region]')
    if (dragEl) {
      window.__TAURI_INTERNALS__?.invoke('plugin:window|start_dragging')
    }
  })

  const upgrade = (root: HTMLElement | Document | null | undefined) => {
    if (!root?.querySelectorAll) return
    root
      .querySelectorAll('[style*="-webkit-app-region: drag"], [style*="-webkit-app-region:drag"]')
      .forEach((el) => {
        el.removeAttribute('style')
        el.setAttribute('data-tauri-drag-region', '')
        ;(el as HTMLElement).style.setProperty('-webkit-app-region', 'no-drag')
      })
  }

  if (document.body) {
    upgrade(document.body)
  } else {
    document.addEventListener('DOMContentLoaded', () => upgrade(document.body))
  }
}

installTauriBridge()
