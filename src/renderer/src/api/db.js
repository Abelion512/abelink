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

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference'];

function getValidType(type) {
  const t = (type || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'preference';
}

// --- CREATE ---
export async function insertMemory(data) {
  const memoryText = data.memory.trim()
  const vector = await generateVector(memoryText)
  try {
    await db.memory.add({
      type: getValidType(data.type),
      key: data.key,
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
    const session = await db.sessions.get(1)
    return session ? session.data : []
  } catch (error) {
    console.error('Error getting main thread:', error)
    return []
  }
}

// --- UPDATE ---
export async function updateMemory(data) {
  try {
    const newMemoryText = data.memory.trim()
    const newVector = await generateVector(newMemoryText)
    
    let targetId = data.id;
    
    // Jika ID tidak ada, coba cari berdasarkan [type+key] atau [key]
    if (!targetId) {
      let existing = null;
      
      // Coba cari pakai oldKey jika ada
      if (data.oldKey) {
        if (data.type) {
          existing = await db.memory.where('[type+key]').equals([getValidType(data.type), data.oldKey.toLowerCase().trim()]).first();
        }
        if (!existing) {
          existing = await db.memory.where('key').equals(data.oldKey.toLowerCase().trim()).first();
        }
      }
      
      // Jika belum ketemu, coba cari pakai key baru
      if (!existing && data.key) {
        if (data.type) {
          existing = await db.memory.where('[type+key]').equals([getValidType(data.type), data.key.toLowerCase().trim()]).first();
        }
        if (!existing) {
          existing = await db.memory.where('key').equals(data.key.toLowerCase().trim()).first();
        }
      }

      if (existing) {
        targetId = existing.id;
      }
    }

    if (targetId) {
      await db.memory.update(targetId, {
        key: data.key.toLowerCase().trim(),
        memory: newMemoryText,
        vector: newVector
      })
      console.log(`✅ Memory ID ${targetId} berhasil di-update.`)
    } else {
      console.warn('⚠️ Gagal update: ID tidak ditemukan dan data fallback tidak cocok.')
    }
  } catch (error) {
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data) {
  try {
    // 1. Prioritas utama: Hapus pake ID yang dikasih Mark
    if (data.id) {
      await db.memory.delete(data.id)
      console.log(`🗑️ Memory ID ${data.id} berhasil dihapus oleh Mark.`)
      return { success: true }
    }

    // 2. Fallback: Cari pakai type+key atau key doang
    const keyToSearch = data.oldKey ? data.oldKey.toLowerCase().trim() : (data.key ? data.key.toLowerCase().trim() : null);
    
    if (keyToSearch) {
      let existing = null;
      if (data.type) {
        existing = await db.memory.where('[type+key]').equals([getValidType(data.type), keyToSearch]).first();
      }
      if (!existing) {
        existing = await db.memory.where('key').equals(keyToSearch).first();
      }

      if (existing) {
        await db.memory.delete(existing.id);
        console.log(`⚠️ Hapus via fallback: Memory ID ${existing.id} terhapus.`);
        return { success: true };
      }
    }

    console.warn('Mark mau hapus data tapi gak kasih ID atau Type/Key yang jelas.')
  } catch (error) {
    console.error('Error in deleteMemory logic:', error)
    throw error
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
