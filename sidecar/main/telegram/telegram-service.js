import { Telegraf, Input } from 'telegraf'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { getGlobalConfig, abortAllFetches, activeAbortControllers } from '../ai-bridge.js'

let bot = null
let currentStatus = 'disconnected'
let botWindow = null
export const uiMessageHistory = []
const MAX_UI_HISTORY = 100
const pendingRequestsMap = new Map()


export const getConnectionStatus = () => {
  return { status: currentStatus }
}

export const stopTelegramBot = () => {
  if (bot) {
    try {
      bot.stop('BOT_STOPPED')
    } catch (e) {
      console.error('[Telegram] Error stopping bot:', e)
    }
    bot = null
  }
  updateStatus('disconnected')
}

import https from 'https'

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000
})

// Batas ukuran unduhan dokumen dari Telegram: 50MB
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024

// Amankan nama file dari Telegram: ambil basename, buang karakter aneh, batasi panjangnya.
const sanitizeFileName = (rawName) => {
  const base = path.basename(String(rawName || ''))
  const cleaned = base.replace(/[^a-zA-Z0-9._ -]/g, '_')
  const capped = cleaned.slice(0, 120).trim()
  return capped || `file_${Date.now()}`
}

// Pastikan path hasil simpan tetap berada di dalam saveDir (anti path traversal).
const resolveContainedSavePath = (saveDir, fileName) => {
  const resolvedDir = path.resolve(saveDir)
  const resolvedPath = path.resolve(resolvedDir, fileName)
  const contained =
    resolvedPath === resolvedDir || resolvedPath.startsWith(resolvedDir + path.sep)
  return contained ? resolvedPath : null
}

