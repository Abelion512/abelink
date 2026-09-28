// Channel: TTS, transkrip & pencarian YouTube.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, lazy } from '../registry.mjs'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { canonicalizeEndpointUrl } from '../../../src/api/ai/providerRegistry.js'
import { getGlobalConfig } from '../../main/ai-bridge.js'

const getYt = lazy(async () => {
  // Paket CJS: fungsi utama bisa di default atau namespace (normalkan).
  const m = await import('youtube-transcript-plus')
  return m.default ?? m
})
const getYts = lazy(async () => (await import('yt-search')).default)

let globalTTS
// TTS router data-driven (providerRegistry): edge (default, tanpa key) atau
// custom OpenAI-compatible /v1/audio/speech (9Router dkk). Fallback edge
// otomatis bila custom gagal. Return data-URL audio atau null.
on('tts-speak', async (text, rate, pitch) => {
  const conf = getGlobalConfig() || {}
  if (conf.ttsProvider === 'custom') {
    const endpoint = resolveTtsEndpointUrl(conf.customTtsEndpoint)
    if (endpoint) {
      try {
        return await speakViaOpenAiCompatible({ endpoint, apiKey: conf.customTtsApiKey, model: conf.customTtsModel, text })
      } catch (error) {
        console.error('[engine] TTS custom gagal, fallback edge:', error.message)
      }
    }
  }
  return speakViaEdge(text, rate, pitch)
})

function resolveTtsEndpointUrl(raw) {
  const base = canonicalizeEndpointUrl(raw, 'tts')
  if (!base) return ''
  if (/\/v\d+$/.test(base)) return `${base}/audio/speech`
  return `${base}/v1/audio/speech`
}

async function speakViaOpenAiCompatible({ endpoint, apiKey, model, text }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey && apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: model || 'tts-1', input: String(text || ''), voice: 'alloy', response_format: 'mp3' }),
      signal: controller.signal
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200) || res.statusText}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('response body kosong')
    return `data:audio/mp3;base64,${buf.toString('base64')}`
  } finally {
    clearTimeout(timer)
  }
}

async function speakViaEdge(text, rate, pitch) {
  try {
    if (!globalTTS) {
      const mod = await import('msedge-tts')
      const MsEdgeTTS = mod.MsEdgeTTS || mod.default?.MsEdgeTTS || mod.default
      const OUTPUT_FORMAT = mod.OUTPUT_FORMAT || mod.default?.OUTPUT_FORMAT || {}
      globalTTS = new MsEdgeTTS()
      await globalTTS.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 || 'audio-24khz-48kbitrate-mono-mp3')
    }
    const tmpPath = path.join(os.tmpdir(), 'abelink-tts-folder')
    fs.mkdirSync(tmpPath, { recursive: true })
    const { audioFilePath } = await globalTTS.toFile(tmpPath, text, {
      rate: `${rate || 0}%`,
      pitch: `${pitch || 0}Hz`
    })
    const audioData = fs.readFileSync(audioFilePath)
    const base64Audio = `data:audio/mp3;base64,${audioData.toString('base64')}`
    fs.unlinkSync(audioFilePath)
    return base64Audio
  } catch (error) {
    console.error('[engine] TTS gagal:', error.message)
    return null
  }
}

on('get-youtube-transcript', async (url) => {
  const yt = await getYt()
  const transcript = await yt.fetchTranscript(url)
  return transcript
    .filter((_, index) => index % 2 === 0)
    .map((item) => {
      const minutes = Math.floor(item.offset / 60)
      const seconds = Math.floor(item.offset % 60)
      return `[${minutes}:${String(seconds).padStart(2, '0')}] ${item.text}`
    })
    .join(' ')
})

on('youtube-search', async (query) => {
  const yts = await getYts()
  const ytData = await yts(query)
  return ytData.videos.slice(0, 4).map((item) => ({
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
    title: item.title,
    thumbnail: item.thumbnail,
    duration: item.duration,
    author: item.author?.name
  }))
})
