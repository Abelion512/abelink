import { generateVector } from './vectorMemory'
import { bulkInsertDocuments, deleteDocumentByName, getAllDocuments, insertMemory } from './db'
import { insertDocumentChunksToOrama, deleteDocumentFromOrama } from './oramaStore'

// ========== JSON → Text Extraction for RAG ==========
function extractTextFromJSON(raw, fileName) {
  try {
    const data = JSON.parse(raw)
    const parts = []

    // Session knowledge format
    if (data.$schema?.includes('session-knowledge') || data.knowledge) {
      const k = data.knowledge || data
      const topic = data.session?.topic || fileName

      // Extract decisions
      if (k.decisions) {
        for (const d of k.decisions) {
          parts.push(`Decision: ${d.decision}. Rationale: ${d.rationale}. Tradeoff: ${d.tradeoff || 'N/A'}`)
        }
      }
      // Extract patterns
      if (k.patterns) {
        for (const p of k.patterns) {
          parts.push(`Pattern: ${p.name}. Description: ${p.description}. Applied to: ${p.appliedTo?.join(', ') || 'N/A'}`)
        }
      }
      // Extract insights
      if (k.insights) {
        for (const i of k.insights) {
          parts.push(`Insight: ${i.insight}`)
        }
      }
      // Extract gaps
      if (k.gaps) {
        for (const g of k.gaps) {
          parts.push(`Gap: ${g.gap}. Priority: ${g.priority}. Effort: ${g.effort}`)
        }
      }
      // Extract errors
      if (k.errors) {
        for (const e of k.errors) {
          parts.push(`Error: ${e.error}. Cause: ${e.cause}. Fix: ${e.fix}`)
        }
      }

      if (parts.length > 0) {
        return `[${topic}]\n${parts.join('\n')}`
      }
    }

    // Generic JSON: stringify with indentation for readability
    return JSON.stringify(data, null, 2)
  } catch {
    return raw // Fallback: raw text
  }
}

// ========== Import Session Knowledge ==========
export async function importSessionKnowledge(jsonContent, fileName) {
  try {
    const data = JSON.parse(jsonContent)
    const topic = data.session?.topic || fileName.replace('.json', '')

    // Convert knowledge to searchable text chunks
    const chunks = []
    const k = data.knowledge || data

    if (k.decisions) {
      for (const d of k.decisions) {
        chunks.push({
          type: 'decision',
          content: `[DECISION] ${d.decision}\nRationale: ${d.rationale}\nTradeoff: ${d.tradeoff || 'N/A'}\nConfidence: ${d.confidence || 'medium'}`,
          metadata: { agent: data.agent?.name, topic, date: data.timestamp }
        })
      }
    }
    if (k.patterns) {
      for (const p of k.patterns) {
        chunks.push({
          type: 'pattern',
          content: `[PATTERN] ${p.name}\n${p.description}\nApplied to: ${p.appliedTo?.join(', ') || 'N/A'}\nSource: ${p.source || 'N/A'}`,
          metadata: { agent: data.agent?.name, topic, date: data.timestamp }
        })
      }
    }
    if (k.insights) {
      for (const i of k.insights) {
        chunks.push({
          type: 'insight',
          content: `[INSIGHT] ${i.insight}`,
          metadata: { agent: data.agent?.name, topic, date: data.timestamp }
        })
      }
    }
    if (k.errors) {
      for (const e of k.errors) {
        chunks.push({
          type: 'error',
          content: `[ERROR] ${e.error}\nCause: ${e.cause}\nFix: ${e.fix}\nPrevention: ${e.preventedBy || 'N/A'}`,
          metadata: { agent: data.agent?.name, topic, date: data.timestamp }
        })
      }
    }

    if (chunks.length === 0) {
      throw new Error('No knowledge chunks found in JSON')
    }

    // Generate vectors and insert
    const dexieRecords = []
    for (const chunk of chunks) {
      const vector = await generateVector(chunk.content)
      if (!vector) continue
      dexieRecords.push({
        docName: `knowledge:${fileName}`,
        chunkIndex: dexieRecords.length,
        content: chunk.content,
        timestamp: Date.now(),
        vector,
        metadata: chunk.metadata
      })
    }

    if (dexieRecords.length === 0) {
      throw new Error('Failed to generate vectors from knowledge')
    }

    const ids = await bulkInsertDocuments(dexieRecords)
    const oramaData = dexieRecords.map((r, i) => ({ ...r, dexieId: ids[i] }))
    await insertDocumentChunksToOrama(oramaData)

    return { fileName, totalChunks: dexieRecords.length, topic, agent: data.agent?.name }
  } catch (error) {
    throw new Error(`Failed to import session knowledge: ${error.message}`)
  }
}

function splitTextIntoChunks(text, chunkSize = 500, overlap = 50) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}

export async function ingestDocument(file, onProgress) {
  // 0. Validasi ukuran (Max 50MB)
  const MAX_SIZE = 50 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    throw new Error('Ukuran file terlalu besar. Maksimal 50MB.')
  }

  // 0.5. Handling duplikat
  const existingDocs = await getAllDocuments()
  const isDuplicate = existingDocs.some(d => d.docName === file.name)
  
  if (isDuplicate) {
    // Hapus dokumen lama dulu
    await deleteDocumentByName(file.name)
    await deleteDocumentFromOrama(file.name)
  }

  // 1. Ekstrak teks
  let rawText = ''

  if (file.name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer()
    rawText = await window.api.parseDocument(buf, false)
  } else if (file.name.endsWith('.docx')) {
    const buf = await file.arrayBuffer()
    rawText = await window.api.parseDocument(buf, true)
  } else if (file.name.endsWith('.json')) {
    // JSON: parse structure → extract meaningful text for RAG
    const raw = await file.text()
    rawText = extractTextFromJSON(raw, file.name)
  } else {
    rawText = await file.text()
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('Dokumen kosong atau tidak terbaca.')
  }

  // 2. Chunking
  const chunks = splitTextIntoChunks(rawText, 500, 50)

  // 3. Embed + Simpan (Dexie & Orama)
  const dexieRecords = []

  for (let i = 0; i < chunks.length; i++) {
    const vector = await generateVector(chunks[i])
    if (!vector) continue

    const record = {
      docName: file.name,
      chunkIndex: i,
      content: chunks[i],
      timestamp: Date.now(),
      vector
    }
    dexieRecords.push(record)
    
    if (onProgress) {
      onProgress(Math.round(((i + 1) / chunks.length) * 100))
    }
  }

  if (dexieRecords.length === 0) {
    throw new Error('Gagal mengekstrak vektor dari dokumen.')
  }

  // Bulk insert ke Dexie
  const ids = await bulkInsertDocuments(dexieRecords)

  // Bulk insert ke Orama (dengan dexieId)
  const oramaData = dexieRecords.map((r, i) => ({ ...r, dexieId: ids[i] }))
  await insertDocumentChunksToOrama(oramaData)

  return { fileName: file.name, totalChunks: chunks.length, totalCharacters: rawText.length }
}
