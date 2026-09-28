import { getAllConfig } from './db'
import { pcmToWav } from './groq'
import { detectProviderFromUrl } from './ai/providerDetect.ts'
import { resolveEndpointUrl } from './ai/providerRegistry.ts'
import { DEFAULT_STT_MODEL, filterSegments } from './sttGuard.ts'

// ---- Kontrak tipe (W2-8b) ----
interface SttEndpointConfig {
  endpoint: unknown
  apiKey?: unknown
  model?: unknown
  language?: unknown
}

interface SttError extends Error {
  httpStatus?: number
}

interface SttVerboseData {
  text?: unknown
  segments?: unknown
}

/**
 * Nama tampilan koneksi: nama provider terdeteksi dari URL bila dikenal,
 * fallback generik bila tidak (mis. endpoint privat tanpa keyword/port umum).
 */
export const connectionDisplayName = (endpoint: unknown, fallback: unknown) => {
  const detected = detectProviderFromUrl(endpoint)
  return detected.id === 'custom' ? fallback : detected.name
}

/**
 * Normalisasi URL target endpoint STT — delegasi ke providerRegistry
 * (smart, satu aturan untuk chat/stt/tts): trailing slash, localhost,
 * suffix lengkap, /v1 ada/tidak — semua dirapikan deterministik.
 */
export const normalizeSttUrl = (rawUrl: unknown) => resolveEndpointUrl(rawUrl, 'stt')

/**
 * Eksekusi panggilan HTTP multipart audio transcription ke server OpenAI-compatible STT.
 * Format request identik dengan cURL spesifikasi 9router dan OpenAI:
 * curl -X POST <endpoint> -H "Authorization: Bearer <key>" -F "file=@audio.wav" -F "model=<model>" -F "response_format=json"
 *
 * Anti-halusinasi (standar OpenAI Whisper + faster-whisper):
 * - prompt DIKOSONGKAN: prompt kalimat intro terbukti memandu Whisper
 *   mengarang teks asisten pada audio sunyi/noise.
 * - temperature 0 (greedy deterministik).
 * - response_format verbose_json bila didukung agar segmen bermetrik
 *   (no_speech_prob/avg_logprob/compression_ratio) bisa difilter; fallback
 *   ke json untuk endpoint yang menolak verbose_json.
 */
export const transcribeToEndpoint = async (
  pcmBuffer: Float32Array,
  { endpoint, apiKey, model, language = 'id' }: SttEndpointConfig
): Promise<string> => {
  const targetUrl = normalizeSttUrl(endpoint)
  if (!targetUrl) {
    throw new Error('Endpoint STT kosong atau tidak valid')
  }

  const wavFile = pcmToWav(pcmBuffer, 16000)

  const buildForm = (responseFormat: string) => {
    const formData = new FormData()
    formData.append('file', wavFile, 'audio.wav')
    formData.append('model', String(model || DEFAULT_STT_MODEL))
    formData.append('response_format', responseFormat)
    formData.append('temperature', '0')
    if (language) formData.append('language', String(language))
    return formData
  }

  const headers: Record<string, string> = {}
  if (apiKey && String(apiKey).trim()) {
    headers['Authorization'] = `Bearer ${String(apiKey).trim()}`
  }

  const postOnce = async (responseFormat: string, timeoutMs: number) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: buildForm(responseFormat),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        const err = new Error(`HTTP ${res.status}: ${errText || res.statusText}`) as SttError
        err.httpStatus = res.status
        throw err
      }
      return await res.json()
    } catch (err) {
      clearTimeout(timeoutId)
      throw err
    }
  }

  const parseText = (data: unknown): string => {
    const d = data as SttVerboseData | null
    if (typeof d?.text === 'string') {
      // Segmen bermetrik verbose_json -> filter sunyi/tak-percaya-diri/repetitif.
      if (Array.isArray(d?.segments)) {
        const filtered = filterSegments(d.segments)
        if (typeof filtered === 'string' && filtered) return filtered
        if (typeof filtered === 'string') return ''
      }
      return d.text as string
    }
    if (typeof data === 'string') {
      return data
    }
    throw new Error('Format respon STT tidak memuat teks transkripsi')
  }

  try {
    try {
      return parseText(await postOnce('verbose_json', 20000)) // 20s timeout
    } catch (err) {
      // Endpoint yang tak kenal verbose_json (400/422/415) -> fallback json polos.
      const status = (err as SttError)?.httpStatus
      if (status === 400 || status === 422 || status === 415) {
        return parseText(await postOnce('json', 20000))
      }
      throw err
    }
  } catch (err) {
    const e = err as SttError
    if (e.name === 'AbortError') {
      throw new Error(`Koneksi ke STT ${targetUrl} timeout (20 detik)`)
    }
    if (e.message === 'Load failed' || (e.name === 'TypeError' && e.message === 'Failed to fetch')) {
      throw new Error(`Koneksi ke STT ${targetUrl} gagal (Network/CORS/DNS error)`)
    }
    throw err
  }
}

