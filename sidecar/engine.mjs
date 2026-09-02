// Mark Sidecar Engine — Node runtime untuk fase A/B migrasi Tauri.
// Protokol (JSON lines di stdin/stdout), kompatibel dgn cmd_node_bridge.rs:
//   request : {"id":1,"action":"ai:fetch","payload":[...args]}
//   response: {"id":1,"success":true,"data":...} | {"id":1,"success":false,"error":"..."}
//   event   : {"event":"ai:status","payload":"..."}
import readline from 'readline'
import fs from 'fs'
import os from 'os'
import path from 'path'

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
const emit = (event, payload) => send({ event, payload })
const ok = (data) => ({ success: true, data: data ?? null })
const fail = (error) => ({ success: false, error: String(error?.message || error) })

const handlers = {}
const on = (action, fn) => {
  handlers[action] = async (payload) => ok(await fn(...(Array.isArray(payload) ? payload : [payload])))
}

const unsupported = (phase) => async () =>
  ok({ unsupported: true, message: `Channel ini dipindah ke ${phase} (lihat docs/PLANNED/migration-tauri-v2.md)` })

// --------------------------------------------------- Lazy module registry
// Prinsip load-when-needed: modul berat hanya di-import saat channel-nya
// dipakai pertama kali. Startup sidecar jadi instan, dan efek samping modul
// (mis. interval polling window-tracker) baru hidup saat benar-benar dibutuhkan.
const lazy = (loader) => {
  let p = null
  return () => (p ??= loader())
}
const getAi = lazy(() => import('./main/ai-bridge.js'))
const getNt = lazy(() => import('./main/node-tools.js'))
const getYt = lazy(async () => {
  // Paket CJS: fungsi utama bisa di default atau namespace — normalkan.
  const m = await import('youtube-transcript-plus')
  return m.default ?? m
})
const getYts = lazy(async () => (await import('yt-search')).default)
const getTg = lazy(() => import('./main/telegram/telegram-service.js'))
const getGsvc = lazy(() => import('./main/google/google-service.js'))
const getWs = lazy(() => import('./main/workspace-rag.js'))
const getTracker = lazy(() => import('./main/awareness/window-tracker.js'))
const getPl = lazy(() => import('./main/plugins/plugin-loader.js'))
const getYtm = lazy(async () => {
  const mod = await import('ytmusic-api')
  const YTMusic = mod.default ?? mod
  const inst = typeof YTMusic === 'function' ? new YTMusic() : YTMusic
  if (typeof inst.initialize === 'function') await inst.initialize()
  return inst
})

// Config terakhir yang disinkronkan renderer — sumber tgAdminIds untuk broadcast.
let latestConfig = null

// ---------------------------------------------------------------- AI bridge
// Daftarkan manual (bukan lewat on()) supaya bentuk frame sukses/gagal ke bridge
// tidak dibungkus ulang oleh ok().
handlers['ai:fetch'] = async (payload) => {
  const data = Array.isArray(payload) ? payload[0] : payload
  const { messages, config, isSmallTask, jsonSchema } = data || {}
  const onStatus = (msg) => emit('ai:status', msg)
  try {
    const { fetchAI } = await getAi()
    const result = await fetchAI(messages || [], config, !!isSmallTask, jsonSchema ?? null, onStatus)
    return { success: true, data: result ?? null }
  } catch (err) {
    return { success: false, error: { message: err.message, code: err.code || 'AI_FETCH_ERROR' } }
  }
}
on('ai:abort-fetch', async () => (await getAi()).abortAllFetches())
// Deteksi daftar model dari endpoint custom (GET /models) utk Configuration.
// on() otomatis spread args + bungkus sukses; throw akan jadi error frame.
on('ai:list-models', async (endpoint, apiKey, protocol) =>
  (await getAi()).listCustomModels(endpoint, apiKey, protocol)
)
on('sync-config', async (config) => {
  const aiMod = await getAi()
  aiMod.setGlobalConfig(config)
  latestConfig = config || null
  const tgMod = await getTg()
  if (
    config?.tgBotToken &&
    config.tgBotToken.trim() &&
    tgMod.getConnectionStatus().status === 'disconnected'
  ) {
    tgMod.startTelegramBot(config.tgBotToken.trim(), null)
  }
  return true
})

