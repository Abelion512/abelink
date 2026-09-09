import { useState, useRef, useEffect } from 'react'
import { getAllConfig } from '../api/db'
import { transcribeAudioUnified } from '../api/sttRouter'
import { resolveMicConstraints, micCoolingDown, noteMicFailure } from '../api/mic'

// Resampling linear audio PCM Float32Array dari sampleRate asal ke 16,000 Hz target Whisper
function resampleTo16k(audioBuffer, origSampleRate) {
  if (!origSampleRate || origSampleRate === 16000 || audioBuffer.length === 0) {
    return audioBuffer
  }
  const ratio = origSampleRate / 16000
  const newLength = Math.round(audioBuffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const origIdx = i * ratio
    const idxFloor = Math.floor(origIdx)
    const idxCeil = Math.min(audioBuffer.length - 1, idxFloor + 1)
    const fraction = origIdx - idxFloor
    result[i] = audioBuffer[idxFloor] * (1 - fraction) + audioBuffer[idxCeil] * fraction
  }
  return result
}

export const useVAD = ({
  onTranscript // Function to call when STT finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const sampleRateRef = useRef(16000)
  const processorRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const audioChunksRef = useRef([])
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const silenceFramesRef = useRef(0)
  const isProcessingSpeechRef = useRef(false)

  const stopVADCleanup = () => {
    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)

    // Jika ada pending audio saat user menekan stop manual
    let pendingAudio = null
    if (totalLength >= 4000) {
      pendingAudio = new Float32Array(totalLength)
      let offset = 0
      for (let arr of audioChunksRef.current) {
        pendingAudio.set(arr, offset)
        offset += arr.length
      }
    }

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    isSpeakingRef.current = false
    audioChunksRef.current = []
    isRecordingRef.current = false
    setIsRecording(false)
    isStartingRef.current = false
    silenceFramesRef.current = 0
    isProcessingSpeechRef.current = false

    return pendingAudio
  }

  const finishSpeechAndTranscribe = (force = false) => {
    if (isProcessingSpeechRef.current) return
    isProcessingSpeechRef.current = true

    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
    const actualRate = sampleRateRef.current || 16000
    const minSamples = Math.round((force ? 0.12 : 0.25) * actualRate)

    if (totalLength < minSamples) {
      if (totalLength > 0) {
        console.log('[VAD] Audio terlalu singkat:', totalLength, 'sampel pada', actualRate, 'Hz')
      }
      isProcessingSpeechRef.current = false
      stopVADCleanup()
      return
    }

    const merged = new Float32Array(totalLength)
    let offset = 0
    for (let arr of audioChunksRef.current) {
      merged.set(arr, offset)
      offset += arr.length
    }

    // Resample buffer audio ke 16000Hz untuk pipeline Whisper
    const trimmedAudio = resampleTo16k(merged, actualRate)

    stopVADCleanup()
    setIsProcessing(true)

    setTimeout(async () => {
      try {
        console.log('[VAD] Memulai transkripsi STT, total sampel 16k:', trimmedAudio.length)
        const text = await executeSpeechToText(trimmedAudio)
        setIsProcessing(false)
        if (text && text.trim() !== '') {
          const cleanText = text.replace(
            /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
            'Abelink'
          )
          console.log('[VAD] Hasil transkripsi:', cleanText)
          onTranscript(cleanText.trim())
        } else {
          console.log('[VAD] Transkripsi menghasilkan teks kosong')
          setToastMessage('Suara tidak terdengar jelas. Coba ulangi.')
          setTimeout(() => setToastMessage(''), 4000)
        }
      } catch (err) {
        setIsProcessing(false)
        console.error('[VAD] STT Error:', err)
        setToastMessage(`Gagal memproses STT: ${err.message}`)
        setTimeout(() => setToastMessage(''), 5000)
      }
    }, 120)
  }

  // Unified Speech-to-Text Pipeline (Groq, Custom STT, Combo Fallback, Local)
  const executeSpeechToText = async (audioBuffer) => {
    return transcribeAudioUnified(audioBuffer, null, (msg) => {
      setToastMessage(msg)
    })
  }

  const startVADRecording = async () => {
    if (isStartingRef.current || isRecordingRef.current) return
    isStartingRef.current = true

    let isActive = true
    const currentStopVAD = stopVADCleanup

    try {
      stopVADCleanup()
      isStartingRef.current = true

      const config = await getAllConfig()
      if (!isActive || !isStartingRef.current) return

      const micId = config[0]?.micDeviceId
      const audioSettings = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }

      // Cooldown global: jangan spam getUserMedia tiap toggle saat mic mati.
      if (micCoolingDown()) {
        isStartingRef.current = false
        return
      }
      const constraints = await resolveMicConstraints(micId, audioSettings)
      if (!constraints) {
        noteMicFailure()
        // Host Linux tidak mendeteksi input mikrofon (0 audio devices); matikan VAD tanpa melempar error
        isStartingRef.current = false
        return
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (err) {
        // Fallback WebKitGTK / Linux: beberapa backend audio menolak DSP constraints (echoCancellation/noiseSuppression)
        // dengan "Invalid constraint". Coba fallback ke stream dasar { audio: true } sebelum menyerah.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (fallbackErr) {
          noteMicFailure()
          console.warn('[useVAD] getUserMedia gagal (no device?), matikan VAD:', fallbackErr.message || fallbackErr)
          isStartingRef.current = false
          return
        }
      }
      if (!stream) {
        isStartingRef.current = false
        return
      }
      if (!isActive || !isStartingRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      let audioContext = null
      try {
        audioContext = new AudioContext({ sampleRate: 16000 })
      } catch {
        audioContext = new AudioContext()
      }
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume()
        } catch (_) {}
      }
      audioContextRef.current = audioContext
      sampleRateRef.current = audioContext.sampleRate || 16000

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0 // Mute output

      source.connect(processor)
      processor.connect(gainNode)
      gainNode.connect(audioContext.destination)

      isRecordingRef.current = true
      setIsRecording(true)
      silenceFramesRef.current = 0

      // Each buffer is 4096 samples at 16000Hz = 0.256s (256ms)
      // 8 frames silence = ~2.0s silence
      const MAX_SILENCE_FRAMES = 8
      const RMS_THRESHOLD = 0.003 // Ambang batas lebih responsif untuk mikrofon Linux

      processor.onaudioprocess = (e) => {
        if (window.isMarkSpeaking || isProcessingSpeechRef.current) return

        const input = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)

        // Normalisasi RMS untuk visualisasi yang responsif terhadap bisikan maupun suara normal
        const normalized = Math.min(1, rms * 25)
        setAudioIntensity(Math.max(0, normalized))

        if (rms > RMS_THRESHOLD) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true
          }
          silenceFramesRef.current = 0
          audioChunksRef.current.push(new Float32Array(input))
        } else if (isSpeakingRef.current) {
          // Push low audio chunk so end of word isn't clipped
          audioChunksRef.current.push(new Float32Array(input))
          silenceFramesRef.current += 1

          // Total recording length check (hard max 15 seconds)
          const totalSamples = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
          if (silenceFramesRef.current >= MAX_SILENCE_FRAMES || totalSamples >= 240000) {
            finishSpeechAndTranscribe(false)
          }
        } else {
          // Rolling pre-roll buffer (maksimal 3 frame ~0.75s) agar suku kata awal tidak terpotong
          audioChunksRef.current.push(new Float32Array(input))
          if (audioChunksRef.current.length > 3) {
            audioChunksRef.current.shift()
          }
        }
      }
      isStartingRef.current = false
    } catch (error) {
      console.error('[VAD] Error starting mic:', error)
      currentStopVAD()
      setToastMessage('Gagal mengakses mikrofon.')
      setTimeout(() => setToastMessage(''), 5000)
    }
  }

  useEffect(() => {
    window.isVADRecording = isRecording
  }, [isRecording])

  const toggleRecording = () => {
    if (isRecordingRef.current) {
      const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
      const actualRate = sampleRateRef.current || 16000
      const minSamples = Math.round(0.15 * actualRate)

      if (isSpeakingRef.current && totalLength >= minSamples) {
        finishSpeechAndTranscribe(true)
      } else {
        stopVADCleanup()
      }
    } else {
      startVADRecording()
    }
  }

  useEffect(() => {
    return () => stopVADCleanup()
  }, [])

  return {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording: startVADRecording,
    stopRecording: () => finishSpeechAndTranscribe(true),
    cancelRecording: stopVADCleanup,
    toastMessage
  }
}
