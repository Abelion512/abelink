// Tool komunikasi/Telegram (dipindah murni dari main/node-tools.js).
import fs from 'fs'
import path from 'path'
import os from 'os'
import { sendTelegramMessage, sendTelegramFile, getConnectionStatus, sendInlineKeyboard, waitForAskUserAnswer } from '../telegram/telegram-service.js'

export const commsTools = {
  'tg-send': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const logPath = path.join(os.homedir(), 'Desktop', 'tg_debug.txt')
        fs.appendFileSync(logPath, `\n\n--- NEW RUN ---\nRaw Query: ${query}\n`)

        const parts = query.split(/\|+/)
        if (parts.length < 2) return { success: false, error: 'Format: chatId||tipe(text/file)||konten' }
        const chatId = parts[0].trim()
        const type = parts[1].trim().toLowerCase()
        const content = parts.slice(2).join('||').trim()

        fs.appendFileSync(logPath, `Type evaluated to: "${type}"\nContent evaluated to: "${content}"\n`)

        if (type === 'file') {
          fs.appendFileSync(logPath, `Branch: FILE. Calling sendTelegramFile...\n`)
          const result = await sendTelegramFile(chatId, content)
          fs.appendFileSync(logPath, `Result: ${JSON.stringify(result)}\n`)
          return { success: result.success, data: result.success ? `Berhasil mengirim file ke Telegram.` : `Gagal: ${result.error}` }
        } else {
          fs.appendFileSync(logPath, `Branch: TEXT. Calling sendTelegramMessage...\n`)
          const result = await sendTelegramMessage(chatId, content)
          fs.appendFileSync(logPath, `Result: ${JSON.stringify(result)}\n`)
          return { success: result.success, data: result.success ? `Berhasil mengirim pesan ke Telegram.` : `Gagal: ${result.error}` }
        }
      } catch (e) {
        const errPath = path.join(os.homedir(), 'Desktop', 'tg_debug.txt')
        fs.appendFileSync(errPath, `CRASH: ${e.stack}\n`)
        return { success: false, error: e.message }
      }
    }
  }
};
