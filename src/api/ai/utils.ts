import { getAllConfig } from '../db'

declare global {
  interface Window {
    isAbelinkSpeaking?: boolean
    abelinkTtsEndedAt?: number
  }
}

export const getCurrentTimeInfo = (dateObj: Date = new Date()) => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  }
  return dateObj.toLocaleDateString('id-ID', options)
}




let ttsAudioContext: AudioContext | null = null;

export const cleanTtsText = (text: unknown) => {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(/```[\s\S]*?```/g, '') // buang code block
    .replace(/`([^`]+)`/g, '$1')     // buang inline code backtick
    .replace(/#{1,6}\s+/g, '')       // buang heading
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // buang bold/italics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // buang markdown link, ambil labelnya
    .replace(/^[*\-+]\s+/gm, '')     // buang bullet list
    .replace(/^\d+\.\s+/gm, '')      // buang numbered list
    .replace(/<[^>]+>/g, '')         // buang tag html/jsx
    .replace(/\s+/g, ' ')            // normalisasi spasi berlebih
    .trim()
}

export const playVoice = async (text: string, onStart?: () => void, onEnd?: () => void) => {
  type TtsBridge = {
    textToSpeech: (text: string, rate: unknown, pitch: unknown) => Promise<string | null>
    showNotification?: (title: string, body: string) => void
  }
  const bridge = (typeof window !== 'undefined' ? (window as unknown as { api?: TtsBridge }).api : undefined)
  try {
    const config = await getAllConfig()
    const rate = config[0]?.ttsRate ?? 0
    const pitch = config[0]?.ttsPitch ?? 0

    const cleanedText = cleanTtsText(text)
    if (!cleanedText) {
      onEnd?.()
      return
    }

    // 1. Minta data audio (base64) ke backend
    const audioBase64 = await bridge?.textToSpeech(cleanedText, rate, pitch)

    if (audioBase64) {
      // 2. Bikin object Audio baru dari string base64 tadi
      const audio = new Audio(String(audioBase64))
      audio.crossOrigin = "anonymous"

      // Setup Web Audio API for Intensity Extraction
      if (!ttsAudioContext) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctor) ttsAudioContext = new Ctor()
      }
      if (!ttsAudioContext) return
      if (ttsAudioContext.state === 'suspended') {
        await ttsAudioContext.resume()
      }

      const source = ttsAudioContext.createMediaElementSource(audio)
      const analyser = ttsAudioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      analyser.connect(ttsAudioContext.destination)

      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)
      let animationId: number | null = null

      const updateIntensity = (): void => {
        if (!window.isAbelinkSpeaking) return
        analyser.getFloatTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / bufferLength)
        
        // Normalisasi RMS untuk visualisasi (RMS biasanya berkisar antara 0.01 - 0.15)
        const normalized = Math.min(1, Math.max(0, rms - 0.01) * 8)
        window.dispatchEvent(new CustomEvent('abelink-intensity', { detail: normalized }))
        animationId = requestAnimationFrame(updateIntensity)
      }

      audio.onended = () => {
        window.isAbelinkSpeaking = false
        // Stempel akhir TTS: VAD menunda auto-restart 800ms agar ekor
        // audio speaker tak tertangkap mic sebagai "ucapan" (loopback).
        window.abelinkTtsEndedAt = Date.now()
        window.dispatchEvent(new CustomEvent('abelink-intensity', { detail: 0 }))
        if (animationId) cancelAnimationFrame(animationId)
        if (onEnd) onEnd()
      }

      // 3. Mainkan!
      window.isAbelinkSpeaking = true
      await audio.play()
      updateIntensity()
      if (onStart) onStart()
    } else {
      if (onStart) onStart()
      if (onEnd) onEnd()
    }
  } catch (error) {
    console.error('Gagal memutar suara:', error)
    if (bridge?.showNotification) {
      bridge.showNotification('Error TTS', String((error as Error)?.message || error))
    }
    window.isAbelinkSpeaking = false
    window.dispatchEvent(new CustomEvent('abelink-intensity', { detail: 0 }))
    if (onStart) onStart()
    if (onEnd) onEnd()
  }
}

// ==========================================
// TELEGRAM UTILS
// ==========================================
