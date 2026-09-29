/// <reference types="vite/client" />
import { getAllConfig } from '../db'
import { jsonrepair } from 'jsonrepair'
import { stripImageContent, stripDataUrls } from './contextCompactor'
import { resolveEffortLevel } from './effortEstimator'
import { EffortLevel, resolve_effort } from './effortSystem'

// ---- Kontrak tipe (W2-4) ----
// Pesan chat lintas provider: content string ATAU array part (vision).
export interface ChatMessage {
  role?: string
  content?: unknown
  [key: string]: unknown
}

// Wrapper AbortSignal-like (session transport): payload session { transport, fetchAI, ... }.
interface SessionOptions {
  signal?: AbortSignal | null
  isSmallTask?: boolean
  jsonSchema?: unknown
  configOverride?: Record<string, unknown> | null
  onToken?: ((chunk: string) => void) | null
  transport?: FetchTransport | null
  fetchAI?: FetchTransport | null
  [key: string]: unknown
}

type FetchTransport = (req: {
  messages: ChatMessage[]
  config: Record<string, unknown>
  isSmallTask: boolean
  jsonSchema: unknown
  stream: boolean
}) => Promise<FetchResult>

// Bentuk frame ai:fetch (wire sidecar): sukses { content?, usage?, ... },
// gagal { error: { message, code } }.
interface FetchResult {
  error?: { message?: string; code?: string } | null
  content?: string
  [key: string]: unknown
}

type TokenListener = ((cb: (payload: unknown) => void) => () => void) | null

