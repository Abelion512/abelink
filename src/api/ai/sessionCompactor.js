/**
 * Session Compactor — manajemen konteks per-sesi ala upstream
 * (Mazees/mark-agent `contextManager.js`: budget + pointer + pipa bertahap).
 *
 * - Budget global 525.000 karakter (MAX_SESSION_CHARS, sama persis upstream).
 * - Akuntansi karakter presisi per sesi + pointer lastCompactedMessageId
 *   (pesan yang sudah terangkum tidak dihitung dua kali).
 * - Tahap 1: prune output tool lama in-memory (0ms, tanpa AI).
 * - Tahap 2: ringkasan AI inkremental (delta dari pointer, bukan ulang penuh).
 * - Prompt dirakit non-destruktif: riwayat asli di Dexie tidak diubah.
 *
 * Adaptasi vs upstream: summarizer lewat fetchAI provider aktif (tanpa
 * Gemini-dulu); tahap orphan tool-pair TIDAK dibawa (protokol kita JSON-teks,
 * tak ada role `tool`); store `sessionCompacts` di Dexie (bukan tabel SQL).
 */
import { fetchAI } from './core'
import { compactCodeBlocks } from './contextCompactor'
import { getSessionCompact, saveSessionCompact, saveSession } from '../db'

// Sama persis upstream: 525.000 karakter.
export const MAX_SESSION_CHARS = 525000

// Giliran terbaru yang selalu dipertahankan utuh (tanpa prune penuh).
export const PRESERVE_RECENT_TURNS = 4

export function getMessageId(msg, fallbackIndex = 0) {
  if (!msg) return `msg-${fallbackIndex}`
  return String(msg.id || msg.created_at || msg.timestamp || `msg-${fallbackIndex}`)
}

export function calculateMessageChars(msg) {
  if (!msg) return 0
  let total = 0
  if (typeof msg.content === 'string') {
    total += msg.content.length
  } else if (Array.isArray(msg.content)) {
    total += JSON.stringify(msg.content).length
  } else if (msg.content && typeof msg.content === 'object') {
    total += JSON.stringify(msg.content).length
  }
  if (typeof msg.reasoning === 'string') total += msg.reasoning.length
  if (typeof msg.thought === 'string') total += msg.thought.length
  if (Array.isArray(msg.executedTools) && msg.executedTools.length > 0) {
    total += JSON.stringify(msg.executedTools).length
  }
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    total += JSON.stringify(msg.tool_calls).length
  }
  return total
}

const isSkipped = (m) =>
  !m || m.isThinking || m.isSearching || m.isSummarizing || m.role === 'command'

export function calculateSessionChars(messages = [], summaryBlock = '', lastCompactedMessageId = null) {
  if (!Array.isArray(messages)) return 0
  let total = typeof summaryBlock === 'string' ? summaryBlock.length : 0
  let startIndex = 0
  if (lastCompactedMessageId) {
    const targetId = String(lastCompactedMessageId)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (
        getMessageId(msg, i) === targetId ||
        String(msg?.id) === targetId ||
        String(msg?.created_at) === targetId ||
        String(msg?.timestamp) === targetId
      ) {
        startIndex = i + 1
        break
      }
    }
  }
  for (let i = startIndex; i < messages.length; i++) {
    if (isSkipped(messages[i])) continue
    total += calculateMessageChars(messages[i])
  }
  return total
}

/**
 * Tahap 1: prune output tool lama in-memory (murni, tanpa AI).
 * 4 giliran terbaru utuh; yang lama: executedTools diringkas + kode dikompaksi.
 */
export function pruneOldToolResultsInMemory(messages = [], preserveRecentTurns = PRESERVE_RECENT_TURNS) {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const cloned = messages.map((m) => ({ ...m }))
  const totalValid = cloned.filter((m) => !isSkipped(m)).length
  let validIndex = 0
  for (let i = 0; i < cloned.length; i++) {
    const item = cloned[i]
    if (isSkipped(item)) continue
    validIndex++
    const isRecent = validIndex > totalValid - preserveRecentTurns
    if (isRecent) {
      if (
        validIndex < totalValid &&
        Array.isArray(item.executedTools) &&
        item.executedTools.length > 0
      ) {
        item.executedTools = item.executedTools.map((t) => {
          if (typeof t.fullResult === 'string' && t.fullResult.length > 500) {
            return {
              ...t,
              fullResult: t.resultSummary || t.fullResult.slice(0, 250) + '... [output dipangkas]'
            }
          }
          return t
        })
      }
      continue
    }
    if (Array.isArray(item.executedTools) && item.executedTools.length > 0) {
      item.executedTools = item.executedTools.map((t) => ({
        tool: t.tool || 'unknown_tool',
        query: t.query ? String(t.query).slice(0, 100) : '',
        resultSummary: t.resultSummary || `[tool result dipangkas: ${t.tool || 'tool'}]`,
        fullResult: `[tool result dipangkas: ${t.tool || 'tool'}]`
      }))
    }
    if (typeof item.content === 'string' && item.content.length > 300) {
      item.content = compactCodeBlocks(item.content)
    }
  }
  return cloned
}

