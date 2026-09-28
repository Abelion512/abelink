/**
 * Workspace RAG & Working Memory Service (Renderer API)
 * Menghubungkan UI/Planning Engine dengan .abelink/ Codebase Index & Scratchpad
 */

// ---- Kontrak tipe (W2-8a) ----
interface WorkingMemory {
  notes?: string
  activeObjective?: string
  recentFiles?: string[]
  [key: string]: unknown
}

interface WorkspaceChunk {
  filePath?: string
  content?: string
  [key: string]: unknown
}

const lastIndexScanTime: Record<string, number> = {}

/**
 * Mengambil konteks RAG dan Working Memory aktif untuk disuntikkan ke System Prompt AI
 * @param {string} workspaceRoot Direktori root proyek aktif
 * @param {string} userInput Pesan / perintah dari pengguna
 * @returns {Promise<{ workingMemoryText: string, codeRagText: string, sessionFactsText: string }>}
 */
export async function getWorkspaceContext(workspaceRoot: unknown, userInput: unknown): Promise<{ workingMemoryText: string; codeRagText: string; sessionFactsText: string }> {
  const bridge = typeof window !== 'undefined' ? (window as unknown as { api?: Record<string, (...a: unknown[]) => unknown> }).api : null
  const root = typeof workspaceRoot === 'string' ? workspaceRoot : ''
  if (!root || typeof window === 'undefined' || !bridge?.workspaceQuery) {
    return { workingMemoryText: '', codeRagText: '', sessionFactsText: '' }
  }

  try {
    // 1. Pastikan folder .abelink ada
    await bridge.workspaceEnsure(root)

    // 2. Trigger scan inkremental jika sudah lebih dari 60 detik sejak scan terakhir
    const now = Date.now()
    if (!lastIndexScanTime[root] || now - lastIndexScanTime[root] > 60000) {
      lastIndexScanTime[root] = now
      // Jalankan background tanpa memblokir
      Promise.resolve(bridge.workspaceIndex(root)).catch(() => {})
    }

    // 3. Baca Working Memory
    const workingMemory = (await bridge.workspaceGetMemory(root)) as WorkingMemory | string | null
    let workingMemoryText = ''
    let sessionFactsText = ''
    const wm = (workingMemory && typeof workingMemory === 'object' ? workingMemory : null) as WorkingMemory | null
    if (wm && (wm.notes || wm.activeObjective)) {
      const parts: string[] = []
      if (wm.activeObjective) parts.push(`- Target/Tujuan Aktif: ${wm.activeObjective}`)
      if (wm.recentFiles && wm.recentFiles.length > 0) {
        parts.push(`- Berkas yang Baru Dimodifikasi: ${wm.recentFiles.join(', ')}`)
      }
      if (wm.notes) parts.push(`- Catatan Konteks: ${wm.notes}`)
      workingMemoryText = parts.join('\n')
    }
    // Fakta sesi verbatim (cap 2000 char); kosong = dilewati pemanggil.
    if (workingMemory) {
      const rawText = typeof workingMemory === 'string' ? workingMemory : JSON.stringify(workingMemory)
      if (rawText && rawText.trim() && rawText !== '{}') sessionFactsText = rawText.slice(0, 2000)
    }

    // 4. Query Codebase RAG jika ada input user
    let codeRagText = ''
    if (userInput && String(userInput).trim().length > 3) {
      const chunks = (await bridge.workspaceQuery(root, userInput, 4)) as WorkspaceChunk[] | null
      if (chunks && chunks.length > 0) {
        codeRagText = chunks
          .map(
            (c: WorkspaceChunk, idx: number) =>
              `[KODE RELEVAN #${idx + 1} (${c.filePath})]:\n\`\`\`\n${c.content}\n\`\`\``
          )
          .join('\n\n')
      }
    }

    return { workingMemoryText, codeRagText, sessionFactsText }
  } catch (err) {
    console.warn('[WorkspaceRAG] Gagal mengambil workspace context:', (err as Error).message)
    return { workingMemoryText: '', codeRagText: '', sessionFactsText: '' }
  }
}

/**
 * Menyimpan pembaruan Working Memory ke .abelink/working-memory.json
 */
export async function saveWorkspaceWorkingMemory(workspaceRoot: unknown, data: unknown): Promise<boolean> {
  const root = typeof workspaceRoot === 'string' ? workspaceRoot : ''
  if (!root || typeof window === 'undefined' || !(window as unknown as { api?: Record<string, (...a: unknown[]) => unknown> }).api?.workspaceSaveMemory) return false
  try {
    return (await (window as unknown as { api: { workspaceSaveMemory: (r: unknown, d: unknown) => Promise<boolean> } }).api.workspaceSaveMemory(root, data))
  } catch (err) {
    console.warn('[WorkspaceRAG] Gagal menyimpan working memory:', (err as Error).message)
    return false
  }
}
