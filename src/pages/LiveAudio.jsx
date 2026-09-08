import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import { getAllConfig } from '../api/db'
import { transcribeAudioLocal } from '../api/localWhisper'
import { transcribeAudioGroq } from '../api/groq'
import { resolveMicConstraints, micCoolingDown, noteMicFailure } from '../api/mic'
import { FaChevronLeft, FaMicrophone, FaStop, FaExclamationTriangle, FaBolt } from 'react-icons/fa'

const LiveAudio = () => {
  const {
    chatData,
    setChatData,
    isLoading,
    isSpeak,
    setIsSpeak,
    message,
    setMessage,
    handleSubmit,
    handlePlanningCommand,
    abortControllerRef,
    config
  } = useChat()
  const chatEndRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [audioIntensity, setAudioIntensity] = useState(0)
  const timeoutsRef = useRef(null)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)
  const prevChatLengthRef = useRef(chatData.length)
  
  const [toastMessage, setToastMessage] = useState('')

  // Local Whisper STT Refs (Now used for Audio Context VAD)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const audioChunksRef = useRef([])
  const silenceTimerRef = useRef(null)
  
  // Inisialisasi dengan pesan terakhir agar saat LiveAudio dibuka, tidak memutar ulang pesan lama
  const lastSpokenMessageContentRef = useRef(
    chatData.length > 0 && chatData[chatData.length - 1].role === 'ai'
      ? chatData[chatData.length - 1].content
      : null
  )

  const stopRecordingCleanup = () => {
    const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
    
    // Jika dipanggil saat mau dimatikan secara manual dan ada data audio,
    // kembalikan merged array agar bisa ditranskrip sebelum dihapus
    let pendingAudio = null;
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
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }
    isSpeakingRef.current = false
    audioChunksRef.current = []
    
    return pendingAudio;
  }

  // Bersihkan mic saat unmount
  useEffect(() => {
    return () => stopRecordingCleanup()
  }, [])

  // Auto-start dari Global Shortcut / System Tray
  useEffect(() => {
    if (location.state?.autoStart) {
      if (!isActive) {
        handleMicToggle()
      }
      // Hapus state dari React Router secara benar agar tidak loop
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, isActive, navigate])

  // Refs untuk mengatasi stale closure pada event listener STT
  const isActiveRef = useRef(isActive)
  const statusRef = useRef(status)

  useEffect(() => {
    isActiveRef.current = isActive
    statusRef.current = status
  }, [isActive, status])

  // Pastikan isSpeak dari ChatContext dimatikan agar tidak double playback
  // karena LiveAudio menghandle playback-nya sendiri
  useEffect(() => {
    setIsSpeak(false)
  }, [setIsSpeak])

  const isStartingRef = useRef(false)

  // Speech envelope generator saat Mark berbicara agar visualizer Jarvis berdenyut reaktif
  useEffect(() => {
    if (status !== 'speaking') {
      if (status === 'idle') setAudioIntensity(0)
      return
    }
    let frameId
    let t = 0
    const animateSpeaking = () => {
      t += 0.18
      const simulated = Math.abs(Math.sin(t) * 0.45 + Math.sin(t * 2.1) * 0.35 + Math.cos(t * 0.6) * 0.2)
      setAudioIntensity(Math.min(1, Math.max(0.15, simulated)))
      frameId = requestAnimationFrame(animateSpeaking)
    }
    frameId = requestAnimationFrame(animateSpeaking)
    return () => cancelAnimationFrame(frameId)
  }, [status])

  const transcribeSpeech = async (pcmBuffer) => {
    const configList = await getAllConfig()
    const cfg = configList[0] || {}
    const sttEngine = cfg.localWhisperModel || 'whisper-small'

    if (sttEngine === 'groq-whisper' || !sttEngine.startsWith('whisper-')) {
      if (cfg.groqApiKey) {
        return await transcribeAudioGroq(pcmBuffer)
      }
    }

    try {
      return await transcribeAudioLocal(pcmBuffer)
    } catch (localErr) {
      if (cfg.groqApiKey) {
        console.warn('[LiveAudio] Local Whisper gagal, otomatis fallback ke Groq Whisper:', localErr.message || localErr)
        return await transcribeAudioGroq(pcmBuffer)
      }
      throw localErr
    }
  }

  const handleMicToggle = async () => {
    if (isActive) {
      // Dapatkan pending audio yang sempat terekam sebelum dimatikan
      const pendingAudio = stopRecordingCleanup()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setIsActive(false)
      
      // Jika ada audio yang sempat ngomong sebelum dimatikan paksa, transkrip!
      if (pendingAudio) {
        setStatus('thinking')
        
        // Memberikan jeda 150ms agar UI React sempat re-render sebelum thread diblokir
        setTimeout(() => {
          transcribeSpeech(pendingAudio)
            .then(text => {
              if (text && text.trim() !== '') {
                setMessage(text.trim())
                const prefixed = `(Hasil STT) ${text.trim()}`
                handlePlanningCommand(prefixed, null, false, null, { forceSpeak: true })
              } else {
                setStatus('idle')
              }
            })
            .catch(err => {
              console.error('[LiveAudio] STT Error:', err)
              setStatus('idle')
            })
        }, 150)
      } else {
        setStatus('idle')
      }
    } else {
      if (isStartingRef.current) return
      isStartingRef.current = true

      try {
        stopRecordingCleanup()
        
        const micId = config[0]?.micDeviceId
        // Cooldown global bersama useVAD: satu kegagalan = diam 60 detik.
        if (micCoolingDown()) {
          isStartingRef.current = false
          return
        }
        const constraints = await resolveMicConstraints(micId, {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        })
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (err) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          } catch (fallbackErr) {
            noteMicFailure()
            console.warn('[LiveAudio] getUserMedia gagal:', fallbackErr.message || fallbackErr)
            setToastMessage('Gagal mengakses mikrofon. Pastikan input audio aktif di sistem.')
            setTimeout(() => setToastMessage(''), 5000)
            setIsActive(false)
            setStatus('idle')
            isStartingRef.current = false
            return
          }
        }
        streamRef.current = stream

        const AudioContext = window.AudioContext || window.webkitAudioContext
        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        const gainNode = audioContext.createGain()
        gainNode.gain.value = 0 // Mute output to speakers

        source.connect(processor)
        processor.connect(gainNode)
        gainNode.connect(audioContext.destination)

        processor.onaudioprocess = (e) => {
          // Jika AI sedang berbicara atau berpikir, kita pause VAD (kecuali untuk barge-in)
          if (statusRef.current === 'speaking' || statusRef.current === 'thinking') {
            const input = e.inputBuffer.getChannelData(0)
            let sum = 0
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
            const rms = Math.sqrt(sum / input.length)
            
            // Barge-in threshold: jika user teriak / bicara keras saat Mark bicara
            if (statusRef.current === 'speaking' && rms > 0.05) {
              if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current = null
              }
              setStatus('listening')
            }
            return
          }

          const input = e.inputBuffer.getChannelData(0)
          let sum = 0
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
          const rms = Math.sqrt(sum / input.length)

          // Audio intensity untuk Jarvis visualizer (0.01 - 0.15 normalized ke 0.0 - 1.0)
          const normalized = Math.min(1, Math.max(0, (rms - 0.01) * 12))
          setAudioIntensity(normalized)

          // Threshold suara (VAD sederhana) diturunkan agar lebih sensitif
          if (rms > 0.01) {
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true
              audioChunksRef.current = []
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            
            silenceTimerRef.current = setTimeout(() => {
              isSpeakingRef.current = false
              
              const totalLength = audioChunksRef.current.reduce((acc, val) => acc + val.length, 0)
              // Minimal 0.5 detik audio untuk dikirim ke Whisper (8000 samples @ 16kHz)
              if (totalLength < 8000) {
                 return // Abaikan noise singkat
              }
              
              const merged = new Float32Array(totalLength)
              let offset = 0
              for (let arr of audioChunksRef.current) {
                merged.set(arr, offset)
                offset += arr.length
              }
              
              setStatus('thinking')
              
              // Memberikan jeda 150ms agar UI React sempat re-render sebelum thread diblokir
              setTimeout(() => {
                transcribeSpeech(merged)
                  .then(text => {
                    if (text && text.trim() !== '') {
                      setMessage(text.trim())
                      const prefixed = `(Hasil STT) ${text.trim()}`
                      handlePlanningCommand(prefixed, null, false, null, { forceSpeak: true })
                    } else {
                      setStatus('listening')
                    }
                  })
                  .catch(err => {
                    console.error('[LiveAudio] STT Error:', err)
                    setToastMessage(`Gagal memproses ucapan: ${err.message || err}`)
                    setTimeout(() => setToastMessage(''), 5000)
                    setStatus('listening')
                  })
              }, 150)
              
            }, 1200) // Diam 1.2 detik = kirim ke STT
          }

          if (isSpeakingRef.current) {
            audioChunksRef.current.push(new Float32Array(input))
          }
        }

        setIsActive(true)
        setStatus('listening')
        isStartingRef.current = false
      } catch (error) {
        // Gagal mic: toast (bukan alert blocking) + cooldown global.
        noteMicFailure()
        console.warn('[LiveAudio] getUserMedia gagal:', error?.message || error)
        setToastMessage('Gagal mengakses mikrofon. Pastikan izin diberikan.')
        setTimeout(() => setToastMessage(''), 5000)
        setIsActive(false)
        setStatus('idle')
        isStartingRef.current = false
      }
    }
  }

  // Memantau chatData untuk auto-play respons TTS
  useEffect(() => {
    if (!isActive) return
    
    if (chatData.length > 0) {
      const lastMsg = chatData[chatData.length - 1]
      // Jika pesan terakhir dari AI dan bukan status 'thinking'
      if (lastMsg && lastMsg.role === 'ai' && !lastMsg.isThinking && !lastMsg.isSearching && !lastMsg.isSummarizing && !lastMsg.isSearchingMusic) {
        // Cek apakah pesan ini sudah diucapkan agar tidak dobel
        if (lastSpokenMessageContentRef.current !== lastMsg.content) {
          lastSpokenMessageContentRef.current = lastMsg.content
          playAIResponse(lastMsg.content)
        }
      }
    }
  }, [chatData, isActive, status])

  const playAIResponse = async (text) => {
    try {
      setStatus('speaking')
      const configList = await getAllConfig()
      const rate = configList[0]?.ttsRate ?? 0
      const pitch = configList[0]?.ttsPitch ?? 0

      // Bersihkan markdown atau token tag sebelum dikirim ke TTS
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#+\s/g, '')
        .trim()

      if (!cleanText) {
        setStatus('listening')
        return
      }

      const audioBase64 = await window.api.textToSpeech(cleanText, rate, pitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audioRef.current = audio

        audio.onended = () => {
          setStatus('listening')
        }
        audio.onerror = (e) => {
          console.warn('[LiveAudio] Audio playback error:', e)
          setStatus('listening')
        }
        try {
          await audio.play()
        } catch (playErr) {
          console.warn('[LiveAudio] audio.play() error:', playErr)
          setStatus('listening')
        }
      } else {
        setStatus('listening')
      }
    } catch (e) {
      console.error('[LiveAudio] TTS Error:', e)
      setStatus('listening')
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Tap untuk mulai bicara'
      case 'listening':
        return 'Mendengarkan...'
      case 'thinking':
        return 'Mark sedang memikirkan balasan...'
      case 'speaking':
        return 'Mark sedang berbicara...'
      default:
        return 'Tap untuk mulai bicara'
    }
  }

  const getStatusSubtext = () => {
    switch (status) {
      case 'idle':
        return 'Tekan tombol mikrofon untuk memulai percakapan live dengan Mark'
      case 'listening':
        return 'Silakan bicara, Mark sedang mendengarkan'
      case 'thinking':
        return 'Tunggu sebentar, Mark sedang memproses ucapanmu'
      case 'speaking':
        return 'Tunggu sebentar, Mark sedang merespon'
      default:
        return ''
    }
  }

  return (
    <div className="h-screen bg-base-300 text-white overflow-hidden relative font-['Poppins',sans-serif] flex flex-col items-center justify-center">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl transition-all duration-1000 ${isActive ? 'scale-110 bg-primary/10' : 'scale-100'}`}
        />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-success/5 blur-3xl transition-all duration-1000 delay-200 ${isActive ? 'scale-125 bg-success/10' : 'scale-100'}`}
        />
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 btn btn-ghost btn-sm gap-2 z-20 opacity-60 hover:opacity-100 transition-opacity"
      >
        <FaChevronLeft size={14} />
        Kembali
      </button>

      {/* Header */}
      <div className="relative z-10 text-center mb-8 select-none">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <FaMicrophone className="text-primary" size={20} />
          </div>
          <h1 className="text-2xl font-bold">Live Audio</h1>
        </div>
        <p className="text-sm opacity-50">Percakapan suara real-time dengan Mark</p>
      </div>

      {/* JARVIS / MARK CYBERNETIC ORB VISUALIZER */}
      <div className="relative z-10 flex items-center justify-center mb-8 select-none">
        {/* Outer Telemetry Arc Reactor HUD (SVG) */}
        <div className="relative w-80 h-80 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 320">
            {/* Outer Orbit Track */}
            <circle
              cx="160"
              cy="160"
              r="152"
              fill="none"
              stroke="currentColor"
              className={`transition-colors duration-700 ${
                status === 'speaking'
                  ? 'text-cyan-400/40'
                  : status === 'listening'
                    ? 'text-emerald-400/40'
                    : status === 'thinking'
                      ? 'text-amber-400/40'
                      : 'text-cyan-600/20'
              }`}
              strokeWidth="1"
              strokeDasharray="4 8"
            />
            {/* Rotating Segmented Ring 1 (Clockwise) */}
            <g className={isActive ? 'animate-[spin_30s_linear_infinite] origin-center' : 'origin-center'}>
              <circle
                cx="160"
                cy="160"
                r="140"
                fill="none"
                stroke="currentColor"
                className={`transition-colors duration-700 ${
                  status === 'speaking'
                    ? 'text-cyan-400/60'
                    : status === 'listening'
                      ? 'text-emerald-400/60'
                      : status === 'thinking'
                        ? 'text-purple-400/60'
                        : 'text-cyan-500/20'
                }`}
                strokeWidth="1.5"
                strokeDasharray="60 30 15 30 90 20"
              />
              {/* Arc Reactor Ticks */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1="160"
                  y1="16"
                  x2="160"
                  y2="24"
                  stroke="currentColor"
                  className={isActive ? 'text-cyan-400/70' : 'text-white/20'}
                  strokeWidth="2"
                  transform={`rotate(${deg} 160 160)`}
                />
              ))}
            </g>

            {/* Counter-Rotating Segmented Ring 2 */}
            <g className={isActive ? 'animate-[spin_20s_linear_infinite_reverse] origin-center' : 'origin-center'}>
              <circle
                cx="160"
                cy="160"
                r="124"
                fill="none"
                stroke="currentColor"
                className={`transition-colors duration-700 ${
                  status === 'speaking'
                    ? 'text-teal-300/60'
                    : status === 'listening'
                      ? 'text-emerald-300/60'
                      : status === 'thinking'
                        ? 'text-amber-300/60'
                        : 'text-cyan-400/20'
                }`}
                strokeWidth="2"
                strokeDasharray="40 40 80 20"
              />
            </g>

            {/* Inner Gyroscopic Gyro Ring (Fast Spin when thinking) */}
            <g className={status === 'thinking' ? 'animate-[spin_4s_linear_infinite] origin-center' : isActive ? 'animate-[spin_12s_linear_infinite] origin-center' : 'origin-center'}>
              <circle
                cx="160"
                cy="160"
                r="108"
                fill="none"
                stroke="currentColor"
                className={`transition-colors duration-700 ${
                  status === 'speaking'
                    ? 'text-cyan-300'
                    : status === 'listening'
                      ? 'text-emerald-400'
                      : status === 'thinking'
                        ? 'text-amber-400'
                        : 'text-cyan-500/30'
                }`}
                strokeWidth="1"
                strokeDasharray="8 6"
              />
            </g>
          </svg>

          {/* Dynamic Audio Ripple Waves */}
          {isActive && (
            <>
              <div
                className={`absolute rounded-full pointer-events-none transition-all duration-300 ${
                  status === 'speaking'
                    ? 'border border-cyan-400/30 shadow-[0_0_30px_rgba(34,211,238,0.2)]'
                    : status === 'listening'
                      ? 'border border-emerald-400/30 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
                      : 'border border-amber-400/30 shadow-[0_0_30px_rgba(251,191,36,0.2)]'
                }`}
                style={{
                  width: `${190 + audioIntensity * 80}px`,
                  height: `${190 + audioIntensity * 80}px`,
                  opacity: Math.max(0.2, audioIntensity * 0.8)
                }}
              />
              <div
                className="absolute rounded-full border border-white/10 pointer-events-none transition-all duration-500"
                style={{
                  width: `${210 + audioIntensity * 100}px`,
                  height: `${210 + audioIntensity * 100}px`,
                  opacity: Math.max(0.1, audioIntensity * 0.5)
                }}
              />
            </>
          )}

          {/* Glowing Arc Reactor Plasma Sphere */}
          <div
            className={`relative w-44 h-44 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300 shadow-2xl ${
              status === 'speaking'
                ? 'bg-radial from-cyan-400/30 via-sky-600/20 to-teal-950/80 border-2 border-cyan-300/80 shadow-[0_0_50px_rgba(34,211,238,0.5)]'
                : status === 'listening'
                  ? 'bg-radial from-emerald-400/30 via-teal-600/20 to-slate-950/80 border-2 border-emerald-400/80 shadow-[0_0_50px_rgba(52,211,153,0.5)]'
                  : status === 'thinking'
                    ? 'bg-radial from-amber-400/30 via-purple-700/30 to-slate-950/80 border-2 border-amber-400/80 shadow-[0_0_50px_rgba(251,191,36,0.5)]'
                    : 'bg-radial from-cyan-900/20 via-slate-900/40 to-slate-950/80 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)]'
            }`}
            style={{
              transform: `scale(${1 + audioIntensity * 0.22})`
            }}
          >
            {/* Center Core Reactor Eye */}
            <div
              className={`w-28 h-28 rounded-full flex items-center justify-center border transition-all duration-500 ${
                status === 'speaking'
                  ? 'border-cyan-300/50 bg-cyan-500/20 shadow-[inset_0_0_25px_rgba(34,211,238,0.6)]'
                  : status === 'listening'
                    ? 'border-emerald-300/50 bg-emerald-500/20 shadow-[inset_0_0_25px_rgba(52,211,153,0.6)]'
                    : status === 'thinking'
                      ? 'border-amber-300/50 bg-amber-500/20 shadow-[inset_0_0_25px_rgba(251,191,36,0.6)]'
                      : 'border-cyan-500/20 bg-cyan-950/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.2)]'
              }`}
            >
              {/* Jarvis Audio Frequency Equalizer Waves */}
              <div className="flex items-center gap-1.5 h-14">
                {[0.4, 0.7, 1.0, 0.8, 1.2, 0.9, 0.6, 1.1, 0.5].map((factor, idx) => {
                  const barHeight = isActive
                    ? Math.max(8, Math.min(48, Math.round(12 + audioIntensity * 36 * factor)))
                    : 6
                  return (
                    <div
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        status === 'speaking'
                          ? 'bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                          : status === 'listening'
                            ? 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                            : status === 'thinking'
                              ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                              : 'bg-cyan-600/40'
                      }`}
                      style={{ height: `${barHeight}px` }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Inner Core Pulse Dot */}
            <div
              className={`absolute w-3 h-3 rounded-full transition-transform duration-100 ${
                status === 'speaking'
                  ? 'bg-cyan-200 shadow-[0_0_12px_#67e8f9]'
                  : status === 'listening'
                    ? 'bg-emerald-200 shadow-[0_0_12px_#6ee7b7]'
                    : status === 'thinking'
                      ? 'bg-amber-200 shadow-[0_0_12px_#fde68a]'
                      : 'bg-cyan-500/40'
              }`}
              style={{
                transform: `scale(${1 + audioIntensity * 0.8})`
              }}
            />
          </div>

          {/* Jarvis Telemetry Badges */}
          <div className="absolute -top-7 text-[10px] font-mono tracking-widest text-cyan-400/70 uppercase flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
            <span>JARVIS // MARK CORE</span>
          </div>
          <div className="absolute -bottom-7 text-[10px] font-mono tracking-wider text-white/40 uppercase">
            {status === 'speaking' ? 'SYNTH // VOCALIZING' : status === 'listening' ? `AUDIO // LEVEL ${Math.round(audioIntensity * 100)}%` : status === 'thinking' ? 'NEURAL // REASONING' : 'STANDBY // READY'}
          </div>
        </div>
      </div>

      {/* Status text */}
      <div className="relative z-10 text-center mb-12 select-none">
        <p
          className={`text-lg font-semibold mb-1 transition-colors duration-300 ${
            status === 'listening'
              ? 'text-primary'
              : status === 'speaking'
                ? 'text-success'
                : 'text-white/60'
          }`}
        >
          {getStatusText()}
        </p>
        <p className="text-sm opacity-40 max-w-xs">{getStatusSubtext()}</p>
      </div>

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center">
        <button
          onClick={handleMicToggle}
          className={`relative w-18 h-18 rounded-full flex items-center justify-center transition-all duration-500 active:scale-95 ${
            isActive
              ? 'bg-error shadow-[0_0_20px_oklch(var(--er)/0.4)] hover:bg-error/90'
              : 'bg-primary shadow-[0_0_20px_oklch(var(--p)/0.4)] hover:bg-primary/90'
          }`}
        >
          {isActive ? (
            <FaStop className="text-white" size={24} />
          ) : (
            <FaMicrophone className="text-white" size={24} />
          )}
        </button>

        {/* Active ring animation around mic button */}
        {isActive && (
          <div className="absolute top-0 w-18 h-18 rounded-full border-2 border-error/50 audio-pulse-ring pointer-events-none" />
        )}
      </div>

      {/* Bottom hint */}
      <p className="relative z-10 mt-8 text-xs opacity-30 select-none">
        {isActive ? 'Tekan tombol untuk menghentikan' : 'Pastikan mikrofon sudah tersambung'}
      </p>

      {/* Floating Toast Error */}
      {toastMessage && (
        <div className="toast toast-top toast-center z-50 animate-bounce">
          <div className="alert alert-error text-sm font-semibold shadow-2xl flex gap-2 items-center">
            <FaExclamationTriangle size={18} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveAudio
