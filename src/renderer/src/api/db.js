import Dexie from 'dexie'
<<<<<<< HEAD
import { generateVector } from './vectorLoader'
=======
import { generateVector } from './vectorMemory'
>>>>>>> cd/friendly-visvesvaraya-3a533a
import { insertMemoryToOrama, updateMemoryInOrama, deleteMemoryFromOrama } from './oramaStore'

export const db = new Dexie('mark-db')

db.version(1).stores({
  // Index gabungan hanya [type+key] agar data lain (summary, confidence) bisa diubah
  memory: '++id, [type+key], type, key, summary, memory, confidence',
  sessions: '++id, title, data, timestamp',
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch'
})

db.version(2).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel'
})

db.version(3).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider'
})

db.version(4).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel'
})

db.version(5).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel'
})

db.version(6).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins'
})

db.version(7).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel'
})

db.version(8).stores({
  chatArchive: '++id, summary, timestamp, topic',
  documents: '++id, docName, chunkIndex, content, timestamp'
})

db.version(9).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled'
})

db.version(10).upgrade(async tx => {
  // Reset all vectors to force re-indexing with the new multilingual MiniLM model
  return tx.memory.toCollection().modify(mem => {
    mem.vector = [];
  });
})

db.version(11).upgrade(async tx => {
  // Reset vectors for chatArchive and documents as well because of the model change
  await tx.chatArchive.toCollection().modify(arc => {
    arc.vector = [];
  });
  await tx.documents.toCollection().modify(doc => {
    doc.vector = [];
  });
})

db.version(12).upgrade(async tx => {
  // BUMP VERSION 12: Memastikan benar-benar terhapus (jika v11 ke-skip)
  await tx.chatArchive.toCollection().modify(arc => {
    arc.vector = [];
  });
  await tx.documents.toCollection().modify(doc => {
    doc.vector = [];
  });
})

db.version(13).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled'
})

db.version(14).stores({
  relationships: 'userId, warmth, sarcasm_level, trust, energy, lastEvaluation, evalCount'
})

db.version(15).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, lastfmApiKey'
})

db.version(16).stores({
  // Task persistence (episodic memory) — based on LangGraph Checkpointer + interrupt pattern
  autonomousTasks: '++id, taskId, status, type, priority, createdAt, updatedAt',
  // Task execution history (long-term episodic) — based on CrewAI long-term memory
  taskHistory: '++id, taskId, status, type, completedAt, durationMs',
  // Audit trail — based on Claude Code auto memory + LangGraph durable execution
  auditLog: '++id, type, taskId, timestamp',
  // Priming/recency tracking — based on CrewAI recency scoring + AutoGen Mem0Memory
  primingLog: '++id, type, itemId, accessedAt, score'
})

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'notes', 'learn'];

