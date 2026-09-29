// src/api/ai/memoryTool.ts
// Single `memory` tool spec + validator + execution engine (Hermes pattern (c)).
// Wiring: core-tools, toolCatalog, knowledgeTools, and subagentExecutor.

import { getAllMemory, insertMemory, updateMemory, deleteMemory } from '../db.js'

interface MemoryRowLike {
  id?: number
  memory?: string | null
  type?: string
  summary?: string
}

interface MemoryOpLike {
  action?: string
  target?: string
  old_text?: string
  new_text?: string
  summary?: string
  operations?: unknown[]
}

interface MemoryDbProvider {
  getAllMemory: typeof getAllMemory
  insertMemory: typeof insertMemory
  updateMemory: typeof updateMemory
  deleteMemory: typeof deleteMemory
}

export const MEMORY_TOOL_SPEC = {
  name: 'memory',
  description: 'Catat, ganti, atau hapus memori profil/preferensi. Batch atomic: semua operasi dalam satu panggilan berhasil atau tidak ada yang diterapkan.',
  actions: ['add', 'replace', 'remove', 'batch'],
  perTurnFailureCap: 3,
  terminalSuccess: true,
}

const ACTIONS = new Set(MEMORY_TOOL_SPEC.actions)
const TARGETS = new Set(['memory', 'user'])

function nonEmptyString(v: unknown) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Validates a memory op. Returns { ok, errors[] }.
 * op: { action, target, old_text?, new_text?, operations? }
 */
export function validateMemoryOp(op: unknown) {
  const errors: string[] = []
  const o = (op ?? {}) as MemoryOpLike
  if (!op || typeof op !== 'object') return { ok: false, errors: ['op harus objek'] }
  if (!ACTIONS.has(o.action as string)) errors.push(`action tidak dikenal: ${o.action}`)
  if (!TARGETS.has(o.target as string)) errors.push(`target tidak dikenal: ${o.target}`)
  if (errors.length > 0) return { ok: false, errors }

  if (o.action === 'add') {
    if (!nonEmptyString(o.new_text)) errors.push('add butuh new_text non-kosong')
  } else if (o.action === 'replace') {
    if (!nonEmptyString(o.old_text)) errors.push('replace butuh old_text non-kosong')
    if (!nonEmptyString(o.new_text)) errors.push('replace butuh new_text non-kosong')
  } else if (o.action === 'remove') {
    if (!nonEmptyString(o.old_text)) errors.push('remove butuh old_text non-kosong')
  } else if (o.action === 'batch') {
    if (!Array.isArray(o.operations) || o.operations.length === 0) {
      errors.push('batch butuh operations array non-kosong')
    } else {
      o.operations.forEach((sub: unknown, i: number) => {
        const r = validateMemoryOp(sub)
        if (!r.ok) errors.push(`operations[${i}]: ${r.errors.join('; ')}`)
      })
    }
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Parses raw query string (JSON or pipe format: action||target||...)
 * into a structured memory operation object.
 */
export function parseMemoryQuery(query: unknown) {
  if (!query) return null
  if (typeof query === 'object') return query as MemoryOpLike

  const str = String(query).trim()
  if (!str) return null

  // Format 1: JSON object
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) {
        return { action: 'batch', target: 'memory', operations: parsed } as MemoryOpLike
      }
      return parsed as MemoryOpLike
    } catch {
      // lanjut ke fallback pipe parser
    }
  }

  // Format 2: Pipa `action||target||...`
  const parts = str.split('||').map((p) => p.trim())
  const action = parts[0]?.toLowerCase()
  const target = parts[1]?.toLowerCase() || 'memory'

  if (action === 'add') {
    return { action, target, new_text: parts.slice(2).join('||') } as MemoryOpLike
  }
  if (action === 'replace') {
    return { action, target, old_text: parts[2] || '', new_text: parts.slice(3).join('||') } as MemoryOpLike
  }
  if (action === 'remove') {
    return { action, target, old_text: parts.slice(2).join('||') } as MemoryOpLike
  }
  if (action === 'batch') {
    const rawOps = parts.slice(2).join('||')
    try {
      const ops = JSON.parse(rawOps)
      return { action: 'batch', target, operations: ops } as MemoryOpLike
    } catch {
      return { action: 'batch', target, operations: [] } as MemoryOpLike
    }
  }

  return { action, target } as MemoryOpLike
}