interface Abortable {
  aborted?: boolean
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

export const fetchAI = async (
  messages: ChatMessage[],
  signalOrOptions:
    | AbortSignal
    | SessionOptions
    | null = null,
  isSmallTask = false,
  jsonSchema: unknown = null,
  configOverride: Record<string, unknown> | null = null,
  onTokenPositional: ((chunk: string) => void) | null = null
): Promise<FetchResult | null> => {
  let signal: Abortable | null = signalOrOptions instanceof AbortSignal ? signalOrOptions : null
  let smallTask = isSmallTask
  let schema = jsonSchema
  let override = configOverride

  let onToken: ((chunk: string) => void) | null = null
  let transport: FetchTransport | null = null
  if (
    signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    !(signalOrOptions instanceof AbortSignal) &&
    typeof (signalOrOptions as Abortable).addEventListener !== 'function'
  ) {
    const opts = signalOrOptions as SessionOptions
    signal = (opts.signal as Abortable) || null
    smallTask = opts.isSmallTask ?? isSmallTask
    schema = opts.jsonSchema ?? jsonSchema
    override = opts.configOverride ?? configOverride
    onToken = typeof opts.onToken === 'function' ? opts.onToken : null
    transport = opts.transport || opts.fetchAI || null
  }
  if (!onToken && typeof onTokenPositional === 'function') onToken = onTokenPositional

  const currentConfig = await getAllConfig()
  const conf: Record<string, unknown> = { ...(currentConfig[0] || {}), ...(override || {}) }

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
  const effortKey = String(effortDecision.effort || '').toUpperCase()
  if (effortDecision.effort && (EffortLevel as Record<string, { value: string }>)[effortKey]) {
    const canonical = resolve_effort((EffortLevel as Record<string, { value: string }>)[effortKey])
    const policy = canonical.policy as {
      level: { value: string }
      reasoning_score: number
      planning_score: number
      verification_score: number
      reflection_score: number
      workflow_score: number
    }
    conf.__effortMetadata = {
      requested: effortDecision.effort,
      canonical: policy.level.value,
      policyLikes: {
        reasoning_score: policy.reasoning_score,
        planning_score: policy.planning_score,
        verification_score: policy.verification_score,
        reflection_score: policy.reflection_score,
        workflow_score: policy.workflow_score,
      },
    }
  }

  return new Promise<FetchResult | null>((resolve, reject) => {
    let hasResolved = false
    // Holder agar onAbort (didefinisikan duluan) bisa melepas listener token
    // yang baru dipasang belakangan.
    let releaseTokenEarly: (() => void) | null = null

    const onAbort = () => {
      if (hasResolved) return
      hasResolved = true
      try {
        releaseTokenEarly?.()
      } catch (_) {}
      const bridgeWindow = typeof window !== 'undefined' ? (window as unknown as { api?: unknown }) : null
      const api = (bridgeWindow && bridgeWindow.api) || (globalThis as Record<string, unknown>).__ABELINK_API__ || null
      if (api && typeof api === 'object' && 'abortFetchAI' in api) {
        ;(api as { abortFetchAI: () => void }).abortFetchAI()
      }
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
        `%c~${Math.round(messages.reduce((s, m) => s + ((m.content as { length?: number } | undefined)?.length || 0), 0) / 2.5)} est. tokens`,
        'color: #ef4444'
      )
      console.groupEnd()
    }

    // Guard anti-bloat: gambar hanya dipertahankan di pesan TERAKHIR yang
    // membawanya; pesan lama + dataURL string disanitasi agar payload raksasa
    // (~1M token) tidak pernah sampai ke sidecar/provider manapun.
    let lastImageIdx = -1
    messages.forEach((m, i) => {
      if (Array.isArray(m?.content) && (m.content as Array<{ type?: string }>).some((p) => p?.type === 'image_url')) {
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

    // Stream opt-in: pasang listener ai:token hanya bila onToken ada;
    // dilepas saat resolve/reject/abort agar tidak bocor antar giliran.
    const bridgeWindow = typeof window !== 'undefined' ? (window as unknown as { api?: unknown }) : null
    const api =
      (bridgeWindow && bridgeWindow.api) ||
      ((globalThis as Record<string, unknown>).__ABELINK_API__ as TokenListener) ||
      null
    let unlistenToken: (() => void) | null = null
    if (onToken && api && typeof api === 'object' && 'onAiToken' in api) {
      try {
        unlistenToken = (api as { onAiToken: NonNullable<TokenListener> }).onAiToken((chunk: unknown) => {
          try {
            onToken?.(chunk as string)
          } catch (_) {}
        })
      } catch (_) {
        unlistenToken = null
      }
    }
    const releaseToken = () => {
      try {
        unlistenToken?.()
      } catch (_) {}
      unlistenToken = null
    }
    releaseTokenEarly = releaseToken

    const fetchTransport =
      transport ||
      (api && typeof api === 'object' && 'fetchAI' in api
        ? (api as { fetchAI: FetchTransport }).fetchAI
        : ((globalThis as Record<string, unknown>).__ABELINK_AI_FETCH__ as FetchTransport | undefined))
    if (!fetchTransport) {
      hasResolved = true
      releaseToken()
      reject(new Error('AI transport tidak tersedia (window.api.fetchAI, transport session, dan __ABELINK_AI_FETCH__ tidak terpasang).'))
      return
    }

    fetchTransport({
      messages: safeMessages,
      config: conf,
      isSmallTask: smallTask,
      jsonSchema: schema,
      stream: !!onToken
    })
      .then((result) => {
        if (hasResolved) return
        hasResolved = true
        releaseToken()
        if (signal && typeof signal.removeEventListener === 'function')
          signal.removeEventListener('abort', onAbort)

        if (import.meta.env?.DEV && result?.error) {
          console.error('[fetchAI] Error:', result.error.message)
        }

        if (result && result.error) {
          const err = new Error(result.error.message)
          ;(err as Error & { code?: string }).code = result.error.code
          reject(err)
          return
        }
        // Sukses: catat model custom ke riwayat endpoint (MRU, max 10) agar
        // ID yang tak terlist /v1/models (mis. oc/...) tetap bisa dipakai
        // ulang. Inline localStorage — tanpa import komponen (bebas cycle).
        try {
          // ponytail: satu skema kunci recent untuk custom + lm-studio
          // (endpoint dinormalisasi sama seperti recentModelsKey).
          const ep =
            conf.aiProvider === 'custom'
              ? conf.customEndpoint
              : conf.aiProvider === 'lm-studio'
                ? 'http://localhost:1234/v1'
                : null
          const mdl =
            conf.aiProvider === 'custom'
              ? conf.customModel
              : conf.aiProvider === 'lm-studio'
                ? conf.model
                : null
          if (ep && mdl) {
            const k = `abelink_recent_models_${String(ep).trim().toLowerCase().replace(/\/+$/, '')}`
            const name = String(mdl).trim()
            if (name) {
              const prev = JSON.parse(localStorage.getItem(k) || '[]')
              const next = [name, ...(Array.isArray(prev) ? (prev as unknown[]).filter((m) => m !== name) : [])].slice(0, 10)
              localStorage.setItem(k, JSON.stringify(next))
            }
          }
        } catch (_) {}
        resolve(result)
      })
      .catch((e) => {
        if (hasResolved) return
        hasResolved = true
        releaseToken()
        if (signal) signal.removeEventListener!('abort', onAbort)
        reject(e)
      })
  })
}

export const cleanAndParse = (rawResponse: unknown): unknown => {
  try {
    if (!rawResponse) return null

    // Model reasoning (DeepSeek/RTK dkk.) sering membungkus JSON dalam <think>.
    // Strip dulu agar brace-extraction tidak nyasar ke isi reasoning.
    if (typeof rawResponse === 'string') {
      rawResponse = rawResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || rawResponse
    }

    // If it's already an object
    if (typeof rawResponse === 'object') {
      const obj = rawResponse as Record<string, unknown>
      if (
        obj.thought !== undefined ||
        obj.action !== undefined ||
        obj.answer !== undefined
      ) {
        return rawResponse
      }
      if (typeof obj.content === 'string' && obj.content.trim().length > 0) {
        rawResponse = obj.content
      } else if (
        typeof obj.reasoning === 'string' &&
        obj.reasoning.includes('{') &&
        obj.reasoning.includes('}')
      ) {
        rawResponse = obj.reasoning
      } else if (typeof obj.text === 'string' && obj.text.trim().length > 0) {
        rawResponse = obj.text
      } else if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
        rawResponse = obj.message
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

    let text = rawResponse as string
    if (text.includes('<think>')) {
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
    }
    text = text
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

    cleaned = cleaned.replace(/\\(?!(["\\/bfnrt]|u[a-fA-F0-9]{4}))/g, '\\\\')

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
      const lastResort = String(rawResponse || '').trim().replace(/^\uFEFF/, '')
      const match = lastResort.match(/\{[\s\S]*\}/)
      return match ? JSON.parse(match[0]) : null
    } catch {
      return null
    }
  }
}

// Pemulihan lapangan dari output MALFORMED (bukan JSON valid): scan regex
// "field":"value" dan unescape manual. Dipakai planning sebagai jaring penyelamat
// agar jawaban model tidak dibuang cuma karena formatnya rusak.
export const extractLenientField = (raw: unknown, field: string): string | null => {
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
