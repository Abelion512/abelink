import { pipeline } from '@huggingface/transformers'
import {
  searchArchives,
  searchDocuments,
  searchMemoriesInOrama,
  searchTurnPairsInOrama
} from './oramaStore'
import { getAllMemory } from './db'

let worker = null
let nextId = 1
const pendingPromises = new Map()
const progressListeners = new Set()

// Lite Mode state (hash embedding fallback, tanpa load model)
let isLiteMode = false

let liteAutoNotified = false
let isTauriEnvironment =
  typeof window !== 'undefined' && typeof window.__TAURI_INTEGRATION__ !== 'undefined'

function emitLiteAuto() {
  if (liteAutoNotified) return
  liteAutoNotified = true
  try {
    window.dispatchEvent(
      new CustomEvent('mark:auto-lite', { detail: { reason: 'wasm-unsupported' } })
    )
  } catch (_) {}
}

// Tauri on Linux/WebKitGTK: WASM SIMD berpeluang tidak tersedia via sandbox.
// TIDAK lagi memaksa Lite Mode dari sini — worker punya fallback ladder
// SIMD -> wasm scalar -> CPU (korpus embedding tetap nyata, bukan hash).
// Lite Mode hanya aktif bila SEMUA attempt gagal (auto-detect di onmessage).
if (isTauriEnvironment) {
  console.log('[EmbeddingWorker] Tauri environment — init worker dengan fallback ladder.')
}

function getWorker() {
  if (!worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./embedding.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (event) => {
        const { id, type, success, vector, results, error, data } = event.data || {}

        if (type === 'progress') {
          progressListeners.forEach((cb) => {
            try {
              cb(data)
            } catch (_) {}
          })
          return
        }

        if (pendingPromises.has(id)) {
          const { resolve } = pendingPromises.get(id)
          pendingPromises.delete(id)
          if (success) {
            resolve(vector !== undefined ? vector : results)
          } else {
            // Setelah Lite Mode pernah AKTIF, semua embed/init berikutnya akan
            // gagal berulang kali karena initFailed flag di worker. Jangan
            // log warning berulang kali — cukup resolve null agar caller
            // langsung pakai hash embedding.
            if (!isLiteMode) {
              console.warn('[EmbeddingWorker] Worker task error:', error)
              // Semua device gagal (worker sudah coba SIMD -> wasm scalar -> CPU)
              // -> auto Lite Mode (hash embedding) sebagai last resort.
              if (/SIMD|no available backend|Unsupported device|Extractor init failed|init gagal/i.test(String(error))) {
                isLiteMode = true
                const isFirstNotice = !liteAutoNotified
                emitLiteAuto()
                if (isFirstNotice) {
                  console.warn(
                    '[EmbeddingWorker] Auto Lite Mode AKTIF (hash embedding fallback) - pesan ini cukup sekali.'
                  )
                }
              }
            }
            resolve(null)
          }
        }
      }

      worker.onerror = (err) => {
        console.error('[EmbeddingWorker] Worker uncaught error:', err)
      }
    } catch (e) {
      console.warn('[EmbeddingWorker] Failed to initialize worker, fallback to main thread:', e)
      worker = null
    }
  }
  return worker
}

// Fallback main-thread extractor jika Web Worker tidak tersedia
let directExtractor = null
let isDirectDownloading = false

async function getDirectExtractor(onProgress) {
  if (!directExtractor && !isDirectDownloading) {
    isDirectDownloading = true
    try {
      const device = typeof window !== 'undefined' && typeof caches !== 'undefined' ? 'wasm' : 'cpu'
      directExtractor = await pipeline(
        'feature-extraction',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        {
          device,
          progress_callback: onProgress
        }
      )
    } catch (e) {
      console.error('Failed to load transformer model directly', e)
    } finally {
      isDirectDownloading = false
    }
  }
  return directExtractor
}

// Guard: jalankan init worker sekali saja. Setelah berhasil, kembalikan
// worker yang sudah siap tanpa post message init lagi. Setelah gagal
// (atau Lite Mode sudah AKTIF), kembalikan null agar caller langsung
// fallback ke hash embedding.
let initDone = false

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (isLiteMode) return null
  if (typeof onProgress === 'function') {
    progressListeners.add(onProgress)
  }
  const w = getWorker()
  if (w) {
    // Init sudah pernah selesai: kembalikan worker jika berhasil.
    // Jika gagal, isLiteMode sudah true dan tertangkap di cek di atas.
    if (initDone) return w
    return new Promise((resolve) => {
      const id = nextId++
      pendingPromises.set(id, {
        // Pada init_done: success -> val=undefined (worker objek siap);
        // failure -> val=null.
        resolve: (val) => {
          initDone = true
          resolve(val === null ? null : w)
        },
        reject: () => {
          initDone = true
          resolve(null)
        }
      })
      w.postMessage({ id, type: 'init' })
    })
  }
  return await getDirectExtractor(onProgress)
}