// State tracker kegagalan memori per-turn
const turnFailures = new Map<string, number>()

export function getTurnFailureCount(turnId = 'default') {
  return turnFailures.get(String(turnId)) || 0
}

export function recordMemoryFailure(turnId = 'default') {
  const tid = String(turnId)
  const current = (turnFailures.get(tid) || 0) + 1
  turnFailures.set(tid, current)
  return current
}

export function resetMemoryFailureCount(turnId = 'default') {
  turnFailures.delete(String(turnId))
}

export function isMemoryFailureCapped(turnId = 'default') {
  return (turnFailures.get(String(turnId)) || 0) >= MEMORY_TOOL_SPEC.perTurnFailureCap
}

/**
 * Mencari item memori yang cocok dengan query oldText (ID, exact, atau substring).
 */
export function findMemoryTarget(memories: MemoryRowLike[] | null | undefined, oldText: unknown): MemoryRowLike | null {
  if (!oldText || !Array.isArray(memories)) return null
  const cleaned = String(oldText).trim().toLowerCase()
  if (!cleaned) return null

  // 1. Coba match ID numerik jika oldText adalah angka
  const asNum = Number(cleaned)
  if (!isNaN(asNum) && asNum > 0) {
    const byId = memories.find((m) => Number(m.id) === asNum)
    if (byId) return byId
  }

  // 2. Exact match case-insensitive
  const exact = memories.find((m) => (m.memory || '').trim().toLowerCase() === cleaned)
  if (exact) return exact

  // 3. Substring match
  const substring = memories.find((m) => (m.memory || '').toLowerCase().includes(cleaned))
  if (substring) return substring

  return null
}

const defaultDbProvider = {
  getAllMemory,
  insertMemory,
  updateMemory,
  deleteMemory,
}

/**
 * Mengeksekusi operasi memori tervalidasi dengan proteksi failure cap dan atomicity.
 * @param {object} op Operasi memori
 * @param {object} options { turnId, dbProvider }
 */
