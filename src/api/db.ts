import Dexie from 'dexie'
import type { Table } from 'dexie'
import { generateVector, cosineSimilarity } from './vectorLoader'
import { DEFAULT_STT_MODEL, PLACEHOLDER_STT_MODELS } from './sttGuard.js'
import { LEGACY_HOSTS } from './ai/providerRegistry.js'

// W2-2 (js-to-ts-spec.md): rename + tipe baris Dexie per store (schema v30
// BEKU — upgrade path tidak disentuh). Tipe konsumen dipertahankan longgar
// (banyak field opsional) sesuai realitas baris lama di disk.

/** Baris store memory. */
export interface MemoryRow {
  id?: number
  type: string
  summary: string
  memory: string
  vector?: number[]
  [key: string]: unknown
}
/** Baris store sessions (riwayat chat per sesi). */
export interface SessionRow {
  id?: number
  title?: string
  data: unknown[]
  timestamp: number
  workspaceRoot?: string
  [key: string]: unknown
}
/** Sambungan STT (v25+). */
export interface SttConnection {
  id: string
  name: string
  endpoint: string
  apiKey: string
  model: string
  enabled: boolean
}
/** Baris store config (id:1 tunggal). */
export interface ConfigRow {
  id?: number
  personality?: string
  model?: string
  temperature?: number
  context?: unknown
  ttsRate?: number
  ttsPitch?: number
  aiProvider?: string
  groqApiKey?: string
  groqModel?: string
  embedProvider?: string
  lmStudioEmbedModel?: string
  customEndpoint?: string
  customApiKey?: string
  customModel?: string
  customApiProtocol?: string
  tgBotToken?: string
  tgAdminIds?: string
  awarenessEnabled?: boolean
  cameraDeviceId?: string
  cameraEnabled?: boolean
  geminiWebModel?: string
  windowOpacity?: number
  localWhisperModel?: string
  lastSeenWhatsNewVersion?: string | null
  alwaysAllowedPaths?: string[]
  sttProvider?: string
  customSttEndpoint?: string
  customSttApiKey?: string
  customSttModel?: string
  sttEnableCombo?: boolean
  sttFallbackEndpoint?: string
  sttFallbackApiKey?: string
  sttFallbackModel?: string
  sttStrategy?: string
  sttLanguage?: string
  sttConnections?: SttConnection[]
  [key: string]: unknown
}
/** Baris store chatArchive. */
export interface ChatArchiveRow {
  id?: number
  summary?: string
  timestamp?: number
  topic?: string
  [key: string]: unknown
}
/** Baris store documents (RAG chunk). */
export interface DocumentRow {
  id?: number
  docName?: string
  chunkIndex?: number
  content?: string
  timestamp?: number
  vector?: number[]
  [key: string]: unknown
}
/** Baris store relationships. */
export interface RelationshipRow {
  userId: string
  warmth: number
  sarcasm_level: number
  trust: number
  energy: number
  obedience: number
  evalCount: number
  lastEvaluation: string | null
  lastChatIndex?: number
  reasoning?: string
  [key: string]: unknown
}
/** Baris store learnedSkills. */
export interface LearnedSkillRow {
  id: string
  name: string
  description: string
  content: string
  createdAt: number
  updatedAt: number
  use_count?: number
  last_used_at?: number | null
  state?: 'active' | 'trial' | 'archived'
  evidenceVerified?: boolean
  [key: string]: unknown
}
/** Baris store chatTurns (turn-pair vector memory). */
export interface ChatTurnRow {
  pairId: string
  sessionId: number
  timestamp?: number
  vector?: number[]
  vectorModel?: 'minilm' | 'hash' | 'none'
  [key: string]: unknown
}
/** Baris store sessionCompacts (pointer ringkasan compactor). */
export interface SessionCompactRow {
  sessionId: string
  [key: string]: unknown
}
/** Baris store appConfig (key-value flag). */
export interface AppConfigRow {
  key: string
  value: string
}
/** Baris store agentTasks. */
export interface AgentTaskRow {
  id: string
  status: string
  mode?: string
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}
/** Baris store agentTaskSteps. */
export interface AgentTaskStepRow {
  id: string
  taskId: string
  index: number
  status: string
  updatedAt?: number
  [key: string]: unknown
}
/** Baris store subagents. */
export interface SubagentRow {
  id: string
  status: string
  parentSessionId?: string
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}
/** Baris store subagent_messages. */
export interface SubagentMessageRow {
  id?: number
  subagentId: string
  sender: string
  timestamp?: number
  [key: string]: unknown
}

/** Database Dexie ter-tipe (schema v30). */
export interface AbelinkDB extends Dexie {
  memory: Table<MemoryRow, number>
  sessions: Table<SessionRow, number>
  config: Table<ConfigRow, number>
  chatArchive: Table<ChatArchiveRow, number>
  documents: Table<DocumentRow, number>
  relationships: Table<RelationshipRow, string>
  agentTasks: Table<AgentTaskRow, string>
  agentTaskSteps: Table<AgentTaskStepRow, string>
  subagents: Table<SubagentRow, string>
  subagent_messages: Table<SubagentMessageRow, number>
  learnedSkills: Table<LearnedSkillRow, string>
  chatTurns: Table<ChatTurnRow, string>
  sessionCompacts: Table<SessionCompactRow, string>
  appConfig: Table<AppConfigRow, string>
}

// Endpoint chat legacy provider groq (pra-registry) — dipakai migrasi v30.
const LEGACY_GROQ_CHAT_ENDPOINT = LEGACY_HOSTS['api.groq.com']

