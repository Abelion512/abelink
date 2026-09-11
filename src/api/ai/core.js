import { getAllConfig } from '../db'
import { jsonrepair } from 'jsonrepair'
import { stripImageContent, stripDataUrls } from './contextCompactor'
import { resolveEffortLevel } from './effortEstimator'
import { EffortLevel, resolve_effort } from './effortSystem'

export const fetchAI = async (
  messages,
  signalOrOptions = null,
  isSmallTask = false,
  jsonSchema = null,
  configOverride = null
) => {
  let signal = signalOrOptions
  let smallTask = isSmallTask
  let schema = jsonSchema
  let override = configOverride

  if (
    signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    !(signalOrOptions instanceof AbortSignal) &&
    typeof signalOrOptions.addEventListener !== 'function'
  ) {
    signal = signalOrOptions.signal || null
    smallTask = signalOrOptions.isSmallTask ?? isSmallTask
    schema = signalOrOptions.jsonSchema ?? jsonSchema
    override = signalOrOptions.configOverride ?? configOverride
  }

  const currentConfig = await getAllConfig()
  const conf = { ...(currentConfig[0] || {}), ...(override || {}) }

  // Effort 'auto': estimasi kompleksitas dari prompt terakhir + task context.
  // Transparan: keputusan dilog dengan skor + alasan (bisa dieval via console).
  const taskText = messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join(' ')
    .slice(-4000)
  const effortDecision = resolveEffortLevel(conf, taskText)
  conf.effortLevel = effortDecision.effort
  // (Log effort-auto dihapus: tiap call = spam; keputusan tetap tercatat di trajectory.)

  // Proactive effort metadata attached to the fetch context for observability.
  // This does not change canonical policy; it is read-only metadata flowing into
  // sidecar/observer hooks and trajectory logs.
  if (effortDecision.effort && EffortLevel[effortDecision.effort.toUpperCase()]) {
    const canonical = resolve_effort(EffortLevel[effortDecision.effort.toUpperCase()])
    conf.__effortMetadata = {
      requested: effortDecision.effort,
      canonical: canonical.policy.level.value,
      policyLikes: {
        reasoning_score: canonical.policy.reasoning_score,
        planning_score: canonical.policy.planning_score,
        verification_score: canonical.policy.verification_score,
        reflection_score: canonical.policy.reflection_score,
        workflow_score: canonical.policy.workflow_score,
      },
    }
  }

  return new Promise((resolve, reject) => {
    let hasResolved = false

    const onAbort = () => {
      if (hasResolved) return
      hasResolved = true
      if (window.api && window.api.abortFetchAI) window.api.abortFetchAI()
      const err = new Error('AbortError')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal) {
      if (signal.aborted) return onAbort()
      if (typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort)
      }
    }

    if (import.meta.env?.DEV) {
      console.groupCollapsed(
        `[fetchAI] ${smallTask ? 'Small' : 'Main'} task, ${messages.length} msgs`
      )
      console.log(
        `%c~${Math.round(messages.reduce((s, m) => s + (m.content?.length || 0), 0) / 2.5)} est. tokens`,
        'color: #ef4444'
      )
      console.groupEnd()
    }

    // Guard anti-bloat: gambar hanya dipertahankan di pesan TERAKHIR yang
    // membawanya; pesan lama + dataURL string disanitasi agar payload raksasa
    // (~1M token) tidak pernah sampai ke sidecar/provider manapun.
    let lastImageIdx = -1
    messages.forEach((m, i) => {
      if (Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url')) {
        lastImageIdx = i
      }
    })
    const safeMessages = messages.map((m, i) => {
      if (Array.isArray(m?.content)) {
        return { ...m, content: stripImageContent(m.content, i === lastImageIdx) }
      }
      if (typeof m?.content === 'string' && m.content.length > 2000) {
        const clean = stripDataUrls(m.content)
        return clean === m.content ? m : { ...m, content: clean }
      }
      return m
    })

    window.api
      .fetchAI({ messages: safeMessages, config: conf, isSmallTask: smallTask, jsonSchema: schema })
      .then((result) => {
        if (hasResolved) return
        hasResolved = true
        if (signal && typeof signal.removeEventListener === 'function')
          signal.removeEventListener('abort', onAbort)

        if (import.meta.env?.DEV && result?.error) {
          console.error('[fetchAI] Error:', result.error.message)
        }

        if (result && result.error) {
          const err = new Error(result.error.message)
          err.code = result.error.code
          reject(err)
          return
        }
        resolve(result)
      })
      .catch((e) => {
        if (hasResolved) return
        hasResolved = true
        if (signal) signal.removeEventListener('abort', onAbort)
        reject(e)
      })
  })
}

