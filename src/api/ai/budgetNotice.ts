// src/api/ai/budgetNotice.ts
// 80% run-budget wrap-up notice (Hermes pattern (b)). Pure, no side effects.

/**
 * Returns a convergence nudge when remaining/total <= 0.2 and remaining > 0,
 * else null.
 */
export function wrapUpNotice(remaining: number, total: number) {
  if (remaining <= 0) return null
  if (remaining / total > 0.2) return null
  return `[SYSTEM / BUDGET] Sisa ${remaining} langkah dari ${total}. WAJIB konvergen: selesaikan jawaban final ("answer", "is_done": true) atau satu aksi penutup. DILARANG memulai eksplorasi/tool baru yang butuh >1 langkah.`
}
