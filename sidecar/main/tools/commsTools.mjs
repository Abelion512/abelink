// Tool komunikasi/Telegram (dipindah murni dari main/node-tools.js).
import { sendTelegramMessage, sendTelegramFile, getConnectionStatus, sendInlineKeyboard, waitForAskUserAnswer } from '../telegram/telegram-service.js'

export const commsTools = {
  'tg-send': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split(/\|+/)
        if (parts.length < 2) return { success: false, error: 'Format: chatId||tipe(text/file)||konten' }
        const chatId = parts[0].trim()
        const type = parts[1].trim().toLowerCase()
        const content = parts.slice(2).join('||').trim()

        if (type === 'file') {
          const result = await sendTelegramFile(chatId, content)
          return { success: result.success, data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}` }
        } else {
          const result = await sendTelegramMessage(chatId, content)
          return { success: result.success, data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}` }
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
};
