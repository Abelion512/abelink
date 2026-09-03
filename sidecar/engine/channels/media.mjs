// Channel: TTS, transkrip & pencarian YouTube.
// Modul ini hanya mendaftarkan handler; semua I/O via helper registry.
import { on, lazy } from '../registry.mjs'

const getYt = lazy(async () => {
  // Paket CJS: fungsi utama bisa di default atau namespace — normalkan.
  const m = await import('youtube-transcript-plus')
  return m.default ?? m
})
const getYts = lazy(async () => (await import('yt-search')).default)

let globalTTS
on('tts-speak', async (text, rate, pitch) => {
  try {
    if (!globalTTS) {
      const mod = await import('msedge-tts')
      const MsEdgeTTS = mod.default || mod.MsEdgeTTS
      const { OUTPUT_FORMAT } = mod
      globalTTS = new MsEdgeTTS()
      await globalTTS.setMetadata('id-ID-ArdiNeural', OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS)
    }
    const tmpPath = path.join(os.tmpdir(), 'mark-tts-folder')
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
})

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

import fs from 'fs'
import os from 'os'
import path from 'path'