export async function executeMemoryOp(
  op: MemoryOpLike,
  options: { turnId?: string; dbProvider?: MemoryDbProvider } = {}
) {
  const turnId = options.turnId || 'default'
  const db: MemoryDbProvider = options.dbProvider || defaultDbProvider

  if (isMemoryFailureCapped(turnId)) {
    return {
      success: false,
      error: `[MEMORY-FAILURE-CAP] Batas kegagalan operasi memori tercapai (${MEMORY_TOOL_SPEC.perTurnFailureCap}x kegagalan pada turn ini). Operasi dibatalkan.`
    }
  }

  const validation = validateMemoryOp(op)
  if (!validation.ok) {
    recordMemoryFailure(turnId)
    return {
      success: false,
      error: `Validasi gagal: ${validation.errors.join('; ')}`
    }
  }

  try {
    if (op.action === 'add') {
      const memType = op.target === 'user' ? 'profile' : 'notes'
      await db.insertMemory({
        type: memType,
        memory: op.new_text || '',
        summary: op.summary || ''
      })
      resetMemoryFailureCount(turnId)
      return {
        success: true,
        message: `Berhasil menambahkan memori (${op.target}): "${op.new_text}"`,
        action: 'add'
      }
    }

    if (op.action === 'replace') {
      const currentMemories = await db.getAllMemory()
      const found = findMemoryTarget(currentMemories, op.old_text)
      if (!found) {
        recordMemoryFailure(turnId)
        return {
          success: false,
          error: `Memori dengan teks "${op.old_text}" tidak ditemukan.`
        }
      }
      const memType = op.target === 'user' ? 'profile' : found.type
      await db.updateMemory({
        id: found.id,
        type: memType,
        memory: op.new_text || '',
        summary: found.summary || ''
      })
      resetMemoryFailureCount(turnId)
      return {
        success: true,
        message: `Berhasil memperbarui memori ID ${found.id}: "${op.new_text}"`,
        action: 'replace'
      }
    }

    if (op.action === 'remove') {
      const currentMemories = await db.getAllMemory()
      const found = findMemoryTarget(currentMemories, op.old_text)
      if (!found) {
        recordMemoryFailure(turnId)
        return {
          success: false,
          error: `Memori dengan teks "${op.old_text}" tidak ditemukan.`
        }
      }
      await db.deleteMemory(found.id)
      resetMemoryFailureCount(turnId)
      return {
        success: true,
        message: `Berhasil menghapus memori ID ${found.id} ("${op.old_text}")`,
        action: 'remove'
      }
    }

    if (op.action === 'batch') {
      // Step 1: Pra-validasi dan snapshot cek untuk atomicity
      const currentMemories = await db.getAllMemory()
      const plannedActions: Array<{
        type: string
        op: MemoryOpLike
        targetId?: number
        existing?: MemoryRowLike
      }> = []

      for (let i = 0; i < (op.operations as MemoryOpLike[]).length; i++) {
        const subOp = (op.operations as MemoryOpLike[])[i]
        if (subOp.action === 'add') {
          plannedActions.push({ type: 'add', op: subOp })
        } else if (subOp.action === 'replace') {
          const found = findMemoryTarget(currentMemories, subOp.old_text)
          if (!found) {
            recordMemoryFailure(turnId)
            return {
              success: false,
              error: `Batch dibatalkan: target "${subOp.old_text}" pada operasi ${i} tidak ditemukan. Tidak ada perubahan yang diterapkan.`
            }
          }
          plannedActions.push({ type: 'replace', op: subOp, targetId: found.id, existing: found })
        } else if (subOp.action === 'remove') {
          const found = findMemoryTarget(currentMemories, subOp.old_text)
          if (!found) {
            recordMemoryFailure(turnId)
            return {
              success: false,
              error: `Batch dibatalkan: target "${subOp.old_text}" pada operasi ${i} tidak ditemukan. Tidak ada perubahan yang diterapkan.`
            }
          }
          plannedActions.push({ type: 'remove', op: subOp, targetId: found.id, existing: found })
        }
      }

      // Step 2: Eksekusi seluruh aksi secara terjamin
      const applied: string[] = []
      for (const item of plannedActions) {
        if (item.type === 'add') {
          const memType = item.op.target === 'user' ? 'profile' : 'notes'
          await db.insertMemory({
            type: memType,
            memory: item.op.new_text || '',
            summary: item.op.summary || ''
          })
          applied.push(`add(${item.op.target}): "${item.op.new_text}"`)
        } else if (item.type === 'replace') {
          const memType = item.op.target === 'user' ? 'profile' : item.existing?.type || 'notes'
          await db.updateMemory({
            id: item.targetId,
            type: memType,
            memory: item.op.new_text || '',
            summary: item.existing?.summary || ''
          })
          applied.push(`replace(ID ${item.targetId}): "${item.op.new_text}"`)
        } else if (item.type === 'remove') {
          await db.deleteMemory(item.targetId)
          applied.push(`remove(ID ${item.targetId}): "${item.op.old_text}"`)
        }
      }

      resetMemoryFailureCount(turnId)
      return {
        success: true,
        message: `Batch atomic berhasil diterapkan (${applied.length} operasi).`,
        details: applied,
        action: 'batch'
      }
    }

    recordMemoryFailure(turnId)
    return { success: false, error: `Action ${op.action} tidak didukung.` }
  } catch (err) {
    recordMemoryFailure(turnId)
    return { success: false, error: `Kegagalan eksekusi memori: ${(err as Error)?.message || err}` }
  }
}

/**
 * Entry point umum untuk memanggil tool `memory` dari planner atau executor.
 * Mengembalikan string representasi hasil (terminalSuccess).
 */
export async function executeMemoryTool(
  rawQuery: unknown,
  options: { turnId?: string; dbProvider?: MemoryDbProvider } = {}
) {
  const turnId = options.turnId || 'default'

  if (isMemoryFailureCapped(turnId)) {
    return `[MEMORY-FAILURE-CAP] Batas kegagalan operasi memori tercapai (${MEMORY_TOOL_SPEC.perTurnFailureCap}x kegagalan pada turn ini). Operasi dibatalkan.`
  }

  const op = parseMemoryQuery(rawQuery)
  if (!op) {
    recordMemoryFailure(turnId)
    return `[MEMORY-ERROR] Format query memori tidak valid. Gunakan JSON {"action","target",...} atau format pipa: action||target||...`
  }

  const result = await executeMemoryOp(op, options)
  if (!result.success) {
    return `[MEMORY-ERROR] ${result.error}`
  }

  return `[MEMORY-SUCCESS] ${result.message}`
}
