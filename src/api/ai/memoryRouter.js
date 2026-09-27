// src/api/ai/memoryRouter.js
// Subsystem Memory Router eksplisit (Hermes & Anthropic Context Engineering pattern).
// Mengorkestrasi pemilihan memori, arsip, turn-pairs, dokumen RAG, dan workspace context
// per-turn secara terpadu, modular, dan teruji.

import { getCurrentTimeInfo } from './utils.js'

/**
 * Format section workspace RAG (.abelink/ working memory + code RAG + session facts).
 */
export function buildWorkspacePromptSection(workspaceContext = {}) {
  if (!workspaceContext || typeof workspaceContext !== 'object') return ''
  const { workingMemoryText, codeRagText, sessionFactsText } = workspaceContext
  const sections = []

  if (workingMemoryText && workingMemoryText.trim()) {
    sections.push(`## 1. ACTIVE WORKING MEMORY (.abelink/)\n${workingMemoryText.trim()}`)
  }
  if (codeRagText && codeRagText.trim()) {
    sections.push(`## 2. RELEVAN CODEBASE CONTEXT (.abelink/ RAG)\n${codeRagText.trim()}`)
  }
  if (sessionFactsText && sessionFactsText.trim()) {
    sections.push(`FAKTA SESAAT (working memory)\n${sessionFactsText.trim()}`)
  }

  if (sections.length === 0) return ''
  return `\n# ACTIVE WORKSPACE CONTEXT & RAG (.abelink/)\n${sections.join('\n\n')}\n`
}

/**
 * Format section daftar memory user aktif saat ini.
 */
export function buildUserMemorySection(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) return ''
  const lines = memories
    .filter((m) => m && m.memory)
    .map((m) => `- [${(m.type || 'profile').toUpperCase()}] (ID:${m.id ?? 'N/A'}) ${m.memory}`)
  if (lines.length === 0) return ''
  return `\n# MEMORY USER (Daftar Ingatan Saat Ini)\n${lines.join('\n')}\nGunakan data memory di atas sebagai referensi, dan perhatikan nomor ID jika ingin melakukan UPDATE atau DELETE.`
}

/**
 * Format aturan penyimpanan, anti-duplikasi, dan pembaruan memory.
 */
export function buildMemoryRulesSection() {
  return `# ATURAN PENYIMPANAN & PEMBARUAN MEMORY
1. Proaktif ("profile" & "preference"): Kamu WAJIB proaktif mendeteksi informasi identitas user ("profile") dan kesukaan/kebiasaan/gaya bicara ("preference") dari percakapan lalu simpan ke memory tanpa perlu diminta. Gunakan tool "memory" (action: "add", target: "user", new_text: "...").
2. Eksplisit ("notes"): HANYA simpan memory bertipe "notes" JIKA user secara eksplisit meminta kamu untuk mencatat/mengingat sesuatu (contoh: "catat ini ya", "ingetin gue") via tool "memory" (action: "add", target: "memory", new_text: "...").
3. Anti-Duplikasi & Update: SEBELUM menyimpan memory baru, SELALU periksa daftar MEMORY USER di atas! Jika informasi tersebut sudah ada atau merupakan pembaruan dari info lama, gunakan tool "memory" dengan action "replace" (old_text & new_text). JANGAN membuat duplikat baru!
4. Hapus Memory: Jika user menyatakan info lama salah/tidak relevan, atau kamu melihat memory yang obsolete/duplikat, gunakan tool "memory" dengan action "remove" (old_text).
5. Batch Atomic: Jika perlu mencatat dan memperbarui beberapa memori sekaligus dalam satu turn, gunakan tool "memory" dengan action "batch".
6. Tipe "learn": HANYA simpan ke "learn" JIKA kamu baru saja berhasil mempelajari/menyelesaikan masalah teknis yang rumit (terutama setelah trial-and-error berulang), agar kamu tidak mengulangi kesalahan yang sama.
7. RECALL PENGALAMAN: Jika kamu menghadapi masalah teknis/error, selalu gunakan tool "memory-search" untuk mencari solusi historis ("learn") yang mungkin pernah kamu temukan, sebelum menebak-nebak.`
}

/**
 * Format aturan integritas fakta & anti-halusinasi memori mutlak.
 */
