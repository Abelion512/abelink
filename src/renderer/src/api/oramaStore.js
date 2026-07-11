import { create, insert, insertMultiple, search, remove, removeMultiple } from '@orama/orama'
import { generateVector } from './vectorMemory'

// Dimensi vektor sesuai model Transformers.js (all-MiniLM-L6-v2 = 384)
const VECTOR_SIZE = 384

let archiveIndex = null
let documentIndex = null

export async function initOramaIndices() {
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
  const { db } = await import('./db')

  const archives = await db.chatArchive.toArray()
  const validArchives = []
  const needsMigration = localStorage.getItem('migrated_vectors_v1') !== 'true'

  for (let a of archives) {
    if (needsMigration || !a.vector || a.vector.length !== VECTOR_SIZE) {
      console.log(`[Orama] Re-generating vector for archive ID ${a.id}`)
      a.vector = await generateVector(a.summary)
      if (a.vector && a.vector.length === VECTOR_SIZE) {
        db.chatArchive.update(a.id, { vector: a.vector }).catch(console.error)
      }
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

  if (needsMigration) {
    localStorage.setItem('migrated_vectors_v1', 'true')
    console.log('[Orama] Successfully migrated all old vectors to new model!')
  }

  console.log(`[Orama] Hydrated: ${validArchives.length} archives, ${validDocs.length} doc chunks`)
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
  if (!archiveIndex) return
  // Orama requires internal ID for deletion. We can search by dexieId first if needed.
  // A simpler way for a small DB is to just search exactly for that dexieId.
  const res = await search(archiveIndex, { term: dexieId.toString(), properties: ['dexieId'], exact: true })
  if (res.hits.length > 0) {
     await remove(archiveIndex, res.hits[0].id)
  }
}

export async function deleteDocumentFromOrama(docName) {
  if (!documentIndex) return
  const res = await search(documentIndex, { term: docName, properties: ['docName'] })
  const ids = res.hits.map(h => h.id)
  await removeMultiple(documentIndex, ids)
}
