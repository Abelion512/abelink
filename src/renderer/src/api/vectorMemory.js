// Facade vector memory. Logika getRelevantMemory/getUnifiedContext/searchExtendedMemory
// tetap di sini (murni, tanpa transformers). generateVector/getExtractor lazy via vectorLoader.
import { searchArchives, searchDocuments, searchMemoriesInOrama } from './oramaStore'
import { generateVector, loadVectorCore } from './vectorLoader'

export { generateVector, cosineSimilarity } from './vectorLoader'

// Dipakai App.jsx / Configuration.jsx untuk progress download model — lazy load chunk wasm
export const getExtractor = async (onProgress) => {
  const core = await loadVectorCore()
  return core.getExtractor(onProgress)
}

export const getRelevantMemory = async (memoryList) => {
  // Hanya Core memory (profile & preference) dipanggil langsung tanpa filter
  const coreMemories = memoryList
    .filter(m => m.type === 'profile' || m.type === 'preference')
    .map(({ vector, ...rest }) => rest);

  return coreMemories;
}

export const searchExtendedMemory = async (query) => {
  const queryVector = await generateVector(query)
  if (!queryVector) return []
  return await searchMemoriesInOrama(query, queryVector, 3, ['notes', 'learn'])
}

export const getUnifiedContext = async (userInput, memoryList) => {
  const memories = await getRelevantMemory(memoryList)

  // Masih perlu generate vector untuk Orama (Documents & Archives)
  const output = await generateVector(userInput)
  if (!output) return { memories, archives: [], documents: [] }
  const userVector = Array.from(output)

  const archives = await searchArchives(userVector, 3)
  const documents = await searchDocuments(userInput, userVector, 5)

  return { memories, archives, documents }
}
