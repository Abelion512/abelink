import { create, insert, insertMultiple, search, remove } from '@orama/orama'
import { generateVector, cosineSimilarity } from './vectorLoader'
import { asyncPool } from '../utils/asyncPool'

// ---- Kontrak tipe (W2-7b) ----
// Instans Orama generik: skema dinamis (template string vector[384]) tidak
// cocok dengan generics ketat lib, jadi indeks disimpan sebagai hasil create
// apa pun dan cast di boundary pemanggilan.
type OramaIndex = Awaited<ReturnType<typeof create>>

// Policy vektor (getVectorModel/generateStorableVector) di-import dinamis dari
// vectorMemory agar bundle transformers tetap ter-split keluar dari entry chunk.
let vectorPolicyPromise: Promise<{ generateStorableVector: (t: unknown) => Promise<number[] | null>; getVectorModel: () => string }> | null
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
const toNumericTs = (rawTs: unknown): number =>
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

let archiveIndex: OramaIndex | null = null
let documentIndex: OramaIndex | null = null
let memoryIndex: OramaIndex | null = null
let turnPairIndex: OramaIndex | null = null

// Lazy init promise: di MINIMAL profile App.jsx sengaja tidak init saat boot
// (hemat RAM/CPU), tapi konsumen (RAG pipeline, memory groomer, pencarian
// arsip/dokumen) tetap memanggil fungsi2 indeks. Tanpa ini, indeks tetap null
// selamanya dan pencarian selalu kosong ([Orama] documentIndex is null!).
// ensure*Index() membuat indeks yang belum ada secara idempoten, on-demand.
let ensurePromise: Promise<void> | null = null
const ensureIndices = async (): Promise<void> => {
  if (memoryIndex && archiveIndex && documentIndex && turnPairIndex) return
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!memoryIndex) memoryIndex = (await create({ schema: MEMORY_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
      if (!archiveIndex) archiveIndex = (await create({ schema: ARCHIVE_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
      if (!documentIndex) documentIndex = (await create({ schema: DOCUMENT_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
      if (!turnPairIndex) turnPairIndex = (await create({ schema: TURN_PAIR_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
    })()
    // Gagal create (mis. Orama tidak tersedia) -> reset promise agar caller
    // berikutnya bisa retry, bukan terjebak rejection yang di-cache selamanya.
    ensurePromise.catch(() => {
      ensurePromise = null
    })
  }
  await ensurePromise
}
const ensureMemoryIndex = async () => {
  await ensureIndices()
  return memoryIndex
}
const ensureDocumentIndex = async () => {
  await ensureIndices()
  return documentIndex
}
const ensureArchiveIndex = async () => {
  await ensureIndices()
  return archiveIndex
}
const ensureTurnPairIndex = async () => {
  await ensureIndices()
  return turnPairIndex
}

export async function initOramaIndices() {
  await ensureIndices()
}

// Kosongkan indeks pencarian turunan data chat (archive, document, turn pair) dengan
// drop + recreate memakai skema konstruksi yang sama seperti module init. Dipanggil
// SETELAH Dexie dibersihkan (Hapus Semua Chat); TIDAK re-hydrate di sini agar baris
// memoryIndex tidak ter-insert dobel. memoryIndex sengaja dipertahankan — memori user
// bukan bagian riwayat chat.
export async function resetSearchIndices() {
  archiveIndex = (await create({ schema: ARCHIVE_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
  documentIndex = (await create({ schema: DOCUMENT_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
  turnPairIndex = (await create({ schema: TURN_PAIR_SCHEMA } as Parameters<typeof create>[0])) as OramaIndex
}

// Kecocokan model baris vs mode pencarian aktif; tanpa tag = legasi MiniLM,
// 'none' (fulltext saja) selalu kompatibel karena tidak punya vektor.
function rowModelCompatible(rowModel: unknown, currentModel: unknown): boolean {
  if (!rowModel || rowModel === 'none') return true
  return rowModel === currentModel
}

// Susun baris indeks: vektor hanya disertakan jika valid & se-model dengan mode aktif,
// selebihnya baris disimpan fulltext saja (tanpa vektor hash/lintas model).
function toIndexRow(
  fields: Record<string, unknown>,
  vector: unknown,
  rowModel: unknown,
  currentModel: unknown
): Record<string, unknown> {
  const model = rowModel || LEGACY_VECTOR_MODEL
  if (Array.isArray(vector) && vector.length === VECTOR_SIZE && rowModelCompatible(model, currentModel)) {
    return { ...fields, vector, vectorModel: model }
  }
  return { ...fields, vectorModel: 'none' }
}

// Dipanggil saat app start: load semua data Dexie ke Orama
export async function hydrateFromDexie(onProgress?: (done: number, total: number) => void): Promise<void> {
  const { db } = await import('./db')
  const { generateStorableVector, getVectorModel } = await loadVectorPolicy()
  const currentModel = getVectorModel()

  // Jaminan indeks siap: App.jsx bisa jadi tidak memanggil initOramaIndices
  // (MINIMAL profile), jadi hydrate juga membuat indeks bila belum ada.
  await ensureIndices()

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
      const prepared = await asyncPool(REGEN_CONCURRENCY, turns as Array<Record<string, unknown>>, async (t: Record<string, unknown>) => {
        const fields = {
          pairId: String(t.pairId || ''),
          sessionId: Number(t.sessionId) || 1,
          sessionTitle: String(t.sessionTitle || 'Session'),
          userText: String(t.userText || ''),
          aiText: String(t.aiText || ''),
          combinedText: String(t.combinedText || ''),
          timestamp: toNumericTs(t.timestamp)
        }
        if (Array.isArray(t.vector) && (t.vector as number[]).length === VECTOR_SIZE) {
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

      const validTurns: Array<Record<string, unknown>> = []
      const turnUpdates: Array<{ key: unknown; changes: Record<string, unknown> }> = []
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
        await db.chatTurns.bulkUpdate(turnUpdates.slice(i, i + BATCH_UPDATE) as unknown as Parameters<typeof db.chatTurns.bulkUpdate>[0]).catch(console.error)
      }

      if (validTurns.length > 0) {
        for (let i = 0; i < validTurns.length; i += BATCH_INSERT) {
          await insertMultiple(turnPairIndex as Parameters<typeof insertMultiple>[0], validTurns.slice(i, i + BATCH_INSERT) as Parameters<typeof insertMultiple>[1])
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

  const archiveResults = await asyncPool(REGEN_CONCURRENCY, archives as Array<Record<string, unknown>>, async (a: Record<string, unknown>) => {
    const fields = {
      summary: a.summary,
      topic: a.topic || 'General',
      timestamp: a.timestamp || Date.now(),
      dexieId: a.id
    }
    if (needsMigration || !Array.isArray(a.vector) || (a.vector as number[]).length !== VECTOR_SIZE) {
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

  const validArchives: Array<Record<string, unknown>> = []
  const archiveUpdates: Array<{ key: unknown; changes: Record<string, unknown> }> = []
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
    await db.chatArchive.bulkUpdate(archiveUpdates.slice(i, i + BATCH_UPDATE) as unknown as Parameters<typeof db.chatArchive.bulkUpdate>[0]).catch(console.error)
  }

  if (validArchives.length > 0) {
    for (let i = 0; i < validArchives.length; i += BATCH_INSERT) {
      await insertMultiple(archiveIndex as Parameters<typeof insertMultiple>[0], validArchives.slice(i, i + BATCH_INSERT) as Parameters<typeof insertMultiple>[1])
    }
  }

  const docs = await db.documents.toArray()
  const docResults = await asyncPool(REGEN_CONCURRENCY, docs as Array<Record<string, unknown>>, async (d: Record<string, unknown>) => {
    const fields = {
      docName: d.docName,
      chunkIndex: d.chunkIndex,
      content: d.content,
      timestamp: d.timestamp || Date.now(),
      dexieId: d.id
    }
    if (needsMigration || !Array.isArray(d.vector) || (d.vector as number[]).length !== VECTOR_SIZE) {
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

  const validDocs: Array<Record<string, unknown>> = []
  const docUpdates: Array<{ key: unknown; changes: Record<string, unknown> }> = []
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
    await db.documents.bulkUpdate(docUpdates.slice(i, i + BATCH_UPDATE) as unknown as Parameters<typeof db.documents.bulkUpdate>[0]).catch(console.error)
  }

  if (validDocs.length > 0) {
    for (let i = 0; i < validDocs.length; i += BATCH_INSERT) {
      await insertMultiple(documentIndex as Parameters<typeof insertMultiple>[0], validDocs.slice(i, i + BATCH_INSERT) as Parameters<typeof insertMultiple>[1])
    }
  }

  const memories = await db.memory.toArray()
  const memoryResults = await asyncPool(REGEN_CONCURRENCY, memories as Array<Record<string, unknown>>, async (m: Record<string, unknown>) => {
    const fields = {
      type: m.type || 'notes',
      summary: m.summary || '',
      memory: m.memory || '',
      timestamp: Date.now(),
      dexieId: m.id
    }
    if (needsMigration || !Array.isArray(m.vector) || (m.vector as number[]).length !== VECTOR_SIZE) {
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

  const validMemories: Array<Record<string, unknown>> = []
  const memoryUpdates: Array<{ key: unknown; changes: Record<string, unknown> }> = []
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
    await db.memory.bulkUpdate(memoryUpdates.slice(i, i + BATCH_UPDATE) as unknown as Parameters<typeof db.memory.bulkUpdate>[0]).catch(console.error)
  }

  if (validMemories.length > 0) {
    for (let i = 0; i < validMemories.length; i += BATCH_INSERT) {
      await insertMultiple(memoryIndex as Parameters<typeof insertMultiple>[0], validMemories.slice(i, i + BATCH_INSERT) as Parameters<typeof insertMultiple>[1])
    }
  }

  if (needsMigration) {
    localStorage.setItem('migrated_vectors_v1', 'true')
    console.log('[Orama] Successfully migrated all old vectors to new model!')
  }

  console.log(
    `[Orama] Hydrated: ${validTurnsCount} turn pairs, ${validArchives.length} archives, ${validDocs.length} doc chunks, ${validMemories.length} memories`
  )
}

// Vector search di arsip obrolan
export async function searchArchives(queryVector: number[] | null, limit = 3): Promise<unknown[]> {
  const archiveIdx = await ensureArchiveIndex()
  if (!archiveIdx) return []
  try {
    const results = (await search(archiveIdx as Parameters<typeof search>[0], {
      mode: 'vector',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    } as Parameters<typeof search>[1])) as { hits: Array<{ document: Record<string, unknown> }> }
    // Buang baris lintas model (hash vs minilm) agar korpus campur tidak menghasut hasil palsu
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const hits = results.hits.filter((h) =>
      rowModelCompatible(h.document.vectorModel, currentModel)
    )
    return hits.map((hit) => hit.document)
  } catch (err) {
    console.error('[Orama] Error in searchArchives:', err)
    return []
  }
}

// Vector search di dokumen RAG
export async function searchDocuments(queryText: unknown, queryVector: number[] | null, limit = 5): Promise<unknown[]> {
  const docIdx = await ensureDocumentIndex()
  if (!docIdx) {
    console.log('[Orama] documentIndex is null!')
    return []
  }
  try {
    const results = (await search(docIdx as Parameters<typeof search>[0], {
      term: queryText as string,
      mode: 'hybrid',
      vector: { value: queryVector, property: 'vector' },
      similarity: 0.25,
      limit
    } as Parameters<typeof search>[1])) as { hits: Array<{ document: Record<string, unknown> }> }
    // Baris 'none' (fulltext saja) tetap boleh lewat lewat jalur term
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const hits = results.hits.filter((h) =>
      rowModelCompatible(h.document.vectorModel, currentModel)
    )
    return hits.map((hit) => hit.document)
  } catch (error) {
    console.error('[Orama] Error in searchDocuments:', error)
    return []
  }
}

// Insert baru (dipanggil setelah Dexie.add)
export async function insertArchiveToOrama(data: Record<string, unknown>) {
  const idx = await ensureArchiveIndex()
  if (!idx) return
  // Vector selalu hasil vectorLoader (MiniLM asli, tanpa fallback hash)
  await insert(idx, { ...data, vectorModel: data.vectorModel || LEGACY_VECTOR_MODEL })
}

export async function insertDocumentChunksToOrama(chunks: Array<Record<string, unknown>> = []) {
  const idx = await ensureDocumentIndex()
  if (!idx) return
  const { getVectorModel } = await loadVectorPolicy()
  const currentModel = getVectorModel()
  const tagged = (chunks || []).map((c) =>
    toIndexRow(
      {
        docName: c.docName,
        chunkIndex: c.chunkIndex,
        content: c.content,
        timestamp: c.timestamp,
        dexieId: c.dexieId
      },
      c.vector,
      c.vectorModel || LEGACY_VECTOR_MODEL,
      currentModel
    )
  )
  await insertMultiple(idx, tagged)
}

export async function deleteArchiveFromOrama(dexieId: unknown) {
  const idx = await ensureArchiveIndex()
  if (!idx || !dexieId) return
  try {
    const res = (await search(idx as Parameters<typeof search>[0], { where: { dexieId: Number(dexieId) } } as Parameters<typeof search>[1])) as { hits: Array<{ id: unknown; document: Record<string, unknown> }> }
    if (res.hits.length > 0) {
      for (const h of res.hits) {
        await remove(idx as Parameters<typeof remove>[0], h.id as Parameters<typeof remove>[1])
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteArchiveFromOrama:', err)
  }
}

export async function deleteDocumentFromOrama(docName: unknown) {
  const idx = await ensureDocumentIndex()
  if (!idx || !docName) return
  try {
    const res = (await search(idx as Parameters<typeof search>[0], { where: { docName: docName as string }, limit: 10000 } as Parameters<typeof search>[1])) as { hits: Array<{ id: unknown; document: Record<string, unknown> }> }
    if (res?.hits?.length > 0) {
      for (const h of res.hits) {
        if (h?.id) {
          try {
            await remove(idx as Parameters<typeof remove>[0], h.id as Parameters<typeof remove>[1])
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteDocumentFromOrama:', err)
  }
}

// ======================== TURN PAIR ORAMA INDEX ========================

export async function insertTurnPairToOrama(data: Record<string, unknown>) {
  const idx = await ensureTurnPairIndex()
  if (!idx) return
  try {
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    let vector = (Array.isArray(data.vector) && (data.vector as number[]).length === VECTOR_SIZE) ? (data.vector as number[]) : null
    // Vektor tanpa tag dianggap dibuat engine aktif saat ini (mis. vectorMemory.generateVector)
    let vectorModel = (data.vectorModel as string | undefined) || (vector ? currentModel : null)
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
    if (vector) (doc as Record<string, unknown>).vector = vector

    await insert(idx as Parameters<typeof insert>[0], doc as Parameters<typeof insert>[1])
  } catch (err) {
    console.error('[Orama] Error insertTurnPairToOrama:', err)
  }
}

export async function insertBatchTurnPairsToOrama(turns: Array<Record<string, unknown>>) {
  const idx = await ensureTurnPairIndex()
  if (!idx || !Array.isArray(turns) || turns.length === 0) return
  try {
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    const valid = []
    for (const t of turns) {
      let vector = (Array.isArray(t.vector) && (t.vector as number[]).length === VECTOR_SIZE) ? (t.vector as number[]) : null
      let vectorModel = (t.vectorModel as string | undefined) || (vector ? currentModel : null)
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
      if (vector) (doc as Record<string, unknown>).vector = vector
      valid.push(doc)
    }

    if (valid.length > 0) {
      await insertMultiple(idx as Parameters<typeof insertMultiple>[0], valid as Parameters<typeof insertMultiple>[1])
    }
  } catch (err) {
    console.error('[Orama] Error insertBatchTurnPairsToOrama:', err)
  }
}

export async function searchTurnPairsInOrama(
  queryText: unknown,
  queryVector: unknown,
  limit = 5,
  threshold = 0.5
): Promise<Array<Record<string, unknown>>> {
  const idx = await ensureTurnPairIndex()
  if (!idx || !queryVector) return []
  try {
    const results = (await search(idx as Parameters<typeof search>[0], {
      term: queryText as string,
      mode: 'hybrid',
      vector: { value: queryVector as number[], property: 'vector' },
      similarity: threshold,
      limit
    } as Parameters<typeof search>[1])) as { hits: Array<{ document: Record<string, unknown>; score: number }> }
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

export async function deleteTurnPairsBySessionFromOrama(sessionId: unknown) {
  const idx = await ensureTurnPairIndex()
  if (!idx || !sessionId) return
  try {
    const results = (await search(idx as Parameters<typeof search>[0], {
      where: { sessionId: Number(sessionId) }
    } as Parameters<typeof search>[1])) as { hits: Array<{ id: unknown; document: Record<string, unknown> }> }
    if (results?.hits?.length > 0) {
      for (const h of results.hits) {
        if (h?.id) {
          try {
            await remove(idx as Parameters<typeof remove>[0], h.id as Parameters<typeof remove>[1])
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteTurnPairsBySessionFromOrama:', err)
  }
}

// ======================== MEMORY ORAMA INDEX ========================

export async function searchMemoriesInOrama(
  queryText: unknown,
  queryVector: unknown,
  limit = 5,
  filterTypes: string[] | null = null,
  threshold = 0.5
): Promise<Array<Record<string, unknown>>> {
  const idx = await ensureMemoryIndex()
  if (!idx || !queryVector) return []
  try {
    const results = (await search(idx as Parameters<typeof search>[0], {
      term: queryText as string,
      mode: 'hybrid',
      vector: { value: queryVector as number[], property: 'vector' },
      similarity: threshold,
      limit: limit * 4
    } as Parameters<typeof search>[1])) as { hits: Array<{ document: Record<string, unknown>; score: number }> }
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()
    let hits = results.hits
      .filter((hit) => rowModelCompatible(hit.document.vectorModel, currentModel))
      .map((hit) => ({ ...hit.document, id: hit.document.dexieId, score: hit.score }))
    if (filterTypes) {
      const typesArr = Array.isArray(filterTypes) ? filterTypes : [filterTypes]
      hits = hits.filter((h: Record<string, unknown>) => typesArr.includes(h.type as string))
    }
    hits.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.score as number) - (a.score as number))
    return hits.slice(0, limit)
  } catch (err) {
    console.error('[Orama] Error in searchMemoriesInOrama:', err)
    return []
  }
}

export async function insertMemoryToOrama(data: Record<string, unknown>) {
  const idx = await ensureMemoryIndex()
  if (!idx || !Array.isArray(data.vector) || (data.vector as number[]).length !== VECTOR_SIZE) return
  try {
    await insert(idx, {
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

export async function updateMemoryInOrama(dexieId: unknown, data: Record<string, unknown>) {
  if (!(await ensureMemoryIndex())) return
  await deleteMemoryFromOrama(dexieId)
  await insertMemoryToOrama({ ...data, id: dexieId })
}

export async function deleteMemoryFromOrama(dexieId: unknown) {
  const idx = await ensureMemoryIndex()
  if (!idx || !dexieId) return
  try {
    const res = (await search(idx as Parameters<typeof search>[0], { where: { dexieId: Number(dexieId) } } as Parameters<typeof search>[1])) as { hits: Array<{ id: unknown; document: Record<string, unknown> }> }
    if (res.hits.length > 0) {
      for (const h of res.hits) {
        if (h.id === undefined || h.id === null) continue
        await remove(idx as Parameters<typeof remove>[0], String(h.id) as Parameters<typeof remove>[1])
      }
    }
  } catch (err) {
    console.error('[Orama] Error deleteMemoryFromOrama:', err)
  }
}

export async function findSimilarMemoryClusters(threshold = 0.6): Promise<Array<{ group: number; items: Array<{ id: number; type: string; memory: string; timestamp: number }> }>> {
  // SUMBER KEBENARAN = DEXIE, bukan indeks Orama.
  // Dulu groomer scan indeks Orama: saat boot (hydrate belum selesai) indeks
  // kosong -> "memoryIndex belum siap" + groomer salah lapor "ingatan sudah
  // bersih"; di MINIMAL profile indeks bahkan tidak pernah di-hydrate, jadi
  // duplikat TIDAK PERNAH ter groom. Vektor tersimpan di Dexie selalu tersinkron
  // lewat insertMemoryToOrama/updateMemoryInOrama (db.js), jadi cluster
  // detection di sini kini jalan identik di SEMUA profile & fase boot.
  try {
    const { db } = await import('./db')
    const { getVectorModel } = await loadVectorPolicy()
    const currentModel = getVectorModel()

    console.log('[Groomer] Scanning cluster memori dari Dexie (threshold):', threshold)
    const rows = (await db.memory.toArray()) as Array<Record<string, unknown>>
    const memories = rows
      .filter((m) => m && (m.type === 'profile' || m.type === 'preference'))
      .map((m: Record<string, unknown>) => ({
        id: Number(m.id),
        type: (m.type as string) || '',
        memory: String(m.memory || ''),
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        vector: Array.isArray(m.vector) && (m.vector as number[]).length === VECTOR_SIZE ? (m.vector as number[]) : null,
        vectorModel: (m.vectorModel as string | undefined) || null
      }))
      // Vektor harus se-model dengan mode aktif agar similarity valid.
      .filter((m) => m.vector && rowModelCompatible(m.vectorModel, currentModel))

    const visited = new Set<number>()
    const clusters: Array<{ group: number; items: Array<{ id: number; type: string; memory: string; timestamp: number }> }> = []
    let groupCount = 1

    for (let i = 0; i < memories.length; i++) {
      const anchor = memories[i]
      if (visited.has(anchor.id) || !anchor.vector) continue

      const group = [anchor]
      for (let j = i + 1; j < memories.length; j++) {
        const cand = memories[j]
        if (visited.has(cand.id) || !cand.vector) continue
        const sim = cosineSimilarity(anchor.vector, cand.vector)
        if (sim >= threshold) group.push(cand)
      }

      if (group.length >= 2) {
        group.forEach((g) => visited.add(g.id))
        clusters.push({
          group: groupCount++,
          items: group.map((g) => ({
            id: g.id,
            type: g.type,
            memory: g.memory,
            timestamp: g.timestamp
          }))
        })
      } else {
        visited.add(anchor.id)
      }
    }

    console.log(
      `[Groomer] Ditemukan ${clusters.length} cluster dari total ${memories.length} memori profile/preference (bervektor & se-model).`
    )
    return clusters
  } catch (err) {
    console.error('[Groomer] Error in findSimilarMemoryClusters:', err)
    return []
  }
}

// On-the-fly Orama Hybrid Vector Search for read-document
export async function searchDocumentWithOrama(rawText: unknown, searchQuery: unknown, limit = 5): Promise<Array<{ content: string; score: number }>> {
  try {
    const text = typeof rawText === 'string' ? rawText : ''
    const query = typeof searchQuery === 'string' ? searchQuery : ''
    if (!text || !query) return []

    // 1. Chunk text (500 chars with 50 overlap)
    const chunks: string[] = []
    let start = 0
    const chunkSize = 500
    const overlap = 50
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length)
      const chunkStr = text.slice(start, end).trim()
      if (chunkStr) chunks.push(chunkStr)
      start += chunkSize - overlap
    }

    if (chunks.length === 0) return []

    // 2. Pre-filter candidate chunks to avoid CPU freeze (Max 20 chunks)
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t: string) => t.length > 2)
    let candidateChunks = chunks
    if (chunks.length > 20) {
      if (terms.length > 0) {
        const scored = chunks.map((c: string) => {
          const lower = c.toLowerCase()
          let score = 0
          for (const term of terms) {
            if (lower.includes(term)) score += 1
          }
          return { chunk: c, score }
        })
        const matching = scored
          .filter((s: { score: number }) => s.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .map((s: { chunk: string }) => s.chunk)

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
    const tempDb = (await create({
      schema: {
        content: 'string',
        vector: `vector[${VECTOR_SIZE}]`
      }
    } as Parameters<typeof create>[0])) as OramaIndex

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
    const queryVec = await generateVector(query)
    if (!queryVec || queryVec.length !== VECTOR_SIZE) return []

    const searchRes = (await search(tempDb as Parameters<typeof search>[0], {
      term: query,
      mode: 'hybrid',
      vector: { value: queryVec, property: 'vector' },
      similarity: 0.15,
      limit: limit
    } as Parameters<typeof search>[1])) as { hits: Array<{ document: Record<string, unknown>; score: number }> }

    return searchRes.hits.map((h) => ({
      content: h.document.content as string,
      score: h.score
    }))
  } catch (err) {
    console.error('[Orama] Error in searchDocumentWithOrama:', err)
    return []
  }
}
