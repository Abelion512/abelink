// src/api/ai/memoryTool.js
// Single `memory` tool spec + validator (Hermes pattern (c)).
// Spec only — NO wiring into core-tools/planner.

export const MEMORY_TOOL_SPEC = {
  name: 'memory',
  description: 'Catat, ganti, atau hapus memori profil/preferensi. Batch atomic: semua operasi dalam satu panggilan berhasil atau tidak ada yang diterapkan.',
  actions: ['add', 'replace', 'remove', 'batch'],
  perTurnFailureCap: 3,
  terminalSuccess: true,
}

const ACTIONS = new Set(MEMORY_TOOL_SPEC.actions)
const TARGETS = new Set(['memory', 'user'])

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Validates a memory op. Returns { ok, errors[] }.
 * op: { action, target, old_text?, new_text?, operations? }
 */
export function validateMemoryOp(op) {
  const errors = []
  if (!op || typeof op !== 'object') return { ok: false, errors: ['op harus objek'] }
  if (!ACTIONS.has(op.action)) errors.push(`action tidak dikenal: ${op.action}`)
  if (!TARGETS.has(op.target)) errors.push(`target tidak dikenal: ${op.target}`)
  if (errors.length > 0) return { ok: false, errors }

  if (op.action === 'add') {
    if (!nonEmptyString(op.new_text)) errors.push('add butuh new_text non-kosong')
  } else if (op.action === 'replace') {
    if (!nonEmptyString(op.old_text)) errors.push('replace butuh old_text non-kosong')
    if (!nonEmptyString(op.new_text)) errors.push('replace butuh new_text non-kosong')
  } else if (op.action === 'remove') {
    if (!nonEmptyString(op.old_text)) errors.push('remove butuh old_text non-kosong')
  } else if (op.action === 'batch') {
    if (!Array.isArray(op.operations) || op.operations.length === 0) {
      errors.push('batch butuh operations array non-kosong')
    } else {
      op.operations.forEach((sub, i) => {
        const r = validateMemoryOp(sub)
        if (!r.ok) errors.push(`operations[${i}]: ${r.errors.join('; ')}`)
      })
    }
  }

  return { ok: errors.length === 0, errors }
}
