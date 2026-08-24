// Facade vector memory (murni, tanpa transformers statis).
// generateVector/getExtractor lazy via vectorLoader - wasm 23MB split dari entry bundle.
import { searchArchives, searchDocuments, searchMemoriesInOrama } from './oramaStore'
import { getAllMemory } from './db'
import { loadVectorCore } from './vectorLoader'

export { cosineSimilarity } from './vectorLoader'

// --- Lite Mode: hash embedding fallback (tanpa model, hemat RAM) ---
let isLiteMode = false
export const setLiteMode = (v) => { isLiteMode = v }

// FNV-1a 384-dim hash embedding
function fnv1a(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); h >>>= 0 }
  return h >>> 0
}
const hashEmbedding = (text) => {
  const v = new Array(384).fill(0)
  const words = String(text || '').toLowerCase().split(/\s+/)
  for (const w of words) {
    if (!w) continue
    v[fnv1a(w) % 384] += 1
    v[fnv1a(w.slice(0, 3)) % 384] += 0.5
  }
  const norm = Math.sqrt(v.reduce((s2, x) => s2 + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

let extractor = null
let isDownloading = false

export const generateVector = async (text) => {
  if (isLiteMode) {
    return hashEmbedding(text)
  }
  try {
    const core = await loadVectorCore()
    return await core.generateVector(text)
  } catch (error) {
    console.error('Gagal generate vector:', error)
    return null
  }
}

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (!extractor && !isDownloading) {
    isDownloading = true
    try {
      const core = await loadVectorCore()
      extractor = await core.getExtractor(onProgress)
    } catch (e) {
      console.error('Failed to load transformer model', e)
    } finally {
      isDownloading = false
    }
  }
  return extractor
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

export const searchExtendedMemory = async (query) => {
  const queryVector = await generateVector(query)
  if (!queryVector) return []
  return await searchMemoriesInOrama(query, queryVector, 3, ['notes', 'learn'])
}

export const getUnifiedContext = async (userInput, memoryList) => {
  const memories = await getRelevantMemory(userInput, memoryList)

  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)

  return { memories, archives, documents }
}
