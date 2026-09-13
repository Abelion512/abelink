/**
 * Session Compactor — manajemen konteks per-sesi ala upstream
 * (Mazees/mark-agent `contextManager.js`: budget + pointer + pipa bertahap).
 *
 * - Budget 525.000 karakter (MAX_SESSION_CHARS, sama persis upstream) dihitung
 *   dari INPUT yang diberikan caller + pointer lastCompactedMessageId (pesan
 *   yang sudah terangkum tidak dihitung dua kali). Jalur otomatis
 *   (useAbelinkPlan) mengirim riwayat sesi penuh agar budget benar-benar
 *   per-sesi; prompt-nya tetap di-window `context` pesan oleh caller.
 * - Akuntansi ber-saturasi: `calculateSessionChars` berhenti begitu melewati
 *   budget (keputusan hanya butuh "< MAX"), jadi input riwayat penuh tetap
 *   murah dihitung tiap giliran.
 * - Tahap 1: prune output tool lama in-memory (0ms, tanpa AI).
 * - Tahap 2: ringkasan AI inkremental (delta dari pointer, bukan ulang penuh).
 * - Prompt dirakit non-destruktif: riwayat asli di Dexie tidak diubah.
 *
 * INVARIANT COVERAGE (jangan dilanggar): lastCompactedMessageId hanya boleh
 * menunjuk pesan yang BENAR-BENAR masuk ke ringkasan. Rentang yang lebih besar
 * dari kapasitas input summarizer diproses bertahap (chunk, paling lama dulu)
 * dan pointer hanya maju sejauh chunk yang selesai; sisanya dilanjutkan
 * kompaksi berikutnya. Ringkasan tidak pernah memotong ekor lalu mengklaim
 * seluruh rentang sudah tercakup.
 *
 * INVARIANT RETENSI (pilihan sadar caller): pada giliran non-kompaksi caller
 * mengirim summary + window pesan terbaru, sehingga pesan di dalam window yang
 * sudah tercakup ringkasan ikut terkirim lagi (duplikasi terbatas ±1,2k char
 * per pesan karena caller memangkas pesan lama) — itu sebabnya akuntansi
 * men-skip pre-pointer. Jangan memotong window untuk menghilangkan duplikasi:
 * retensi turn terbaru lebih penting daripada angka akuntansi.
 *
 * persist=true menulis prunedMessages ke store `sessions` (memotong riwayat
 * asli). Pemanggil yang hanya butuh ringkasan untuk prompt WAJIB persist=false.
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

// Hasil akuntansi ber-saturasi di `maxChars` (default = budget). Caller yang
// butuh angka pasti cukup membandingkan dengan MAX_SESSION_CHARS.
export function calculateSessionChars(
  messages = [],
  summaryBlock = '',
  lastCompactedMessageId = null,
  maxChars = MAX_SESSION_CHARS
) {
  if (!Array.isArray(messages)) return 0
  const cap = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_SESSION_CHARS
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
  if (total >= cap) return cap
  for (let i = startIndex; i < messages.length; i++) {
    if (isSkipped(messages[i])) continue
    total += calculateMessageChars(messages[i])
    if (total >= cap) return cap
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
// Budget karakter untuk SATU panggilan summarizer (upstream: 90k).
export const MAX_SUMMARY_INPUT_CHARS = 90000
// Batas teks per pesan di dalam input summarizer (head+tail tetap dipertahankan).
export const SUMMARY_PER_MESSAGE_CHARS = 2500
// Batas jumlah panggilan AI per kompaksi; sisanya dilanjutkan kompaksi berikutnya.
export const MAX_SUMMARY_CHUNKS_PER_RUN = 4

const renderSummaryLine = (msg, index, maxChars = SUMMARY_PER_MESSAGE_CHARS) => {
  if (isSkipped(msg)) return null
  const sender = msg.role === 'user' ? 'User' : 'Abelink'
  let text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
  if (text.length > maxChars) {
    const head = Math.max(120, Math.floor(maxChars * 0.6))
    const tail = Math.max(80, maxChars - head)
    text = text.substring(0, head) + '\n... [potongan teks panjang diringkas] ...\n' + text.slice(-tail)
  }
  return `[Turn ${index + 1}] ${sender}: ${text}`
}

/**
 * Bagi rentang pesan jadi chunk input summarizer (paling lama dulu) yang tiap
 * chunknya muat ± maxChars. INVARIANT COVERAGE: setiap pesan non-skipped
 * terwakili di salah satu chunk — tidak ada pemotongan ekor yang membuang
 * pesan sementara pointer tetap maju. `lastIndex` = indeks pesan terakhir yang
 * benar-benar masuk chunk (dipakai caller untuk memajukan pointer).
 */