// Akses TERBATAS ke bridge native untuk sinkronisasi config. Sengaja TIDAK
// bergantung pada augmentasi Window dari tauri-bridge.ts: program node-zone
// (typecheck:node) memuat berkas ini via import test tanpa memuat bridge,
// jadi deklarasi global itu tidak tersedia di sana. db.ts hanya butuh satu
// method — deklarasikan struktural di sini (runtime identik).
type BridgeLike = { api?: { syncConfig?: (config: ConfigRow) => void } }
const bridgeWindow = (): BridgeLike => window as unknown as BridgeLike

// Lazy (bukan impor statis) agar tidak ada siklus modul db<->oramaStore:
// oramaStore sudah lazy-import db untuk hydrate; sisi ini simetris.
const syncMemoryToOrama = (fn: string, ...args: unknown[]) =>
  import('./oramaStore').then((m) => (m as Record<string, (...a: unknown[]) => void>)[fn](...args)).catch(console.error)

if (typeof indexedDB !== 'undefined' && (!Dexie.dependencies?.indexedDB || !Dexie.dependencies?.IDBKeyRange)) {
  Dexie.dependencies.indexedDB = indexedDB
  if (typeof IDBKeyRange !== 'undefined') Dexie.dependencies.IDBKeyRange = IDBKeyRange
}

export const db = new Dexie('abelink-db') as AbelinkDB

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

db.version(10).upgrade(async (tx) => {
  // Reset all vectors to force re-indexing with the new multilingual MiniLM model
  return (tx as unknown as AbelinkDB).memory.toCollection().modify((mem) => {
    mem.vector = [];
  });
})

db.version(11).upgrade(async (tx) => {
  // Reset vectors for chatArchive and documents as well because of the model change
  await (tx as unknown as AbelinkDB).chatArchive.toCollection().modify((arc) => {
    arc.vector = [];
  });
  await (tx as unknown as AbelinkDB).documents.toCollection().modify((doc) => {
    doc.vector = [];
  });
})

db.version(12).upgrade(async (tx) => {
  // BUMP VERSION 12: Memastikan benar-benar terhapus (jika v11 ke-skip)
  await (tx as unknown as AbelinkDB).chatArchive.toCollection().modify((arc) => {
    arc.vector = [];
  });
  await (tx as unknown as AbelinkDB).documents.toCollection().modify((doc) => {
    doc.vector = [];
  });
})

db.version(13).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled'
})

db.version(14).stores({
  relationships: 'userId, warmth, sarcasm_level, trust, energy, obedience, lastEvaluation, evalCount'
})

db.version(15).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, waAdminNumber, waPendingAdmins, waApprovedAdmins, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel'
})

db.version(16).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel'
}).upgrade(async (tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    config.tgBotToken = config.tgBotToken || ''
    config.tgAdminIds = config.tgAdminIds || ''
    delete config.waAdminNumber
    delete config.waPendingAdmins
    delete config.waApprovedAdmins
  })
})

db.version(17).stores({
  agentTasks: 'id, status, mode, updatedAt, createdAt',
  agentTaskSteps: 'id, taskId, [taskId+index], status, updatedAt'
})

db.version(18).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity'
}).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    config.windowOpacity = config.windowOpacity ?? 1
  })
})

db.version(19).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, localWhisperModel'
}).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    config.localWhisperModel = config.localWhisperModel ?? 'whisper-small'
  })
})

db.version(20).stores({
  subagents: 'id, status, parentSessionId, createdAt, updatedAt',
  subagent_messages: '++id, subagentId, sender, timestamp'
})

db.version(21).stores({
  learnedSkills: 'id, name, createdAt, updatedAt'
})

db.version(22).stores({
  chatTurns: 'pairId, sessionId, timestamp'
})

db.version(23).stores({
  appConfig: 'key'
})

db.version(24).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, localWhisperModel, sttProvider, customSttEndpoint, customSttApiKey, customSttModel, sttEnableCombo, sttFallbackEndpoint, sttFallbackApiKey, sttFallbackModel'
}).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    config.sttProvider = 'custom'
    config.customSttEndpoint = config.customSttEndpoint || (config.groqApiKey ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'http://127.0.0.1:20128/v1/audio/transcriptions')
    config.customSttApiKey = config.customSttApiKey ?? ''
    config.customSttModel = config.customSttModel || DEFAULT_STT_MODEL
    config.sttEnableCombo = config.sttEnableCombo ?? false
    config.sttFallbackEndpoint = config.sttFallbackEndpoint || (config.groqApiKey ? 'https://api.groq.com/openai/v1/audio/transcriptions' : '')
    config.sttFallbackApiKey = config.sttFallbackApiKey || config.groqApiKey || ''
    config.sttFallbackModel = config.sttFallbackModel || 'whisper-large-v3-turbo'
  })
})

db.version(25).stores({
  config: 'id, personality, model, temperature, context, ttsRate, ttsPitch, aiProvider, groqApiKey, groqModel, embedProvider, lmStudioEmbedModel, cerebrasApiKey, cerebrasModel, tgBotToken, tgAdminIds, customEndpoint, customApiKey, customModel, awarenessEnabled, cameraDeviceId, cameraEnabled, geminiWebModel, windowOpacity, localWhisperModel, sttProvider, customSttEndpoint, customSttApiKey, customSttModel, sttEnableCombo, sttFallbackEndpoint, sttFallbackApiKey, sttFallbackModel, sttStrategy, sttLanguage'
}).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    config.sttProvider = config.sttProvider || 'custom'
    config.sttStrategy = config.sttStrategy || 'fallback'
    config.sttLanguage = config.sttLanguage || 'id'
    if (!Array.isArray(config.sttConnections) || config.sttConnections.length === 0) {
      const connections = []
      if (config.customSttEndpoint) {
        connections.push({
          id: 'conn-primary',
          name: config.customSttEndpoint.includes('groq') ? 'Groq Whisper' : 'Primary Gateway',
          endpoint: config.customSttEndpoint,
          apiKey: config.customSttApiKey || '',
          model: config.customSttModel || DEFAULT_STT_MODEL,
          enabled: true
        })
      }
      if (config.sttFallbackEndpoint && config.sttFallbackEndpoint !== config.customSttEndpoint) {
        connections.push({
          id: 'conn-fallback',
          name: 'Fallback Gateway',
          endpoint: config.sttFallbackEndpoint,
          apiKey: config.sttFallbackApiKey || '',
          model: config.sttFallbackModel || 'whisper-large-v3-turbo',
          enabled: true
        })
      }
      if (connections.length === 0) {
        connections.push({
          id: 'conn-default-1',
          name: 'Local Gateway (127.0.0.1:20128)',
          endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
          apiKey: '',
          model: DEFAULT_STT_MODEL,
          enabled: true
        })
      }
      config.sttConnections = connections
    }
  })
})

