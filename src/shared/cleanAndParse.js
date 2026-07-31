// Shared JSON parser for LLM responses — single source of truth for main + renderer.
// Fast path avoids jsonrepair cost on valid JSON; fallbacks handle fenced/broken output.

let _jsonrepair = null

async function getJsonrepair() {
  if (_jsonrepair === null) {
    try { _jsonrepair = (await import('jsonrepair')).jsonrepair || false } catch { _jsonrepair = false }
  }
  return _jsonrepair || null
}

function tryParse(text) {
  const parsed = JSON.parse(text)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return null
}

export async function cleanAndParse(rawResponse) {
  try {
    if (!rawResponse) return null
    const trimmed = rawResponse.replace(/^\uFEFF/, '').trim()
    // Fast path: valid JSON object, no repair needed
    try {
      const parsed = tryParse(trimmed)
      if (parsed) return parsed
    } catch {}
    // Strip code fences, then jsonrepair for broken LLM JSON
    const cleaned = trimmed.replace(/```[\s\S]*?```/g, '').trim()
    try {
      const repair = await getJsonrepair()
      const parsed = repair ? tryParse(repair(cleaned)) : tryParse(cleaned)
      if (parsed) return parsed
    } catch {}
    // Last resort: extract first {...} substring
    const match = trimmed.match(/\{[\s\S]*\}/)
    return match ? tryParse(match[0]) : null
  } catch {
    return null
  }
}