export function buildFactsIntegritySection() {
  return `# ATURAN INTEGRITAS FAKTA & ANTI-HALUSINASI MEMORI (MUTLAK)
1. KETIKA HASIL PENCARIAN KOSONG / TIDAK DITEMUKAN:
   Jika kamu menjalankan "memory-search" dan hasilnya KOSONG ("Tidak ditemukan memori atau percakapan yang relevan"):
   KAMU DILARANG KERAS MENGARANG DAFTAR, MATA KULIAH, KEPUTUSAN, KATA SANDI, ATAU HASIL ANALISIS FIKTIF SEOLAH-OLAH PERNAH MEMBAHASNYA DENGAN USER!
   Kamu WAJIB JUJUR mengatakan kepada user bahwa riwayat/analisis tersebut belum tercatat atau tidak ditemukan di memori, lalu tawarkan untuk menganalisis/membahasnya bersama dari awal.
2. ANTI-EKSTRAPOLASI (DILARANG MENAMBAH-NAMBAHKAN FAKTA):
   Jika hasil "memory-search" HANYA MEMUAT SEBAGIAN FAKTA (misal hanya ada 1 atau 2 poin):
   KAMU HANYA BOLEH MENYAMPAIKAN FAKTA YANG BENAR-BENAR TERTULIS DI HASIL TERSEBUT. DILARANG KERAS MENAMBAH-NAMBAHKAN POIN, MATKUL, ATAU DAFTAR FIKTIF LAINNYA di luar data asli yang ditemukan!
3. MEMBEDAKAN MEMORI MASA LALU VS PENGETAHUAN UMUM:
   Jika user bertanya tentang sesuatu yang "dulu pernah dibahas/dianalisis", jawabanmu HARUS 100% TERIKAT (GROUNDED) pada riwayat yang nyata. Jangan pernah menyamarkan tebakan/halusinasi AI sebagai fakta obrolan masa lalu!`
}

/**
 * Format aturan pemakaian memori natural.
 */
export function buildMemoryUsageSection(hasContent = false) {
  if (!hasContent) return ''
  return `\n# ATURAN PENGGUNAAN MEMORY USER\n1. Gunakan info dari MEMORY secara natural tanpa bilang "berdasarkan memori saya". Langsung pakai seolah kamu memang tahu.\n2. Jangan ungkit hal sensitif/kelam kecuali user yang mulai.`
}

/**
 * Format arsip obrolan lama (ringkasan sesi terdahulu).
 */
export function buildArchivesSection(archives = []) {
  if (!Array.isArray(archives) || archives.length === 0) return ''
  const lines = archives
    .filter((a) => a && a.summary)
    .map((a) => {
      const dateStr = a.timestamp ? getCurrentTimeInfo(new Date(a.timestamp)) : ''
      return dateStr ? `[${dateStr}] ${a.summary}` : a.summary
    })
  if (lines.length === 0) return ''
  return `\n# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)\n${lines.join('\n')}\nGunakan arsip di atas jika user merujuk ke obrolan atau kejadian masa lalu.`
}

/**
 * Format turn pairs relevan (pasangan tanya-jawab historis vektor).
 */
export function buildTurnPairsSection(turnPairs = []) {
  if (!Array.isArray(turnPairs) || turnPairs.length === 0) return ''
  const blocks = turnPairs
    .filter((t) => t && (t.userText || t.aiText))
    .map((t) => {
      const dateStr = t.timestamp ? ` | Waktu: ${getCurrentTimeInfo(new Date(t.timestamp))}` : ''
      return `[Sesi: ${t.sessionTitle || 'Chat'}${dateStr}]\nUser: ${t.userText || ''}\nAbelink: ${t.aiText || ''}`
    })
  if (blocks.length === 0) return ''
  return `\n# RIWAYAT PERCAKAPAN RELEVAN (Turn Pairs Vektor)\n${blocks.join('\n---\n')}`
}

/**
 * Format dokumen referensi RAG knowledge base.
 */
export function buildDocumentsSection(documents = []) {
  if (!Array.isArray(documents) || documents.length === 0) return ''
  const blocks = documents
    .filter((d) => d && (d.text || d.content))
    .map((d) => `[${d.docName || d.title || 'Dokumen'}] ${d.content || d.text}`)
  if (blocks.length === 0) return ''
  return `\n# REFERENSI DOKUMEN (RAG Knowledge Base)\n${blocks.join('\n---\n')}\nJika pertanyaan terkait dokumen ini, LANGSUNG jawab dari dokumen ini tanpa "browser-navigate". Jangan mengarang fakta di luar konteks dokumen!`
}

/**
 * Menggabungkan seluruh komponen memori ke dalam satu string siap-pakai untuk system prompt planner.
 */