/**
 * Tahap 2: ringkas AI inkremental (delta). Dipanggil hanya bila tahap 1
 * tidak cukup. Provider aktif sesi (tanpa Gemini-dulu — adaptasi dari upstream).
 */
export async function summarizeMiddle(messagesToSummarize = [], existingSummaryBlock = '', activeConfig = {}) {
  if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
    return existingSummaryBlock || ''
  }
  const formattedLines = []
  for (let i = 0; i < messagesToSummarize.length; i++) {
    const msg = messagesToSummarize[i]
    if (isSkipped(msg)) continue
    const sender = msg.role === 'user' ? 'User' : 'Abelink'
    let text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
    if (text.length > 2500) {
      text = text.substring(0, 1200) + '\n... [potongan teks panjang diringkas] ...\n' + text.slice(-800)
    }
    formattedLines.push(`[Turn ${i + 1}] ${sender}: ${text}`)
  }
  let messagesText = formattedLines.join('\n\n')
  if (messagesText.length > 90000) {
    messagesText = messagesText.slice(-90000)
  }
  const systemPrompt = `Kamu adalah sistem internal Abelink untuk context compaction.
Tugasmu: Buat SATU ringkasan padat dan komprehensif yang memperbarui ringkasan lama dengan percakapan baru.

Aturan Ringkasan:
1. Pertahankan semua keputusan penting dan kesepakatan pengguna.
2. Pertahankan berkas atau kode yang dibuat atau dimodifikasi.
3. Pertahankan status task yang sedang berjalan atau telah selesai.
4. Buang basa-basi, salam, dan log intermediate yang tidak lagi relevan.
5. Gunakan bahasa Indonesia ringkas, padat, dan faktual.
6. HANYA OUTPUT TEKS RANGKUMAN tanpa kalimat pembuka atau penutup.`
  const promptPayload = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `[RINGKASAN KOMPAKSI SEBELUMNYA]:\n${existingSummaryBlock ? existingSummaryBlock.trim() : '(Belum ada ringkasan sebelumnya / kompaksi pertama kali)'}\n\n[PERCAKAPAN BARU YANG HARUS DIRANGKUM]:\n${messagesText}`
    }
  ]
  try {
    const response = await fetchAI(promptPayload, null, true, null, {
      ...(activeConfig || {}),
      ...(activeConfig?.aiProvider ? {} : { aiProvider: 'gemini-web', geminiWebModel: 'gemini-3.5-flash-thinking' })
    })
    if (response && response.content && !response.error) return response.content.trim()
  } catch (err) {
    console.warn('[sessionCompactor] summarizer provider aktif gagal:', err?.message)
  }
  return `${existingSummaryBlock ? existingSummaryBlock + '\n\n' : ''}[Arsip percakapan lampau: ${messagesToSummarize.length} pesan telah dikompaksi pada ${new Date().toLocaleString('id-ID')}]`
}

/**
 * Orkestrator: kompaksi hybrid per sesi. Non-destruktif terhadap riwayat asli
 * (yang disimpan ke sessions tetap versi prune; ringkasan hidup di store
 * sessionCompacts + dirakit ke prompt oleh caller).
 */
