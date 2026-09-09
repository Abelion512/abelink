import OpenAI from 'openai'
import { getAllConfig } from './db'
import { pcmToWav, transcribeAudioGroq } from './groq'
import { transcribeAudioLocal } from './localWhisper'

/**
 * Transkripsi audio via Custom OpenAI-Compatible STT API endpoint.
 * Mendukung proxy STT seperti 9router, self-hosted faster-whisper, vLLM, Cloudflare AI, dsb.
 */
export const transcribeAudioCustom = async (pcmBuffer, endpoint, apiKey, model = 'whisper-1') => {
  const url = (endpoint || '').trim() || 'https://api.openai.com/v1'
  const key = (apiKey || '').trim()

  const client = new OpenAI({
    apiKey: key || 'dummy-key',
    baseURL: url.replace(/\/+$/, ''),
    dangerouslyAllowBrowser: true
  })

  const file = pcmToWav(pcmBuffer, 16000)

  const response = await client.audio.transcriptions.create({
    file,
    model: model || 'whisper-1',
    language: 'id',
    temperature: 0.0,
    prompt: 'Halo Abelink, ini percakapan asisten virtual Linux berbahasa Indonesia.',
    response_format: 'json'
  })

  return response.text
}

/**
 * Router Terpadu Speech-to-Text (STT)
 * Mencegah laptop lemot akibat beban CPU/RAM lokal Whisper WASM.
 * Mendukung mode:
 * - 'groq': Groq Cloud API (Whisper Large-v3 atau Turbo)
 * - 'custom': Custom OpenAI-compatible endpoint (misal 9router / self-hosted)
 * - 'combo': Multi-provider auto-fallback (Custom -> Groq -> Local)
 * - 'whisper-small' / 'local': Local Offline ONNX Whisper
 */
export const transcribeAudioUnified = async (pcmBuffer, onProgress, setStatusMessage) => {
  const configs = await getAllConfig()
  const cfg = configs[0] || {}

  const provider = cfg.sttProvider || (cfg.groqApiKey?.trim() ? 'groq' : (cfg.localWhisperModel?.startsWith('groq') ? 'groq' : 'whisper-small'))
  const hasGroqKey = Boolean(cfg.groqApiKey?.trim())
  const hasCustomEndpoint = Boolean(cfg.customSttEndpoint?.trim())

  const updateStatus = (msg) => {
    if (typeof setStatusMessage === 'function') {
      setStatusMessage(msg)
    }
  }

  // 1. MODE CUSTOM STT (OpenAI Compatible / 9router)
  if (provider === 'custom') {
    if (!hasCustomEndpoint) {
      throw new Error('Custom STT Endpoint belum diisi di Konfigurasi')
    }
    updateStatus('Mentranskrip via Custom STT...')
    try {
      const res = await transcribeAudioCustom(
        pcmBuffer,
        cfg.customSttEndpoint,
        cfg.customSttApiKey,
        cfg.customSttModel || 'whisper-1'
      )
      updateStatus('')
      return res
    } catch (err) {
      updateStatus('')
      throw new Error(`Custom STT gagal: ${err.message}`)
    }
  }

  // 2. MODE GROQ CLOUD STT
  if (provider === 'groq') {
    if (!hasGroqKey) {
      throw new Error('Groq API Key belum disetel di Konfigurasi (Audio & Voice Engine)')
    }
    updateStatus('Mentranskrip via Groq Cloud API...')
    try {
      const res = await transcribeAudioGroq(pcmBuffer)
      updateStatus('')
      return res
    } catch (err) {
      updateStatus('')
      throw err
    }
  }

  // 3. MODE COMBO (Multi-Provider Auto-Fallback ala 9router)
  if (provider === 'combo') {
    const errors = []

    // Langkah A: Coba Custom Endpoint jika tersedia
    if (hasCustomEndpoint) {
      updateStatus('Combo: Mencoba Custom STT Endpoint...')
      try {
        const res = await transcribeAudioCustom(
          pcmBuffer,
          cfg.customSttEndpoint,
          cfg.customSttApiKey,
          cfg.customSttModel || 'whisper-1'
        )
        updateStatus('')
        return res
      } catch (err) {
        console.warn('[sttRouter] Combo Custom STT gagal, fallback ke Groq:', err.message)
        errors.push(`Custom STT: ${err.message}`)
      }
    }

    // Langkah B: Coba Groq API Cloud
    if (hasGroqKey) {
      updateStatus('Combo: Fallback ke Groq Cloud API...')
      try {
        const res = await transcribeAudioGroq(pcmBuffer)
        updateStatus('')
        return res
      } catch (err) {
        console.warn('[sttRouter] Combo Groq API gagal:', err.message)
        errors.push(`Groq: ${err.message}`)
      }
    }

    updateStatus('')
    throw new Error(
      `Seluruh provider Combo gagal. Rincian: ${errors.join('; ') || 'Endpoint atau API Key belum dikonfigurasi.'}`
    )
  }

  // 4. MODE LOCAL OFFLINE WHISPER
  // Peringatan: Membutuhkan RAM & CPU tinggi
  updateStatus('Menyiapkan model Local Whisper...')
  try {
    let highestProgress = 0
    const fileProgressMap = {}

    const text = await transcribeAudioLocal(pcmBuffer, (progressData) => {
      if (progressData?.file && progressData.progress !== undefined) {
        fileProgressMap[progressData.file] = progressData.progress
        const vals = Object.values(fileProgressMap)
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(3, vals.length))
        if (avg > highestProgress) {
          highestProgress = Math.min(100, avg)
          updateStatus(`Memuat model suara lokal... ${highestProgress}%`)
        }
      }
      if (typeof onProgress === 'function') {
        onProgress(progressData)
      }
    })
    updateStatus('')
    return text
  } catch (localErr) {
    console.warn('[sttRouter] Local Whisper gagal:', localErr.message)
    if (hasGroqKey) {
      updateStatus('Whisper lokal berat/gagal, fallback ke Groq...')
      try {
        const res = await transcribeAudioGroq(pcmBuffer)
        updateStatus('')
        return res
      } catch (groqErr) {
        updateStatus('')
        throw groqErr
      }
    }
    updateStatus('')
    throw new Error(
      `Whisper lokal gagal (${localErr.message || 'WASM gagal'}). Gunakan Groq Cloud atau Custom STT di Konfigurasi agar laptop tidak lemot.`
    )
  }
}