// v26: STT dikunci ke gateway lokal (9router) sebagai primary; Groq hanya cadangan.
db.version(26).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    const LOCAL_STT = 'http://127.0.0.1:20128/v1/audio/transcriptions'
    const GROQ_STT = 'https://api.groq.com/openai/v1/audio/transcriptions'
    const primaryIsGroq = (config.customSttEndpoint || '').includes('groq')
    if (primaryIsGroq) {
      config.customSttEndpoint = LOCAL_STT
      config.customSttApiKey = ''
      config.customSttModel = DEFAULT_STT_MODEL
      if (!config.sttFallbackEndpoint || config.sttFallbackEndpoint === config.customSttEndpoint) {
        config.sttFallbackEndpoint = GROQ_STT
        config.sttFallbackApiKey = config.sttFallbackApiKey || config.groqApiKey || ''
        config.sttFallbackModel = config.sttFallbackModel || 'whisper-large-v3-turbo'
      }
      // Bangun ulang koneksi auto (jangan sentuh koneksi custom manual user).
      const ids = (config.sttConnections || []).map((c) => c?.id)
      const autoIds = ['conn-primary', 'conn-fallback', 'conn-bootstrap-1', 'conn-bootstrap-2', 'conn-default-1']
      if (ids.length === 0 || ids.every((id) => autoIds.includes(id))) {
        config.sttConnections = [
          { id: 'conn-primary', name: 'Local Gateway (127.0.0.1:20128)', endpoint: LOCAL_STT, apiKey: '', model: DEFAULT_STT_MODEL, enabled: true },
          { id: 'conn-fallback', name: 'Groq Whisper (cadangan)', endpoint: GROQ_STT, apiKey: config.sttFallbackApiKey || config.groqApiKey || '', model: 'whisper-large-v3-turbo', enabled: true }
        ]
      }
    } else {
      if (config.customSttEndpoint === undefined) config.customSttEndpoint = LOCAL_STT
      if (config.sttFallbackEndpoint === undefined) {
        config.sttFallbackEndpoint = config.groqApiKey ? GROQ_STT : ''
      }
    }
  })
})

// v27: store sessionCompacts untuk Session Compactor (ATM upstream
// contextManager): pointer ringkasan per sesi, bukan isi riwayat.
db.version(27).stores({
  sessionCompacts: 'sessionId'
})

// v28: rewrite placeholder STT yang tak ada di server -> default 9router namespaced.
// Hanya nilai persis placeholder; pilihan manual user tak tersentuh.
db.version(28).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    const isPlaceholder = (m: string | undefined) => PLACEHOLDER_STT_MODELS.includes((m || '').trim())
    if (isPlaceholder(config.customSttModel)) config.customSttModel = DEFAULT_STT_MODEL
    if (Array.isArray(config.sttConnections)) {
      for (const c of config.sttConnections) {
        if (c && isPlaceholder(c.model)) c.model = DEFAULT_STT_MODEL
      }
    }
  })
})

// v29: telemetri reuse learnedSkills (RSI terukur ala Hermes skill_usage):
// use_count / last_used_at / state (active|trial|archived). Upgrade
// non-destruktif: field baru default (0/null/'active') agar skill lama hidup.
db.version(29).stores({
  learnedSkills: 'id, name, createdAt, updatedAt, state'
}).upgrade((tx) => {
  return tx.table<LearnedSkillRow>('learnedSkills').toCollection().modify((skill) => {
    if (typeof skill.use_count !== 'number') skill.use_count = 0
    if (!skill.last_used_at) skill.last_used_at = null
    if (typeof skill.state !== 'string') skill.state = 'active'
  })
})

// v30: provider registry era — provider hardcoded vendor (groq) dilebur ke
// jalur custom generik (data-driven, providerRegistry.js). Kredensial & model
// lama dibawa utuh (custom* menang bila sudah ada); field vendor lama
// DIPERTAHANKAN agar downgrade aman & jejak historis tidak hilang. Idempoten:
// customEndpoint yang sudah menunjuk legacy endpoint tak diubah dua kali.
db.version(30).upgrade((tx) => {
  return tx.table<ConfigRow>('config').toCollection().modify((config) => {
    if (config.aiProvider === 'groq') {
      config.aiProvider = 'custom'
      if (!config.customEndpoint) {
        config.customEndpoint = LEGACY_GROQ_CHAT_ENDPOINT
      }
      if (!config.customApiKey) config.customApiKey = config.groqApiKey || ''
      if (!config.customModel) config.customModel = config.groqModel || ''
      if (!config.customApiProtocol || config.customApiProtocol === 'auto') {
        config.customApiProtocol = 'openai'
      }
    }
    // 'cerebras' tidak pernah jadi cabang chat runtime — tapi bersihkan
    // residual field agar UI tak lagi menampilkannya.
    delete config.cerebrasApiKey
    delete config.cerebrasModel
  })
})