function getValidType(type) {
  const t = (type || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'notes';
}

// --- CREATE ---
export async function insertMemory(data) {
  const memoryText = data.memory.trim()
  const type = getValidType(data.type)
  const vector = (await generateVector(memoryText)) || []

  try {
    const id = await db.memory.add({
      type: type,
      summary: data.summary || '',
      memory: memoryText,
      vector: vector
    })
    insertMemoryToOrama({ id, type, summary: data.summary || '', memory: memoryText, vector }).catch(console.error)
  } catch (error) {
    console.error('Error Save Memory:', error)
  }
}

export async function saveMainThread(data) {
  try {
    await db.sessions.put({ id: 1, title: 'Main Thread', data: data, timestamp: Date.now() })
  } catch (error) {
    console.error('Error saving main thread:', error)
  }
}

export async function getMainThread() {
  try {
    const thread = await db.sessions.get(1)
    return thread ? thread.data : []
  } catch (error) {
    console.error('Error fetching main thread:', error)
    return []
  }
}

// --- UPDATE ---
export async function updateMemory(data) {
  try {
    const newMemoryText = data.memory.trim()
    const type = getValidType(data.type)
    
    let updatePayload = {
      type: type,
      summary: data.summary || '',
      memory: newMemoryText,
      vector: (await generateVector(newMemoryText)) || []
    }

    if (data.id) {
      await db.memory.update(data.id, updatePayload)
      updateMemoryInOrama(data.id, { ...updatePayload, id: data.id }).catch(console.error)
      console.log(`✅ Memory ID ${data.id} berhasil di-update.`)
    } else {
      console.warn('⚠️ Gagal update: ID tidak ditemukan.')
    }
  } catch (error) {
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data) {
  try {
    if (data.id) {
      await db.memory.delete(data.id)
      deleteMemoryFromOrama(data.id).catch(console.error)
      console.log(`🗑️ Memory ID ${data.id} berhasil dihapus oleh Mark.`)
      return { success: true }
    }
    
    console.warn('⚠️ Gagal menghapus memory: ID tidak ditemukan dalam perintah delete.')
    return { success: false, error: 'ID is required for deletion' }
  } catch (error) {
    console.error('Error in deleteMemory logic:', error)
    return { success: false, error: error.message }
  }
}

export async function getAllMemory() {
  try {
    const data = await db.memory.toArray()
    return data || []
  } catch (error) {
    console.error('Error in getAllMemory logic:', error)
    return []
  }
}

export async function getAllConfig() {
  try {
    const data = await db.config.toArray()
    return data || []
  } catch (error) {
    console.error('Error in getAllConfig logic:', error)
    return []
  }
}

export async function saveConfiguration(data) {
  try {
    await db.config.put({ ...data, id: 1 })
    if (window.api && window.api.syncConfig) {
      window.api.syncConfig(data)
    }
    window.dispatchEvent(new CustomEvent('config-updated', { detail: data }))
    console.log('Configuration saved:', data)
  } catch (error) {
    console.error('Error in saveConfiguration logic:', error)
  }
}

export async function getAllSessionTitle() {
  try {
    const data = await db.sessions.toArray()
    console.log(data)
    return data || []
  } catch (error) {
    console.error('Error in getAllSessionTitle logic:', error)
    return []
  }
}
export async function getChatData(id) {
  try {
    const session = await db.sessions.where('id').equals(id).toArray()
    console.log(session[0].data)
    return session[0].data
  } catch (error) {
    console.error('Error in getChatData logic:', error)
    return []
  }
}

// --- CHAT ARCHIVE CRUD ---
export async function insertChatArchive(data) {
  try {
    return await db.chatArchive.add(data)
  } catch (error) {
    console.error('Error in insertChatArchive:', error)
    throw error
  }
}

export async function getAllChatArchives() {
  try {
    return await db.chatArchive.toArray()
  } catch (error) {
    console.error('Error in getAllChatArchives:', error)
    return []
  }
}

export async function deleteChatArchive(id) {
  try {
    await db.chatArchive.delete(id)
  } catch (error) {
    console.error('Error in deleteChatArchive:', error)
    throw error
  }
}

// --- DOCUMENTS CRUD ---
export async function bulkInsertDocuments(chunks) {
  try {
    return await db.documents.bulkAdd(chunks, { allKeys: true })
  } catch (error) {
    console.error('Error in bulkInsertDocuments:', error)
    throw error
  }
}

export async function getAllDocuments() {
  try {
    return await db.documents.toArray()
  } catch (error) {
    console.error('Error in getAllDocuments:', error)
    return []
  }
}

export async function deleteDocumentByName(docName) {
  try {
    const chunks = await db.documents.where('docName').equals(docName).toArray()
    const ids = chunks.map(c => c.id)
    await db.documents.bulkDelete(ids)
    return ids
  } catch (error) {
    console.error('Error in deleteDocumentByName:', error)
    throw error
  }
}

// --- CORE MEMORY ---
export async function getCoreMemory() {
  try {
    const profiles = await db.memory.where('type').equals('profile').toArray()
    if (profiles && profiles.length > 0) {
      return profiles.map(p => `- ${p.summary || p.memory}`).join('\n')
    }
  } catch (error) {
    console.error('Error in getCoreMemory:', error)
  }
  return 'Tidak ada profil user.'
}

// --- RELATIONSHIPS ---
const DEFAULT_TRAITS = {
  warmth: 0.5,
  sarcasm_level: 0.5,
  trust: 0.5,
  energy: 0.5,
  evalCount: 0,
  lastChatIndex: 0,
  reasoning: 'Baseline netral — belum ada evaluasi.'
}

export async function getRelationship(userId = 'owner') {
  try {
    const data = await db.relationships.get(userId)
    if (!data) {
      // Return default traits untuk user baru
      return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
    }
    return data
  } catch (error) {
    console.error('[DB] Error getRelationship:', error)
    return { userId, ...DEFAULT_TRAITS, lastEvaluation: null }
  }
}

export async function saveRelationship(data) {
  try {
    await db.relationships.put(data)
    console.log(`[DB] Relationship saved for ${data.userId}:`, data)
  } catch (error) {
    console.error('[DB] Error saveRelationship:', error)
  }
}

// --- TASK PERSISTENCE (v16) ---
// Based on: LangGraph Checkpointer + interrupt/resume pattern
// Source: https://docs.langchain.com/oss/python/langgraph/interrupts

export async function insertAutonomousTask(data) {
  try {
    return await db.autonomousTasks.add(data)
  } catch (error) {
    console.error('[DB] Error insertAutonomousTask:', error)
    throw error
  }
}

export async function updateAutonomousTask(taskId, updates) {
  try {
    const task = await db.autonomousTasks.where('taskId').equals(taskId).first()
    if (task) {
      await db.autonomousTasks.update(task.id, { ...updates, updatedAt: Date.now() })
      return true
    }
    return false
  } catch (error) {
    console.error('[DB] Error updateAutonomousTask:', error)
    return false
  }
}

export async function getAutonomousTask(taskId) {
  try {
    return await db.autonomousTasks.where('taskId').equals(taskId).first()
  } catch (error) {
    console.error('[DB] Error getAutonomousTask:', error)
    return null
  }
}

export async function getAllAutonomousTasks() {
  try {
    return await db.autonomousTasks.orderBy('createdAt').reverse().toArray()
  } catch (error) {
    console.error('[DB] Error getAllAutonomousTasks:', error)
    return []
  }
}

export async function getPendingAutonomousTasks() {
  try {
    return await db.autonomousTasks.where('status').anyOf('pending', 'running').toArray()
  } catch (error) {
    console.error('[DB] Error getPendingAutonomousTasks:', error)
    return []
  }
}

export async function deleteAutonomousTask(id) {
  try {
    await db.autonomousTasks.delete(id)
  } catch (error) {
    console.error('[DB] Error deleteAutonomousTask:', error)
  }
}

// --- TASK HISTORY (v16) — episodic memory ---
// Based on: CrewAI long-term memory (persistent patterns, importance scoring)
// Source: https://docs.crewai.com/concepts/memory

export async function insertTaskHistory(data) {
  try {
    return await db.taskHistory.add(data)
  } catch (error) {
    console.error('[DB] Error insertTaskHistory:', error)
  }
}

export async function getRecentTaskHistory(limit = 20) {
  try {
    return await db.taskHistory.orderBy('completedAt').reverse().limit(limit).toArray()
  } catch (error) {
    console.error('[DB] Error getRecentTaskHistory:', error)
    return []
  }
}

export async function getTaskStats() {
  try {
    const all = await db.taskHistory.toArray()
    const total = all.length
    const succeeded = all.filter(t => t.status === 'completed').length
    const failed = all.filter(t => t.status === 'failed' || t.status === 'hardstop').length
    const avgDuration = total > 0 ? all.reduce((s, t) => s + (t.durationMs || 0), 0) / total : 0
    const avgTurns = total > 0 ? all.reduce((s, t) => s + (t.turns || 0), 0) / total : 0
    return { total, succeeded, failed, successRate: total > 0 ? (succeeded / total) * 100 : 0, avgDuration, avgTurns }
  } catch (error) {
    console.error('[DB] Error getTaskStats:', error)
    return { total: 0, succeeded: 0, failed: 0, successRate: 0, avgDuration: 0, avgTurns: 0 }
  }
}

// --- AUDIT LOG (v16) ---
// Based on: Claude Code auto memory (stores learnings and patterns per session)
// + LangGraph durable execution (durable state persistence)
// Source: https://code.claude.com/docs/en/memory

export async function insertAuditLog(data) {
  try {
    return await db.auditLog.add({
      ...data,
      timestamp: data.timestamp || Date.now()
    })
  } catch (error) {
    console.error('[DB] Error insertAuditLog:', error)
  }
}

export async function getAuditLogs(limit = 50, filterType = null) {
  try {
    let collection = db.auditLog.orderBy('timestamp').reverse()
    if (filterType) {
      return await collection.filter(l => l.type === filterType).limit(limit).toArray()
    }
    return await collection.limit(limit).toArray()
  } catch (error) {
    console.error('[DB] Error getAuditLogs:', error)
    return []
  }
}

export async function clearAuditLogs() {
  try {
    await db.auditLog.clear()
  } catch (error) {
    console.error('[DB] Error clearAuditLogs:', error)
  }
}

// --- PRIMING LOG (v16) — recent access tracking ---
// Based on: CrewAI recency scoring (recency_weight, recency_half_life_days)
// + AutoGen Mem0Memory (retrieval based on recent activity)
// Source: https://docs.crewai.com/concepts/memory

export async function logAccess(type, itemId, score = 1.0) {
  try {
    await db.primingLog.add({ type, itemId, accessedAt: Date.now(), score })
    // Auto-cleanup: keep only last 100 entries
    const count = await db.primingLog.count()
    if (count > 100) {
      const oldest = await db.primingLog.orderBy('accessedAt').limit(count - 100).toArray()
      const ids = oldest.map(e => e.id)
      await db.primingLog.bulkDelete(ids)
    }
  } catch (error) {
    console.error('[DB] Error logAccess:', error)
  }
}

export async function getRecentAccesses(type = null, limit = 10) {
  try {
    let collection = db.primingLog.orderBy('accessedAt').reverse()
    if (type) {
      return await collection.filter(l => l.type === type).limit(limit).toArray()
    }
    return await collection.limit(limit).toArray()
  } catch (error) {
    console.error('[DB] Error getRecentAccesses:', error)
    return []
  }
}

// ========== ENCRYPTION (AES-256-GCM + PBKDF2) ==========

async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

export async function encryptBackup(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  }
}

export async function decryptBackup(encrypted, password) {
  const salt = Uint8Array.from(atob(encrypted.salt), c => c.charCodeAt(0))
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0))
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

