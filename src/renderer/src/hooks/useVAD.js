import { useState, useRef, useEffect } from 'react'
import { transcribeAudioGroq } from '../api/groq'

import { getAllConfig } from '../api/db'

export const useVAD = ({
  onTranscript // Function to call when STT finishes
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const audioChunksRef = useRef([])
  const silenceTimerRef = useRef(null)
  const isStartingRef = useRef(false)
  const isRecordingRef = useRef(false)
  // ==========================================
  // VAD & GROQ WHISPER RECORDING
  // ==========================================
  const stopVADCleanup = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }
    isSpeakingRef.current = false
    audioChunksRef.current = []
    isRecordingRef.current = false
    setIsRecording(false)
    isStartingRef.current = false
  }

  const startVADRecording = async () => {
    if (isStartingRef.current || isRecordingRef.current) return
    isStartingRef.current = true

    try {
      stopVADCleanup()
      
      const config = await getAllConfig()
      const micId = config[0]?.micDeviceId
      const constraints = {
        audio: micId && micId !== 'default' 
          ? { deviceId: { exact: micId } } 
          : true
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0 // Mute output

      // AudioWorklet (replace deprecated ScriptProcessorNode)
      const workletCode = `
class VADProcessor extends AudioWorkletProcessor {
  constructor() { super(); }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);
    this.port.postMessage({ rms, samples: channel.buffer }, [channel.buffer]);
    return true;
  }
}
registerProcessor('vad-processor', VADProcessor);
`

      const blob = new Blob([workletCode], { type: 'application/javascript' })
      const blobUrl = URL.createObjectURL(blob)
      await audioContext.audioWorklet.addModule(blobUrl)
      URL.revokeObjectURL(blobUrl)

      const workletNode = new AudioWorkletNode(audioContext, 'vad-processor', {
        processorOptions: { threshold: 0.015 }
      })
      workletNodeRef.current = workletNode

      source.connect(workletNode)
      workletNode.connect(gainNode)
      gainNode.connect(audioContext.destination)

      isRecordingRef.current = true
      setIsRecording(true)

      workletNode.port.onmessage = (e) => {
        if (window.isMarkSpeaking) return

        const { rms, samples } = e.data
        const input = new Float32Array(samples)

        if (rms > 0.015) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true
            audioChunksRef.current = []
          }
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

          silenceTimerRef.current = setTimeout(() => {
            isSpeakingRef.current = false

            const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
            if (totalLength < 8000) {
               stopVADCleanup()
               // Restart VAD silently if too short
               setTimeout(() => startVADRecording(), 300)
               return
            }

            const merged = new Float32Array(totalLength)
            let offset = 0
            for (let arr of audioChunksRef.current) {
              merged.set(arr, offset)
              offset += arr.length
            }

            // Buang 1.5 detik keheningan di akhir (1.5 * 16000 = 24000 samples)
            // Biar Whisper nggak halusinasi nyetak huruf berulang ("AAR AAR", "OI MI MAI") gara-gara denger desis kosong.
            const trimLength = Math.max(8000, merged.length - 24000)
            const trimmedAudio = merged.subarray(0, trimLength)

            stopVADCleanup()

            // Send to Groq
            transcribeAudioGroq(trimmedAudio)
              .then(text => {
                if (text && text.trim() !== '') {
                  onTranscript(text.trim())
                }
              })
              .catch(err => {
                console.error('Groq Error:', err)
                if (err.message.includes('Key')) {
                  setToastMessage(err.message)
                  setTimeout(() => setToastMessage(''), 5000)
                }
              })

          }, 2000) // 2 detik diam = otomatis cut
        }

        if (isSpeakingRef.current) {
          audioChunksRef.current.push(input)
        }
      }
      isStartingRef.current = false
    } catch (error) {
      console.error('Error starting mic:', error)
      stopVADCleanup()
      setToastMessage('Gagal mengakses mikrofon.')
      setTimeout(() => setToastMessage(''), 5000)
    }
  }

  const toggleRecording = () => {
    // Override manual: If it's already recording, we can force-stop and send it immediately
    if (isRecordingRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
      if (totalLength >= 8000) {
        const merged = new Float32Array(totalLength)
        let offset = 0
        for (let arr of audioChunksRef.current) {
          merged.set(arr, offset)
          offset += arr.length
        }
        stopVADCleanup()
        transcribeAudioGroq(merged)
          .then(text => {
            if (text && text.trim() !== '') onTranscript(text.trim())
          })
          .catch(e => {
            console.error(e)
          })
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

  return { isRecording, toggleRecording, toastMessage }
}
