import { create, insert, insertMultiple, search, remove, removeMultiple } from '@orama/orama'
import { generateVector } from './vectorLoader'
import { asyncPool } from '../utils/asyncPool'

// Policy vektor (getVectorModel/generateStorableVector) di-import dinamis dari
// vectorMemory agar bundle transformers tetap ter-split keluar dari entry chunk.
let vectorPolicyPromise = null
const loadVectorPolicy = () => {
  if (!vectorPolicyPromise) vectorPolicyPromise = import('./vectorMemory')
  return vectorPolicyPromise
}

// Dimensi vektor sesuai model Transformers.js (all-MiniLM-L6-v2 = 384)
const VECTOR_SIZE = 384

// Konstanta hydrasi: regen embedding paralel terbatas + tulis per batch.
// Concurrency sengaja kecil agar perangkat RAM rendah tetap aman; Lite Mode
// lolos cepat karena generateStorableVector langsung null di mode itu.
const REGEN_CONCURRENCY = 3
const BATCH_INSERT = 25
const BATCH_UPDATE = 25

// Normalisasi timestamp Dexie (angka / string ISO / lainnya) ke epoch ms.
const toNumericTs = (rawTs) =>
  typeof rawTs === 'number' && !isNaN(rawTs)
    ? rawTs
    : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
      ? Date.parse(rawTs)
      : Number(rawTs) || Date.now()

// Baris legasi tanpa tag dianggap ber-model MiniLM (vektor asli era pra-penetapan)
const LEGACY_VECTOR_MODEL = 'minilm'

// Provenansi vektor tiap baris indeks:
//   'minilm' = vektor asli MiniLM | 'hash' = hash embedding (DILARANG tersimpan)
//   'none'   = baris fulltext saja, tanpa vektor
const MEMORY_SCHEMA = {
  type: 'string',
  summary: 'string',
  memory: 'string',
  timestamp: 'number',
  dexieId: 'number',
  vector: `vector[${VECTOR_SIZE}]`,
  vectorModel: 'string'
}

const ARCHIVE_SCHEMA = {
  summary: 'string',
  topic: 'string',
  timestamp: 'number',
  dexieId: 'number', // Referensi ke ID di Dexie
  vector: `vector[${VECTOR_SIZE}]`,
  vectorModel: 'string'
}

const DOCUMENT_SCHEMA = {
  docName: 'string',
  chunkIndex: 'number',
  content: 'string',
  timestamp: 'number',
  dexieId: 'number',
  vector: `vector[${VECTOR_SIZE}]`,
  vectorModel: 'string'
}

const TURN_PAIR_SCHEMA = {
  pairId: 'string',
  sessionId: 'number',
  sessionTitle: 'string',
  userText: 'string',
  aiText: 'string',
  combinedText: 'string',
  timestamp: 'number',
  vector: `vector[${VECTOR_SIZE}]`,
  vectorModel: 'string'
}

let archiveIndex = null
let documentIndex = null
let memoryIndex = null
let turnPairIndex = null

export async function initOramaIndices() {
  memoryIndex = await create({ schema: MEMORY_SCHEMA })
  archiveIndex = await create({ schema: ARCHIVE_SCHEMA })
  documentIndex = await create({ schema: DOCUMENT_SCHEMA })
  turnPairIndex = await create({ schema: TURN_PAIR_SCHEMA })
}

// Kosongkan indeks pencarian turunan data chat (archive, document, turn pair) dengan
// drop + recreate memakai skema konstruksi yang sama seperti module init. Dipanggil
// SETELAH Dexie dibersihkan (Hapus Semua Chat); TIDAK re-hydrate di sini agar baris
// memoryIndex tidak ter-insert dobel. memoryIndex sengaja dipertahankan — memori user
// bukan bagian riwayat chat.
export async function resetSearchIndices() {
  archiveIndex = await create({ schema: ARCHIVE_SCHEMA })
  documentIndex = await create({ schema: DOCUMENT_SCHEMA })
  turnPairIndex = await create({ schema: TURN_PAIR_SCHEMA })
}

// Kecocokan model baris vs mode pencarian aktif; tanpa tag = legasi MiniLM,
// 'none' (fulltext saja) selalu kompatibel karena tidak punya vektor.
function rowModelCompatible(rowModel, currentModel) {
  if (!rowModel || rowModel === 'none') return true
  return rowModel === currentModel
}

