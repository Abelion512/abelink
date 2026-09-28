/**
 * Context Compactor (Antigravity-Style Token Optimizer)
 * Mengoptimalkan payload riwayat chat yang dikirim ke LLM:
 * - Menjaga pesan terkini dalam resolusi tinggi
 * - Mengompaksi blok kode panjang dan log tool pada giliran masa lalu
 * - Memastikan respons tetap instan (sub-second) tanpa kehilangan konsistensi coding
 */

// ---- Kontrak tipe (W2-6) ----
interface ExecutedToolEntry {
  tool?: string
  query?: string
  fullResult?: unknown
  resultSummary?: unknown
  [key: string]: unknown
}

interface ChatHistoryItem {
  role?: string
  content?: unknown
  isThinking?: boolean
  isSearching?: boolean
  isSummarizing?: boolean
  isTaskDone?: boolean
  executedTools?: ExecutedToolEntry[]
  mood?: string
  isProactive?: boolean
  timestamp?: string
  source?: string
  sender?: string
  [key: string]: unknown
}

export interface OptimizedChatMessage {
  role: string
  content: unknown
  mood?: string
  isProactive?: boolean
  timestamp?: string
  source?: string
  sender?: string
}

/**
 * Meringkas blok kode markdown panjang (> 300 char atau > 10 baris)
 */
export const compactCodeBlocks = (text: unknown): string => {
  if (!text || typeof text !== 'string') return ''

  return text.replace(/```([a-zA-Z0-9_\-./]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.split('\n')
    if (lines.length <= 10 && code.length <= 300) {
      return match
    }

    const firstLines = lines.slice(0, 3).join('\n')
    const lastLines = lines.slice(-2).join('\n')
    const omittedCount = lines.length - 5

    return `\`\`\`${lang || ''}\n${firstLines}\n/* --- [Sisa ${omittedCount} baris kode diringkas. Berkas tersimpan di disk. Gunakan tool 'read-file' jika perlu membaca/melanjutkan] --- */\n${lastLines}\n\`\`\``
  })
}

/**
 * Sanitasi payload vision agar base64 tidak meracuni history/embedding:
 * - Array content: part image_url diganti placeholder, kecuali keepImages=true
 * - String: dataURL base64 panjang dipotong jadi placeholder
 * Dipakai saat persist chat dan saat merakit history lama.
 */
export const IMAGE_PLACEHOLDER = '[Gambar terlampir]'
const DATA_URL_RE = /data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]{100,}/g

/** Potong dataURL base64 dari teks bebas (query embedding, ringkasan, log). */
export const stripDataUrls = (text: unknown): string => {
  if (typeof text !== 'string' || !text.includes('data:image')) return (text ?? '') as string
  return text.replace(DATA_URL_RE, IMAGE_PLACEHOLDER)
}

export const stripImageContent = (content: unknown, keepImages = false): unknown => {
  if (Array.isArray(content)) {
    if (keepImages) return content
    const out = content
      .filter((p: unknown) => (p as { type?: string })?.type === 'text' || typeof p === 'string')
      .map((p: unknown) => (typeof p === 'string' ? { type: 'text', text: p } : p))
    if (out.length === 0) return [{ type: 'text', text: IMAGE_PLACEHOLDER }]
    return out
  }
  if (typeof content === 'string') {
    if (content.length < 10000 && !content.includes('data:image')) return content
    return content.replace(DATA_URL_RE, IMAGE_PLACEHOLDER)
  }
  return content || ''
}

/**
 * Potong observasi / hasil tool raksasa (> 4000 char) jadi head 2500 + tail 500.
 * Dipakai saat merakit history lama, bukan saat eksekusi live.
 */
export const truncateGiantObservation = (text: unknown): string => {
  if (typeof text !== 'string') return (text ?? '') as string
  if (text.length <= 4000) return text
  return (
    text.slice(0, 2500) +
    `\n... [observasi raksasa dipangkas: ${text.length} char -> 3000 char] ...\n` +
    text.slice(-500)
  )
}

/**
 * Mengompaksi daftar riwayat percakapan untuk prompt LLM
 */
