// Channel: Telegram — kontrol bot, dashboard benchmark, broadcast admin.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
//
// W1-2 (js-to-ts-spec.md): rename + tipe; kontrak setTelegramHeadlessRunner
// (M0/D4) dan flag ABELINK_TELEGRAM_HEADLESS tidak berubah.
import { on, emit, lazy } from '../registry.ts'

type TelegramServiceModule = {
  startTelegramBot: (token: unknown, headlessRunner: unknown) => Promise<unknown>
  stopTelegramBot: () => Promise<unknown>
  getConnectionStatus: () => { status: string }
  uiMessageHistory: unknown
  sendTelegramMessage: (chatId: string, text: string) => Promise<unknown>
  sendAgentExecutionDone: (data: unknown) => Promise<unknown>
  sendReport: (runId: unknown, chatId: unknown) => Promise<unknown>
  sendInlineKeyboard: (chatId: unknown, question: unknown, options: unknown) => Promise<unknown>
  sendProgress: (taskId: unknown, status: unknown, details: unknown, chatId: unknown) => Promise<unknown>
}
const getTg = lazy(async () =>
  (await import('../../main/telegram/telegram-service.ts')) as unknown as TelegramServiceModule
)

// Config terakhir yang disinkronkan renderer — sumber tgAdminIds untuk broadcast.
export let latestConfig: Record<string, unknown> | null = null
export const setLatestConfig = (config: Record<string, unknown> | null): void => {
  latestConfig = config || null
}

on('tg:start', async (token: unknown) => (await getTg()).startTelegramBot(token, null))
on('tg:stop', async () => (await getTg()).stopTelegramBot())
on('tg:get-status', async () => (await getTg()).getConnectionStatus())
on('tg:get-history', async () => (await getTg()).uiMessageHistory)
on('tg:send-message', async (chatId: unknown, text: unknown) =>
  (await getTg()).sendTelegramMessage(String(chatId), String(text))
)
on('tg:agent-execution-done', async (data: unknown) => (await getTg()).sendAgentExecutionDone(data))

// ---------------------------------------------------------------- Benchmark events (Telegram dashboard)
// Action di-spread sebagai argumen posisional oleh on(): (action, data)
type TelegramData = { runId?: string; chatId?: string; question?: string; options?: unknown; taskId?: string; status?: string; details?: unknown } | null
on('benchmark:telegram', async (action: unknown, data: unknown) => {
  const tg = await getTg()
  if (tg.getConnectionStatus().status !== 'connected') return { skipped: true }
  const body = (data || {}) as NonNullable<TelegramData>
  const act = action as string
  switch (act) {
    case 'send_report':
      return tg.sendReport(body.runId, body.chatId)
    case 'send_ask_user':
      return tg.sendInlineKeyboard(body.chatId, body.question, body.options)
    case 'send_progress':
      return tg.sendProgress(body.taskId, body.status, body.details, body.chatId)
    default:
      return { success: false, error: `Unknown benchmark:telegram action: ${act}` }
  }
})

// Broadcast ke admin milik owner (id dari config.tgAdminIds). Jika bot tidak
// terhubung, kembalikan flag skipped secara sunyi — pemanggil UI tidak boleh
// kena unhandled rejection tiap giliran agen hanya karena Telegram mati.
on('tg:broadcast-to-admins', async (text: unknown) => {
  const tgMod = await getTg()
  if (tgMod.getConnectionStatus().status !== 'connected') return { skipped: true }
  const ids = String((latestConfig?.tgAdminIds as string) || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return { skipped: true, reason: 'no-admin-ids' }
  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const id of ids) {
    try {
      await tgMod.sendTelegramMessage(id, String(text))
      results.push({ id, ok: true })
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message })
    }
  }
  return { sent: results.filter((r) => r.ok).length, results }
})

// ------------------------------------------------------- Musik remote (F4)
// Forwarder event ke frontend: Telegram/UI lama mengirim perintah, frontend
// (YoutubeMusicPlayer) yang mengeksekusi — pola event bridge era Electron.
// Bridge mengirim dua argumen posisional: (command, payload).
on('remote-music-command', async (command: unknown, payload: unknown) => {
  emit('execute-music-command', { command, payload })
  return true
})