export async function executeSessionCompaction({
  sessionId = '1',
  messages = [],
  activeConfig = {},
  onProgress = null,
  force = false,
  // persist=false: jangan tulis prunedMessages ke sessions (caller memakai
  // jendela history yang sudah di-window; persist akan memotong riwayat asli).
  // Pointer sessionCompacts tetap disimpan (butuh untuk delta).
  persist = true
} = {}) {
  let existingSummaryBlock = ''
  let existingLastCompactedId = null
  try {
    const existingData = await getSessionCompact(sessionId)
    if (existingData) {
      existingSummaryBlock = existingData.summaryBlock || ''
      existingLastCompactedId = existingData.lastCompactedMessageId || null
    }
  } catch (err) {
    console.warn('[sessionCompactor] Gagal mengambil session_compact lama:', err?.message)
  }
  const currentChars = calculateSessionChars(messages, existingSummaryBlock, existingLastCompactedId)
  if (!force && currentChars < MAX_SESSION_CHARS) {
    return {
      success: true,
      isCompacted: false,
      compactedMessages: messages,
      newSummaryBlock: existingSummaryBlock,
      summaryBlock: existingSummaryBlock,
      lastCompactedMessageId: existingLastCompactedId,
      currentChars
    }
  }
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'pruning', text: 'Memangkas log tool di memori...' })
  }
  const prunedMessages = pruneOldToolResultsInMemory(messages, PRESERVE_RECENT_TURNS)
  const prunedChars = calculateSessionChars(prunedMessages, existingSummaryBlock, existingLastCompactedId)
  if (!force && prunedChars < MAX_SESSION_CHARS) {
    if (persist) {
      try {
        await saveSession(sessionId, prunedMessages)
      } catch (e) {
        console.warn('[sessionCompactor] Gagal menyimpan pruned messages:', e?.message)
      }
    }
    return {
      success: true,
      isCompacted: true,
      prunedOnly: true,
      compactedMessages: prunedMessages,
      tailMessages: prunedMessages,
      newSummaryBlock: existingSummaryBlock,
      summaryBlock: existingSummaryBlock,
      lastCompactedMessageId: existingLastCompactedId,
      currentChars: prunedChars
    }
  }
  if (typeof onProgress === 'function') {
    onProgress({ stage: 'summarizing', text: 'Merangkum konteks percakapan lama...' })
  }
  const tailStartIndex = Math.max(0, prunedMessages.length - 1)
  let startIndexToSummarize = 0
  if (existingLastCompactedId) {
    const targetId = String(existingLastCompactedId)
    for (let i = 0; i < prunedMessages.length; i++) {
      const msg = prunedMessages[i]
      if (
        getMessageId(msg, i) === targetId ||
        String(msg?.id) === targetId ||
        String(msg?.created_at) === targetId ||
        String(msg?.timestamp) === targetId
      ) {
        startIndexToSummarize = i + 1
        break
      }
    }
  }
  const effectiveTailIndex = Math.max(tailStartIndex, startIndexToSummarize)
  const messagesToSummarize = prunedMessages.slice(startIndexToSummarize, effectiveTailIndex)
  const tailMessages = prunedMessages.slice(effectiveTailIndex)
  let newSummaryBlock = existingSummaryBlock
  let lastCompactedMessageId = existingLastCompactedId
  if (messagesToSummarize.length > 0) {
    const lastCompactedMsg = messagesToSummarize[messagesToSummarize.length - 1]
    lastCompactedMessageId = getMessageId(lastCompactedMsg, effectiveTailIndex - 1)
    newSummaryBlock = await summarizeMiddle(messagesToSummarize, existingSummaryBlock, activeConfig)
  }
  try {
    await saveSessionCompact(sessionId, {
      summaryBlock: newSummaryBlock,
      lastCompactedMessageId,
      lastCompactedAt: Date.now()
    })
  } catch (err) {
    console.error('[sessionCompactor] Gagal menyimpan session_compact:', err?.message)
  }
  if (persist) {
    try {
      await saveSession(sessionId, prunedMessages)
    } catch (e) {
      console.warn('[sessionCompactor] Gagal menyimpan sessions:', e?.message)
    }
  }
  const finalChars = calculateSessionChars(tailMessages, newSummaryBlock, null)
  return {
    success: true,
    isCompacted: true,
    prunedOnly: false,
    compactedMessages: prunedMessages,
    tailMessages,
    lastCompactedMessageId,
    newSummaryBlock,
    summaryBlock: newSummaryBlock,
    currentChars: finalChars
  }
}

/**
 * Rakit payload prompt non-destruktif: summary block sebagai pesan user
 * pembuka + slice tail terkini.
 */
export function assembleCompactedPayload({ messages = [], sessionCompact = null, systemPrompt = '' } = {}) {
  const payload = []
  if (systemPrompt) payload.push({ role: 'system', content: systemPrompt })
  const summaryBlock = sessionCompact?.summaryBlock
  const lastCompactedId = sessionCompact?.lastCompactedMessageId
  if (summaryBlock) {
    let cutIndex = -1
    if (lastCompactedId) {
      for (let i = 0; i < messages.length; i++) {
        if (getMessageId(messages[i], i) === String(lastCompactedId)) {
          cutIndex = i
          break
        }
      }
    }
    const activeSlice = cutIndex !== -1 ? messages.slice(cutIndex + 1) : messages
    payload.push({ role: 'user', content: `[ COMPACTED MESSAGE SUMMARY ] ${summaryBlock}` })
    for (const msg of activeSlice) {
      if (isSkipped(msg)) continue
      payload.push({ role: msg.role === 'ai' ? 'assistant' : msg.role, content: msg.content || '' })
    }
  } else {
    for (const msg of messages) {
      if (isSkipped(msg)) continue
      payload.push({ role: msg.role === 'ai' ? 'assistant' : msg.role, content: msg.content || '' })
    }
  }
  return payload
}