// --- APP CONFIG (feature flags, hardware profile, etc.) ---
export async function getAppConfig(key: string, fallback: unknown = null) {
  try {
    const row = await db.appConfig.get(key)
    if (row === undefined) return fallback
    // Parse JSON jika value terlihat seperti object/array, else return string
    const v = row.value
    if (v === 'true') return true
    if (v === 'false') return false
    try { return JSON.parse(v) } catch { return v }
  } catch { return fallback }
}

export async function setAppConfig(key: string, value: unknown) {
  await db.appConfig.put({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })
}

// --- VALIDATION ---
const VALID_TYPES = ['profile', 'preference', 'notes', 'learn'];

function getValidType(type: unknown) {
  const t = (String(type) || '').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'notes';
}

// --- CREATE ---
// Write-gate dedup: near-duplikat (>= threshold) tidak ditulis ulang.
// Satu pintu untuk SEMUA caller (plan loop, music, relational, YT context) —
// dulu cek hanya di plan loop via Orama sehingga 3 penulis lain lolos.
// ponytail: threshold tinggi sengaja (hanya near-duplikat); mirip-tapi-beda
// tetap ditulis dan diurus groomer berkala (threshold 0.60).
export const MEMORY_WRITE_DEDUP_SIMILARITY = 0.85

export async function insertMemory(data: { id?: number; memory: string; type: string; summary?: string }) {
  const memoryText = data.memory.trim()
  const type = getValidType(data.type)
  const vector = (await generateVector(memoryText)) || []

  try {
    if (vector.length > 0 && (type === 'profile' || type === 'preference')) {
      const existing = await db.memory.where('type').equals(type).toArray()
      for (const row of existing) {
        if (!Array.isArray(row.vector) || row.vector.length !== vector.length) continue
        if (cosineSimilarity(vector, row.vector) >= MEMORY_WRITE_DEDUP_SIMILARITY) {
          return row.id
        }
      }
    }
    const id = await db.memory.add({
      type: type,
      summary: data.summary || '',
      memory: memoryText,
      vector: vector
    })
    syncMemoryToOrama('insertMemoryToOrama', { id, type, summary: data.summary || '', memory: memoryText, vector })
  } catch (error) {
    console.error('Error Save Memory:', error)
  }
}