export function buildSummaryChunks(messagesToSummarize = [], maxChars = MAX_SUMMARY_INPUT_CHARS) {
  const budget = Math.max(1000, Number(maxChars) || MAX_SUMMARY_INPUT_CHARS)
  const chunks = []
  let lines = []
  let size = 0
  let lastIndex = -1
  const flush = () => {
    if (lines.length === 0) return
    chunks.push({ text: lines.join('\n\n'), count: lines.length, lastIndex })
    lines = []
    size = 0
    lastIndex = -1
  }
  for (let i = 0; i < messagesToSummarize.length; i++) {
    const line = renderSummaryLine(messagesToSummarize[i], i)
    if (!line) continue
    if (lines.length > 0 && size + 2 + line.length > budget) flush()
    if (lines.length === 0) {
      lines.push(line)
      size = line.length
    } else {
      lines.push(line)
      size += 2 + line.length
    }
    lastIndex = i
  }
  flush()
  return chunks
}

/**
 * Satu panggilan summarizer untuk satu chunk (fold ke ringkasan lama).
 */
async function summarizeChunk(messagesText, existingSummaryBlock, activeConfig, messageCount) {
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
    if (response && response.content && !response.error) {
      return { summaryBlock: response.content.trim(), usedFallback: false }
    }
  } catch (err) {
    console.warn('[sessionCompactor] summarizer provider aktif gagal:', err?.message)
  }
  return {
    summaryBlock: `${existingSummaryBlock ? existingSummaryBlock + '\n\n' : ''}[Arsip percakapan lampau: ${messageCount} pesan telah dikompaksi pada ${new Date().toLocaleString('id-ID')}]`,
    usedFallback: true
  }
}

/**
 * Ringkas rentang pesan secara bertahap (chunk paling lama dulu, fold ke
 * ringkasan sebelumnya). Kembalikan `coveredCount` = jumlah pesan (dari awal
 * rentang) yang benar-benar sudah masuk ringkasan, sehingga caller bisa
 * memajukan pointer hanya sejauh itu.
 *
 * Jika provider gagal, chunk itu diisi catatan arsip (bukan hilang) dan loop
 * berhenti: tidak ada ledakan panggilan AI, pointer tetap jujur, sisanya diulang
 * pada kompaksi berikutnya.
 */
export async function summarizeMiddle(messagesToSummarize = [], existingSummaryBlock = '', activeConfig = {}, options = {}) {
  if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
    return {
      summaryBlock: existingSummaryBlock || '',
      coveredCount: 0,
      chunks: 0,
      totalChunks: 0,
      partial: false,
      usedFallback: false
    }
  }
  const chunks = buildSummaryChunks(
    messagesToSummarize,
    options.maxInputChars || MAX_SUMMARY_INPUT_CHARS
  )
  const maxChunks = Math.max(1, Number(options.maxChunks) || MAX_SUMMARY_CHUNKS_PER_RUN)
  let summaryBlock = existingSummaryBlock || ''
  let coveredCount = 0
  let processed = 0
  let usedFallback = false
  for (const chunk of chunks) {
    if (processed >= maxChunks) break
    processed++
    const result = await summarizeChunk(chunk.text, summaryBlock, activeConfig, chunk.count)
    summaryBlock = result.summaryBlock
    coveredCount = chunk.lastIndex + 1
    if (result.usedFallback) {
      usedFallback = true
      break
    }
  }
  const total = messagesToSummarize.length
  return {
    summaryBlock,
    coveredCount,
    chunks: processed,
    totalChunks: chunks.length,
    partial: coveredCount < total,
    usedFallback
  }
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
  // persist=false: jangan tulis prunedMessages ke store `sessions` (memotong
  // riwayat asli). Caller prompt-only wajib false. Pointer sessionCompacts tetap
  // disimpan (butuh untuk delta).
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
  let summaryCoverage = null
  if (messagesToSummarize.length > 0) {
    const run = await summarizeMiddle(messagesToSummarize, existingSummaryBlock, activeConfig)
    newSummaryBlock = run.summaryBlock
    // INVARIANT COVERAGE: pointer maju hanya sejauh pesan yang benar-benar
    // masuk ringkasan, bukan selalu pesan terakhir rentang.
    if (run.coveredCount > 0) {
      const coveredIndex = startIndexToSummarize + run.coveredCount - 1
      const coveredMsg = prunedMessages[coveredIndex]
      if (coveredMsg) lastCompactedMessageId = getMessageId(coveredMsg, coveredIndex)
    }
    summaryCoverage = {
      covered: run.coveredCount,
      total: messagesToSummarize.length,
      partial: run.partial,
      chunks: run.chunks,
      usedFallback: run.usedFallback
    }
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
  // currentChars = sisa SETELAH pointer pada input (bukan hanya tail 1 pesan),
  // supaya angka yang dilaporkan ke UI/tracker mencerminkan kondisi sesi nyata.
  const finalChars = calculateSessionChars(prunedMessages, newSummaryBlock, lastCompactedMessageId)
  return {
    success: true,
    isCompacted: true,
    prunedOnly: false,
    compactedMessages: prunedMessages,
    tailMessages,
    lastCompactedMessageId,
    newSummaryBlock,
    summaryBlock: newSummaryBlock,
    summaryCoverage,
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