let roundRobinCounter = 0

/**
 * Deteksi kapabilitas CPU & RAM laptop untuk rekomendasi Local Whisper vs Custom STT
 */
export const getHardwareSttSupport = async (): Promise<{ cores: number; isLiteMode: boolean; isLowEnd: boolean; recommendation: string; reason: string }> => {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 2) : 2
  let isLiteMode = false
  try {
    const w = typeof window !== 'undefined' ? (window as unknown as { api?: { getLiteMode?: () => Promise<boolean> } }) : null
    if (w?.api?.getLiteMode) {
      isLiteMode = await w.api.getLiteMode()
    }
  } catch (_) {}

  const isLowEnd = cores <= 4 || isLiteMode
  return {
    cores,
    isLiteMode,
    isLowEnd,
    recommendation: isLowEnd ? 'custom' : 'whisper',
    reason: isLowEnd
      ? 'CPU/RAM laptop terbatas. Disarankan menggunakan Custom STT (Remote/Gateway) agar sistem tidak terbebani.'
      : 'Spesifikasi laptop mencukupi untuk menjalankan model Whisper on-device secara lokal.'
  }
}

/**
 * Router STT Terpadu (Custom Multi-Connection Combo & Local Whisper)
 * Mengadopsi arsitektur AI Gateway (9router & OmniRoute):
 * Mendukung unlimited connections dengan strategi Fallback (Priority Chain) & Round Robin.
 */