// --- Lite Mode (RAM 4GB): hash embedding fallback, tanpa load model ---
export const setLiteMode = (v) => {
  isLiteMode = v
}
function fnv1a(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
    h >>>= 0
  }
  return h >>> 0
}
const hashEmbedding = (text) => {
  const v = new Array(384).fill(0)
  for (const w of String(text || '')
    .toLowerCase()
    .split(/\s+/)) {
    if (!w) continue
    v[fnv1a(w) % 384] += 1
    v[fnv1a(w.slice(0, 3)) % 384] += 0.5
  }
  const norm = Math.sqrt(v.reduce((s2, x) => s2 + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

export const generateVector = async (text) => {
  if (isLiteMode) return hashEmbedding(text)
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null
  }

  const w = getWorker()
  if (w) {
    return new Promise((resolve) => {
      const id = nextId++
      pendingPromises.set(id, {
        resolve,
        reject: () => resolve(null)
      })
      w.postMessage({ id, type: 'embed', text })
    })
  }

  // Fallback direct
  try {
    const ext = await getDirectExtractor()
    if (!ext) return null
    const output = await ext(text, {
      pooling: 'mean',
      normalize: true,
      truncation: true,
      max_length: 512
    })
    const result = Array.from(output.data)
    if (output.dispose) output.dispose()
    return result
  } catch (error) {
    console.error('Gagal generate vector directly:', error)
    return null
  }
}

// Model vektor aktif saat ini ('hash' saat Lite Mode, 'minilm' saat normal).
// Dipakai oramaStore/db untuk menandai provenansi vektor tiap baris.
export const getVectorModel = () => (isLiteMode ? 'hash' : 'minilm')

// Vektor yang layak disimpan ke Dexie/Orama: NULL saat Lite Mode agar hash embedding
// tidak pernah mengotori korpus pencarian (kerusakan permanen). Untuk similarity
// in-memory tetap gunakan generateVector() yang fallback ke hash.
export const generateStorableVector = async (text) => {
  if (isLiteMode) return null
  return generateVector(text)
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1)
export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}

export const getRelevantMemory = async (userInput, memoryList) => {
  let list = memoryList
  if (!Array.isArray(list)) {
    try {
      list = await getAllMemory()
    } catch (e) {
      list = []
    }
  }
  if (!Array.isArray(list)) {
    list = []
  }
  // Hanya Core memory (profile & preference) dipanggil langsung tanpa filter
  const coreMemories = list
    .filter((m) => m && typeof m === 'object' && (m.type === 'profile' || m.type === 'preference'))
    .map(({ vector, ...rest }) => rest)

  return coreMemories
}

export const searchExtendedMemory = async (query, threshold = 0.5, limit = 5) => {
  const queryVector = await generateVector(query)
  if (!queryVector) return { memories: [], chatTurns: [] }

  const memories = await searchMemoriesInOrama(
    query,
    queryVector,
    limit,
    ['notes', 'learn'],
    threshold
  )
  const chatTurns = await searchTurnPairsInOrama(query, queryVector, limit, threshold)

  return { memories, chatTurns }
}

export const executeMemorySearch = async (rawQuery) => {
  const parts = (rawQuery || '').split('||')
  const searchKeyword = parts[0]?.trim() || ''
  const customThreshold =
    parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1].trim()) : 0.5
  const customLimit = parts[2] && !isNaN(parseInt(parts[2], 10)) ? parseInt(parts[2].trim(), 10) : 5

  const { memories = [], chatTurns = [] } = await searchExtendedMemory(
    searchKeyword,
    customThreshold,
    customLimit
  )

  const formattedMemories =
    memories.length > 0
      ? memories
          .map(
            (m) =>
              `- [${m.type.toUpperCase()}] (ID:${m.id}, Score:${(m.score || 0).toFixed(2)}) ${m.memory}`
          )
          .join('\n')
      : ''

  const formattedTurns =
    chatTurns.length > 0
      ? chatTurns
          .map(
            (t) =>
              `--- [RIWAYAT CHAT: "${t.sessionTitle || 'Session'}" | Score:${(t.score || 0).toFixed(2)}] ---\n${t.combinedText}`
          )
          .join('\n\n')
      : ''

  let sections = []
  if (formattedMemories) {
    sections.push(`[CATATAN & MEMORI PENGGUNA]\n${formattedMemories}`)
  }
  if (formattedTurns) {
    sections.push(`[RIWAYAT PERCAKAPAN ASLI (TURN PAIRS)]\n${formattedTurns}`)
  }

  if (sections.length > 0) {
    return `[MEMORY SEARCH RESULTS (Threshold: ${customThreshold}, Limit: ${customLimit})]\n\n${sections.join('\n\n')}`
  }
  return `[MEMORY SEARCH RESULTS (Threshold: ${customThreshold}, Limit: ${customLimit})]\nTidak ditemukan memori atau percakapan yang relevan dengan kata kunci "${searchKeyword}".`
}

export const getUnifiedContext = async (userInput, memoryList) => {
  const memories = await getRelevantMemory(userInput, memoryList)

  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [], turnPairs: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)
  const turnPairs = await searchTurnPairsInOrama(userInput, userVector, 3, 0.3)

  return { memories, archives, documents, turnPairs }
}