export async function saveMainThread(data: unknown[] | null | undefined) {
  try {
    // Strip base64 image_url -> placeholder agar IndexedDB tidak bloat
    // (screenshot 1080p ~1-2MB × N turn). Gambar hidup di memori sesi saja.
    const slim = Array.isArray(data)
      ? data.map((m: unknown) => {
          if (!m || typeof m !== 'object') return m
          const c = (m as { content?: unknown }).content
          if (typeof c === 'string' && c.startsWith('data:image/')) {
            return { ...m, content: '[Gambar: dilampirkan saat sesi, tidak dipersist]' }
          }
          if (Array.isArray(c)) {
            const slimC = c.map((p) =>
              p && typeof p === 'object' && typeof p.image_url?.url === 'string' && p.image_url.url.startsWith('data:')
                ? { ...p, image_url: { url: '[Gambar: tidak dipersist]' } }
                : p
            )
            return { ...m, content: slimC }
          }
          return m
        })
      : data
    await db.sessions.put({ id: 1, title: 'Main Thread', data: slim ?? [], timestamp: Date.now() })
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
export async function updateMemory(
  data: { id?: number; memory?: string; type?: string; summary?: string } | number | null,
  maybeMemory?: unknown,
  maybeType?: unknown
) {
  try {
    let id, memoryText, typeStr, summaryStr
    if (typeof data === 'object' && data !== null) {
      id = data.id
      memoryText = data.memory || ''
      typeStr = data.type
      summaryStr = data.summary || ''
    } else {
      id = Number(data)
      memoryText = String(maybeMemory || '')
      typeStr = maybeType || 'profile'
      summaryStr = ''
    }

    const newMemoryText = memoryText.trim()
    const type = getValidType(typeStr)
    
    const updatePayload = {
      type: type,
      summary: summaryStr,
      memory: newMemoryText,
      vector: (await generateVector(newMemoryText)) || []
    }

    if (id && !isNaN(id)) {
      await db.memory.update(id, updatePayload)
      syncMemoryToOrama('updateMemoryInOrama', id, { ...updatePayload, id: id })
      console.log(`✅ Memory ID ${id} berhasil di-update.`)
    } else {
      console.warn('⚠️ Gagal update: ID tidak ditemukan.')
    }
  } catch (error) {
    console.error('Error in updateMemory logic:', error)
  }
}

// --- DELETE ---
export async function deleteMemory(data: number | { id?: number } | null | undefined) {
  try {
    const id = typeof data === 'object' && data !== null ? data.id : Number(data)
    if (id && !isNaN(id)) {
      await db.memory.delete(id)
      syncMemoryToOrama('deleteMemoryFromOrama', id)
      console.log(`🗑️ Memory ID ${id} berhasil dihapus oleh Abelink.`)
      return { success: true }
    }
    
    console.warn('⚠️ Gagal menghapus memory: ID tidak ditemukan dalam perintah delete.')
    return { success: false, error: 'ID is required for deletion' }
  } catch (error) {
    console.error('Error in deleteMemory logic:', error)
    return { success: false, error: (error as Error).message }
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

// Ambil satu memori berdasarkan ID (dipakai memory groomer sebelum merge)
export async function getMemory(id: unknown) {
  try {
    const numId = Number(id)
    if (!numId || isNaN(numId)) return null
    return (await db.memory.get(numId)) || null
  } catch (error) {
    console.error('Error in getMemory logic:', error)
    return null
  }
}

export async function getAllConfig() {
  try {
    const data = await db.config.toArray()
    if (data && data.length > 0) {
      if (!data[0].geminiWebModel) {
        data[0].geminiWebModel = 'gemini-latest'
      }
      if (!data[0].aiProvider) {
        data[0].aiProvider = 'gemini-web'
      }
      if (data[0].windowOpacity === undefined) {
        data[0].windowOpacity = 1
      }
      // P10 Linux patch: WhatNew boot trigger masih baca field ini
      if (data[0].lastSeenWhatsNewVersion === undefined) {
        data[0].lastSeenWhatsNewVersion = null
      }
      if (!data[0].localWhisperModel) {
        data[0].localWhisperModel = 'whisper-small'
      }
      if (!data[0].sttProvider) {
        data[0].sttProvider = 'custom'
      }
      if (!data[0].sttStrategy) {
        data[0].sttStrategy = 'fallback'
      }
      if (!data[0].sttLanguage) {
        data[0].sttLanguage = 'id'
      }
      if (data[0].customSttEndpoint === undefined) {
        // Primary dikunci ke gateway lokal; Groq hanya cadangan (lihat migrasi v26).
        data[0].customSttEndpoint = 'http://127.0.0.1:20128/v1/audio/transcriptions'
      }
      if (data[0].customSttApiKey === undefined) {
        data[0].customSttApiKey = ''
      }
      if (data[0].customSttModel === undefined) {
        data[0].customSttModel = DEFAULT_STT_MODEL
      }
      if (data[0].sttEnableCombo === undefined) {
        data[0].sttEnableCombo = false
      }
      if (data[0].sttFallbackEndpoint === undefined) {
        data[0].sttFallbackEndpoint = data[0].groqApiKey ? 'https://api.groq.com/openai/v1/audio/transcriptions' : ''
      }
      if (data[0].sttFallbackApiKey === undefined) {
        data[0].sttFallbackApiKey = data[0].groqApiKey || ''
      }
      if (data[0].sttFallbackModel === undefined) {
        data[0].sttFallbackModel = 'whisper-large-v3-turbo'
      }
      if (!Array.isArray(data[0].sttConnections) || data[0].sttConnections.length === 0) {
        const connections = []
        if (data[0].customSttEndpoint) {
          connections.push({
            id: 'conn-primary',
            name: data[0].customSttEndpoint.includes('groq') ? 'Groq Whisper Cloud' : 'Primary Gateway',
            endpoint: data[0].customSttEndpoint,
            apiKey: data[0].customSttApiKey || '',
            model: data[0].customSttModel || DEFAULT_STT_MODEL,
            enabled: true
          })
        }
        if (data[0].sttFallbackEndpoint && data[0].sttFallbackEndpoint !== data[0].customSttEndpoint) {
          connections.push({
            id: 'conn-fallback',
            name: 'Fallback Gateway',
            endpoint: data[0].sttFallbackEndpoint,
            apiKey: data[0].sttFallbackApiKey || '',
            model: data[0].sttFallbackModel || 'whisper-large-v3-turbo',
            enabled: true
          })
        }
        if (connections.length === 0) {
          connections.push({
            id: 'conn-default-1',
            name: 'Local Gateway (127.0.0.1:20128)',
            endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
            apiKey: '',
            model: DEFAULT_STT_MODEL,
            enabled: true
          })
        }
        data[0].sttConnections = connections
      }
    }
    return data || []
  } catch (error) {
    console.error('Error in getAllConfig logic:', error)
    return []
  }
}

export async function saveConfiguration(data: ConfigRow) {
  try {
    await db.config.put({ ...data, id: 1 })
    const nativeApi = bridgeWindow().api
    if (nativeApi?.syncConfig) {
      nativeApi.syncConfig(data)
    }
    window.dispatchEvent(new CustomEvent('config-updated', { detail: data }))
    // Jangan pernah print payload utuh — berisi API key & tgBotToken.
    // debug level: autosave debounce menulis puluhan kali per sesi Configuration
    // dan menenggelamkan log yang berguna.
    console.debug('Configuration saved:', Object.keys(data).length, 'keys')
  } catch (error) {
    console.error('Error in saveConfiguration logic:', error)
  }
}

export async function getAlwaysAllowedPaths() {
  try {
    const configs = await db.config.toArray()
    if (configs && configs.length > 0 && Array.isArray(configs[0].alwaysAllowedPaths)) {
      return configs[0].alwaysAllowedPaths
    }
    return []
  } catch (error) {
    console.error('Error in getAlwaysAllowedPaths logic:', error)
    return []
  }
}

export async function addAlwaysAllowedPath(pathToAdd: string) {
  try {
    if (!pathToAdd) return []
    const configs = await db.config.toArray()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths)
      ? currentConfig.alwaysAllowedPaths
      : []

    if (!currentList.includes(pathToAdd)) {
      const updatedList = [...currentList, pathToAdd]
      const newConfig = { ...currentConfig, id: 1, alwaysAllowedPaths: updatedList }
      await db.config.put(newConfig)
      const nativeApi = bridgeWindow().api
      if (nativeApi?.syncConfig) {
        nativeApi.syncConfig(newConfig)
      }
      window.dispatchEvent(new CustomEvent('config-updated', { detail: newConfig }))
      return updatedList
    }
    return currentList
  } catch (error) {
    console.error('Error in addAlwaysAllowedPath logic:', error)
    return []
  }
}

export async function removeAlwaysAllowedPath(pathToRemove: string) {
  try {
    const configs = await db.config.toArray()
    const currentConfig = (configs && configs[0]) || { id: 1 }
    const currentList = Array.isArray(currentConfig.alwaysAllowedPaths)
      ? currentConfig.alwaysAllowedPaths
      : []

    const updatedList = currentList.filter((p) => p !== pathToRemove)
    const newConfig = { ...currentConfig, id: 1, alwaysAllowedPaths: updatedList }
    await db.config.put(newConfig)
    const nativeApi = bridgeWindow().api
    if (nativeApi?.syncConfig) {
      nativeApi.syncConfig(newConfig)
    }
    window.dispatchEvent(new CustomEvent('config-updated', { detail: newConfig }))
    return updatedList
  } catch (error) {
    console.error('Error in removeAlwaysAllowedPath logic:', error)
    return []
  }
}

export async function getAllSessionTitle() {
  try {
    const data = await db.sessions.toArray()
    data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return data || []
  } catch (error) {
    console.error('Error in getAllSessionTitle logic:', error)
    return []
  }
}

export async function getAllSessions() {
  try {
    const sessions = await db.sessions.toArray()
    if (!sessions || sessions.length === 0) {
      const defaultSession = { id: 1, title: 'Main Thread', data: [], timestamp: Date.now() }
      await db.sessions.put(defaultSession)
      return [defaultSession]
    }
    // Pastikan session id: 1 ada
    const hasMain = sessions.some((s) => s.id === 1)
    if (!hasMain) {
      await db.sessions.put({ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() })
      sessions.unshift({ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() })
    }
    sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return sessions
  } catch (error) {
    console.error('Error in getAllSessions:', error)
    return [{ id: 1, title: 'Main Thread', data: [], timestamp: Date.now() }]
  }
}

export async function getChatData(id: number | string) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    const session = await db.sessions.get(numId)
    return session?.data || []
  } catch (error) {
    console.error('Error in getChatData logic:', error)
    return []
  }
}

export async function getSession(id: number | string) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    return await db.sessions.get(numId)
  } catch (error) {
    console.error('Error in getSession:', error)
    return null
  }
}

