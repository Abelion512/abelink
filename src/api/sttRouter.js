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
    throw err
  }
}

/**
 * Router STT Terpadu (Custom STT & Multi-Provider Combo Fallback ala 9router)
 * Tidak lagi menggunakan model WASM lokal di CPU laptop agar performa laptop tetap ringan.
 */
export const transcribeAudioUnified = async (pcmBuffer, onProgress, setStatusMessage) => {
  const configs = await getAllConfig()
  const cfg = configs[0] || {}

  const updateStatus = (msg) => {
    if (typeof setStatusMessage === 'function') {
      setStatusMessage(msg)
    }
  }

  // Primary Endpoint: Default ke 9router localhost atau Groq jika ada key
  const primaryEndpoint =
    cfg.customSttEndpoint?.trim() ||
    (cfg.groqApiKey?.trim() ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'http://localhost:20128/v1/audio/transcriptions')
  const primaryKey = cfg.customSttApiKey?.trim() || cfg.groqApiKey?.trim() || ''
  const primaryModel = cfg.customSttModel?.trim() || (cfg.groqApiKey?.trim() ? 'whisper-large-v3-turbo' : 'selfhosted-stt/whisper-1')

  // Fallback Endpoint (Combo mode)
  const fallbackEndpoint = cfg.sttFallbackEndpoint?.trim() || (cfg.groqApiKey?.trim() ? 'https://api.groq.com/openai/v1/audio/transcriptions' : '')
  const fallbackKey = cfg.sttFallbackApiKey?.trim() || cfg.groqApiKey?.trim() || ''
  const fallbackModel = cfg.sttFallbackModel?.trim() || 'whisper-large-v3-turbo'

  const isComboEnabled = Boolean(cfg.sttEnableCombo && fallbackEndpoint && fallbackEndpoint !== primaryEndpoint)

  if (!primaryEndpoint && !fallbackEndpoint) {
    throw new Error('Endpoint STT belum diisi. Buka Konfigurasi > Audio & Voice Engine untuk menyetel endpoint.')
  }

  // Langkah 1: Coba Primary Connection (misal 9router / self-hosted STT)
  updateStatus('Mentranskrip audio...')
  try {
    const text = await transcribeToEndpoint(pcmBuffer, {
      endpoint: primaryEndpoint,
      apiKey: primaryKey,
      model: primaryModel,
      language: 'id',
      prompt: 'Halo Abelink, percakapan asisten Linux berbahasa Indonesia.'
    })
    updateStatus('')
    return text
  } catch (primaryErr) {
    console.warn('[sttRouter] Primary STT gagal:', primaryErr.message)

    // Langkah 2: Fallback ke Secondary Connection jika mode Combo aktif
    if (isComboEnabled) {
      updateStatus('Koneksi utama gagal, beralih ke Fallback Provider...')
      try {
        const text = await transcribeToEndpoint(pcmBuffer, {
          endpoint: fallbackEndpoint,
          apiKey: fallbackKey,
          model: fallbackModel,
          language: 'id',
          prompt: 'Halo Abelink, percakapan asisten Linux berbahasa Indonesia.'
        })
        updateStatus('')
        return text
      } catch (fallbackErr) {
        updateStatus('')
        throw new Error(
          `Semua provider STT gagal. Utama (${primaryEndpoint}): ${primaryErr.message}. Fallback (${fallbackEndpoint}): ${fallbackErr.message}`
        )
      }
    }

    updateStatus('')
    throw primaryErr
  }
}
