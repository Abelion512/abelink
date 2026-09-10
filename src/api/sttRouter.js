import { getAllConfig } from './db'
import { pcmToWav } from './groq'

/**
 * Normalisasi URL target endpoint STT.
 * Menangani URL berakhiran /v1/audio/transcriptions, /v1, atau baseURL murni.
 */
export const normalizeSttUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let cleaned = rawUrl.trim().replace(/\/+$/, '')
  if (!cleaned) return ''

  // Linux WebKit: konversi localhost ke 127.0.0.1 agar bebas dari isu resolusi IPv6 [::1]
  cleaned = cleaned.replace(/^(https?:\/\/)(localhost)(:\d+)?/i, '$1127.0.0.1$3')

  if (cleaned.endsWith('/audio/transcriptions')) {
    return cleaned
  }
  if (cleaned.endsWith('/v1')) {
    return `${cleaned}/audio/transcriptions`
  }
  return `${cleaned}/v1/audio/transcriptions`
}

/**
 * Eksekusi panggilan HTTP multipart audio transcription ke server OpenAI-compatible STT.
 * Format request identik dengan cURL spesifikasi 9router dan OpenAI:
 * curl -X POST <endpoint> -H "Authorization: Bearer <key>" -F "file=@audio.wav" -F "model=<model>" -F "response_format=json"
 */
export const transcribeToEndpoint = async (pcmBuffer, { endpoint, apiKey, model, language = 'id', prompt = '' }) => {
  const targetUrl = normalizeSttUrl(endpoint)
  if (!targetUrl) {
    throw new Error('Endpoint STT kosong atau tidak valid')
  }

  const wavFile = pcmToWav(pcmBuffer, 16000)
  const formData = new FormData()
  formData.append('file', wavFile, 'audio.wav')
  formData.append('model', model || 'selfhosted-stt/whisper-1')
  formData.append('response_format', 'json')
  if (language) formData.append('language', language)
  if (prompt) formData.append('prompt', prompt)

  const headers = {}
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000) // 20s timeout

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`)
    }

    const data = await res.json()
    if (typeof data?.text === 'string') {
      return data.text
    }
    if (typeof data === 'string') {
      return data
    }
    throw new Error('Format respon STT tidak memuat teks transkripsi')
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error(`Koneksi ke STT ${targetUrl} timeout (20 detik)`)
    }
    if (err.message === 'Load failed' || err.name === 'TypeError') {
      throw new Error(`Koneksi ke STT ${targetUrl} gagal (Network/CORS/DNS error)`)
    }
    throw err
  }
}

let roundRobinCounter = 0

/**
 * Deteksi kapabilitas CPU & RAM laptop untuk rekomendasi Local Whisper vs Custom STT
 */
export const getHardwareSttSupport = async () => {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 2) : 2
  let isLiteMode = false
  try {
    if (window.api && window.api.getLiteMode) {
      isLiteMode = await window.api.getLiteMode()
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
export const transcribeAudioUnified = async (pcmBuffer, onProgress, setStatusMessage) => {
  const configs = await getAllConfig()
  const cfg = configs[0] || {}

  const updateStatus = (msg) => {
    if (typeof setStatusMessage === 'function') {
      setStatusMessage(msg)
    }
  }

  // JALUR 1: Local Whisper (On-Device Inference)
  if (cfg.sttProvider === 'whisper') {
    updateStatus('Mentranskrip via Local Whisper (On-Device)...')
    try {
      const { transcribeAudioLocal } = await import('./localWhisper.js')
      const text = await transcribeAudioLocal(pcmBuffer, onProgress)
      updateStatus('')
      return text
    } catch (localErr) {
      console.warn('[sttRouter] Local Whisper gagal:', localErr.message)
      updateStatus(`Local Whisper gagal (${localErr.message.slice(0, 40)}...). Beralih ke Custom Gateway...`)
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
      defaultEndpoint = cfg.groqApiKey?.trim()
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'http://127.0.0.1:20128/v1/audio/transcriptions'
    }
    const defaultKey = cfg.customSttApiKey?.trim() || cfg.groqApiKey?.trim() || ''
    const defaultModel =
      cfg.customSttModel?.trim() ||
      (defaultEndpoint.includes('groq') ? 'whisper-large-v3-turbo' : 'selfhosted-stt/whisper-1')

    connections = [
      {
        id: 'conn-bootstrap-1',
        name: defaultEndpoint.includes('groq') ? 'Groq Whisper Cloud' : 'Local STT Gateway',
        endpoint: defaultEndpoint,
        apiKey: defaultKey,
        model: defaultModel,
        enabled: true
      }
    ]

    if (cfg.sttFallbackEndpoint && cfg.sttFallbackEndpoint !== defaultEndpoint) {
      connections.push({
        id: 'conn-bootstrap-2',
        name: 'Secondary Fallback',
        endpoint: cfg.sttFallbackEndpoint,
        apiKey: cfg.sttFallbackApiKey || cfg.groqApiKey || '',
        model: cfg.sttFallbackModel || 'whisper-large-v3-turbo',
        enabled: true
      })
    }
  }

  const strategy = cfg.sttStrategy || 'fallback'
  const lang = cfg.sttLanguage || 'id'
  const promptText =
    lang === 'zh'
      ? '你好 Abelink，Linux 桌面助手对话。'
      : lang === 'en'
      ? 'Hello Abelink, Linux desktop companion conversation.'
      : 'Halo Abelink, percakapan asisten Linux berbahasa Indonesia.'

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
        model: conn.model || 'selfhosted-stt/whisper-1',
        language: lang,
        prompt: promptText
      })

      const elapsed = Math.round(performance.now() - t0)
      console.log(`[sttRouter] Sukses transkripsi via [${providerName}] dalam ${elapsed}ms`)
      updateStatus('')
      return text
    } catch (err) {
      const elapsed = Math.round(performance.now() - t0)
      const reason = err.message || 'Error tidak diketahui'
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
      const { transcribeAudioLocal } = await import('./localWhisper.js')
      const localText = await transcribeAudioLocal(pcmBuffer, onProgress)
      updateStatus('')
      return localText
    } catch (localErr) {
      console.warn('[sttRouter] Fallback Local Whisper juga gagal:', localErr.message)
      failureReports.push(`[Local Whisper Fallback]: ${localErr.message}`)
    }
  }

  updateStatus('')
  throw new Error(`Semua provider STT gagal:\n${failureReports.join('\n')}`)
}
