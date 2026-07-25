// Fallback serializer — parses LLM output in JSON, XML, or key-value formats
// Prevents retry death spiral when model can't produce valid JSON.

import { cleanAndParse } from './core'

export const FALLBACK_PROMPT_SUFFIX = `
# FORMAT OUTPUT (ALTERNATIF — XML TAGS)
Jika kamu TIDAK BISA menghasilkan JSON yang valid, gunakan format XML tags berikut:
<thought>Alasan logika keputusanmu</thought>
<action tool="nama-tool" query="parameter"> atau <action></action> (kosong jika tidak perlu tool)
<answer>Jawaban untuk user</answer> atau <answer></answer>
<mood>neutral</mood>
<active_topic>Topik pembicaraan</active_topic>
<memory type="notes">...</memory> atau <memory></memory>

PENTING: Pilih SALAH SATU — JSON ATAU XML. Jangan campur keduanya.
`

function extractBetween(text, openTag, closeTag) {
  const escapedOpen = openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedClose = closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escapedOpen}([\\s\\S]*?)${escapedClose}`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : null
}

function parseXml(text) {
  const thought = extractBetween(text, '<thought>', '</thought>')
  const answer = extractBetween(text, '<answer>', '</answer>')
  const mood = extractBetween(text, '<mood>', '</mood>')
  const topic = extractBetween(text, '<active_topic>', '</active_topic>')

  let action = null
  const actionMatch = text.match(/<action\s+(?:tool="([^"]*)"\s+query="([^"]*)")\s*\/?>/i)
  if (actionMatch) {
    action = { tool: actionMatch[1], query: actionMatch[2] }
  }

  let memory = null
  const memTag = text.match(/<memory(?:\s+type="([^"]*)")?>([\s\S]*?)<\/memory>/i)
  if (memTag) {
    memory = {
      type: memTag[1] || 'notes',
      memory: memTag[2].trim(),
      action: 'insert'
    }
  }

  if (!thought && !action && !answer) return null

  return {
    thought: thought || '',
    action,
    answer: answer || null,
    mood: mood || 'neutral',
    active_topic: topic || '',
    memory: memory || null
  }
}

function parseKeyValue(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result = {}
  for (const line of lines) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.substring(0, sep).trim().toLowerCase()
    const val = line.substring(sep + 1).trim()
    if (['thought', 'answer', 'mood', 'active_topic'].includes(key)) {
      result[key] = val === 'null' ? null : val
    } else if (key === 'action') {
      result.action = val === 'null' ? null : { tool: val }
    }
  }
  return result.thought || result.answer ? result : null
}

export function parseFallbackFormat(rawText) {
  if (!rawText || typeof rawText !== 'string') return null

  // Strategy 1: JSON (existing)
  const jsonResult = cleanAndParse(rawText)
  if (jsonResult) return jsonResult

  // Strategy 2: XML tags
  const xmlResult = parseXml(rawText)
  if (xmlResult) return xmlResult

  // Strategy 3: Key-value lines
  const kvResult = parseKeyValue(rawText)
  if (kvResult) return kvResult

  return null
}