// ========== FULL MARK EXPORT / IMPORT ==========

export async function exportFullMark(password = null) {
  const [sessions, memory, configs, chatArchive, documents, relationships, tasks, taskHistory, auditLogs, primingLogs] =
    await Promise.all([
      db.sessions.toArray(),
      db.memory.toArray(),
      db.config.toArray(),
      db.chatArchive.toArray(),
      db.documents.toArray(),
      db.relationships.toArray(),
      db.autonomousTasks.toArray(),
      db.taskHistory.toArray(),
      db.auditLog.toArray(),
      db.primingLog.toArray()
    ])

  // Config: hapus API keys sensitive
  const safeConfig = configs.map(c => {
    const safe = { ...c }
    delete safe.groqApiKey
    delete safe.cerebrasApiKey
    delete safe.customApiKey
    return safe
  })

  const payload = JSON.stringify({
    version: 1,
    type: 'mark-full',
    exportedAt: Date.now(),
    stores: {
      sessions, memory, config: safeConfig, chatArchive, documents,
      relationships, tasks, taskHistory, auditLogs, primingLogs
    }
  })

  if (password) {
    const encrypted = await encryptBackup(payload, password)
    return JSON.stringify({
      version: 1,
      type: 'mark-full-encrypted',
      exportedAt: Date.now(),
      encrypted
    })
  }

  return payload
}