export function composeAllMemorySections(unifiedContext = {}) {
  const { memories = [], archives = [], documents = [], turnPairs = [] } = unifiedContext || {}
  const parts = []

  const userMemSection = buildUserMemorySection(memories)
  if (userMemSection) parts.push(userMemSection)

  parts.push(buildMemoryRulesSection())
  parts.push(buildFactsIntegritySection())

  const hasAnyMemoryContent = memories.length > 0 || archives.length > 0 || turnPairs.length > 0
  const usageSection = buildMemoryUsageSection(hasAnyMemoryContent)
  if (usageSection) parts.push(usageSection)

  const archivesSection = buildArchivesSection(archives)
  if (archivesSection) parts.push(archivesSection)

  const turnPairsSection = buildTurnPairsSection(turnPairs)
  if (turnPairsSection) parts.push(turnPairsSection)

  const documentsSection = buildDocumentsSection(documents)
  if (documentsSection) parts.push(documentsSection)

  return parts.join('\n\n')
}

/**
 * Router terpusat: mengambil memori vektor + workspace context secara aman dan terpadu.
 */
export async function routeTurnMemoryContext({
  userInput = '',
  searchQuery = '',
  allMemory = null,
  workspaceRoot = null,
  signal = null,
  getUnifiedContextFn = null,
  getWorkspaceContextFn = null
} = {}) {
  const query = searchQuery || userInput || ''

  // 1. Ambil Unified Context (memories, archives, documents, turnPairs)
  let unifiedContext = { memories: [], archives: [], documents: [], turnPairs: [] }
  try {
    const fetchContext = getUnifiedContextFn || (async (q, m) => {
      const { getUnifiedContext } = await import('../vectorMemory.js')
      return getUnifiedContext(q, m)
    })

    const contextPromise = fetchContext(query, allMemory)
    if (signal) {
      const abortPromise = new Promise((_, reject) => {
        const onAbort = () => reject(new Error('AbortError'))
        if (signal.aborted) return onAbort()
        signal.addEventListener('abort', onAbort, { once: true })
      })
      unifiedContext = await Promise.race([contextPromise, abortPromise])
    } else {
      unifiedContext = await contextPromise
    }
  } catch (err) {
    if (err?.message !== 'AbortError') {
      console.warn('[MemoryRouter] Gagal mengambil unified memory context:', err)
    }
  }

  // 2. Ambil Workspace Context jika workspaceRoot didefinisikan
  let workspaceContext = null
  if (workspaceRoot) {
    try {
      const fetchWorkspace = getWorkspaceContextFn || (async (root, input) => {
        const { getWorkspaceContext } = await import('../workspaceRag.js')
        return getWorkspaceContext(root, input)
      })
      workspaceContext = await fetchWorkspace(workspaceRoot, userInput)
    } catch (err) {
      console.warn('[MemoryRouter] Gagal mengambil workspace context:', err)
    }
  }

  return {
    ...unifiedContext,
    workspaceContext
  }
}

/**
 * Validasi dan normalisasi keputusan memory dari model sebelum persistensi.
 */
export function normalizeMemoryDecision(decisionMemory, existingMemories = []) {
  if (!decisionMemory || typeof decisionMemory !== 'object') {
    return { valid: false, reason: 'Keputusan memory kosong atau bukan objek' }
  }

  const { action, type, memory, summary, id } = decisionMemory
  const validActions = ['insert', 'update', 'delete']
  const validTypes = ['profile', 'preference', 'notes', 'learn']

  if (!validActions.includes(action)) {
    return { valid: false, reason: `Action memory tidak valid: ${action}` }
  }

  if (action === 'delete') {
    if (id == null) {
      return { valid: false, reason: 'Delete memory membutuhkan id' }
    }
    return {
      valid: true,
      action: 'delete',
      normalized: { id: Number(id) }
    }
  }

  if (!validTypes.includes(type)) {
    return { valid: false, reason: `Type memory tidak valid: ${type}` }
  }

  if (!memory || typeof memory !== 'string' || !memory.trim()) {
    return { valid: false, reason: 'Isi memory tidak boleh kosong' }
  }

  if (action === 'update') {
    if (id == null) {
      return { valid: false, reason: 'Update memory membutuhkan id' }
    }
    return {
      valid: true,
      action: 'update',
      normalized: {
        id: Number(id),
        type,
        memory: memory.trim(),
        summary: (summary || memory.slice(0, 40)).trim()
      }
    }
  }

  // Action 'insert': cek duplikasi konten terhadap memory aktif
  const trimmed = memory.trim().toLowerCase()
  const isDuplicate = existingMemories.some(
    (m) => m && m.memory && m.memory.trim().toLowerCase() === trimmed
  )
  if (isDuplicate) {
    return { valid: false, reason: 'Memory dengan isi serupa sudah ada (anti-duplikasi)', isDuplicate: true }
  }

  return {
    valid: true,
    action: 'insert',
    normalized: {
      type,
      memory: memory.trim(),
      summary: (summary || memory.slice(0, 40)).trim()
    }
  }
}