export const startTelegramBot = async (token, mainWindow) => {
  if (!token || !token.trim()) {
    console.error('[Telegram] Token kosong')
    updateStatus('disconnected')
    return
  }

  botWindow = mainWindow
  if (bot) {
    stopTelegramBot()
  }

  updateStatus('connecting')

  try {
    const config = getGlobalConfig()
    const telegramOpts = { agent }
    if (config.tgApiRoot && config.tgApiRoot.trim()) {
      telegramOpts.apiRoot = config.tgApiRoot.trim()
    }

    bot = new Telegraf(token.trim(), { telegram: telegramOpts })

    if (config.tgAdminIds) {
      const ids = config.tgAdminIds.split(',').map((s) => s.trim()).filter(Boolean)
      const numericIds = []
      ids.forEach((id) => {
        const cleanId = id.replace(/^@/, '')
        if (/^\d+$/.test(cleanId)) {
          numericIds.push(cleanId)
          adminChatIdsSet.add(cleanId)
          pendingChatIdsSet.delete(cleanId)
        }
      })
      // Hanya id yang tercantum di config.tgAdminIds yang dianggap admin terpercaya.
      setTelegramAdmins(numericIds)
      saveChatIdsToFile()
    }

    bot.command('start', (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      const senderUsername = (ctx.from?.username || '').toLowerCase()
      if (chatId) {
        adminChatIdsSet.add(chatId)
        if (senderUsername) usernameToChatIdMap.set(senderUsername, chatId)
        saveChatIdsToFile()
      }
      if (chatId && authorizedAdminIds.has(chatId)) {
        // Admin terpercaya: hapus status pending dan sambut normal.
        pendingChatIdsSet.delete(chatId)
        ctx.reply('Halo! Saya Mark (AI OS Companion). Bot Telegram ini telah terhubung. Kamu terdaftar sebagai admin.')
      } else if (chatId) {
        // Pendaftaran mandiri tetap masuk daftar broadcast, tapi ditandai PENDING:
        // tidak akan menerima screenshot/approval sampai id-nya masuk tgAdminIds.
        pendingChatIdsSet.add(chatId)
        ctx.reply(
          'Halo! Saya Mark (AI OS Companion). Bot Telegram ini telah terhubung.\n\n' +
          `ID kamu (${chatId}) terdaftar sebagai PENDING. Tambahkan ID tersebut ke tgAdminIds ` +
          'di konfigurasi MARK agar menerima screenshot & approval.'
        )
      } else {
        ctx.reply('Halo! Saya Mark (AI OS Companion). Bot Telegram ini telah terhubung.')
      }
    })

    bot.command('info', (ctx) => {
      ctx.reply(
        '**Daftar Perintah MARK:**\n\n' +
        '/start - Memulai bot\n' +
        '/info - Menampilkan daftar perintah\n' +
        '/abort - Menghentikan proses AI yang sedang berjalan\n' +
        '/accept - Mengizinkan persetujuan sekali saja\n' +
        '/always - Mengizinkan selamanya untuk path folder ini\n' +
        '/reject - Menolak prompt persetujuan',
        { parse_mode: 'Markdown' }
      )
    })

    bot.command('abort', (ctx) => {
      if (activeAbortControllers.size > 0) {
        abortAllFetches()
        ctx.reply('[INFO]: Membatalkan proses AI saat ini...')
      } else {
        ctx.reply('[INFO]: Tidak ada proses AI yang sedang berjalan.')
      }
    })

    bot.command('accept', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-accept', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.command('always', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-always', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.command('reject', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      if (botWindow && !botWindow.isDestroyed()) {
        const chatId = String(ctx.chat?.id || ctx.from?.id || '')
        botWindow.webContents.send('tg:command-reject', { chatId })
      } else {
        ctx.reply('[ERROR]: UI Mark tidak terhubung.')
      }
    })

    bot.on('text', async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name
        ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim()
        : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)
      const text = ctx.message?.text || ''

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getGlobalConfig()
      const adminList = (config.tgAdminIds || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)

      const isAdmin =
        adminList.includes(senderId.toLowerCase()) ||
        (senderUsername && adminList.includes(senderUsername))

      if (!isAdmin) {
        console.log(`[Telegram] Access denied for user ${senderId} (@${senderUsername})`)
        await ctx.reply('Maaf, kamu belum punya akses ke MARK.')
        return
      }

      adminChatIdsSet.add(chatId)
      if (senderUsername) usernameToChatIdMap.set(senderUsername, chatId)
      saveChatIdsToFile()

      const msgId = `${chatId}-${ctx.message.message_id}`

      const uiMsgPayload = {
        id: msgId,
        chatId: chatId,
        sender: senderName,
        text: text,
        isGroup: ctx.chat?.type !== 'private',
        chatTitle: ctx.chat?.title || senderName,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        type: 'incoming'
      }

      uiMessageHistory.push(uiMsgPayload)
      if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('tg:message', uiMsgPayload)
        botWindow.webContents.send('tg:thinking', { sender: senderName, chatId })
      }

      let loadingMsgId = null
      try {
        const loadingMsg = await ctx.reply('[LOADING]: Sedang diproses...', { disable_notification: true })
        loadingMsgId = loadingMsg.message_id
      } catch (e) {}

      pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId })
      setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

      const recentHistory = uiMessageHistory
        .filter((m) => m.chatId === chatId)
        .slice(-10)
        .map((m) => ({
          role: m.type === 'incoming' ? 'user' : 'assistant',
          content: m.type === 'incoming' ? m.text : m.reply
        }))

      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('tg:request-agent-execution', {
          text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
          isAdmin: true,
          senderName,
          msgId,
          chatId,
          isGroup: ctx.chat?.type !== 'private',
          chatSession: recentHistory
        })
      }
    })

    bot.on(['document', 'photo'], async (ctx) => {
      const senderId = String(ctx.from?.id || '')
      const senderName = ctx.from?.first_name ? `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim() : ctx.from?.username || senderId
      const chatId = String(ctx.chat?.id || senderId)

      const senderUsername = (ctx.from?.username || '').toLowerCase()
      const config = getGlobalConfig()
      const adminList = (config.tgAdminIds || '')
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
      const isAdmin = adminList.includes(senderId.toLowerCase()) || (senderUsername && adminList.includes(senderUsername))

      if (!isAdmin) {
        await ctx.reply('Maaf, kamu belum punya akses ke MARK.')
        return
      }
      
      try {
        let fileId = ''
        let originalName = ''

        if (ctx.message.document) {
          fileId = ctx.message.document.file_id
          originalName = sanitizeFileName(ctx.message.document.file_name || `document_${Date.now()}`)
          // Tolak lebih awal SEBELUM mengunduh/buffering bila metadata ukuran tersedia.
          const declaredSize = Number(ctx.message.document.file_size || 0)
          if (declaredSize > MAX_DOWNLOAD_BYTES) {
            await ctx.reply('[ERROR]: File terlalu besar (batas 50MB). Unduhan dibatalkan.')
            return
          }
        } else if (ctx.message.photo) {
          const photo = ctx.message.photo[ctx.message.photo.length - 1]
          fileId = photo.file_id
          originalName = sanitizeFileName(`photo_${Date.now()}.jpg`)
        }

        const statusMsg = await ctx.reply(`[INFO]: Sedang mengunduh file ${originalName}...`)

        const fileUrl = await ctx.telegram.getFileLink(fileId)
        const saveDir = path.join(os.homedir(), 'Documents', 'Mark Workspace', 'Telegram')
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

        const savePath = resolveContainedSavePath(saveDir, originalName)
        if (!savePath) {
          console.warn(`[Telegram] Path simpan di luar direktori tujuan, dibatalkan: ${originalName}`)
          await ctx.telegram.editMessageText(
            chatId,
            statusMsg.message_id,
            undefined,
            '[ERROR]: Nama file tidak valid. Unduhan dibatalkan.'
          )
          return
        }
        
        const response = await fetch(fileUrl)
        const buffer = await response.arrayBuffer()
        fs.writeFileSync(savePath, Buffer.from(buffer))

        await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `[INFO]: Berhasil mengunduh: ${originalName}\n[LOADING]: Sedang diproses...`)

        const caption = ctx.message.caption || ''
        const text = `[FILE TERLAMPIR]: "${savePath}"\n${caption ? `Caption dari user: ${caption}` : 'Silakan baca/analisa file gambar atau dokumen ini jika perlu.'}`

        const msgId = `${chatId}-${ctx.message.message_id}`
        const uiMsgPayload = {
          id: msgId,
          chatId: chatId,
          sender: senderName,
          text: `[FILE]: Mengirim file: ${originalName}\n${caption}`,
          isGroup: ctx.chat?.type !== 'private',
          chatTitle: ctx.chat?.title || senderName,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          type: 'incoming'
        }

        uiMessageHistory.push(uiMsgPayload)
        if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

        if (botWindow && !botWindow.isDestroyed()) {
          botWindow.webContents.send('tg:message', uiMsgPayload)
          botWindow.webContents.send('tg:thinking', { sender: senderName, chatId })
        }

        pendingRequestsMap.set(msgId, { ctx, chatId, text, loadingMsgId: statusMsg.message_id })
        setTimeout(() => pendingRequestsMap.delete(msgId), 300000)

        const recentHistory = uiMessageHistory
          .filter((m) => m.chatId === chatId)
          .slice(-10)
          .map((m) => ({
            role: m.type === 'incoming' ? 'user' : 'assistant',
            content: m.type === 'incoming' ? m.text : m.reply
          }))

        if (botWindow && !botWindow.isDestroyed()) {
          botWindow.webContents.send('tg:request-agent-execution', {
            text: `[Telegram from ${chatId} - ${senderName}]:\n${text}`,
            isAdmin: true,
            senderName,
            msgId,
            chatId,
            isGroup: ctx.chat?.type !== 'private',
            chatSession: recentHistory
          })
        }
      } catch (e) {
        console.error('Failed to download file from Telegram:', e)
        ctx.reply(`Gagal mengunduh file: ${e.message}`)
      }
    })

    bot.command('run', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      await ctx.reply('[SKIP]: Perintah benchmark lewat Telegram belum terhubung ke runner di UI. Jalankan dari terminal: bun run benchmark:run.')
    })

    bot.command('report', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      const res = await sendReport(null, chatId)
      if (!res.success) {
        await ctx.reply(`[ERROR]: ${res.error}`)
      }
      // Laporan sukses sudah dikirim langsung oleh sendReport ke chatId ini.
    })

    bot.command('stop', async (ctx) => {
      if (!(await ensureTrustedAdmin(ctx))) return
      await ctx.reply('[SKIP]: Tidak ada benchmark yang berjalan via Telegram. Runner benchmark berjalan sinkron di terminal.')
    })

    bot.action(/^bmk_(yes|no|opt_\d+)$/, async (ctx) => {
      const chatId = String(ctx.chat?.id || ctx.from?.id || '')
      const answer = ctx.match[1]
      resolveAskUser(chatId, answer)
      if (botWindow && !botWindow.isDestroyed()) {
        botWindow.webContents.send('benchmark:ask-response', { chatId, answer })
      }
      await ctx.answerCbQuery()
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] })
      await ctx.reply(`Jawaban diterima: ${answer}`)
    })

    bot.catch((err, ctx) => {
      console.error(`[Telegram] Error for ${ctx.updateType}:`, err)
    })

    bot.launch({ allowedUpdates: ['message', 'callback_query'] }).catch((err) => {
      console.error('[Telegram] Polling error:', err)
      bot = null
      updateStatus('disconnected')
    })
    updateStatus('connected')
    console.log('[Telegram] Bot successfully started and listening')
  } catch (err) {
    console.error('[Telegram] Failed to start bot:', err)
    bot = null
    updateStatus('disconnected')
  }
}

const formatMarkdownToTelegramHTML = (text) => {
  if (!text) return ''
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  html = html.replace(/```([a-z0-9-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
    return lang ? `<pre><code class="language-${lang}">${code}</code></pre>` : `<pre><code>${code}</code></pre>`
  })
  
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  html = html.replace(/\*([^*]+)\*/g, '<i>$1</i>')
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  
  return html
}

export const sendTelegramMessage = async (chatId, text) => {
  if (!bot || currentStatus !== 'connected') {
    return { success: false, error: 'Telegram Bot belum terhubung.' }
  }
  try {
    const htmlText = formatMarkdownToTelegramHTML(text)
    await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    return { success: true }
  } catch (err) {
    try {
      await bot.telegram.sendMessage(chatId, text)
      return { success: true }
    } catch (fallbackErr) {
      return { success: false, error: fallbackErr.message }
    }
  }
}

export const sendTelegramFile = async (chatId, filePath, caption = '') => {
  if (!bot || currentStatus !== 'connected') {
    return { success: false, error: 'Telegram Bot belum terhubung.' }
  }
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File tidak ditemukan: ${filePath}` }
  }
  try {
    const filename = path.basename(filePath)
    const fileStream = fs.createReadStream(filePath)
    await bot.telegram.sendDocument(
      chatId,
      { source: fileStream, filename: filename },
      { caption }
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

const adminChatIdsSet = new Set()
const usernameToChatIdMap = new Map()
const pendingBroadcastQueue = []

// Chat yang mendaftar via /start tapi BELUM tercantum di daftar admin (pending, tidak dipercaya).
const pendingChatIdsSet = new Set()
// Id admin terpercaya: hanya id yang ada di config.tgAdminIds; dipersist ke tg_admin_ids.json.
const authorizedAdminIds = new Set()

// Pengganti app.getPath('userData') era Electron: XDG data dir Linux.
const MARK_DATA_DIR = path.join(
  process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
  'mark'
)
fs.mkdirSync(MARK_DATA_DIR, { recursive: true })
const CHAT_IDS_FILE = path.join(MARK_DATA_DIR, 'tg_chat_ids.json')
const ADMIN_IDS_FILE = path.join(MARK_DATA_DIR, 'tg_admin_ids.json')

const loadSavedAdminIds = () => {
  try {
    if (fs.existsSync(ADMIN_IDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_IDS_FILE, 'utf8'))
      if (Array.isArray(data.adminIds)) {
        data.adminIds.forEach((id) => authorizedAdminIds.add(String(id)))
      }
      console.log(`[Telegram] Loaded ${authorizedAdminIds.size} trusted admin IDs.`)
    }
  } catch (e) {
    console.error('[Telegram] Error loading saved admin IDs:', e)
  }
}

const saveAdminIdsToFile = () => {
  try {
    fs.writeFileSync(
      ADMIN_IDS_FILE,
      JSON.stringify({ adminIds: Array.from(authorizedAdminIds) }, null, 2),
      'utf8'
    )
  } catch (e) {
    console.error('[Telegram] Error saving admin IDs to file:', e)
  }
}

// Daftarkan id admin terpercaya (dari config.tgAdminIds). Dipanggil oleh startTelegramBot;
// dieksport juga agar modul lain bisa memasang daftar admin secara eksplisit.
export const setTelegramAdmins = (ids) => {
  const list = Array.isArray(ids) ? ids : [ids]
  let changed = false
  list.forEach((raw) => {
    const clean = String(raw || '').trim().toLowerCase().replace(/^@/, '')
    if (/^\d+$/.test(clean) && !authorizedAdminIds.has(clean)) {
      authorizedAdminIds.add(clean)
      pendingChatIdsSet.delete(clean)
      changed = true
    }
  })
  if (changed) saveAdminIdsToFile()
}

// Gate perintah sensitif: wajib ctx.from.id tercantum di daftar admin terpercaya.
const ensureTrustedAdmin = async (ctx) => {
  const senderId = String(ctx.from?.id || '')
  if (senderId && authorizedAdminIds.has(senderId)) return true
  console.warn(`[Telegram] Perintah ditolak: sender ${senderId} bukan admin terpercaya.`)
  await ctx.reply('Tidak diizinkan.')
  return false
}

// Target broadcast TERPERCAYA saja: irisan antara config tgAdminIds dengan chat terdaftar.
// Chat pending (hanya /start tanpa masuk config) tidak pernah ikut.
const resolveTrustedBroadcastTargets = () => {
  const trusted = new Set()
  for (const id of authorizedAdminIds) {
    if (adminChatIdsSet.has(id)) trusted.add(id)
  }
  const config = getGlobalConfig()
  const adminInputs = (config.tgAdminIds || '')
    .split(',')
    .map((id) => id.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  for (const input of adminInputs) {
    if (/^\d+$/.test(input)) {
      if (adminChatIdsSet.has(input)) trusted.add(input)
    } else if (usernameToChatIdMap.has(input)) {
      const mapped = usernameToChatIdMap.get(input)
      if (adminChatIdsSet.has(mapped)) trusted.add(mapped)
    }
  }
  return trusted
}

const loadSavedChatIds = () => {
  try {
    if (fs.existsSync(CHAT_IDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf8'))
      if (Array.isArray(data.chatIds)) {
        data.chatIds.forEach((id) => adminChatIdsSet.add(String(id)))
      }
      if (data.usernameMap && typeof data.usernameMap === 'object') {
        Object.entries(data.usernameMap).forEach(([user, id]) => {
          usernameToChatIdMap.set(user, String(id))
        })
      }
      console.log(`[Telegram] Loaded ${adminChatIdsSet.size} saved admin chat IDs.`)
    }
  } catch (e) {
    console.error('[Telegram] Error loading saved chat IDs:', e)
  }
}

const saveChatIdsToFile = () => {
  try {
    const data = {
      chatIds: Array.from(adminChatIdsSet),
      usernameMap: Object.fromEntries(usernameToChatIdMap)
    }
    fs.writeFileSync(CHAT_IDS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.error('[Telegram] Error saving chat IDs to file:', e)
  }
}

loadSavedChatIds()
loadSavedAdminIds()

const flushPendingBroadcasts = async () => {
  if (currentStatus !== 'connected' || pendingBroadcastQueue.length === 0) return
  console.log(`[Telegram] Flushing ${pendingBroadcastQueue.length} pending broadcast messages...`)
  const queue = [...pendingBroadcastQueue]
  pendingBroadcastQueue.length = 0
  for (const text of queue) {
    await sendTelegramToAdmins(text)
  }
}

const updateStatus = (status) => {
  currentStatus = status
  if (botWindow && !botWindow.isDestroyed()) {
    botWindow.webContents.send('tg:connection', status)
  }
  if (status === 'connected') {
    setTimeout(flushPendingBroadcasts, 500)
  }
}

export const sendTelegramToAdmins = async (text) => {
  if (!bot || currentStatus !== 'connected') {
    console.log('[Telegram] Bot belum terhubung. Menampung pesan ke antrean broadcast...')
    pendingBroadcastQueue.push(text)
    return
  }
  // Hanya kirim ke admin terpercaya (config tgAdminIds yang terdaftar), bukan chat pending.
  const targetChatIds = resolveTrustedBroadcastTargets()

  if (targetChatIds.size === 0) {
    console.warn('[Telegram Broadcast] Tidak ada admin terpercaya. Tambahkan ID Telegram ke tgAdminIds di konfigurasi MARK, lalu kirim /start dari akun tersebut.')
    return
  }

  console.log(`[Telegram Broadcast] Mengirim pesan ke ${targetChatIds.size} Chat ID:`, Array.from(targetChatIds))

  for (const chatId of targetChatIds) {
    try {
      const htmlText = formatMarkdownToTelegramHTML(text)
      await bot.telegram.sendMessage(chatId, htmlText, { parse_mode: 'HTML' })
    } catch (err) {
      try {
        await bot.telegram.sendMessage(chatId, text)
      } catch (e) {
        console.error(`[Telegram] Gagal mengirim broadcast ke ${chatId}:`, e.message)
      }
    }
  }
}

// ---- Channel exports (didaftarkan engine.mjs; tanpa Electron IPC) ----
// Kirim event ke renderer lewat stdout JSON-lines (engine meneruskan ke Tauri event system).
const sendEvent = (event, payload) => {
  try {
    process.stdout.write(JSON.stringify({ event, payload }) + '\n')
  } catch {}
}

export const broadcastToAdminsSidecar = async (text) => {
  await sendTelegramToAdmins(text)
  return { success: true }
}

export const sendAgentExecutionDone = async (data) => {
  const { chatId, result, msgId } = data || {}
  const reqObj = pendingRequestsMap.get(msgId)
  const replyText = result?.answer || 'Selesai diproses.'

  const uiReplyPayload = {
    id: Date.now(),
    chatId: chatId,
    sender: 'Mark',
    text: reqObj?.text || '',
    reply: replyText,
    toolsUsed: result?.toolsUsed || [],
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    type: 'outgoing'
  }

  uiMessageHistory.push(uiReplyPayload)
  if (uiMessageHistory.length > MAX_UI_HISTORY) uiMessageHistory.shift()

  sendEvent('tg:reply-sent', uiReplyPayload)

  if (bot && chatId) {
    if (reqObj?.loadingMsgId) {
      try {
        await bot.telegram.deleteMessage(chatId, reqObj.loadingMsgId)
      } catch (e) {}
    }
    try {
      await bot.telegram.sendMessage(chatId, replyText, { parse_mode: 'Markdown' })
    } catch (e) {
      await bot.telegram.sendMessage(chatId, replyText).catch(() => {})
    }
  }

  pendingRequestsMap.delete(msgId)
  return { success: true }
}

// ---- Benchmark dashboard methods ----

// Direktori hasil benchmark relatif terhadap root repo (stabil terhadap cwd).
// telegram-service.js ada di sidecar/main/telegram/ -> naik 3 level ke repo root.
const RESULTS_DIR = fileURLToPath(new URL('../../../benchmark/results/', import.meta.url))

const loadLatestResult = (runId) => {
  try {
    const dir = RESULTS_DIR
    if (!fs.existsSync(dir)) return null
    let file
    if (runId) {
      file = path.join(dir, `${runId}.json`)
      if (!fs.existsSync(file)) return null
    } else {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
      if (!files.length) return null
      file = path.join(dir, files[0])
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error('[Telegram] Error loading benchmark result:', e)
    return null
  }
}

export const sendReport = async (runId, targetChatId) => {
  if (!bot || currentStatus !== 'connected') return { success: false, error: 'Bot not connected.' }
  const report = loadLatestResult(runId)
  if (!report) return { success: false, error: 'No benchmark result found.' }

  const lines = [
    `<b>MarkBench Report</b>`,
    `<code>Run:</code> ${escapeHtml(report.runId)}`,
    `<code>Variant:</code> ${escapeHtml(report.agentVariant)}`,
    `<code>Model:</code> ${escapeHtml(report.model)}`,
    `<code>Git:</code> ${escapeHtml(report.gitCommit?.slice(0, 7) ?? 'unknown')}`,
    `<code>Time:</code> ${new Date(report.timestamp).toLocaleString('id-ID')}`,
    `<code>Duration:</code> ${Number(report.totalDurationMs)}ms`,
    '',
    `<b>Summary:</b> ${report.summary.passed}/${report.summary.total} passed (${((report.summary.passed / report.summary.total) * 100).toFixed(1)}%)`
  ]

  for (const t of report.tasks) {
    const status = t.status === 'passed' ? 'PASS' : 'FAIL'
    lines.push(`[${status}] ${escapeHtml(t.taskId)} — ${Number(t.durationMs)}ms (${escapeHtml(t.status)})`)
  }

  const targets = resolveTrustedBroadcastTargets()
  const chatIds = targetChatId ? [String(targetChatId)] : Array.from(targets)
  if (chatIds.length === 0) return { success: false, error: 'No admin targets.' }

  const results = []
  for (const chatId of chatIds) {
    try {
      await bot.telegram.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' })
      results.push({ chatId, ok: true })
    } catch (e) {
      results.push({ chatId, ok: false, error: e.message })
    }
  }
  return { sent: results.filter(r => r.ok).length, results }
}

export const sendInlineKeyboard = async (chatId, question, options) => {
  if (!bot || currentStatus !== 'connected') return { success: false, error: 'Bot not connected.' }
  if (!chatId) return { success: false, error: 'chatId required.' }

  const keyboard = {
    inline_keyboard: (options || ['Approve', 'Reject']).map((opt, i) => [
      { text: opt.label || opt, callback_data: `bmk_${opt.value || `opt_${i}`}` }
    ])
  }

  try {
    await bot.telegram.sendMessage(chatId, escapeHtml(String(question)), {
      parse_mode: 'HTML',
      reply_markup: JSON.stringify(keyboard)
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ---- ask_user correlation: pending registry keyed by chatId ----
// ask_user mengirim keyboard lalu MENUNGGU jawaban callback bmk_*.
let askUserWaiters = new Map() // chatId -> { resolve, timer }
const ASK_USER_TIMEOUT_MS = 120000

const resolveAskUser = (chatId, answer) => {
  const w = askUserWaiters.get(String(chatId))
  if (!w) return false
  clearTimeout(w.timer)
  askUserWaiters.delete(String(chatId))
  w.resolve(answer)
  return true
}

export const waitForAskUserAnswer = (chatId, timeoutMs = ASK_USER_TIMEOUT_MS) =>
  new Promise((resolve) => {
    const key = String(chatId)
    const existing = askUserWaiters.get(key)
    if (existing) {
      clearTimeout(existing.timer)
      existing.resolve(null)
    }
    const timer = setTimeout(() => {
      askUserWaiters.delete(key)
      resolve(null) // timeout -> null
    }, timeoutMs)
    askUserWaiters.set(key, { resolve, timer })
  })

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

let progressMessageCache = new Map()

export const sendProgress = async (taskId, status, details, targetChatId) => {
  if (!bot || currentStatus !== 'connected') return { success: false, error: 'Bot not connected.' }

  const statusLabel = { running: 'RUNNING', passed: 'PASS', failed: 'FAIL', error: 'ERROR' }[status] || 'PENDING'
  const text = `<b>Benchmark Progress</b>\n<code>Task:</code> ${escapeHtml(taskId)}\n<code>Status:</code> ${escapeHtml(statusLabel)}\n${escapeHtml(details || '')}`

  const chatIds = targetChatId ? [String(targetChatId)] : Array.from(resolveTrustedBroadcastTargets())
  if (chatIds.length === 0) return { success: false, error: 'No admin targets.' }

  const results = []
  for (const chatId of chatIds) {
    try {
      const prev = progressMessageCache.get(chatId)
      if (prev) {
        await bot.telegram.editMessageText(chatId, prev.msgId, undefined, text, {
          parse_mode: 'HTML',
          reply_markup: JSON.stringify({ inline_keyboard: [] })
        })
      } else {
        const msg = await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' })
        progressMessageCache.set(chatId, { msgId: msg.message_id })
      }
      results.push({ chatId, ok: true })
    } catch (e) {
      results.push({ chatId, ok: false, error: e.message })
    }
  }
  if (status === 'passed' || status === 'failed' || status === 'error') {
    progressMessageCache.clear()
  }
  return { sent: results.filter(r => r.ok).length, results }
}