export async function importFullMark(jsonText, password = null) {
  let data

  if (password) {
    // Decrypt dulu
    const wrapper = JSON.parse(jsonText)
    if (wrapper.type !== 'mark-full-encrypted' || !wrapper.encrypted) {
      throw new Error('Format backup terenkripsi tidak valid')
    }
    const plaintext = await decryptBackup(wrapper.encrypted, password)
    data = JSON.parse(plaintext)
  } else {
    data = JSON.parse(jsonText)
  }

  if (data.type !== 'mark-full') {
    throw new Error('Bukan file backup MARK yang valid')
  }

  const { stores } = data

  // Clear + restore semua store
  await Promise.all([
    db.sessions.clear(),
    db.chatArchive.clear(),
    db.relationships.clear(),
    db.autonomousTasks.clear(),
    db.taskHistory.clear(),
    db.auditLog.clear(),
    db.primingLog.clear()
    // memory & documents di-clear manual karena mungkin besar
  ])

  // Re-insert
  if (stores.sessions?.length) await db.sessions.bulkAdd(stores.sessions)
  if (stores.chatArchive?.length) await db.chatArchive.bulkAdd(stores.chatArchive)
  if (stores.memory?.length) await db.memory.bulkAdd(stores.memory)
  if (stores.documents?.length) await db.documents.bulkAdd(stores.documents)
  if (stores.relationships?.length) await db.relationships.bulkAdd(stores.relationships)
  if (stores.tasks?.length) await db.autonomousTasks.bulkAdd(stores.tasks)
  if (stores.taskHistory?.length) await db.taskHistory.bulkAdd(stores.taskHistory)
  if (stores.auditLogs?.length) await db.auditLog.bulkAdd(stores.auditLogs)
  if (stores.primingLogs?.length) await db.primingLog.bulkAdd(stores.primingLogs)

  // Restore config (jaga id=1)
  if (stores.config?.length) {
    await db.config.clear()
    for (const cfg of stores.config) {
      await db.config.put({ ...cfg, id: 1 })
    }
  }

  return { totalStores: Object.keys(stores).length }
}

// ========== CHAT-ONLY EXPORT / IMPORT ==========

export async function exportChat() {
  const session = await db.sessions.get(1)
  return JSON.stringify({
    version: 1,
    type: 'chat',
    exportedAt: Date.now(),
    data: session ? session.data : []
  })
}

export async function importChat(jsonText) {
  const data = JSON.parse(jsonText)
  if (data.type !== 'chat') throw new Error('Bukan file chat MARK yang valid')
  if (!Array.isArray(data.data)) throw new Error('Format chat tidak valid')
  await db.sessions.put({ id: 1, title: 'Main Thread', data: data.data, timestamp: Date.now() })
  return { count: data.data.length }
}

export async function getPrimedItemIds(type, limit = 5) {
  try {
    // Return most frequently accessed items (priming effect)
    const logs = await db.primingLog.where('type').equals(type).toArray()
    const grouped = {}
    logs.forEach(l => {
      grouped[l.itemId] = (grouped[l.itemId] || 0) + l.score
    })
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([itemId]) => itemId)
  } catch (error) {
    console.error('[DB] Error getPrimedItemIds:', error)
    return []
  }
}
