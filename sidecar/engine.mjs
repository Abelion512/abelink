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

// ---------------------------------------------------------------- AI bridge
const ai = await import('./main/ai-bridge.js')
// Daftarkan manual (bukan lewat on()) supaya bentuk frame sukses/gagal ke bridge
// tidak dibungkus ulang oleh ok().
handlers['ai:fetch'] = async (payload) => {
  const data = Array.isArray(payload) ? payload[0] : payload
  const { messages, config, isSmallTask, jsonSchema } = data || {}
  const onStatus = (msg) => emit('ai:status', msg)
  try {
    const result = await ai.fetchAI(messages || [], config, !!isSmallTask, jsonSchema ?? null, onStatus)
    return { success: true, data: result ?? null }
  } catch (err) {
    return { success: false, error: { message: err.message, code: err.code || 'AI_FETCH_ERROR' } }
  }
}
on('ai:abort-fetch', () => ai.abortAllFetches())
on('sync-config', (config) => {
  ai.setGlobalConfig(config)
  if (
    config?.tgBotToken &&
    config.tgBotToken.trim() &&
    tg.getConnectionStatus().status === 'disconnected'
  ) {
    tg.startTelegramBot(config.tgBotToken.trim(), null)
  }
  return true
})

// ------------------------------------------------------------- Native tools
const nt = await import('./main/node-tools.js')
on('native-tool:execute', async (toolName, query, config) => {
  const tool = nt.NATIVE_TOOLS[toolName]
  if (!tool) return { success: false, error: 'Tool tidak ditemukan' }
  try {
    const result = await tool.handler(query, config)
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('native-tool:needs-approval', (toolName, query) => {
  const tool = nt.NATIVE_TOOLS[toolName]
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

const yt = await import('youtube-transcript-plus')
on('get-youtube-transcript', async (url) => {
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
const yts = (await import('yt-search')).default
on('youtube-search', async (query) => {
  const ytData = await yts(query)
  return ytData.videos.slice(0, 4).map((item) => ({
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
    title: item.title,
    thumbnail: item.thumbnail,
    duration: item.duration,
    author: item.author?.name
  }))
})

// ---------------------------------------------------------------- Telegram
const tg = await import('./main/telegram/telegram-service.js')
on('tg:start', (token) => tg.startTelegramBot(token, null))
on('tg:stop', () => tg.stopTelegramBot())
on('tg:get-status', () => tg.getConnectionStatus())
on('tg:get-history', () => tg.uiMessageHistory)

// ------------------------------------------------------------------ Google
const gsvc = await import('./main/google/google-service.js')
on('google:connect', async (clientId, clientSecret) => {
  try {
    await gsvc.connectGoogle(clientId, clientSecret)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
on('google:disconnect', () => gsvc.disconnectGoogle())
on('google:status', () => gsvc.getGoogleStatus())

// ------------------------------------------------------- Workspace RAG (.mark)
const ws = await import('./main/workspace-rag.js')
on('workspace:index', (root) => ws.indexWorkspace(root))
on('workspace:query', ({ workspaceRoot, queryText, topK }) => ws.queryCodebase(workspaceRoot, queryText, topK))
on('workspace:get-memory', (root) => ws.readWorkingMemory(root))
on('workspace:save-memory', ({ workspaceRoot, memoryData }) => ws.saveWorkingMemory(workspaceRoot, memoryData))
on('workspace:ensure', (root) => ws.ensureMarkWorkspace(root))

// ---------------------------------------------------------------- Awareness
const tracker = await import('./main/awareness/window-tracker.js')
on('awareness:get-buffer', () => tracker.getActivityBuffer())
on('awareness:clear-buffer', () => tracker.clearActivityBuffer())

// ------------------------------------------------------------- Lite & misc
// Fase B0 (2026-08-26): cluster lite & misc pindah ke Rust native
// (src-tauri/src/cmd_misc.rs): system:get-lite-mode, app:get-documents-path,
// save-temp-file, open-external, show-notification.
// `ping` TETAP di sini — semantiknya health-check proses sidecar itu sendiri.
on('ping', () => 'pong')

// ------------------------------------------- Dipindah ke fase B/C (Tauri native)
for (const ch of [
  'take-screenshot',
  'dialog:open-directory',
  'dialog:open-file',
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
import { app as _electronAppStub } from 'electron' // eslint-disable-line
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
rl.on('close', () => process.exit(0))
