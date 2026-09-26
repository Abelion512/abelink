/**
 * citationEngine.js - Ephemeral Passage Store & Verbatim Citation Verifier
 * 
 * Mengadopsi standar Anthropic Citations & Character-Offset Grounding:
 * 1. Menghancurkan teks hasil pencarian web / ekstraksi dokumen menjadi
 *    potongan terindeks (passages) berukuran konsisten dengan offset pasti.
 * 2. Menyediakan fungsi verifikasi eksak (verbatim matching) apakah klaim
 *    faktual yang dikutip benar-benar ada dalam passage terkait.
 * 3. Menghitung skor factual grounding (0.0 - 1.0) untuk objectively
 *    menolak halusinasi sebelum jawaban disajikan ke pengguna.
 */

export class EphemeralPassageStore {
  constructor({ maxPassageLen = 350, overlap = 50 } = {}) {
    this.maxPassageLen = maxPassageLen
    this.overlap = overlap
    this.passages = [] // Array of { id, source, url, text, startOffset, endOffset }
    this.passageCounter = 1
  }

  /**
   * Reset store untuk sesi/turn baru
   */
  clear() {
    this.passages = []
    this.passageCounter = 1
  }

  /**
   * Ingest teks mentah hasil observasi tool (web-search, browser-extract, read-document)
   * @param {string} rawText 
   * @param {{ source?: string, url?: string }} meta 
   * @returns {Array<{ id: string, text: string }>}
   */
  ingest(rawText, meta = {}) {
    const text = String(rawText || '').trim()
    if (!text) return []

    const added = []
    let cursor = 0
    const source = meta.source || 'web'
    const url = meta.url || ''

    while (cursor < text.length) {
      let end = cursor + this.maxPassageLen
      if (end < text.length) {
        // Coba cari titik atau spasi terdekat agar tidak memotong kata di tengah
        const nextSpace = text.indexOf(' ', end - 30)
        if (nextSpace !== -1 && nextSpace <= end + 30) {
          end = nextSpace
        }
      } else {
        end = text.length
      }

      const chunk = text.slice(cursor, end).trim()
      if (chunk.length > 0) {
        const id = `P-${this.passageCounter++}`
        const item = {
          id,
          source,
          url,
          text: chunk,
          startOffset: cursor,
          endOffset: cursor + chunk.length
        }
        this.passages.push(item)
        added.push(item)
      }

      cursor += this.maxPassageLen - this.overlap
      if (cursor >= text.length || end === text.length) break
    }

    return added
  }

  /**
   * Cari passage berdasarkan ID
   */
  getPassage(id) {
    if (!id) return null
    const cleanId = String(id).toUpperCase().trim()
    return this.passages.find((p) => p.id === cleanId) || null
  }

  /**
   * Ambil semua passage terdaftar
   */
  getAll() {
    return [...this.passages]
  }

  /**
   * Format ringkasan passage untuk disuntikkan ke observasi/prompt
   */
  formatPassagesPrompt() {
    if (this.passages.length === 0) return ''
    return this.passages
      .map((p) => `[${p.id}] (${p.source}${p.url ? `: ${p.url}` : ''})\n"${p.text}"`)
      .join('\n\n')
  }
}

/**
 * Ekstraksi kutipan bertanda [P-X] atau [Kutipan: ...] dari teks jawaban
 * @param {string} text 
 * @returns {Array<{ passageId: string, quote: string }>}
 */
export function extractCitations(text) {
  const citations = []
  const raw = String(text || '')

  // 1. Format dalam kurung siku: [P-1: "quote"] atau [P-1]
  const insideBracketRegex = /\[(P-\d+)(?:\s*[:\u2014-]\s*["“']([^"”']+)["”'])?\s*\]/gi
  let match
  while ((match = insideBracketRegex.exec(raw)) !== null) {
    const passageId = match[1].toUpperCase()
    const quote = match[2] ? match[2].trim() : ''
    citations.push({ passageId, quote })
  }

  // 2. Format luar kurung siku: [P-1]: "quote" atau [P-1] "quote"
  const outsideBracketRegex = /\[(P-\d+)\]\s*[:\u2014-]?\s*["“']([^"”']+)["”']/gi
  while ((match = outsideBracketRegex.exec(raw)) !== null) {
    const passageId = match[1].toUpperCase()
    const quote = match[2] ? match[2].trim() : ''
    const existing = citations.find((c) => c.passageId === passageId)
    if (existing) {
      if (!existing.quote && quote) {
        existing.quote = quote
      }
    } else {
      citations.push({ passageId, quote })
    }
  }

  return citations
}

/**
 * Validasi deterministik apakah kutipan benar-benar ada dalam passage (Verbatim Check)
 * @param {string} quote - Teks kutipan
 * @param {string} passageText - Teks passage rujukan
 * @returns {{ valid: boolean, offset: number, normalizedMatch: boolean }}
 */
export function verifyVerbatimQuote(quote, passageText) {
  if (!quote || !passageText) {
    return { valid: false, offset: -1, normalizedMatch: false }
  }

  const q = quote.trim()
  const p = passageText.trim()

  // 1. Exact string match
  const exactIdx = p.indexOf(q)
  if (exactIdx !== -1) {
    return { valid: true, offset: exactIdx, normalizedMatch: false }
  }

  // 2. Normalized whitespace / punctuation match
  const normQ = q.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '')
  const normP = p.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '')
  const normIdx = normP.indexOf(normQ)

  if (normIdx !== -1) {
    return { valid: true, offset: normIdx, normalizedMatch: true }
  }

  return { valid: false, offset: -1, normalizedMatch: false }
}

/**
 * Menilai tingkat grounding jawaban secara komprehensif
 * @param {{ answer: string, passageStore: EphemeralPassageStore }} 
 * @returns {{ score: number, citationsCount: number, validCount: number, invalidCitations: Array }}
 */
export function verifyAnswerGrounding({ answer = '', passageStore = null }) {
  if (!passageStore || passageStore.getAll().length === 0) {
    return { score: 1.0, citationsCount: 0, validCount: 0, invalidCitations: [] }
  }

  const citations = extractCitations(answer)
  if (citations.length === 0) {
    return { score: 0.0, citationsCount: 0, validCount: 0, invalidCitations: ['Tidak ada rujukan passage [P-X] yang disertakan.'] }
  }

  const invalid = []
  let validCount = 0

  for (const cite of citations) {
    const passage = passageStore.getPassage(cite.passageId)
    if (!passage) {
      invalid.push(`Passage rujukan [${cite.passageId}] tidak ditemukan dalam store.`)
      continue
    }

    if (cite.quote) {
      const v = verifyVerbatimQuote(cite.quote, passage.text)
      if (!v.valid) {
        invalid.push(`Kutipan untuk [${cite.passageId}] tidak cocok secara eksak dengan teks sumber: "${cite.quote}".`)
        continue
      }
    }
    validCount++
  }

  const score = Number((validCount / citations.length).toFixed(2))

  return {
    score,
    citationsCount: citations.length,
    validCount,
    invalidCitations: invalid
  }
}
