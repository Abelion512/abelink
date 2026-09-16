// Eksekutor tool domain MEDIA (dipindah murni dari useAbelinkPlan.executeSingleTool):
// YouTube search/summary, music control, TTS speak, screenshot-to-Telegram.
import { getYoutubeSummary } from '../../../api/ai/tools'
import { playVoice } from '../../../api/ai/utils'
import { parseChoiceQuery, requestChoice, dropChoice } from '../../../api/choiceBus.js'

// Race helper (cermin toolDispatcher agar media mandiri tanpa import silang).
const raceWithAbort = (promise, currentSignal) => {
  let onAbort = null
  const abortPromise = new Promise((_, reject) => {
    onAbort = () => reject(new Error('AbortError'))
    if (currentSignal?.aborted) return onAbort()
    currentSignal?.addEventListener('abort', onAbort)
  })
  return { race: Promise.race([promise, abortPromise]), onAbort }
}

const musicLabel = (m) => {
  const t = typeof m === 'string' ? m : m?.title || m?.id || ''
  const a = typeof m === 'string' ? '' : m?.artist || ''
  return `${t}${a ? ` — ${a}` : ''}`.slice(0, 120)
}

// Tawarkan kandidat lagu via tombol inline (format ask-choice, maks 4).
// Kembalikan item kandidat terpilih atau null (batal/abort).
const offerMusicChoice = async (candidates, question, ctx) => {
  const { targetSetChatData, currentSignal } = ctx || {}
  const opts = candidates.slice(0, 4)
  const parsed = parseChoiceQuery(`${question || 'Lagu mana yang dimaksud?'}||${opts.map(musicLabel).join(';')}`)
  if (!parsed || typeof targetSetChatData !== 'function') return null
  const choiceId = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const choiceTimestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  targetSetChatData((prev) => [
    ...prev.filter((item) => !item.isThinking),
    {
      role: 'ai',
      content: parsed.question,
      choice: { id: choiceId, options: parsed.options, selected: null },
      isIntermediate: true,
      timestamp: choiceTimestamp,
      created_at: Date.now()
    }
  ])
  let selected = null
  const { race, onAbort } = raceWithAbort(requestChoice(choiceId), currentSignal)
  try {
    selected = await race
  } catch (e) {
    selected = null
  } finally {
    if (onAbort) currentSignal?.removeEventListener('abort', onAbort)
    dropChoice(choiceId)
  }
  if (selected == null) return null
  const idx = parsed.options.indexOf(selected)
  targetSetChatData((prev) => [
    ...prev
      .filter((item) => !item.isThinking)
      .map((m) => (m.choice?.id === choiceId ? { ...m, choice: { ...m.choice, selected } } : m)),
    { role: 'user', content: selected, timestamp: choiceTimestamp, created_at: Date.now() }
  ])
  return opts[idx >= 0 ? idx : 0] ?? null
}

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
    const out = await handleMusic(tool, query, targetSetChatData)
    // Kandidat ambigu -> tawarkan tombol inline (ask-choice), bukan autoplay buta.
    // Kontrak: handleMusic kembalikan { candidates } bila tak yakin.
    if (out && typeof out === 'object' && Array.isArray(out.candidates) && out.candidates.length > 0) {
      const picked = await offerMusicChoice(out.candidates, out.question, ctx)
      if (!picked) return '[DIBATALKAN] User tidak memilih lagu. Minta query lebih spesifik bila masih dibutuhkan.'
      return await handleMusic('music-play', picked.id || picked.url || picked.title, targetSetChatData)
    }
    return out
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