// Susun baris indeks: vektor hanya disertakan jika valid & se-model dengan mode aktif,
// selebihnya baris disimpan fulltext saja (tanpa vektor hash/lintas model).
function toIndexRow(fields, vector, rowModel, currentModel) {
  const model = rowModel || LEGACY_VECTOR_MODEL
  if (vector && vector.length === VECTOR_SIZE && rowModelCompatible(model, currentModel)) {
    return { ...fields, vector, vectorModel: model }
  }
  return { ...fields, vectorModel: 'none' }
}

// Dipanggil saat app start: load semua data Dexie ke Orama
export async function hydrateFromDexie(onProgress) {
  const { db } = await import('./db')
  const { generateStorableVector, getVectorModel } = await loadVectorPolicy()
  const currentModel = getVectorModel()

  // 1. CHAT TURNS HYDRATION & SMART MIGRATION
  let validTurnsCount = 0
  try {
    const turnCount = await db.chatTurns.count()
    const sessionCount = await db.sessions.count()

    if (turnCount === 0 && sessionCount > 0) {
      console.log('[Orama] Kondisi 1: chatTurns kosong & sessions ada. Memulai smart migration...')
      const { migrateOldSessionsToTurns } = await import('./turnPairMigrator')
      validTurnsCount = await migrateOldSessionsToTurns(onProgress)
    } else if (turnCount > 0) {
      const turns = await db.chatTurns.toArray()

      // Regen embedding PARALEL terbatas (REGEN_CONCURRENCY sekaligus) — dulu
      // serial murni sehingga startup korpus besar lambat. Slot gagal menjadi
      // Error di posisinya; baris itu jatuh ke fulltext-only, bukan batal semua.
      const prepared = await asyncPool(REGEN_CONCURRENCY, turns, async (t) => {
        const fields = {
          pairId: String(t.pairId || ''),
          sessionId: Number(t.sessionId) || 1,
          sessionTitle: String(t.sessionTitle || 'Session'),
          userText: String(t.userText || ''),
          aiText: String(t.aiText || ''),
          combinedText: String(t.combinedText || ''),
          timestamp: toNumericTs(t.timestamp)
        }
        if (t.vector && t.vector.length === VECTOR_SIZE) {
          // Vektor tersimpan: hormati provenansinya, jangan campur lintas model
          return toIndexRow(fields, t.vector, t.vectorModel, currentModel)
        }
        // Regenerasi HANYA lewat generateStorableVector (null saat Lite Mode)
        const vec = await generateStorableVector(t.combinedText)
        if (vec && vec.length === VECTOR_SIZE) {
          return {
            row: { ...fields, vector: vec, vectorModel: currentModel },
            update: { key: t.pairId, changes: { vector: vec, vectorModel: currentModel } }
          }
        }
        // Gagal regen / Lite Mode: baris fulltext saja, JANGAN menulis vektor ke Dexie
        return toIndexRow(fields, null, null, currentModel)
      })

      const validTurns = []
      const turnUpdates = []
      for (const item of prepared) {
        if (item instanceof Error) continue
        if (item && item.row) {
          validTurns.push(item.row)
          turnUpdates.push(item.update)
        } else if (item) {
          validTurns.push(item)
        }
      }

      // Tulis vektor balik ke Dexie per batch (bulkUpdate) — dulu satu update()
      // fire-and-forget per baris.
      for (let i = 0; i < turnUpdates.length; i += BATCH_UPDATE) {
        await db.chatTurns.bulkUpdate(turnUpdates.slice(i, i + BATCH_UPDATE)).catch(console.error)
      }

      if (validTurns.length > 0) {
        for (let i = 0; i < validTurns.length; i += BATCH_INSERT) {
          await insertMultiple(turnPairIndex, validTurns.slice(i, i + BATCH_INSERT))
        }
        validTurnsCount = validTurns.length
      }
      console.log(`[Orama] Kondisi 2: Hydrated ${validTurnsCount} turn pairs from Dexie`)
    } else {
      console.log('[Orama] Kondisi 3: Fresh install, no chat turns to migrate')
    }
  } catch (err) {
    console.error('[Orama] Error hydrating turn pairs:', err)
  }

  const archives = await db.chatArchive.toArray()
  const needsMigration = localStorage.getItem('migrated_vectors_v1') !== 'true'

  const archiveResults = await asyncPool(REGEN_CONCURRENCY, archives, async (a) => {
    const fields = {
      summary: a.summary,
      topic: a.topic || 'General',
      timestamp: a.timestamp || Date.now(),
      dexieId: a.id
    }
    if (needsMigration || !a.vector || a.vector.length !== VECTOR_SIZE) {
      // Hanya generateStorableVector — null di Lite Mode sehingga hash tidak pernah disimpan
      const vec = await generateStorableVector(a.summary)
      if (vec && vec.length === VECTOR_SIZE) {
        return {
          row: toIndexRow(fields, vec, currentModel, currentModel),
          update: { key: a.id, changes: { vector: vec, vectorModel: currentModel } }
        }
      }
      return toIndexRow(fields, null, null, currentModel)
    }
    return toIndexRow(fields, a.vector, a.vectorModel, currentModel)
  })

  const validArchives = []
  const archiveUpdates = []
  for (const item of archiveResults) {
    if (item instanceof Error) continue
    if (item && item.row) {
      validArchives.push(item.row)
      archiveUpdates.push(item.update)
    } else if (item) {
      validArchives.push(item)
    }
  }

  for (let i = 0; i < archiveUpdates.length; i += BATCH_UPDATE) {
    await db.chatArchive.bulkUpdate(archiveUpdates.slice(i, i + BATCH_UPDATE)).catch(console.error)
  }

  if (validArchives.length > 0) {
    for (let i = 0; i < validArchives.length; i += BATCH_INSERT) {
      await insertMultiple(archiveIndex, validArchives.slice(i, i + BATCH_INSERT))
    }
  }

  const docs = await db.documents.toArray()
  const docResults = await asyncPool(REGEN_CONCURRENCY, docs, async (d) => {
    const fields = {
      docName: d.docName,
      chunkIndex: d.chunkIndex,
      content: d.content,
      timestamp: d.timestamp || Date.now(),
      dexieId: d.id
    }
    if (needsMigration || !d.vector || d.vector.length !== VECTOR_SIZE) {
      const vec = await generateStorableVector(d.content)
      if (vec && vec.length === VECTOR_SIZE) {
        return {
          row: toIndexRow(fields, vec, currentModel, currentModel),
          update: { key: d.id, changes: { vector: vec, vectorModel: currentModel } }
        }
      }
      return toIndexRow(fields, null, null, currentModel)
    }
    return toIndexRow(fields, d.vector, d.vectorModel, currentModel)
  })

  const validDocs = []
  const docUpdates = []
  for (const item of docResults) {
    if (item instanceof Error) continue
    if (item && item.row) {
      validDocs.push(item.row)
      docUpdates.push(item.update)
    } else if (item) {
      validDocs.push(item)
    }
  }

  for (let i = 0; i < docUpdates.length; i += BATCH_UPDATE) {
    await db.documents.bulkUpdate(docUpdates.slice(i, i + BATCH_UPDATE)).catch(console.error)
  }

  if (validDocs.length > 0) {
    for (let i = 0; i < validDocs.length; i += BATCH_INSERT) {
      await insertMultiple(documentIndex, validDocs.slice(i, i + BATCH_INSERT))
    }
  }

  const memories = await db.memory.toArray()
  const memoryResults = await asyncPool(REGEN_CONCURRENCY, memories, async (m) => {
    const fields = {
      type: m.type || 'notes',
      summary: m.summary || '',
      memory: m.memory || '',
      timestamp: Date.now(),
      dexieId: m.id
    }
    if (needsMigration || !m.vector || m.vector.length !== VECTOR_SIZE) {
      const vec = await generateStorableVector(m.memory)
      if (vec && vec.length === VECTOR_SIZE) {
        return {
          row: toIndexRow(fields, vec, currentModel, currentModel),
          update: { key: m.id, changes: { vector: vec, vectorModel: currentModel } }
        }
      }
      return toIndexRow(fields, null, null, currentModel)
    }
    return toIndexRow(fields, m.vector, m.vectorModel, currentModel)
  })

  const validMemories = []
  const memoryUpdates = []
  for (const item of memoryResults) {
    if (item instanceof Error) continue
    if (item && item.row) {
      validMemories.push(item.row)
      memoryUpdates.push(item.update)
    } else if (item) {
      validMemories.push(item)
    }
  }

  for (let i = 0; i < memoryUpdates.length; i += BATCH_UPDATE) {
    await db.memory.bulkUpdate(memoryUpdates.slice(i, i + BATCH_UPDATE)).catch(console.error)
  }

  if (validMemories.length > 0) {
    for (let i = 0; i < validMemories.length; i += BATCH_INSERT) {
      await insertMultiple(memoryIndex, validMemories.slice(i, i + BATCH_INSERT))
    }
  }

  if (needsMigration) {
    localStorage.setItem('migrated_vectors_v1', 'true')
    console.log('[Orama] Successfully migrated all old vectors to new model!')
  }

  console.log(`[Orama] Hydrated: ${validTurnsCount} turn pairs, ${validArchives.length} archives, ${validDocs.length} doc chunks, ${validMemories.length} memories`)
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
    // Buang baris lintas model (hash vs minilm) agar korpus campur tidak menghasut hasil palsu
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const hits = results.hits.filter((h) =>
      rowModelCompatible(h.document.vectorModel, currentModel)
    )
    console.log(
      `[Orama] Found ${hits.length} archives. Scores:`,
      hits.map((h) => h.score)
    )
    return hits.map((hit) => hit.document)
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
    // Baris 'none' (fulltext saja) tetap boleh lewat lewat jalur term
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const hits = results.hits.filter((h) =>
      rowModelCompatible(h.document.vectorModel, currentModel)
    )
    console.log(
      `[Orama] Found ${hits.length} documents. Scores:`,
      hits.map((h) => h.score)
    )
    return hits.map((hit) => hit.document)
  } catch (error) {
    console.error('[Orama] Error in searchDocuments:', error)
    return []
  }
}

