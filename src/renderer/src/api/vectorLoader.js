// Pintu lazy-load ke vectorCore (23MB ort-wasm). Export generateVector via dynamic import
// supaya wasm split keluar dari entry bundle. Static import lain → tarik wasm ke entry.
let corePromise = null
export const loadVectorCore = () => {
  if (!corePromise) corePromise = import('./vectorCore.js')
  return corePromise
}

export const generateVector = async (text) => {
  const core = await loadVectorCore()
  return core.generateVector(text)
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1) — tanpa transformers, aman statis
export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
}