export const buildOptimizedChatSession = (sourceChatData: unknown, maxTurns = 20): OptimizedChatMessage[] => {
  if (!Array.isArray(sourceChatData)) return []

  const validMessages = (sourceChatData as ChatHistoryItem[]).filter(
    (item) =>
      item &&
      item.role !== 'command' &&
      !item.isThinking &&
      !item.isSearching &&
      !item.isSummarizing
  )

  const recentSlice = validMessages.slice(-1 * maxTurns)
  const totalCount = recentSlice.length

  return recentSlice.map((item, idx) => {
    const isRecentTurn = idx >= totalCount - 2 // 2 pesan terakhir dibiarkan resolusi tinggi
    // In-progress retention: Jika pesan AI ini belum selesai (tanya user/in-progress) atau pesan AI paling akhir
    const isInProgress = item.isTaskDone === false || (item.isTaskDone !== true && isRecentTurn)
    let msgContent: unknown = item.content || ''

    if (item.role === 'ai') {
      // 1. Kompaksi log tool
      let toolLog = ''
      if (item.executedTools && item.executedTools.length > 0) {
        if (isInProgress) {
          // Smart Retention: Pertahankan detail hasil tool secara terukur (maks 2000 char)
          toolLog = item.executedTools
            .map((t: ExecutedToolEntry) => {
              let res = t.fullResult || t.resultSummary || 'OK'
              if (typeof res === 'string' && res.length > 2000) {
                res =
                  res.slice(0, 1200) +
                  '\n... [hasil dipangkas demi efisiensi token] ...\n' +
                  res.slice(-500)
              }
              return `  * [Tool: ${t.tool}] query: "${t.query || ''}"\n    Hasil:\n${res}`
            })
            .join('\n\n')
        } else if (isRecentTurn) {
          toolLog = item.executedTools
            .map(
              (t: ExecutedToolEntry) =>
                `  * [Tool: ${t.tool}] query: "${t.query || ''}" -> Hasil: ${truncateGiantObservation(t.resultSummary || 'OK')}`
            )
            .join('\n')
        } else {
          // Giliran lama: 2 baris per tool (nama+query, lalu 200 char pertama hasil)
          // agar keputusan survive lebih lama tanpa membengkakkan konteks.
          toolLog = item.executedTools
            .map((t: ExecutedToolEntry) => {
              const raw = t.fullResult ?? t.resultSummary ?? 'OK'
              const res = typeof raw === 'string' ? raw : String(raw)
              const snippet = res.slice(0, 200)
              const cutMark =
                res.length > 4000 ? `\n... [observasi raksasa dipangkas: ${res.length} char] ...` : ''
              return `  * [Tool: ${t.tool}] (query: "${(t.query || '').slice(0, 60)}")\n    -> ${snippet}${cutMark}`
            })
            .join('\n')
        }
      }

      // 2. Kompaksi blok kode panjang pada giliran lama (hanya jika sudah bukan in-progress)
      let formattedBody: unknown = msgContent
      if (!isRecentTurn && !isInProgress) {
        const compacted = compactCodeBlocks(msgContent)
        formattedBody = compacted
        // Batasi panjang teks maksimal pada pesan lama
        if (compacted.length > 1500) {
          formattedBody =
            compacted.slice(0, 1200) +
            '\n\n[... sisa teks lampau diringkas. Gunakan tool terkait jika butuh detail lengkap ...]'
        }
      }

      if (toolLog) {
        msgContent = `[RIWAYAT TOOL TURN INI]:\n${toolLog}\n\n[JAWABAN]:\n${formattedBody}`
      } else {
        msgContent = formattedBody
      }
    } else {
      // Pesan user: gambar hanya dipertahankan di giliran TERAKHIR.
      // Giliran lama selalu di-strip agar base64 tidak terkirim ulang tiap turn.
      const isLast = idx === totalCount - 1
      msgContent = stripImageContent(msgContent, isLast)
      if (typeof msgContent === 'string' && !isLast && !isRecentTurn && msgContent.length > 1500) {
        msgContent =
          msgContent.slice(0, 1200) +
          '\n\n[... sisa teks lampau diringkas. Gunakan tool terkait jika butuh detail lengkap ...]'
      }
    }

    return {
      role: item.role === 'ai' ? 'assistant' : 'user',
      content: msgContent,
      mood: item.mood,
      isProactive: item.isProactive,
      timestamp: item.timestamp,
      source: item.source,
      sender: item.sender
    }
  })
}
