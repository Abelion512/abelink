// Eksekutor tool domain MEDIA (dipindah murni dari useAbelinkPlan.executeSingleTool):
// YouTube search/summary, music control, TTS speak, screenshot-to-Telegram.
import { getYoutubeSummary } from '../../../api/ai/tools'
import { playVoice } from '../../../api/ai/utils'

/**
 * @returns {string|undefined} resultString bila tool milik domain ini.
 */
export const runMediaTool = async (tool, query, ctx) => {
  const { targetSetChatData, tgContext, getYoutubeData, handleMusic } = ctx
  // 1. YouTube Search
  if (tool === 'yt-search') {
    const ytResults = await window.api.searchYoutube(query)
    return JSON.stringify(ytResults)
  }
  // 2. YouTube Summary
  if (tool === 'yt-summary') {
    targetSetChatData((prev) => [
      ...prev,
      {
        role: 'ai',
        content: 'Menonton video youtube...',
        isSummarizing: true,
        youtubeLink: query
      }
    ])
    const yData = await getYoutubeData(query)
    const out = await getYoutubeSummary(query, yData, ctx.currentSignal)
    targetSetChatData((prev) => prev.filter((item) => !item.isSummarizing))
    return out
  }
  // 3. Music Control
  if (tool.startsWith('music')) {
    return await handleMusic(tool, query, targetSetChatData)
  }
  // 5. Speak (TTS)
  if (tool === 'speak') {
    if (query && query.trim() !== '') {
      targetSetChatData((prev) => {
        const filtered = prev.filter((item) => !item.isThinking)
        return [
          ...filtered,
          { role: 'ai', content: `(Sedang berbicara) ${query}`, isThinking: true }
        ]
      })
      await playVoice(query)
      return `Berhasil berbicara secara lisan: "${query}"`
    }
    return 'Gagal: teks yang mau diucapkan kosong.'
  }
  // 6. Screenshot ke Telegram (native: misc_take_screenshot + telegram_send_photo)
  if (tool === 'screenshot-to-tg') {
    if (window.api && window.api.tgTakeScreenshot) {
      const targetChatId = tgContext?.chatId || null
      try {
        const res = await window.api.tgTakeScreenshot(targetChatId)
        if (res && res.sent > 0) {
          return `Screenshot layar PC terkirim ke ${res.sent} penerima Telegram.`
        }
        if (res && res.skipped) {
          return 'Gagal: bot Telegram tidak sedang terhubung.'
        }
        return `Gagal mengirim screenshot: ${(res && res.error) || 'tidak diketahui'}`
      } catch (e) {
        return `Gagal: ${(e && e.message) || 'error screenshot Telegram'}`
      }
    }
    return 'Gagal: Fitur Telegram Bot belum tersedia.'
  }
  return undefined
}
