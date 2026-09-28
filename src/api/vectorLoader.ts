// Pintu lazy-load ke vectorCore (23MB ort-wasm). Export generateVector via dynamic import
// supaya wasm split keluar dari entry bundle. Static import lain → tarik wasm ke entry.

// ---- Kontrak tipe (W2-7a) ----
type VectorCore = {
  generateVector: (text: unknown) => Promise<number[] | null>
}

let corePromise: Promise<VectorCore> | null = null
export const loadVectorCore = (): Promise<VectorCore> => {
  if (!corePromise) corePromise = import('./vectorCore.ts') as Promise<VectorCore>
  return corePromise
}

export const generateVector = async (text: unknown): Promise<number[] | null> => {
  const core = await loadVectorCore()
  return core.generateVector(text)
}

// SEARCH: Rumus matematika buat ngukur kemiripan (0 sampai 1) — tanpa transformers, aman statis
export const cosineSimilarity = (vecA: unknown, vecB: unknown): number => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  return (vecA as number[]).reduce((sum: number, a: number, i: number) => sum + a * (vecB as number[])[i], 0)
}