// Insert baru (dipanggil setelah Dexie.add)
export async function insertArchiveToOrama(data) {
  if (!archiveIndex) return
  // Vector selalu hasil vectorLoader (MiniLM asli, tanpa fallback hash)
  await insert(archiveIndex, { ...data, vectorModel: data.vectorModel || LEGACY_VECTOR_MODEL })
}

export async function insertDocumentChunksToOrama(chunks) {
  if (!documentIndex) return
  const tagged = (chunks || []).map((c) => ({
    ...c,
    vectorModel: c.vectorModel || LEGACY_VECTOR_MODEL
  }))
  await insertMultiple(documentIndex, tagged)
}

export async function deleteArchiveFromOrama(dexieId) {
  if (!archiveIndex || !dexieId) return
  try {
    const res = await search(archiveIndex, { where: { dexieId: Number(dexieId) } })
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
  if (!documentIndex || !docName) return
  try {
    // Filter eksak (bukan fuzzy term search) agar chunk dokumen sejenis tidak ikut terhapus
    const res = await search(documentIndex, { where: { docName }, limit: 10000 })
    const ids = res.hits.map((h) => h.id)
    if (ids.length > 0) {
      await removeMultiple(documentIndex, ids)
    }
  } catch (err) {
    console.error('[Orama] Error deleteDocumentFromOrama:', err)
  }
}

// ======================== TURN PAIR ORAMA INDEX ========================

export async function insertTurnPairToOrama(data) {
  if (!turnPairIndex) return
  try {
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    let vector = data.vector && data.vector.length === VECTOR_SIZE ? data.vector : null
    // Vektor tanpa tag dianggap dibuat engine aktif saat ini (mis. vectorMemory.generateVector)
    let vectorModel = data.vectorModel || (vector ? currentModel : null)
    if (vectorModel === 'hash') {
      // Hash embedding DILARANG masuk indeks — sisakan baris fulltext saja
      vector = null
      vectorModel = 'none'
    }

    const rawTs = data.timestamp
    const numericTs =
      typeof rawTs === 'number' && !isNaN(rawTs)
        ? rawTs
        : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
          ? Date.parse(rawTs)
          : Number(rawTs) || Date.now()

    const doc = {
      pairId: String(data.pairId || ''),
      sessionId: Number(data.sessionId) || 1,
      sessionTitle: String(data.sessionTitle || 'Session'),
      userText: String(data.userText || ''),
      aiText: String(data.aiText || ''),
      combinedText: String(data.combinedText || ''),
      timestamp: numericTs,
      vectorModel: vectorModel || 'none'
    }
    if (vector) doc.vector = vector

    await insert(turnPairIndex, doc)
  } catch (err) {
    console.error('[Orama] Error insertTurnPairToOrama:', err)
  }
}

export async function insertBatchTurnPairsToOrama(turns) {
  if (!turnPairIndex || !Array.isArray(turns) || turns.length === 0) return
  try {
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const valid = []
    for (let t of turns) {
      let vector = t.vector && t.vector.length === VECTOR_SIZE ? t.vector : null
      let vectorModel = t.vectorModel || (vector ? currentModel : null)
      if (vectorModel === 'hash') {
        vector = null
        vectorModel = 'none'
      }
      const rawTs = t.timestamp
      const numericTs =
        typeof rawTs === 'number' && !isNaN(rawTs)
          ? rawTs
          : typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))
            ? Date.parse(rawTs)
            : Number(rawTs) || Date.now()

      const doc = {
        pairId: String(t.pairId || ''),
        sessionId: Number(t.sessionId) || 1,
        sessionTitle: String(t.sessionTitle || 'Session'),
        userText: String(t.userText || ''),
        aiText: String(t.aiText || ''),
        combinedText: String(t.combinedText || ''),
        timestamp: numericTs,
        vectorModel: vectorModel || 'none'
      }
      if (vector) doc.vector = vector
      valid.push(doc)
    }

    if (valid.length > 0) {
      await insertMultiple(turnPairIndex, valid)
    }
  } catch (err) {
    console.error('[Orama] Error insertBatchTurnPairsToOrama:', err)
  }
}

