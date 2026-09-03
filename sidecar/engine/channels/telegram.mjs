// Channel: Telegram — kontrol bot, dashboard benchmark, broadcast admin.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, emit, lazy } from '../registry.mjs'

const getTg = lazy(() => import('../../main/telegram/telegram-service.js'))

// Config terakhir yang disinkronkan renderer — sumber tgAdminIds untuk broadcast.
export let latestConfig = null
export const setLatestConfig = (config) => {
  latestConfig = config || null
}

on('tg:start', async (token) => (await getTg()).startTelegramBot(token, null))
on('tg:stop', async () => (await getTg()).stopTelegramBot())
on('tg:get-status', async () => (await getTg()).getConnectionStatus())
on('tg:get-history', async () => (await getTg()).uiMessageHistory)
on('tg:send-message', async (chatId, text) => (await getTg()).sendTelegramMessage(String(chatId), String(text)))
on('tg:agent-execution-done', async (data) => (await getTg()).sendAgentExecutionDone(data))

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

// ------------------------------------------------------- Musik remote (F4)
// Forwarder event ke frontend: Telegram/UI lama mengirim perintah, frontend
// (YoutubeMusicPlayer) yang mengeksekusi — pola event bridge era Electron.
// Bridge mengirim dua argumen posisional: (command, payload).
on('remote-music-command', async (command, payload) => {
  emit('execute-music-command', { command, payload })
  return true
})
