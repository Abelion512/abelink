import { create, insert, insertMultiple, search, remove, removeMultiple } from '@orama/orama'
import { generateVector } from './vectorLoader'
import { db } from './db'

// Dimensi vektor sesuai model Transformers.js (all-MiniLM-L6-v2 = 384)
const VECTOR_SIZE = 384

let archiveIndex = null
let documentIndex = null
let memoryIndex = null

// Singleton init — React StrictMode double-invokes effects in dev; this
// guarantees init+hydrate run exactly once per session (no duplicate inserts).
let readyPromise = null
export function ensureOramaReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initOramaIndices()
      await hydrateFromDexie()
    })()
  }
  return readyPromise
}

export async function initOramaIndices() {
  memoryIndex = await create({
    schema: {
      type: 'string',
      summary: 'string',
      memory: 'string',
      timestamp: 'number',
      dexieId: 'number',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })
  archiveIndex = await create({
    schema: {
      summary: 'string',
      topic: 'string',
      timestamp: 'number',
      dexieId: 'number',       // Referensi ke ID di Dexie
      vector: `vector[${VECTOR_SIZE}]`
    }
  })

  documentIndex = await create({
    schema: {
      docName: 'string',
      chunkIndex: 'number',
      content: 'string',
      timestamp: 'number',
      dexieId: 'number',
      vector: `vector[${VECTOR_SIZE}]`
    }
  })
}

// Dipanggil saat app start: load semua data Dexie ke Orama
export async function hydrateFromDexie() {
  const archives = await db.chatArchive.toArray()
  const validArchives = []
  const needsMigration = localStorage.getItem('migrated_vectors_v1') !== 'true'
  let vecCount = 0

  for (let a of archives) {
    if (needsMigration || !a.vector || a.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for archive ID ${a.id}`)
      a.vector = await generateVector(a.summary)
      if (a.vector && a.vector.length === VECTOR_SIZE) {
        db.chatArchive.update(a.id, { vector: a.vector }).catch(console.error)
      }
      vecCount++
      if (vecCount % 3 === 0) await new Promise(r => setTimeout(r, 0))
    }
    if (a.vector && a.vector.length === VECTOR_SIZE) {
      validArchives.push({
        summary: a.summary,
        topic: a.topic || 'General',
        timestamp: a.timestamp || Date.now(),
        dexieId: a.id,
        vector: a.vector
      })
    }
  }

  if (validArchives.length > 0) {
    await insertMultiple(archiveIndex, validArchives)
  }

  const docs = await db.documents.toArray()
  const validDocs = []
  for (let d of docs) {
    if (needsMigration || !d.vector || d.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for doc ID ${d.id}`)
      d.vector = await generateVector(d.content)
      if (d.vector && d.vector.length === VECTOR_SIZE) {
        db.documents.update(d.id, { vector: d.vector }).catch(console.error)
      }
      vecCount++
      if (vecCount % 3 === 0) await new Promise(r => setTimeout(r, 0))
    }
    if (d.vector && d.vector.length === VECTOR_SIZE) {
      validDocs.push({
        docName: d.docName,
        chunkIndex: d.chunkIndex,
        content: d.content,
        timestamp: d.timestamp || Date.now(),
        dexieId: d.id,
        vector: d.vector
      })
    }
  }

  if (validDocs.length > 0) {
    await insertMultiple(documentIndex, validDocs)
  }

  const memories = await db.memory.toArray()
  const validMemories = []
  for (let m of memories) {
    if (needsMigration || !m.vector || m.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for memory ID ${m.id}`)
      m.vector = await generateVector(m.memory)
      if (m.vector && m.vector.length === VECTOR_SIZE) {
        db.memory.update(m.id, { vector: m.vector }).catch(console.error)
      }
    }
    if (m.vector && m.vector.length === VECTOR_SIZE) {
      validMemories.push({
        type: m.type || 'notes',
        summary: m.summary || '',
        memory: m.memory || '',
        timestamp: Date.now(),
        dexieId: m.id,
        vector: m.vector
      })
    }
  }

  if (validMemories.length > 0) {
    await insertMultiple(memoryIndex, validMemories)
  }

  if (needsMigration) {
    localStorage.setItem('migrated_vectors_v1', 'true')
    console.log('[Orama] Successfully migrated all old vectors to new model!')
  }

  console.log(`[Orama] Hydrated: ${validArchives.length} archives, ${validDocs.length} doc chunks, ${validMemories.length} memories`)
}

// Vector search di arsip obrolan
export async function searchArchives(queryVector, limit = 3) {
  if (!archiveIndex) return []
  try {
    const results = await search(archiveIndex, {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    })
    console.log(`[Orama] Found ${results.hits.length} archives. Scores:`, results.hits.map(h => h.score))
    return results.hits.map(hit => hit.document)
  } catch (err) {
    console.error('[Orama] Error in searchArchives:', err)
    return []
  }
}

// Vector search di dokumen RAG
export async function searchDocuments(queryText, queryVector, limit = 5) {
  if (!documentIndex) {
    console.log('[Orama] documentIndex is null!')
    return []
  }
  try {
    console.log(`[Orama] Searching documents for: "${queryText}", vector length: ${queryVector?.length}`)
    const results = await search(documentIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    })
    console.log(`[Orama] Found ${results.hits.length} documents. Scores:`, results.hits.map(h => h.score))
    return results.hits.map(hit => hit.document)
  } catch (error) {
    console.error('[Orama] Error in searchDocuments:', error)
    return []
  }
}

// Insert baru (dipanggil setelah Dexie.add)
export async function insertArchiveToOrama(data) {
  if (!archiveIndex) return
  await insert(archiveIndex, data)
}

export async function insertDocumentChunksToOrama(chunks) {
  if (!documentIndex) return
  await insertMultiple(documentIndex, chunks)
}

export async function deleteArchiveFromOrama(dexieId) {
  if (!archiveIndex || !dexieId) return
  try {
    // Same fix as deleteMemoryFromOrama: 'dexieId' is 'number', not searchable
    // via fullTextSearch properties. Use `where` filter instead.
    const res = await search(archiveIndex, { term: '', where: { dexieId: dexieId } })
    if (res.hits.length > 0) {
      for (let h of res.hits) {
        await remove(archiveIndex, h.id)
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteArchiveFromOrama:', err)
  }
}

export async function deleteDocumentFromOrama(docName) {
  if (!documentIndex) return
  const res = await search(documentIndex, { term: docName, properties: ['docName'], exact: true })
  const ids = res.hits.map(h => h.id)
  await removeMultiple(documentIndex, ids)
}

// ======================== MEMORY ORAMA INDEX ========================

export async function searchMemoriesInOrama(queryText, queryVector, limit = 5, filterTypes = null) {
  if (!memoryIndex || !queryVector) return []
  try {
    const results = await search(memoryIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit: limit * 4
    })
    let hits = results.hits.map(hit => ({ ...hit.document, id: hit.document.dexieId, score: hit.score }))
    if (filterTypes) {
      const typesArr = Array.isArray(filterTypes) ? filterTypes : [filterTypes]
      hits = hits.filter(h => typesArr.includes(h.type))
    }
    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, limit)
  } catch (err) {
    console.error('[Orama] Error in searchMemoriesInOrama:', err)
    return []
  }
}

export async function insertMemoryToOrama(data) {
  if (!memoryIndex || !data.vector || data.vector.length !== VECTOR_SIZE) return
  try {
    await insert(memoryIndex, {
      type: data.type || 'notes',
      summary: data.summary || '',
      memory: data.memory || '',
      timestamp: Date.now(),
      dexieId: data.id,
      vector: data.vector
    })
  } catch (err) {
    console.error('[Orama] Error insertMemoryToOrama:', err)
  }
}

export async function updateMemoryInOrama(dexieId, data) {
  if (!memoryIndex) return
  await deleteMemoryFromOrama(dexieId)
  await insertMemoryToOrama({ ...data, id: dexieId })
}

export async function deleteMemoryFromOrama(dexieId) {
  if (!memoryIndex || !dexieId) return
  try {
    // Orama v3: `search` auto-derives `properties` from `where` fields.
    // `dexieId` is 'number' (not in fulltext index) → throws INVALID_PROPERTY.
    // Fix: explicitly pass string-only properties so Orama doesn't auto-include dexieId.
    const res = await search(memoryIndex, {
      term: '',
      properties: ['type', 'summary', 'memory'],
      where: { dexieId: { eq: dexieId } }
    })
    if (res.hits.length > 0) {
      for (let h of res.hits) {
        await remove(memoryIndex, h.id)
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteMemoryFromOrama:', err)
  }
}