export async function searchTurnPairsInOrama(queryText, queryVector, limit = 5, threshold = 0.5) {
  if (!turnPairIndex || !queryVector) return []
  try {
    const results = await search(turnPairIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit
    })
    // Abaikan baris lintas model agar korpus campur tidak menghasilkan skor bohong
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    return results.hits
      .filter((hit) => rowModelCompatible(hit.document.vectorModel, currentModel))
      .map((hit) => ({
        ...hit.document,
        score: hit.score
      }))
  } catch (err) {
    console.error('[Orama] Error in searchTurnPairsInOrama:', err)
    return []
  }
}

export async function deleteTurnPairsBySessionFromOrama(sessionId) {
  if (!turnPairIndex || !sessionId) return
  try {
    const results = await search(turnPairIndex, {
      where: { sessionId: Number(sessionId) }
    })
    if (results.hits.length > 0) {
      const ids = results.hits.map((h) => h.id)
      await removeMultiple(turnPairIndex, ids)
    }
  } catch (err) {
    console.error('[Orama] Error deleteTurnPairsBySessionFromOrama:', err)
  }
}

// ======================== MEMORY ORAMA INDEX ========================

export async function searchMemoriesInOrama(queryText, queryVector, limit = 5, filterTypes = null, threshold = 0.5) {
  if (!memoryIndex || !queryVector) return []
  try {
    const results = await search(memoryIndex, {
      term: queryText,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: threshold,
      limit: limit * 4
    })
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    let hits = results.hits
      .filter((hit) => rowModelCompatible(hit.document.vectorModel, currentModel))
      .map(hit => ({ ...hit.document, id: hit.document.dexieId, score: hit.score }))
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
      // Vector dari db.js selalu hasil vectorLoader (MiniLM asli, tanpa fallback hash)
      vectorModel: data.vectorModel || LEGACY_VECTOR_MODEL,
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
    const res = await search(memoryIndex, { where: { dexieId: Number(dexieId) } })
    if (res.hits.length > 0) {
      for (let h of res.hits) {
        if (h.id === undefined || h.id === null) continue
        await remove(memoryIndex, String(h.id))
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteMemoryFromOrama:', err)
  }
}

export async function findSimilarMemoryClusters(threshold = 0.60) {
  if (!memoryIndex) {
    console.warn('[Orama Groomer] memoryIndex belum siap!')
    return []
  }
  try {
    console.log('[Orama Groomer] Memulai scanning cluster memori di Orama dengan threshold:', threshold)
    const results = await search(memoryIndex, {
      term: '',
      limit: 1000
    })
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    let memories = results.hits
      .map(hit => ({
        ...hit.document,
        id: hit.document.dexieId
      }))
      .filter(
        (m) =>
          (m.type === 'profile' || m.type === 'preference') &&
          rowModelCompatible(m.vectorModel, currentModel)
      )

    const visited = new Set()
    const clusters = []
    let groupCount = 1

    for (const mem of memories) {
      if (visited.has(mem.id)) continue
      if (!mem.vector || !Array.isArray(mem.vector)) {
        visited.add(mem.id)
        continue
      }

      const simResults = await search(memoryIndex, {
        term: mem.memory,
        mode: 'hybrid',
        vector: { value: mem.vector, property: 'vector' },
        similarity: threshold,
        limit: 20
      })

      if (simResults.hits.length > 1) {
        console.log(
          '[Orama Groomer] Kandidat mirip untuk:',
          mem.memory,
          '-> scores:',
          simResults.hits.map(h => `${h.score.toFixed(2)} (${h.document.memory.slice(0, 30)}...)`)
        )
      }

      const similarHits = simResults.hits
        .map(hit => ({
          ...hit.document,
          id: hit.document.dexieId,
          score: hit.score
        }))
        .filter(
          h =>
            (h.type === 'profile' || h.type === 'preference') &&
            rowModelCompatible(h.vectorModel, currentModel) &&
            h.score >= threshold &&
            !visited.has(h.id)
        )

      if (similarHits.length >= 2) {
        similarHits.forEach(h => visited.add(h.id))
        clusters.push({
          group: groupCount++,
          items: similarHits.map(h => ({
            id: h.id,
            type: h.type,
            memory: h.memory,
            timestamp: h.timestamp
          }))
        })
      } else {
        visited.add(mem.id)
      }
    }

    console.log(`[Orama Groomer] Ditemukan ${clusters.length} cluster dari total ${memories.length} memori profile/preference.`)
    return clusters
  } catch (err) {
    console.error('[Orama] Error in findSimilarMemoryClusters:', err)
    return []
  }
}

// On-the-fly Orama Hybrid Vector Search for read-document
export async function searchDocumentWithOrama(rawText, searchQuery, limit = 5) {
  try {
    if (!rawText || !searchQuery) return []

    // 1. Chunk text (500 chars with 50 overlap)
    const chunks = []
    let start = 0
    const chunkSize = 500
    const overlap = 50
    while (start < rawText.length) {
      const end = Math.min(start + chunkSize, rawText.length)
      const chunkStr = rawText.slice(start, end).trim()
      if (chunkStr) chunks.push(chunkStr)
      start += chunkSize - overlap
    }

    if (chunks.length === 0) return []

    // 2. Pre-filter candidate chunks to avoid CPU freeze (Max 20 chunks)
    const terms = searchQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
    let candidateChunks = chunks
    if (chunks.length > 20) {
      if (terms.length > 0) {
        const scored = chunks.map((c) => {
          const lower = c.toLowerCase()
          let score = 0
          for (const term of terms) {
            if (lower.includes(term)) score += 1
          }
          return { chunk: c, score }
        })
        const matching = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((s) => s.chunk)

        if (matching.length > 0) {
          candidateChunks = matching.slice(0, 20)
        } else {
          const step = Math.max(1, Math.floor(chunks.length / 20))
          candidateChunks = []
          for (let i = 0; i < chunks.length && candidateChunks.length < 20; i += step) {
            candidateChunks.push(chunks[i])
          }
        }
      } else {
        candidateChunks = chunks.slice(0, 20)
      }
    }

    // 3. Create in-memory Orama instance
    const tempDb = await create({
      schema: {
        content: 'string',
        vector: `vector[${VECTOR_SIZE}]`
      }
    })

    // 4. Generate vectors and insert with Event-Loop yielding
    for (let i = 0; i < candidateChunks.length; i++) {
      const vec = await generateVector(candidateChunks[i])
      if (vec && vec.length === VECTOR_SIZE) {
        await insert(tempDb, {
          content: candidateChunks[i],
          vector: vec
        })
      }
      // Yield back to Electron Event Loop every 2 chunks to keep UI responsive
      if (i % 2 === 0) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    // 5. Generate query vector and search
    const queryVec = await generateVector(searchQuery)
    if (!queryVec || queryVec.length !== VECTOR_SIZE) return []

    const searchRes = await search(tempDb, {
      term: searchQuery,
      mode: 'hybrid',
      vector: { value: queryVec, property: 'vector' },
      similarity: 0.15,
      limit: limit
    })

    return searchRes.hits.map((h) => ({
      content: h.document.content,
      score: h.score
    }))
  } catch (err) {
    console.error('[Orama] Error in searchDocumentWithOrama:', err)
    return []
  }
}
