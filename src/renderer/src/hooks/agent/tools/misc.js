// Tool: tool-info, memory-search, speak — misc tools
import { searchExtendedMemory } from '../../../api/vectorMemory'
import { playVoice } from '../../../api/ai/utils'

export async function executeMiscTool(ctx) {
  const { tool, query, scheduleThinkingUpdate } = ctx
  if (tool === 'tool-info') {
    // --- TOOL INFO (Progressive Disclosure L1) ---
    try {
      const detail = await window.api.getToolDetail(query)
      if (detail) {
        return detail.l1 || `Tool: ${detail.name}\n${detail.description}`
      }
      return `Tool "${query}" tidak ditemukan. Gunakan "tool-info" dengan nama tool yang ada di daftar.`
    } catch (e) {
      return `Gagal mengambil info tool: ${e.message}`
    }
  }
  if (tool === 'memory-search') {
    // --- MEMORY SEARCH ---
    const results = await searchExtendedMemory(query)
    const formatted = results.length > 0
      ? results.map(m => `- [${m.type.toUpperCase()}] (ID:${m.id}, Score:${m.score.toFixed(2)}) ${m.memory}`).join('\n')
      : 'Tidak ditemukan memori yang relevan.'
    return `[MEMORY SEARCH RESULTS]\n${formatted}`
  }
  // --- NATIVE TTS SPEAKER ---
  if (query && query.trim() !== '') {
    scheduleThinkingUpdate(`(Sedang berbicara) ${query}`)
    await playVoice(query)
    return `Berhasil berbicara secara lisan: "${query}"`
  }
  return 'Gagal: teks yang mau diucapkan kosong.'
}
