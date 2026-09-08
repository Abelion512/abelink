import { useState, useRef, useEffect } from 'react'
import { transcribeAudioLocal } from '../api/localWhisper'
import { transcribeAudioGroq } from '../api/groq'
import { getAllConfig } from '../api/db'
import { resolveMicConstraints, micCoolingDown, noteMicFailure } from '../api/mic'

export const useVAD = ({
  onTranscript // Function to call when STT finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioIntensity, setAudioIntensity] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
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
    if (totalLength >= 8000) {
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

  const finishSpeechAndTranscribe = () => {
    if (isProcessingSpeechRef.current) return
    isProcessingSpeechRef.current = true

    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
    if (totalLength < 8000) {
      stopVADCleanup()
      return
    }

    const merged = new Float32Array(totalLength)
    let offset = 0
    for (let arr of audioChunksRef.current) {
      merged.set(arr, offset)
      offset += arr.length
    }

    // Hapus pemotongan silence agresif. Whisper bisa menangani sedikit silence di akhir.
    // Menyimpan sedikit silence di akhir justru mencegah plosif terakhir terpotong.
    const trimmedAudio = merged

    stopVADCleanup()
    setIsProcessing(true)

    setTimeout(async () => {
      try {
        const text = await executeSpeechToText(trimmedAudio)
        setIsProcessing(false)
        if (text && text.trim() !== '') {
          const cleanText = text.replace(
            /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
            'Mark'
          )
          onTranscript(cleanText.trim())
        }
      } catch (err) {
        setIsProcessing(false)
        console.error('[VAD] STT Error:', err)
        setToastMessage(`Gagal memproses STT: ${err.message}`)
        setTimeout(() => setToastMessage(''), 5000)
      }
    }, 150)
  }

  // ── Unified Robust Speech-to-Text Pipeline ──────────────────────────────
  const executeSpeechToText = async (audioBuffer) => {
    const config = await getAllConfig()
    const hasGroqKey = Boolean(config[0]?.groqApiKey?.trim())
    const configuredEngine = config[0]?.localWhisperModel
    const isGroqSelected = configuredEngine?.startsWith('groq')

    // Jika user secara eksplisit memilih Groq di Konfigurasi
    if (isGroqSelected) {
      if (!hasGroqKey) {
        throw new Error('Groq API Key belum disetel di Konfigurasi')
      }
      setToastMessage('Mentranskrip via Groq API...')
      try {
        const res = await transcribeAudioGroq(audioBuffer)
        setToastMessage('')
        return res
      } catch (err) {
        setToastMessage('')
        throw err
      }
    }

    // Default: Jalankan Local Whisper sesuai preferensi pengguna
    try {
      let highestProgress = 0
      const fileProgressMap = {}

      const text = await transcribeAudioLocal(audioBuffer, (progressData) => {
        if (progressData?.file && progressData.progress !== undefined) {
          fileProgressMap[progressData.file] = progressData.progress
          const vals = Object.values(fileProgressMap)
          const avg = Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(3, vals.length))
          // Progress monotonik: hanya naik, tidak pernah mundur
          if (avg > highestProgress) {
            highestProgress = Math.min(100, avg)
            setToastMessage(`Menyiapkan model AI Suara... ${highestProgress}%`)
          }
        }
      })
      setToastMessage('')
      return text
    } catch (localErr) {
      console.warn('[VAD] Local Whisper gagal:', localErr.message)
      if (hasGroqKey) {
        setToastMessage('Fallback ke Groq API...')
        try {
          const res = await transcribeAudioGroq(audioBuffer)
          setToastMessage('')
          return res
        } catch (groqErr) {
          setToastMessage('')
          throw groqErr
        }
      }
      throw new Error(`Whisper lokal gagal (${localErr.message || 'WASM SIMD tidak didukung'}). Masukkan Groq API Key di Konfigurasi jika ingin fallback cloud.`)
    }
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
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

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
      // 8 frames silence = ~2.0s silence (memberi waktu jeda nafas/berpikir sedikit)
      const MAX_SILENCE_FRAMES = 8
      const RMS_THRESHOLD = 0.01 // Diturunkan agar suara pelan/ujung kata tidak dianggap silence

      processor.onaudioprocess = (e) => {
        if (window.isMarkSpeaking || isProcessingSpeechRef.current) return

        const input = e.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)

        // Normalisasi RMS untuk visualisasi (RMS biasanya berkisar antara 0.01 - 0.15)
        const normalized = Math.min(1, (rms - RMS_THRESHOLD) * 15)
        setAudioIntensity(Math.max(0, normalized))

        if (rms > RMS_THRESHOLD) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true
            audioChunksRef.current = []
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
            finishSpeechAndTranscribe()
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
      const pendingAudio = stopVADCleanup()

      if (pendingAudio) {
        // Jika user secara eksplisit mematikan mic saat ngomong, transkrip!
        setIsProcessing(true)
        setTimeout(async () => {
          try {
            const text = await executeSpeechToText(pendingAudio)
            setIsProcessing(false)
            if (text && text.trim() !== '') {
              const cleanText = text.replace(
                /\b(mbak|mak|makh|marg|mart|marck|marc|mac|mag)\b/gi,
                'Mark'
              )
              onTranscript(cleanText.trim())
            }
          } catch (err) {
            setIsProcessing(false)
            console.error('[VAD] STT Error:', err)
            setToastMessage(`Gagal memproses STT: ${err.message}`)
            setTimeout(() => setToastMessage(''), 5000)
          }
        }, 150)
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
    stopRecording: finishSpeechAndTranscribe,
    toastMessage
  }
}