export const cleanAndParse = (rawResponse) => {
  try {
    if (!rawResponse) return null

    // Model reasoning (DeepSeek/RTK dkk.) sering membungkus JSON dalam <think>.
    // Strip dulu agar brace-extraction tidak nyasar ke isi reasoning.
    if (typeof rawResponse === 'string') {
      rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || rawResponse
    }

    // If it's already an object
    if (typeof rawResponse === 'object') {
      if (
        rawResponse.thought !== undefined ||
        rawResponse.action !== undefined ||
        rawResponse.answer !== undefined
      ) {
        return rawResponse
      }
      if (typeof rawResponse.content === 'string' && rawResponse.content.trim().length > 0) {
        rawResponse = rawResponse.content
      } else if (
        typeof rawResponse.reasoning === 'string' &&
        rawResponse.reasoning.includes('{') &&
        rawResponse.reasoning.includes('}')
      ) {
        rawResponse = rawResponse.reasoning
      } else if (typeof rawResponse.text === 'string' && rawResponse.text.trim().length > 0) {
        rawResponse = rawResponse.text
      } else if (typeof rawResponse.message === 'string' && rawResponse.message.trim().length > 0) {
        rawResponse = rawResponse.message
      } else {
        try {
          rawResponse = JSON.stringify(rawResponse)
        } catch (_) {
          return null
        }
      }
    }

    if (typeof rawResponse !== 'string') {
      rawResponse = String(rawResponse || '')
    }

    let text = rawResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')

    let firstIndex = -1
    let lastIndex = -1

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstIndex = firstBrace
    } else if (firstBracket !== -1) {
      firstIndex = firstBracket
    }

    if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) {
      lastIndex = lastBrace
    } else if (lastBracket !== -1) {
      lastIndex = lastBracket
    }

    if (firstIndex === -1 || lastIndex === -1) return null

    const jsonStr = text.substring(firstIndex, lastIndex + 1)

    try {
      return JSON.parse(jsonStr)
    } catch (_) {}

    let cleaned = jsonStr
      .replace(/\r?\n/g, ' ')
      .replace(/\t/g, ' ')
      // Escape sequence, bukan karakter kontrol literal: no-control-regex tidak
      // menyala di sini, jadi directive disable-nya dibuang (pernah memicu
      // "Unused eslint-disable directive").
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/\\(?!(["\\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

    try {
      return JSON.parse(cleaned)
    } catch (_) {}

    // Ultimate fallback using jsonrepair for missing brackets/quotes
    try {
      const repaired = jsonrepair(cleaned)
      return JSON.parse(repaired)
    } catch (_) {}

    // Fallback khusus bila model menggunakan kutip melengkung (curly quotes) sebagai delimiter JSON
    try {
      const normalizedQuotes = cleaned
        .replace(/[\u201C\u201D\u2018\u2019]/g, '"')
        .replace(/[\uFF02\u300C\u300D]/g, '"')
      const repaired2 = jsonrepair(normalizedQuotes)
      return JSON.parse(repaired2)
    } catch (_) {}

    return null
  } catch (error) {
    console.error('Gagal Parse JSON:', error)
    try {
      const lastResort = rawResponse.trim().replace(/^\xEF\xBB\xBF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch (e) {
      return null
    }
  }
}

// Pemulihan lapangan dari output MALFORMED (bukan JSON valid): scan regex
// "field":"value" dan unescape manual. Dipakai planning sebagai jaring penyelamat
// agar jawaban model tidak dibuang cuma karena formatnya rusak.
export const extractLenientField = (raw, field) => {
  if (!raw || typeof raw !== 'string') return null
  // 1. Coba regex standar yang menangkap escaped quotes dan ditutup dengan pemisah valid (koma, kurung kurawal, komentar, atau akhir)
  const standardRe = new RegExp(`"${field}\\s*"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"\\s*(?:,|\\}|\\]|\\/\\/|$)`, 'm')
  const m = raw.match(standardRe)
  if (m && m[1]) {
    try {
      return JSON.parse(`"${m[1]}"`)
    } catch {
      return m[1]
    }
  }

  // 2. Jaring kedua: jika string mengandung kutip unescaped (misal '8.7"'),
  // cocokkan sampai kutip penutup field sebelum koma field berikutnya atau kurung kurawal penutup
  const fallbackRe = new RegExp(
    `"${field}"\\s*:\\s*"([\\s\\S]*?)"(?:\\s*,\\s*"[a-zA-Z0-9_]+"\\s*:|\\s*\\}\\s*$)`
  )
  const m2 = raw.match(fallbackRe)
  if (m2 && m2[1]) {
    try {
      return JSON.parse(`"${m2[1]}"`)
    } catch {
      return m2[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
    }
  }

  return null
}