// ------------------------------------------------------------- Native tools
on('native-tool:execute', async (toolName, query, config) => {
  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { success: false, error: 'Tool tidak ditemukan' }
  try {
    const result = await tool.handler(query, config)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('native-tool:needs-approval', async (toolName, query) => {
  const { NATIVE_TOOLS } = await getNt()
  const tool = NATIVE_TOOLS[toolName]
  if (!tool) return { needsApproval: true, reason: 'Tool tidak ditemukan' }
  if (typeof tool.needsApproval === 'function') return { needsApproval: !!tool.needsApproval(query), message: tool.needsApproval(query) ? tool.approvalMessage?.(query) : null }
  return { needsApproval: !!tool.needsApproval, message: tool.needsApproval ? tool.approvalMessage?.(query) : null }
})

// ------------------------------------------------------------ Dokumen & file
on('parse-document', async (b64OrBytes, isDocx) => {
  // Bridge renderer mengirim base64 string; array byte lama tetap didukung.
  let buffer
  if (typeof b64OrBytes === 'string') buffer = Buffer.from(b64OrBytes, 'base64')
  else if (Array.isArray(b64OrBytes)) buffer = Buffer.from(new Uint8Array(b64OrBytes))
  else buffer = Buffer.from(new Uint8Array(b64OrBytes ?? []))
  if (isDocx) {
    const mammoth = (await import('mammoth')).default
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
})
// save-temp-file -> Fase B0: Rust native `misc_save_temp_file` (src-tauri/src/cmd_misc.rs)

// ------------------------------------------------------------------- Media
let globalTTS
on('tts-speak', async (text, rate, pitch) => {
  try {
    if (!globalTTS) {
      const mod = await import('msedge-tts')
      const MsEdgeTTS = mod.default || mod.MsEdgeTTS
      const { OUTPUT_FORMAT } = mod
      globalTTS = new MsEdgeTTS()
      await globalTTS.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS)
    }
    const tmpPath = path.join(os.tmpdir(), 'mark-tts-folder')
    fs.mkdirSync(tmpPath, { recursive: true })
    const { audioFilePath } = await globalTTS.toFile(tmpPath, text, {
      rate: `${rate || 0}%`,
      pitch: `${pitch || 0}Hz`
    })
    const audioData = fs.readFileSync(audioFilePath)
    const base64Audio = `data:audio/mp3;base64,${audioData.toString('base64')}`
    fs.unlinkSync(audioFilePath)
    return base64Audio
  } catch (error) {
    console.error('[engine] TTS gagal:', error.message)
    return null
  }
})

on('get-youtube-transcript', async (url) => {
  const yt = await getYt()
  const transcript = await yt.fetchTranscript(url)
  return transcript
    .filter((_, index) => index % 2 === 0)
    .map((item) => {
      const minutes = Math.floor(item.offset / 60)
      const seconds = Math.floor(item.offset % 60)
      return `[${minutes}:${String(seconds).padStart(2, '0')}] ${item.text}`
    })
    .join(' ')
})
on('youtube-search', async (query) => {
  const yts = await getYts()
  const ytData = await yts(query)
  return ytData.videos.slice(0, 4).map((item) => ({
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
    title: item.title,
    thumbnail: item.thumbnail,
    duration: item.duration,
    author: item.author?.name
  }))
})

// ---------------------------------------------------------------- Benchmark events (Telegram dashboard)
// Action di-spread sebagai argumen posisional oleh on(): (action, data)
on('benchmark:telegram', async (action, data) => {
  const tg = await getTg()
  if (tg.getConnectionStatus().status !== 'connected') return { skipped: true }
  const body = data || {}
  switch (action) {
    case 'send_report':
      return tg.sendReport(body.runId, body.chatId)
    case 'send_ask_user':
      return tg.sendInlineKeyboard(body.chatId, body.question, body.options)
    case 'send_progress':
      return tg.sendProgress(body.taskId, body.status, body.details, body.chatId)
    default:
      return { success: false, error: `Unknown benchmark:telegram action: ${action}` }
  }
})
on('tg:start', async (token) => (await getTg()).startTelegramBot(token, null))
on('tg:stop', async () => (await getTg()).stopTelegramBot())
on('tg:get-status', async () => (await getTg()).getConnectionStatus())
on('tg:get-history', async () => (await getTg()).uiMessageHistory)
on('tg:send-message', async (chatId, text) => (await getTg()).sendTelegramMessage(String(chatId), String(text)))
// Broadcast ke admin milik owner (id dari config.tgAdminIds). Jika bot tidak
// terhubung, kembalikan flag skipped secara sunyi — pemanggil UI tidak boleh
// kena unhandled rejection tiap giliran agen hanya karena Telegram mati.
on('tg:broadcast-to-admins', async (text) => {
  const tgMod = await getTg()
  if (tgMod.getConnectionStatus().status !== 'connected') return { skipped: true }
  const ids = String(latestConfig?.tgAdminIds || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return { skipped: true, reason: 'no-admin-ids' }
  const results = []
  for (const id of ids) {
    try {
      await tgMod.sendTelegramMessage(id, String(text))
      results.push({ id, ok: true })
    } catch (err) {
      results.push({ id, ok: false, error: err.message })
    }
  }
  return { sent: results.filter((r) => r.ok).length, results }
})

// ------------------------------------------------------------------ Google
on('google:connect', async (clientId, clientSecret) => {
  try {
    await (await getGsvc()).connectGoogle(clientId, clientSecret)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('google:disconnect', async () => (await getGsvc()).disconnectGoogle())
on('google:status', async () => (await getGsvc()).getGoogleStatus())

// ------------------------------------------------------- Workspace RAG (.mark)
on('workspace:index', async (root) => (await getWs()).indexWorkspace(root))
on(
  'workspace:query',
  async ({ workspaceRoot, queryText, topK }) => (await getWs()).queryCodebase(workspaceRoot, queryText, topK)
)
on('workspace:get-memory', async (root) => (await getWs()).readWorkingMemory(root))
on(
  'workspace:save-memory',
  async ({ workspaceRoot, memoryData }) => (await getWs()).saveWorkingMemory(workspaceRoot, memoryData)
)
on('workspace:ensure', async (root) => (await getWs()).ensureMarkWorkspace(root))

// ---------------------------------------------------------------- Awareness
// Nama fungsi asli modul: startTracking/getBuffer/flushBuffer. get-buffer
// otomatis memulai tracking sekali (interval polling internal modul).
let trackerStarted = false
on('awareness:get-buffer', async () => {
  const tracker = await getTracker()
  if (!trackerStarted) {
    tracker.startTracking()
    trackerStarted = true
  }
  return tracker.getBuffer()
})
on('awareness:clear-buffer', async () => (await getTracker()).flushBuffer())

// ------------------------------------------------------------------ Plugins
// Listing metadata saja (nama/deskripsi/actions) — kode plugin tidak dieksekusi
// di jalur ini; eksekusi tetap fase C4 (Web Worker sandbox, load-when-needed).
on('plugins:list', async () => {
  const pl = await getPl()
  await pl.loadPlugins()
  return pl.getLoadedPlugins()
})

// ------------------------------------------------------- Musik remote (F4)
// Forwarder event ke frontend: Telegram/UI lama mengirim perintah, frontend
// (YoutubeMusicPlayer) yang mengeksekusi — pola event bridge era Electron.
// Bridge mengirim dua argumen posisional: (command, payload).
on('remote-music-command', async (command, payload) => {
  emit('execute-music-command', { command, payload })
  return true
})

// ---------------------------------------------------- YouTube Music player bridge (Tauri)
// Stub handlers — Tauri belum punya window terpisah seperti Electron BrowserWindow.
// Rencanakan: multi-window Tauri WebviewWindow untuk load youtube.com.
// Untuk sekarang: return response yang aman supaya frontend ga crash.
on('yt:load', async (url) => {
  // Future: spawn Tauri WebviewWindow, load youtube.com/music
  // Emit event saat track berubah via yt:track-updated
  return { success: true, message: 'yt:load not yet implemented in Tauri (needs WebviewWindow)' }
})

on('yt:show', async () => {
  return { success: true, message: 'yt:show not yet implemented in Tauri' }
})

on('yt:hide', async () => {
  return { success: true, message: 'yt:hide not yet implemented in Tauri' }
})

on('yt:command', async (command) => {
  // Supported: next, prev, playPause, repeat, queue
  // Future: inject JS into YouTube WebviewWindow
  return { success: false, message: `yt:command '${command}' not yet implemented in Tauri` }
})

on('yt:get-duration', async () => {
  return { success: false, data: 0, message: 'yt:get-duration not yet implemented in Tauri' }
})
// Pencarian lagu via ytmusic-api (lazy; instance di-init sekali). Hasil
// DINORMALKAN ke kontrak lama yt-search ({id,title,artist,duration,url,...})
// karena konsumen (getBestMusicMatch, YoutubeMusicPlayer) bergantung padanya —
// tanpa ini field metadata jadi undefined.
on('search-music', async (query) => {
  const ytm = await getYtm()
  if (typeof ytm.search !== 'function') {
    throw new Error('ytmusic-api tidak menyediakan search()')
  }
  const res = await ytm.search(String(query))
  const items = Array.isArray(res) ? res : Array.isArray(res?.videos) ? res.videos : []
  const fmtDur = (d) => {
    if (d == null) return ''
    if (typeof d === 'string') return d
    const s = Number(d)
    if (!isFinite(s) || s <= 0) return ''
    const m = Math.floor(s / 60)
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    return `${m}:${ss}`
  }
  return items
    .slice(0, 8)
    .map((v) => {
      const id = v.videoId ?? v.id ?? ''
      const thumb =
        v.thumbnails?.at?.(-1)?.url ?? v.thumbnail ?? v.thumbnails?.[0]?.url ?? ''
      return {
        id,
        videoId: id,
        title: v.title ?? v.name ?? '',
        artist: v.artist?.name ?? v.author?.name ?? (typeof v.author === 'string' ? v.author : ''),
        duration: fmtDur(v.duration ?? v.durationText),
        url: `https://music.youtube.com/watch?v=${id}`,
        thumbnail: thumb
      }
    })
    .filter((x) => x.id)
})

// ------------------------------------------------------------- Lite & misc
// Fase B0 (2026-08-26): cluster lite & misc pindah ke Rust native
// (src-tauri/src/cmd_misc.rs): system:get-lite-mode, app:get-documents-path,
// save-temp-file, open-external, show-notification.
// `ping` TETAP di sini — semantiknya health-check proses sidecar itu sendiri.
on('ping', () => 'pong')

// ------------------------------------------- Dipindah ke fase B/C (Tauri native)
// dialog:open-file / dialog:open-directory -> Rust native `misc_open_*_dialog`
// take-screenshot                            -> Rust native `misc_take_screenshot`
// Sisanya masih stub fase B/C.
for (const ch of [
  'browser:navigate',
  'browser:read-dom',
  'browser:action',
  'browser:close',
  'browser:show',
  'os:read',
  'os:click',
  'os:type',
  'os:key',
  'os:scroll',
  'os:open',
  'os:list-windows',
  'os:focus-window',
  'os:ask-user'
]) {
  handlers[ch] = unsupported(ch.startsWith('browser:') ? 'Fase C3' : ch.startsWith('os:') ? 'Fase B6' : 'Fase B5')
}

// -------------------------------------------------------------------- Skills
// Implementasi langsung di atas fs dengan layout yang sama dgn skill-manager
// (XDG ~/.local/share/mark/skills ; folder skill = <nama>/SKILL.md ; legacy *.md)
const SKILLS_DIR = (() => {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  const dir = process.platform === 'win32'
    ? path.join(os.homedir(), 'Documents', 'Mark Skills')
    : path.join(xdg, 'mark', 'skills')
  fs.mkdirSync(dir, { recursive: true })
  return dir
})()

async function readDescription(folderPath) {
  try {
    const raw = await fs.promises.readFile(path.join(folderPath, 'SKILL.md'), 'utf8')
    const m = raw.match(/^---[\s\S]*?description:\s*(.+)$/m)
    if (!m) return raw.split('\n').find(Boolean)?.slice(0, 120) || ''
    return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

// Nama skill wajib sederhana tanpa slash dan tanpa titik di depan agar tidak
// bisa dipakai untuk path traversal keluar dari folder skills.
const isValidSkillName = (name) =>
  typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)

// Handler skills terdaftar lewat on() yang membungkus hasil dengan ok(),
// jadi penolakan dilempar sebagai error agar frame-nya {success:false,error}.
const rejectInvalidSkillName = () => {
  throw new Error('Nama skill tidak valid')
}

on('skills:get-all', async () => {
  await fs.promises.mkdir(SKILLS_DIR, { recursive: true })
  const entries = await fs.promises.readdir(SKILLS_DIR, { withFileTypes: true })
  const skills = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(SKILLS_DIR, e.name)
    if (e.isDirectory()) {
      skills.push({ name: e.name, description: await readDescription(full), type: 'folder', path: full })
    } else if (e.name.endsWith('.md')) {
      const content = await fs.promises.readFile(full, 'utf8')
      skills.push({ name: e.name.replace(/\.md$/, ''), description: content.split('\n')[0] || '', type: 'file', path: full })
    }
  }
  return skills
})
on('skills:read', async (name) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const folder = path.join(SKILLS_DIR, name, 'SKILL.md')
  if (fs.existsSync(folder)) return await fs.promises.readFile(folder, 'utf8')
  const single = path.join(SKILLS_DIR, `${name}.md`)
  if (fs.existsSync(single)) return await fs.promises.readFile(single, 'utf8')
  return null
})
on('skills:save', async (name, content) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const folderPath = path.join(SKILLS_DIR, name)
  const skillFilePath = path.join(folderPath, 'SKILL.md')
  fs.mkdirSync(folderPath, { recursive: true })
  await fs.promises.writeFile(skillFilePath, content, 'utf8')
  emit('skills-updated', { name })
  return true
})
on('skills:delete', async (name) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  const target = path.join(SKILLS_DIR, name)
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true })
    emit('skills-updated', { name })
    return true
  }
  const single = `${target}.md`
  if (fs.existsSync(single)) {
    await fs.promises.unlink(single)
    emit('skills-updated', { name })
    return true
  }
  return false
})
on('skills:read-file', async (name, relativePath) => {
  if (!isValidSkillName(name)) rejectInvalidSkillName()
  // Buang SEMUA segmen '..' dan '.' agar file tetap di dalam folder skill.
  const safe = path
    .normalize(String(relativePath || ''))
    .split(path.sep)
    .filter((s) => s !== '..' && s !== '.')
    .join(path.sep)
  return await fs.promises.readFile(path.join(SKILLS_DIR, name, safe), 'utf8')
})

// ------------------------------------------------------------------- Main loop
send({ event: 'engine:ready', payload: Object.keys(handlers) })

const rl = readline.createInterface({ input: process.stdin, terminal: false })
// Batas panjang satu frame JSON agar stdin tidak bisa menghabiskan memori.
const MAX_FRAME_LENGTH = 32 * 1024 * 1024
rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  if (trimmed.length > MAX_FRAME_LENGTH) {
    send({ id: null, success: false, error: 'json frame terlalu besar (batas 32MB)' })
    return
  }
  let req
  try {
    req = JSON.parse(trimmed)
  } catch {
    send({ id: null, success: false, error: 'malformed json frame' })
    return
  }
  const { id, action, payload } = req
  const handler = handlers[action]
  if (!handler) {
    send({ id, success: false, error: `Aksi tidak dikenal: ${action}` })
    return
  }
  try {
    const result = await handler(payload === undefined ? [] : payload)
    send({ id, ...result })
  } catch (err) {
    send({ id, ...fail(err) })
  }
})
rl.on('close', () => {
  // Event loop stays alive while async handlers complete.
  // Process exits naturally when all work is done.
})
