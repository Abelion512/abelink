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

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'skill', 'project', 'transaction', 'goal', 'relationship', 'fact', 'other'];

function getValidType(type) {
  const t = (type || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'other';
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
    if (!targetId && data.type && data.oldKey) {
       // Support Mark's "oldKey" format if provided
       const existing = await db.memory
        .where('[type+key]')
        .equals([getValidType(data.type), data.oldKey.toLowerCase().trim()])
        .first();
      if (existing) {
        targetId = existing.id;
      }
    } else if (!targetId && data.type && data.key) {
      // Fallback normal
      const existing = await db.memory
        .where('[type+key]')
        .equals([getValidType(data.type), data.key.toLowerCase().trim()])
        .first();
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

    // 2. Fallback: Kalau Mark nggak kasih ID (tapi ini harusnya jarang)
    // Kita hapus berdasarkan type dan key
    if (data.type && (data.oldKey || data.key)) {
      const keyToDelete = data.oldKey ? data.oldKey : data.key;
      const deletedCount = await db.memory
        .where('[type+key]')
        .equals([getValidType(data.type), keyToDelete.toLowerCase()])
        .delete()

      console.log(`⚠️ Hapus via fallback: ${deletedCount} data terhapus.`)
      return { success: true }
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
