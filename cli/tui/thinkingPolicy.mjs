// cli/tui/thinkingPolicy.mjs — S2: thinking per-model dari capabilities live,
// pola qwen (mapped & clamped per provider) + fallback claude-code
// (level tak didukung -> tertinggi yang didukung di bawahnya).
// - claude-adaptive -> thinking adaptive + output_config.effort, TANPA
//   budget_tokens (budget manual 400-error di 4.7+, deprecated 4.6 — docs resmi).
// - claude-budget -> budget_tokens + max_tokens (model lama).
// - openai/deepseek/qwen/kimi/zai/gemini-level/minimax/hunyuan/dll ->
//   reasoning_effort saja (composite 9Router yang menerjemahkan).
// - reasoning False / format None -> strip semua thinking/effort fields.
// - max_tokens di-clamp ke maxOutput live bila dikenal.
// - Murni + testable. Tanpa network.

export const EFFORT_ORDER = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'])

// Subset effort per profile (qwen-pattern `efforts`). Kunci = thinkingFormat
// 9Router; tak dikenal -> subset konservatif low/medium/high.
export const EFFORTS_BY_PROFILE = Object.freeze({
  'claude-adaptive': ['low', 'medium', 'high', 'xhigh', 'max'],
  'claude-budget': ['low', 'medium', 'high', 'max'],
  openai: ['low', 'medium', 'high', 'xhigh', 'max'],
})

export const CONSERVATIVE_EFFORTS = Object.freeze(['low', 'medium', 'high'])

export function effortsFor(thinkFmt = null) {
  if (thinkFmt && EFFORTS_BY_PROFILE[thinkFmt]) return [...EFFORTS_BY_PROFILE[thinkFmt]]
  return [...CONSERVATIVE_EFFORTS]
}

// Clamp: level tak didukung -> tertinggi yang didukung di bawahnya
// (claude-code). Tak dikenal -> medium bila ada, else pertama.
export function clampEffort(effort = 'medium', supported = CONSERVATIVE_EFFORTS) {
  const list = Array.isArray(supported) && supported.length ? supported : [...CONSERVATIVE_EFFORTS]
  const e = String(effort || '').toLowerCase()
  const idx = EFFORT_ORDER.indexOf(e)
  if (idx >= 0) {
    for (let i = idx; i >= 0; i--) {
      if (list.includes(EFFORT_ORDER[i])) return EFFORT_ORDER[i]
    }
    return list[0]
  }
  return list.includes('medium') ? 'medium' : list[0]
}

// Payload thinking untuk wire. cap = { thinkFmt, reasoning, maxOut }.
// Return { reasoning_effort?, thinking?, output_config?, max_tokens, profile, clamped }.
export function thinkingPayload({ thinkFmt = null, reasoning = false, maxOut = null, effort = 'medium', maxTokens = null } = {}) {
  const fmt = reasoning ? thinkFmt : null
  const supported = effortsFor(fmt)
  const clamped = clampEffort(effort, supported)
  const want = Number(maxTokens) || null
  const cap = Number(maxOut) || null
  const finalMax = want && cap ? Math.min(want, cap) : (want || cap || null)
  const base = { max_tokens: finalMax, profile: fmt || 'none', clamped }
  if (!fmt) return base
  if (fmt === 'claude-adaptive') {
    return { ...base, thinking: { type: 'adaptive' }, output_config: { effort: clamped } }
  }
  if (fmt === 'claude-budget') {
    return { ...base, thinking: null, budgetTokens: true, effort: clamped }
  }
  return { ...base, reasoning_effort: clamped }
}

// Capabilitas -> ringkasan satu baris untuk /models detail (opsional).
export function capSummary(cap = {}) {
  const bits = []
  bits.push(cap.reasoning ? 'reasoning' : 'no-reasoning')
  if (cap.ctx) bits.push(`${cap.ctx}ctx`)
  if (cap.maxOut) bits.push(`max${cap.maxOut}`)
  if (cap.thinkFmt) bits.push(cap.thinkFmt)
  return bits.join(' · ')
}