export async function createSession(title: string = 'Percakapan Baru', initialData: unknown[] = []) {
  try {
    const timestamp = Date.now()
    const id = await db.sessions.add({
      title: title.trim() || 'Percakapan Baru',
      data: initialData,
      timestamp
    })
    return { id, title, data: initialData, timestamp }
  } catch (error) {
    console.error('Error in createSession:', error)
    throw error
  }
}

export async function saveSession(
  id: number | string,
  data: unknown[],
  title: string | null = null,
  workspaceRoot: string | null = null
) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    const existing = await db.sessions.get(numId)
    const updatePayload: SessionRow = {
      id: numId,
      data: data,
      timestamp: Date.now()
    }
    if (title) {
      updatePayload.title = title
    } else if (existing?.title) {
      updatePayload.title = existing.title
    } else {
      updatePayload.title = numId === 1 ? 'Main Thread' : 'Percakapan Baru'
    }
    if (workspaceRoot !== null && workspaceRoot !== undefined) {
      updatePayload.workspaceRoot = workspaceRoot
    } else if (existing?.workspaceRoot) {
      updatePayload.workspaceRoot = existing.workspaceRoot
    }
    await db.sessions.put(updatePayload)
    return true
  } catch (error) {
    console.error('Error in saveSession:', error)
    return false
  }
}

export async function setSessionWorkspace(id: number | string, workspaceRoot: string | null | undefined) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    const existing = await db.sessions.get(numId)
    if (existing) {
      existing.workspaceRoot = workspaceRoot ?? undefined
      existing.timestamp = Date.now()
      await db.sessions.put(existing)
      return true
    } else {
      await db.sessions.put({
        id: numId,
        title: numId === 1 ? 'Main Thread' : 'Percakapan Baru',
        data: [],
        workspaceRoot: workspaceRoot ?? undefined,
        timestamp: Date.now()
      })
      return true
    }
  } catch (e) {
    console.error('Error in setSessionWorkspace:', e)
    return false
  }
}

export async function deleteSession(id: number | string) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    if (numId === 1) {
      // Main Thread tidak boleh dihapus barisnya, hanya dikosongkan pesannya
      const existing = await db.sessions.get(1)
      await db.sessions.put({ id: 1, title: existing?.title || 'Main Thread', data: [], timestamp: Date.now() })
      await db.chatTurns.where('sessionId').equals(1).delete()
      // Ringkasan kompaksi hanya valid untuk riwayat yang melahirkannya. Main
      // Thread memakai ID yang sama setelah di-clear, jadi row lama wajib ikut
      // dibuang agar ringkasan percakapan sebelumnya tidak bocor ke chat baru.
      await db.sessionCompacts.delete('1')
      try {
        const { deleteTurnPairsBySessionFromOrama } = await import('./oramaStore')
        await deleteTurnPairsBySessionFromOrama(1)
      } catch (_) {}
      return true
    }
    await db.sessions.delete(numId)
    await db.chatTurns.where('sessionId').equals(Number(numId)).delete()
    await db.sessionCompacts.delete(String(numId))
    try {
      const { deleteTurnPairsBySessionFromOrama } = await import('./oramaStore')
      await deleteTurnPairsBySessionFromOrama(numId)
    } catch (_) {}
    return true
  } catch (error) {
    console.error('Error in deleteSession:', error)
    return false
  }
}

export async function renameSession(id: number | string, newTitle: string) {
  try {
    const numId = (typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id) as number
    const existing = await db.sessions.get(numId)
    if (existing) {
      existing.title = newTitle.trim() || existing.title
      existing.timestamp = Date.now()
      await db.sessions.put(existing)
      return true
    }
    return false
  } catch (error) {
    console.error('Error in renameSession:', error)
    return false
  }
}