export const transcribeAudioUnified = async (
  pcmBuffer: Float32Array,
  onProgress: unknown,
  setStatusMessage: unknown
): Promise<string> => {
  const configs = await getAllConfig()
  const cfg = configs[0] || {}

  const updateStatus = (msg: string) => {
    if (typeof setStatusMessage === 'function') {
      setStatusMessage(msg)
    }
  }

  // JALUR 1: Local Whisper (On-Device Inference)
  if (cfg.sttProvider === 'whisper') {
    updateStatus('Mentranskrip via Local Whisper (On-Device)...')
    try {
      const { transcribeAudioLocal } = await import('./localWhisper.ts')
      const text = await transcribeAudioLocal(pcmBuffer as unknown as ArrayBuffer, onProgress as (p: unknown) => void)
      updateStatus('')
      return text
    } catch (localErr) {
      const le = localErr as Error
      console.warn('[sttRouter] Local Whisper gagal:', le.message)
      updateStatus(`Local Whisper gagal (${le.message.slice(0, 40)}...). Beralih ke Custom Gateway...`)
      // Otomatis fallback ke Custom jika lokal gagal
    }
  }

  // JALUR 2: Custom Multi-Provider Audio Router (OpenAI /v1/audio/transcriptions)
  let connections = Array.isArray(cfg.sttConnections)
    ? cfg.sttConnections.filter((c) => c && c.enabled !== false && c.endpoint?.trim())
    : []

  // Fallback bootstrap jika array connections belum terisi
  if (connections.length === 0) {
    let defaultEndpoint = cfg.customSttEndpoint?.trim()
    if (defaultEndpoint && defaultEndpoint.includes('dashscope')) {
      defaultEndpoint = ''
    }
    if (!defaultEndpoint) {
      // Primary dikunci ke gateway lokal; Groq hanya cadangan.
      defaultEndpoint = 'http://127.0.0.1:20128/v1/audio/transcriptions'
    }
    const defaultKey = cfg.customSttApiKey?.trim() || ''
    const defaultModel =
      cfg.customSttModel?.trim() || DEFAULT_STT_MODEL

    connections = [
      {
        id: 'conn-bootstrap-1',
        name: connectionDisplayName(defaultEndpoint, 'Local STT Gateway') as string,
        endpoint: defaultEndpoint,
        apiKey: defaultKey,
        model: defaultModel,
        enabled: true
      }
    ]

    if (cfg.sttFallbackEndpoint && cfg.sttFallbackEndpoint !== defaultEndpoint) {
      connections.push({
        id: 'conn-bootstrap-2',
        name: connectionDisplayName(cfg.sttFallbackEndpoint, 'Secondary Fallback') as string,
        endpoint: cfg.sttFallbackEndpoint,
        apiKey: cfg.sttFallbackApiKey || cfg.groqApiKey || '',
        model: cfg.sttFallbackModel || 'whisper-large-v3-turbo',
        enabled: true
      })
    } else if (cfg.groqApiKey?.trim() && !defaultEndpoint.includes('groq')) {
      // Groq key ada tapi belum jadi cadangan → jadikan fallback, bukan primary.
      connections.push({
        id: 'conn-bootstrap-groq',
        name: 'Groq Whisper (cadangan)',
        endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
        apiKey: cfg.groqApiKey.trim(),
        model: 'whisper-large-v3-turbo',
        enabled: true
      })
    }
  }

  const strategy = cfg.sttStrategy || 'fallback'
  const lang = cfg.sttLanguage || 'id'
  // Prompt kalimat intro DIHAPUS (anti-halusinasi): prompt Whisper memandu
  // gaya/kelanjutan segmen — kalimat asisten + audio sunyi = karangan intro.
  // Bahasa (id/en/zh) tetap dikirim via `language`, tanpa prompt teks.

  // Susun urutan eksekusi berdasarkan strategi
  let executionList = [...connections]
  if (strategy === 'round-robin' && connections.length > 1) {
    const startIndex = Math.abs(roundRobinCounter++) % connections.length
    executionList = [
      ...connections.slice(startIndex),
      ...connections.slice(0, startIndex)
    ]
  }

  const failureReports = []

  for (let i = 0; i < executionList.length; i++) {
    const conn = executionList[i]
    const providerName = conn.name || `Provider #${i + 1}`
    const isLast = i === executionList.length - 1

    updateStatus(`Mentranskrip via [${providerName}]...`)
    const t0 = performance.now()

    try {
      const text = await transcribeToEndpoint(pcmBuffer, {
        endpoint: conn.endpoint,
        apiKey: conn.apiKey || '',
        model: conn.model || DEFAULT_STT_MODEL,
        language: lang
      })

      const elapsed = Math.round(performance.now() - t0)
      console.log(`[sttRouter] Sukses transkripsi via [${providerName}] dalam ${elapsed}ms`)
      updateStatus('')
      return text
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0)
      const reason = (err as Error).message || 'Error tidak diketahui'
      console.warn(`[sttRouter] [${providerName}] gagal (${elapsed}ms):`, reason)
      failureReports.push(`[${providerName}]: ${reason}`)

      if (!isLast) {
        const nextProvider = executionList[i + 1].name || `Provider #${i + 2}`
        updateStatus(`[${providerName}] gagal. Failover ke [${nextProvider}]...`)
      }
    }
  }

  // Fallback darurat ke Local Whisper jika seluruh endpoint gateway gagal
  if (cfg.sttProvider !== 'whisper') {
    try {
      console.warn('[sttRouter] Semua gateway remote gagal. Mencoba fallback ke Local Whisper...')
      updateStatus('Gateway STT gagal. Mencoba Local Whisper...')
      const { transcribeAudioLocal } = await import('./localWhisper.ts')
      const localText = await transcribeAudioLocal(pcmBuffer as unknown as ArrayBuffer, onProgress as (p: unknown) => void)
      updateStatus('')
      return localText
    } catch (localErr) {
      const le = localErr as Error
      console.warn('[sttRouter] Fallback Local Whisper juga gagal:', le.message)
      failureReports.push(`[Local Whisper Fallback]: ${le.message}`)
    }
  }

  updateStatus('')
  throw new Error(`Semua provider STT gagal:\n${failureReports.join('\n')}`)
}
