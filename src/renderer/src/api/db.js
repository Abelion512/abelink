import Dexie from 'dexie'
import { generateVector } from './vectorMemory'

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
// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'notes'];

function getValidType(type) {
  const t = (type || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'notes';
}

// --- CREATE ---
export async function insertMemory(data) {
  const memoryText = data.memory.trim()
  const type = getValidType(data.type)
  let vector = []
  
  if (type === 'notes') {
    vector = await generateVector(memoryText) || []
  }

  try {
    await db.memory.add({
      type: type,
      summary: data.summary || '',
      memory: memoryText,
      vector: vector
    })
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
      memory: newMemoryText
    }
    
    if (type === 'notes') {
      updatePayload.vector = await generateVector(newMemoryText) || []
    }

    if (data.id) {
      await db.memory.update(data.id, updatePayload)
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