// --- CHAT ARCHIVE CRUD ---
export async function insertChatArchive(data: ChatArchiveRow) {
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

export async function deleteChatArchive(id: number) {
  try {
    await db.chatArchive.delete(id)
  } catch (error) {
    console.error('Error in deleteChatArchive:', error)
    throw error
  }
}

// --- DOCUMENTS CRUD ---
export async function bulkInsertDocuments(chunks: DocumentRow[]) {
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

// Meta ringan untuk visualizer (tanpa content — konten penuh dimuat on-select).
export async function getAllDocumentsMeta() {
  try {
    const rows = await db.documents.toArray()
    return (rows || []).map((d) => ({
      id: d.id,
      docName: d.docName,
      chunkIndex: d.chunkIndex,
      timestamp: d.timestamp
    }))
  } catch (error) {
    console.error('Error in getAllDocumentsMeta:', error)
    return []
  }
}

export async function getDocumentChunk(id: unknown) {
  try {
    const numId = Number(id)
    if (!numId || isNaN(numId)) return null
    return (await db.documents.get(numId)) || null
  } catch (error) {
    console.error('Error in getDocumentChunk:', error)
    return null
  }
}

export async function deleteDocumentByName(docName: string) {
  try {
    const chunks = await db.documents.where('docName').equals(docName).toArray()
    const ids = chunks.map((c) => c.id as number)
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
  obedience: 0.5,
  evalCount: 0,
  lastChatIndex: 0,
  reasoning: 'Baseline netral — belum ada evaluasi.'
}

export async function getRelationship(userId: string = 'owner') {
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

export async function saveRelationship(data: RelationshipRow) {
  try {
    await db.relationships.put(data)
    console.log(`[DB] Relationship saved for ${data.userId}:`, data)
  } catch (error) {
    console.error('[DB] Error saveRelationship:', error)
  }
}

// --- LEARNED SKILLS (METASYSTEM SELF-IMPROVEMENT) ---
export async function saveLearnedSkill({
  name,
  description,
  content,
  state,
  evidenceVerified = false
}: {
  name?: string
  description?: string
  content?: string
  state?: 'active' | 'trial' | 'archived'
  evidenceVerified?: boolean
}) {
  try {
    const cleanName = (name || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
    if (!cleanName || !content) return null

    // Cek apakah skill dengan nama ini sudah ada (update) atau baru (create)
    const existing = await db.learnedSkills.where('name').equalsIgnoreCase(cleanName).first()
    const id = existing?.id || `learned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    
    const skillData = {
      id,
      name: cleanName,
      description: description || 'Prosedur teknis teruji buatan Abelink',
      content: content.trim(),
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      // Telemetri reuse (RSI): counter pakai-ulang + status lifecycle.
      use_count: existing?.use_count ?? 0,
      last_used_at: existing?.last_used_at ?? null,
      // R1b: skill baru lahir sebagai 'trial' bila diminta; update
      // mempertahankan state lama kecuali dioverride eksplisit.
      state: state ?? existing?.state ?? 'active',
      // General Agentic Runtime: structural mini-eval is not evidence.
      // Promotion may use evalPassed only when the originating trajectory
      // had independent completion verification.
      evidenceVerified: Boolean(evidenceVerified || existing?.evidenceVerified)
    }

    await db.learnedSkills.put(skillData)
    console.log(`[DB] Learned skill saved: /${cleanName}`, skillData)
    return skillData
  } catch (err) {
    console.error('[DB] Error saveLearnedSkill:', err)
    return null
  }
}

export async function getLearnedSkill(name?: string) {
  try {
    if (!name) return null
    const cleanName = name.toLowerCase().trim()
    return await db.learnedSkills.where('name').equalsIgnoreCase(cleanName).first()
  } catch (err) {
    console.error('[DB] Error getLearnedSkill:', err)
    return null
  }
}

export async function getAllLearnedSkills() {
  try {
    return await db.learnedSkills.orderBy('createdAt').reverse().toArray()
  } catch (err) {
    console.error('[DB] Error getAllLearnedSkills:', err)
    return []
  }
}

export async function deleteLearnedSkill(idOrName: string) {
  try {
    if (!idOrName) return false
    const existing = (await db.learnedSkills.get(idOrName)) || (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())
    if (existing) {
      await db.learnedSkills.delete(existing.id)
      return true
    }
    return false
  } catch (err) {
    console.error('[DB] Error deleteLearnedSkill:', err)
    return false
  }
}

// --- RSI reuse telemetry (ala Hermes skill_usage.bump_use) ---
// Dipanggil tiap read-skill Dexie sukses: use_count+1 + last_used_at.
// Mengembalikan record terbaru, atau null bila skill tak ada / gagal.
export async function bumpLearnedSkillUse(idOrName: string) {
  try {
    if (!idOrName) return null
    const existing = (await db.learnedSkills.get(idOrName)) || (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())
    if (!existing) return null
    const updated = {
      ...existing,
      use_count: (typeof existing.use_count === 'number' ? existing.use_count : 0) + 1,
      last_used_at: Date.now()
    }
    await db.learnedSkills.put(updated)
    return updated
  } catch (err) {
    console.error('[DB] Error bumpLearnedSkillUse:', err)
    return null
  }
}

// R1b: gate empiris skill trial (ala DGM/AlphaEvolve).
// Trial lulus -> 'active' bila reuse_count > 0 ATAU evalPassed true
// AND originating evidence was independently verified.
// Trial kedaluwarsa (> trialDays hari tanpa reuse) -> 'archived'.
// Mengembalikan state akhir ('active' | 'trial' | 'archived') atau null.
export async function graduateTrialSkill(
  idOrName: string,
  { evalPassed = false, trialDays = 7, now = Date.now() }: { evalPassed?: boolean; trialDays?: number; now?: number } = {}
) {
  try {
    if (!idOrName) return null
    const existing = (await db.learnedSkills.get(idOrName)) || (await db.learnedSkills.where('name').equalsIgnoreCase(idOrName).first())
    if (!existing || existing.state !== 'trial') return existing?.state ?? null
    const uses = typeof existing.use_count === 'number' ? existing.use_count : 0
    if (uses > 0 || (evalPassed === true && existing.evidenceVerified === true)) {
      await db.learnedSkills.put({ ...existing, state: 'active', updatedAt: now })
      return 'active'
    }
    const age = now - (existing.createdAt || now)
    if (age > Math.max(1, Number(trialDays) || 7) * 24 * 3600 * 1000) {
      await db.learnedSkills.put({ ...existing, state: 'archived', updatedAt: now })
      return 'archived'
    }
    return 'trial'
  } catch (err) {
    console.error('[DB] Error graduateTrialSkill:', err)
    return null
  }
}

// Arsip deterministik (ala Hermes curator prune): skill active/trial yang
// tidak dipakai > `inactiveDays` hari (default 30) -> state 'archived'.
// Tidak menghapus (recoverable). Mengembalikan jumlah yang diarsipkan.
export async function archiveStaleLearnedSkills(inactiveDays: number = 30, now: number = Date.now()) {
  try {
    const cutoff = now - Math.max(1, Number(inactiveDays) || 30) * 24 * 3600 * 1000
    const all = await db.learnedSkills.toArray()
    let archived = 0
    for (const s of all) {
      if (s?.state === 'archived') continue
      const lastActive = s?.last_used_at || s?.updatedAt || s?.createdAt || 0
      if (lastActive < cutoff) {
        await db.learnedSkills.put({ ...s, state: 'archived', updatedAt: now })
        archived += 1
      }
    }
    return archived
  } catch (err) {
    console.error('[DB] Error archiveStaleLearnedSkills:', err)
    return 0
  }
}

// ==========================================================================
// CHAT TURNS (TURN-PAIR VECTOR MEMORY)
// ==========================================================================

// Vektor hasil generateVector() saat Lite Mode adalah hash embedding dan TIDAK BOLEH
// masuk Dexie/Orama — korpus pencarian vektor bisa rusak permanen. Fungsi ini
// menstrip vektor hash sebelum disimpan dan menandai provenansi model tiap baris:
//   vectorModel: 'minilm' | 'hash' (dilarang tersimpan) | 'none' (fulltext saja)
async function sanitizeTurnForStorage(turn: unknown): Promise<unknown> {
  if (!turn || typeof turn !== 'object') return turn
  try {
    const { getVectorModel } = await import('./vectorMemory')
    const safe = { ...(turn as ChatTurnRow) }
    if (!Array.isArray(safe.vector) || safe.vector.length === 0) {
      delete safe.vector
      safe.vectorModel = safe.vectorModel || 'none'
      return safe
    }
    // Vektor tanpa tag dianggap dibuat oleh engine yang aktif saat ini
    const model = safe.vectorModel || getVectorModel()
    if (model === 'hash') {
      delete safe.vector
      safe.vectorModel = 'none'
    } else {
      safe.vectorModel = model
    }
    return safe
  } catch {
    return turn
  }
}

export async function saveChatTurn(turnData: ChatTurnRow | null | undefined) {
  try {
    if (!turnData || !turnData.pairId) return null
    const safeTurn = (await sanitizeTurnForStorage(turnData)) as ChatTurnRow
    await db.chatTurns.put(safeTurn)
    return safeTurn
  } catch (err) {
    console.error('[DB] Error saveChatTurn:', err)
    return null
  }
}

export async function saveBatchChatTurns(turnsArray: unknown) {
  try {
    if (!Array.isArray(turnsArray) || turnsArray.length === 0) return 0
    const safeTurns: ChatTurnRow[] = []
    for (const t of turnsArray) {
      safeTurns.push((await sanitizeTurnForStorage(t)) as ChatTurnRow)
    }
    await db.chatTurns.bulkPut(safeTurns)
    return safeTurns.length
  } catch (err) {
    console.error('[DB] Error saveBatchChatTurns:', err)
    return 0
  }
}

export async function getAllChatTurns() {
  try {
    return await db.chatTurns.toArray()
  } catch (err) {
    console.error('[DB] Error getAllChatTurns:', err)
    return []
  }
}

export async function getChatTurnsBySession(sessionId: unknown) {
  try {
    if (!sessionId) return []
    return await db.chatTurns.where('sessionId').equals(Number(sessionId)).toArray()
  } catch (err) {
    console.error('[DB] Error getChatTurnsBySession:', err)
    return []
  }
}

export async function deleteChatTurnsBySession(sessionId: unknown) {
  try {
    if (!sessionId) return 0
    return await db.chatTurns.where('sessionId').equals(Number(sessionId)).delete()
  } catch (err) {
    console.error('[DB] Error deleteChatTurnsBySession:', err)
    return 0
  }
}

export async function getChatTurnCount() {
  try {
    return await db.chatTurns.count()
  } catch (err) {
    console.error('[DB] Error getChatTurnCount:', err)
    return 0
  }
}

// --- SESSION COMPACTS (pointer ringkasan Session Compactor) ---
export async function getSessionCompact(sessionId: unknown) {
  try {
    return (await db.sessionCompacts.get(String(sessionId))) || null
  } catch (err) {
    console.error('[DB] Error getSessionCompact:', err)
    return null
  }
}

export async function saveSessionCompact(sessionId: unknown, data: Record<string, unknown> = {}) {
  try {
    await db.sessionCompacts.put({ sessionId: String(sessionId), ...data })
    return true
  } catch (err) {
    console.error('[DB] Error saveSessionCompact:', err)
    return false
  }
}

export async function clearSessionCompact(sessionId: unknown) {
  try {
    await db.sessionCompacts.delete(String(sessionId))
    return true
  } catch (err) {
    console.error('[DB] Error clearSessionCompact:', err)
    return false
  }
}
