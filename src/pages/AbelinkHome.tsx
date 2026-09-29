import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChat } from '../contexts/useChat'
import OrbVisualizer from '../components/core/OrbVisualizer'
import JarvisOrb from '../components/core/JarvisOrb'
import InputBar from '../components/core/InputBar'
import { useManualCompaction } from '../hooks/useManualCompaction'
import ResponseArea from '../components/core/ResponseArea'
import { mapChatItemToResponse } from '../api/choiceBus'
import StatusIndicator from '../components/core/StatusIndicator'
import HistoryDrawer from '../components/core/HistoryDrawer'
import ProcessPanel from '../components/core/ProcessPanel'
import ThoughtNeuralFlow from '../components/core/ThoughtNeuralFlow'
import MemoryVisualizer from '../components/core/MemoryVisualizer'
import { ChatStudioModal } from '../components/core/ChatStudioModal'
import WindowControls from '../components/core/WindowControls'
import BootScreen from '../components/core/BootScreen'
import {
  Mic,
  MicOff,
  MessageSquare,
  Camera,
  Monitor,
  Square,
  Maximize2,
  Eye
} from 'lucide-react'
import LiteBadge from '../components/core/LiteBadge'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useVAD } from '../hooks/useVAD'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { db, setSessionWorkspace, getAllConfig, saveConfiguration } from '../api/db'
import { DEFAULT_STT_MODEL } from '../api/sttGuard'

/**
 * Deteksi apakah respons AI mengandung data terstruktur/kaya (rich content)
 * seperti tabel, kode, gambar, link, atau daftar data.
 * Sesuai aturan: pada mode Voice (Jarvis), teks percakapan biasa tidak ditampilkan
 * agar layar tetap bersih, KECUALI jika AI memberikan data terstruktur.
 */
const isRichContent = (text, resp) => {
  // Dukung rendering kartu jika respons membawa opsi ask-choice (seperti pemilihan track musik / OST)
  if (resp?.choice && Array.isArray(resp.choice.options) && resp.choice.options.length > 0) return true
  if (!text || typeof text !== 'string') return false
  // Jangan pernah buka tab samping untuk percakapan lisan biasa atau konfirmasi tool singkat
  if (text.includes('|') && text.includes('\n|')) return true // Tabel markdown terstruktur
  if (text.includes('```')) return true // Blok kode pemrograman
  if (text.includes('![') || text.includes('data:image/')) return true // Gambar visual
  const listCount = text.split('\n').filter((l) => l.trim().startsWith('- ') || l.trim().match(/^\d+\./)).length
  if (listCount >= 4) return true // Daftar panjang minimal 4 poin
  return false
}

const AbelinkHome = () => {
  const chatContext = useChat()
  const safeContext = chatContext ?? {}
  const {
    chatData = [],
    setChatData = () => {},
    message,
    setMessage = () => {},
    isLoading,
    isAgentBusy,
    setIsSpeak = () => {},
    handlePlanningCommand,
    orbStatus = 'idle',
    setOrbStatus = () => {},
    notifications,
    activeProcesses,
    dismissProcess,
    inputSource,
    handleStop,
    isBooting,
    config
  } = safeContext

  const { isPlaying, currentTrack } = useYoutubeMusic()
  useMemoryGroomer(true) // Hippocampus Engine

  const location = useLocation()
  const navigate = useNavigate()
  const isHomeRoute = location.pathname === '/'
  // ponytail: satu guard home-only untuk semua fixed chrome (kapsul mode,
  // kapsul studio/controls, drag strip, bottom bar). Home selalu mounted tapi
  // di-hidden di sub-page — tanpa ini fixed children menutupi semua page.

  // ── 4 MODE WORKSPACE: voice (Jarvis default) | chat | vision | screen ────
  const queryParams = new URLSearchParams(location.search)
  const initialMode =
    queryParams.get('mode') ||
    localStorage.getItem('abelink:preferred_mode') ||
    'voice'

  const [currentMode, setCurrentMode] = useState(initialMode)
  const [capsuleInput, setCapsuleInput] = useState('')
  const [orbStyle, setOrbStyle] = useState(() => {
    try {
      return localStorage.getItem('abelink:orb_style') || 'jarvis'
    } catch (_) {
      return 'jarvis'
    }
  })
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [showVoiceSetupModal, setShowVoiceSetupModal] = useState(false)
  // Watchdog independen: overlay boot TIDAK boleh nyangkut walau rantai
  // hook (greeting AI / compaction) hang. Hidup per-mount, mati sendiri.
  const [bootExpired, setBootExpired] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setBootExpired(true), 10000)
    return () => clearTimeout(t)
  }, [])

  // (Reset mute state & onboarding dipindah ke handleModeChange di atas.)

  // Drag / Slide with cursor handler untuk beralih Orb (klik biasa untuk toggle mic di mode voice)
  const dragStartXRef = useRef(null)
  const handleOrbMouseDown = (e) => {
    dragStartXRef.current = e.clientX
  }
  const handleOrbMouseUp = (e) => {
    if (dragStartXRef.current === null) return
    const deltaX = e.clientX - dragStartXRef.current
    if (Math.abs(deltaX) > 30) {
      const nextStyle = orbStyle === 'jarvis' ? 'abelink' : 'jarvis'
      setOrbStyle(nextStyle)
      try {
        localStorage.setItem('abelink:orb_style', nextStyle)
      } catch (_) {}
    } else if (currentMode === 'voice') {
      if (isRecording) {
        setIsMicMuted(true)
        cancelRecording()
      } else {
        setIsMicMuted(false)
        startRecording()
      }
    }
    dragStartXRef.current = null
  }
  const handleOrbTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      dragStartXRef.current = e.touches[0].clientX
    }
  }
  const handleOrbTouchEnd = (e) => {
    if (dragStartXRef.current === null) return
    if (e.changedTouches && e.changedTouches[0]) {
      const deltaX = e.changedTouches[0].clientX - dragStartXRef.current
      if (Math.abs(deltaX) > 30) {
        const nextStyle = orbStyle === 'jarvis' ? 'abelink' : 'jarvis'
        setOrbStyle(nextStyle)
        try {
          localStorage.setItem('abelink:orb_style', nextStyle)
        } catch (_) {}
      } else if (currentMode === 'voice') {
        if (isRecording) {
          setIsMicMuted(true)
          cancelRecording()
        } else {
          setIsMicMuted(false)
          startRecording()
        }
      }
    }
    dragStartXRef.current = null
  }

  const cancelRecordingRef = useRef(null)

  // Reset mute state & Smart Voice Onboarding saat berganti mode.
  // Dijalankan di dalam handler (bukan useEffect) agar tidak memicu
  // cascading renders react-hooks/set-state-in-effect.
  const maybeShowVoiceOnboarding = useCallback(() => {
    getAllConfig().then((cfgs) => {
      const c = cfgs[0] || {}
      const hasValidCustom =
        Array.isArray(c.sttConnections) &&
        c.sttConnections.some((conn) => conn.enabled && conn.endpoint?.trim())
      const hasLegacy = c.customSttEndpoint?.trim()
      const isWhisper = c.sttProvider === 'whisper'

      if (!hasValidCustom && !hasLegacy && !isWhisper) {
        setShowVoiceSetupModal(true)
      }
    })
  }, [])

  const handleModeChange = useCallback((newMode) => {
    cancelRecordingRef.current?.()
    setCurrentMode(newMode)
    setIsMicMuted(false)
    if (newMode === 'voice') {
      maybeShowVoiceOnboarding()
    }
    try {
      localStorage.setItem('abelink:preferred_mode', newMode)
    } catch (_) {}
  }, [maybeShowVoiceOnboarding])

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isChatStudioOpen, setIsChatStudioOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [, setIsMusicAnimatingOut] = useState(false)
  const [isMaxWindow, setIsMaxWindow] = useState(false)
  const [ttsIntensity, setTtsIntensity] = useState(0)
  const [workspaceRoot, setWorkspaceRoot] = useState(null)
  const [, setWinState] = useState({ isMaximized: false, isFullScreen: false })

  // ── Vision & Screen Share Refs & State ──────────────────────────────────
  const videoRef = useRef(null)
  const screenVideoRef = useRef(null)
  const [, setCamStream] = useState(null)
  const [camError, setCamError] = useState(null)
  const [isCamMirrored] = useState(() => {
    try {
      const saved = localStorage.getItem('abelink:camera_mirrored')
      return saved !== null ? saved === 'true' : true
    } catch (_) {
      return true
    }
  })
  const [screenStream, setScreenStream] = useState(null)
  const [screenError, setScreenError] = useState(null)
  const [liveScreenFrame, setLiveScreenFrame] = useState(null)
  const liveMirrorIntervalRef = useRef(null)
  const isScreenStreamingRef = useRef(false)
  const isCapturingTickRef = useRef(false)

  useEffect(() => {
    db.sessions
      .get(1)
      .then((s) => {
        if (s?.workspaceRoot) setWorkspaceRoot(s.workspaceRoot)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (window.api?.onWindowState) {
      window.api.onWindowState((s) => setWinState(s))
      window.api.getWindowState?.().then(setWinState)
    }
  }, [])

  const handleSelectWorkspace = async () => {
    if (window.api && window.api.selectDirectory) {
      const selected = await window.api.selectDirectory()
      if (selected) {
        await setSessionWorkspace(1, selected)
        setWorkspaceRoot(selected)
      }
    }
  }

  // ── TTS Sync & Intensity ────────────────────────────────────────────────
  useEffect(() => {
    const handleTtsIntensity = (e) => {
      setTtsIntensity(e.detail || 0)
      if (typeof setOrbStatus === 'function') {
        if (window.isAbelinkSpeaking) {
          setOrbStatus('speaking')
        } else {
          setOrbStatus((prev) => (prev === 'speaking' ? 'idle' : prev))
        }
      }
    }
    window.addEventListener('abelink-intensity', handleTtsIntensity)
    return () => window.removeEventListener('abelink-intensity', handleTtsIntensity)
  }, [setOrbStatus])

  useEffect(() => {
    // 'window-maximized' tidak pernah di-emit Rust (hanya 'window-state') —
    // dengar yang benar + state awal, pola sama seperti WindowControls.
    let unsubWin = null
    if (window.api?.onWindowState) {
      unsubWin = window.api.onWindowState((s) => {
        setIsMaxWindow(!!s?.isMaximized)
      })
      window.api.getWindowState?.().then((s) => setIsMaxWindow(!!s?.isMaximized)).catch(() => {})
    }

    const handleOpenMap = () => setIsMemoryMapOpen(true)
    const handleOpenChat = () => setIsChatStudioOpen(true)
    // Persistent AppSidebar (MainLayout level) dispatches this; AbelinkHome
    // owns the History drawer state.
    const handleOpenHistory = () => setIsHistoryOpen(true)

    window.addEventListener('open-memory-map', handleOpenMap)
    window.addEventListener('open-chat-studio', handleOpenChat)
    window.addEventListener('abelink:open-history', handleOpenHistory)

    return () => {
      if (typeof unsubWin === 'function') unsubWin()
      window.removeEventListener('open-memory-map', handleOpenMap)
      window.removeEventListener('open-chat-studio', handleOpenChat)
      window.removeEventListener('abelink:open-history', handleOpenHistory)
    }
  }, [])

  // ── Camera capture helper ───────────────────────────────────────────────
  const captureCameraFrame = useCallback(() => {
    if (!videoRef.current) return null
    try {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (isCamMirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.8)
    } catch (e) {
      console.warn('[Vision] Frame capture error:', e)
      return null
    }
  }, [isCamMirrored])

  // ── Stop Screen Share helper ────────────────────────────────────────────
  const handleStopScreenShare = useCallback(() => {
    isScreenStreamingRef.current = false
    if (liveMirrorIntervalRef.current) {
      clearInterval(liveMirrorIntervalRef.current)
      liveMirrorIntervalRef.current = null
    }
    if (screenStream && typeof screenStream !== 'string') {
      try {
        screenStream.getTracks().forEach((t) => t.stop())
      } catch (_) {}
    }
    setScreenStream(null)
    setLiveScreenFrame(null)
    handleModeChange('voice')
  }, [screenStream, handleModeChange, setScreenStream, setLiveScreenFrame])

  // ── Continuous Live Desktop Mirror Loop ──────────────────────────────────
  const startLiveMirrorLoop = useCallback(() => {
    isScreenStreamingRef.current = true
    if (liveMirrorIntervalRef.current) {
      clearInterval(liveMirrorIntervalRef.current)
    }

    const fetchFrame = async () => {
      if (!isScreenStreamingRef.current || isCapturingTickRef.current) return
      isCapturingTickRef.current = true
      try {
        if (window.api?.takeScreenshot) {
          const res = await window.api.takeScreenshot()
          if (res && isScreenStreamingRef.current) {
            const frameUrl =
              typeof res === 'string'
                ? res
                : res?.base64
                ? `data:image/png;base64,${res.base64}`
                : null
            if (frameUrl) {
              setLiveScreenFrame(frameUrl)
            }
          }
        }
      } catch (e) {
        console.warn('[ScreenLive] Frame capture error:', e)
      } finally {
        isCapturingTickRef.current = false
      }
    }

    fetchFrame()
    liveMirrorIntervalRef.current = setInterval(fetchFrame, 180)
  }, [])

  // ── Screen capture helper ───────────────────────────────────────────────
  const captureScreenFrame = useCallback(async () => {
    if (screenStream instanceof MediaStream && screenVideoRef.current) {
      try {
        const video = screenVideoRef.current
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', 0.85)
      } catch (e) {
        console.warn('[Screen] Canvas capture error:', e)
      }
    }
    if (liveScreenFrame) {
      return liveScreenFrame
    }
    if (window.api?.takeScreenshot) {
      try {
        const res = await window.api.takeScreenshot()
        if (typeof res === 'string') return res
        if (res?.base64) return `data:image/png;base64,${res.base64}`
      } catch (_) {}
    }
    return null
  }, [screenStream, liveScreenFrame])

  // ── Unified Voice Transcript Handler ────────────────────────────────────
  const handleVoiceTranscript = useCallback(
    async (text) => {
      let finalPrompt = `(Mikrofon) ${text}`

      // Multimodal injection jika di mode Vision atau Screen
      if (currentMode === 'vision') {
        const frame = captureCameraFrame()
        if (frame) {
          finalPrompt += `\n\n[FRAME KAMERA]: ${frame}`
        }
      } else if (currentMode === 'screen') {
        const frame = await captureScreenFrame()
        if (frame) {
          finalPrompt += `\n\n[FRAME LAYAR]: ${frame}`
        }
      }

      setMessage(finalPrompt)
      setIsSpeak(true)
      handlePlanningCommand(finalPrompt, null, false, null, { forceSpeak: true, isVoice: true })
    },
    [currentMode, captureCameraFrame, captureScreenFrame, setMessage, setIsSpeak, handlePlanningCommand]
  )

  const {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    startRecording,
    stopRecording,
    cancelRecording,
    toastMessage
  } = useVAD({
    onTranscript: handleVoiceTranscript
  })
  useEffect(() => {
    cancelRecordingRef.current = cancelRecording
  }, [cancelRecording])

  // ── Lifecycle for Camera Stream in Vision Mode ───────────────────────────
  // Reset error via microtask + stream via async agar lolos
  // set-state-in-effect; cleanup identik.
  useEffect(() => {
    if (currentMode === 'vision') {
      let activeStream = null
      queueMicrotask(() => setCamError(null))
      void (async () => {
        try {
          const stream = await navigator.mediaDevices
            ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
          if (!stream) return
          activeStream = stream
          setCamStream(stream)
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        } catch (err) {
          console.warn('[Vision] Camera access error:', err)
          queueMicrotask(() => setCamError('Kamera tidak dapat diakses atau izin ditolak sistem.'))
        }
      })()

      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop())
        }
        queueMicrotask(() => setCamStream(null))
      }
    }
  }, [currentMode])

  // ── Screen Share Starter (WebRTC Screen Capture with Native Mirror Fallback) ──
  const handleStartScreenShare = async () => {
    setScreenError(null)

    // 1. Coba browser getDisplayMedia WebRTC (jika PipeWire/Portal aktif)
    if (navigator.mediaDevices?.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        })
        setScreenStream(stream)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream
          screenVideoRef.current.play?.().catch(() => {})
        }
        stream.getVideoTracks()[0].onended = () => {
          handleStopScreenShare()
        }
        return
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError' || err.name === 'OverconstrainedError') {
          setScreenError(null)
          if (window.api?.takeScreenshot) {
            startLiveMirrorLoop()
            return
          }
        }
      }
    }

    // 2. Fallback otomatis ke continuous live desktop mirror (X11 native via screenshot API)
    if (window.api?.takeScreenshot) {
      startLiveMirrorLoop()
      return
    }

    setScreenError('Screen capture API tidak didukung pada sistem Linux ini.')
  }

  // ── Mode Cleanup for Screen Stream ──────────────────────────────────────
  // Stop deferred via microtask agar lolos set-state-in-effect.
  useEffect(() => {
    if (currentMode !== 'screen') {
      if (screenStream) {
        queueMicrotask(() => handleStopScreenShare())
      }
    }
    return () => {
      if (liveMirrorIntervalRef.current) {
        clearInterval(liveMirrorIntervalRef.current)
      }
    }
  }, [currentMode, screenStream, handleStopScreenShare])

  // Auto-start VAD mic bila URL param trigger
  const hasAutoStartedRef = useRef(false)
  useEffect(() => {
    if (location.state?.autoToggleMic) {
      if (hasAutoStartedRef.current !== location.state.autoToggleMic) {
        hasAutoStartedRef.current = location.state.autoToggleMic
        if (!isLoading && !isAgentBusy) {
          toggleRecording()
        }
      }
    }
  }, [location.state?.autoToggleMic, toggleRecording, isLoading, isAgentBusy])

  // Di mode Voice: otomatis aktifkan listening jika belum merekam, sistem standby, dan tidak di-mute
  useEffect(() => {
    if (currentMode === 'voice') {
      if (!isMicMuted && !isRecording && !isLoading && !isAgentBusy && !isProcessing && !window.isAbelinkSpeaking) {
        // Tunda hingga ekor TTS hilang dari mic (stempel di utils.js),
        // minimal 800ms, agar loopback speaker tak ditranskrip.
        const sinceTts = Date.now() - (window.abelinkTtsEndedAt || 0)
        const delay = Math.max(250, 800 - Math.max(0, sinceTts))
        const timer = setTimeout(() => {
          startRecording()
        }, delay)
        return () => clearTimeout(timer)
      }
    }
  }, [currentMode, isMicMuted, isRecording, isLoading, isAgentBusy, isProcessing, startRecording])

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable

      // Global shortcuts with Alt/Ctrl modifier (aktif bahkan saat fokus di input teks)
      if (e.altKey || e.ctrlKey) {
        if (e.code === 'Space') {
          e.preventDefault()
          toggleRecording()
          return
        }
        if (e.key === '1') {
          e.preventDefault()
          handleModeChange('chat')
          return
        }
        if (e.key === '2') {
          e.preventDefault()
          handleModeChange('voice')
          return
        }
        if (e.key === '3') {
          e.preventDefault()
          handleModeChange('vision')
          return
        }
        if (e.key === '4') {
          e.preventDefault()
          handleModeChange('screen')
          return
        }
      }

      // Escape: batalkan rekaman atau hentikan respons yang sedang berjalan
      if (e.key === 'Escape') {
        e.preventDefault()
        if (isRecording) {
          cancelRecording()
        }
        handleStop()
        return
      }

      // Hindari shortcut single-key saat user sedang mengetik di input text
      if (isEditable) {
        return
      }

      // Space: toggle rekaman suara
      if (e.code === 'Space') {
        e.preventDefault()
        toggleRecording()
        return
      }

      // 1-4: pindah mode
      if (e.key === '1') {
        e.preventDefault()
        handleModeChange('chat')
        return
      }
      if (e.key === '2') {
        e.preventDefault()
        handleModeChange('voice')
        return
      }
      if (e.key === '3') {
        e.preventDefault()
        handleModeChange('vision')
        return
      }
      if (e.key === '4') {
        e.preventDefault()
        handleModeChange('screen')
        return
      }

      // ArrowLeft / ArrowRight: beralih visual Orb (Jarvis <-> Abelink)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        setOrbStyle((prev) => {
          const next = prev === 'jarvis' ? 'abelink' : 'jarvis'
          try {
            localStorage.setItem('abelink:orb_style', next)
          } catch (_) {}
          return next
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleRecording, handleModeChange, isRecording, cancelRecording, handleStop])

  // Music widget exit animation — kickoff via microtask agar lolos
  // set-state-in-effect; timer cleanup identik.
  useEffect(() => {
    const hasTrack = isPlaying && currentTrack?.title
    let timer = null
    queueMicrotask(() => {
      if (hasTrack) {
        setIsMusicAnimatingOut(false)
        setShowMusicWidget(true)
      } else {
        if (showMusicWidget) {
          setIsMusicAnimatingOut(true)
          timer = setTimeout(() => {
            setShowMusicWidget(false)
            setIsMusicAnimatingOut(false)
          }, 500)
        }
      }
    })
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget])

  // Kompaksi manual + tracker gauge (session compaction, sesi utama).
  useManualCompaction({ messages: chatData, setMessages: setChatData, sessionId: 1 })

  // Orb Status Sync
  useEffect(() => {
    if (isRecording) {
      setOrbStatus('listening')
    } else if (isProcessing) {
      setOrbStatus('thinking')
    } else if (isLoading) {
      const lastMsg = chatData[chatData.length - 1]
      if (lastMsg?.isThinking || lastMsg?.isSearching) {
        setOrbStatus('thinking')
      } else if (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin')) {
        setOrbStatus('thinking')
      } else {
        setOrbStatus('listening')
      }
    } else {
      setOrbStatus('idle')
    }
  }, [isLoading, chatData, isRecording, isProcessing, setOrbStatus])

  // Response extraction (mapping via mapChatItemToResponse agar `choice`
  // ask-choice selamat sampai ResponseArea — regresi tombol hilang).
  // Kickoff via microtask agar lolos set-state-in-effect.
  useEffect(() => {
    queueMicrotask(() => {
      if (chatData && chatData.length > 0) {
        const lastItem = chatData[chatData.length - 1]
        if (lastItem.role === 'ai') {
          setCurrentResponse(mapChatItemToResponse(lastItem))
        } else {
          if (isLoading) {
            setCurrentResponse({
              text: 'Memproses...',
              type: 'short',
              isThinking: true
            })
          }
        }
      }
    })
  }, [chatData, isLoading])

  const handleSubmit = (e, text) => {
    if (safeContext.handleSubmit) {
      safeContext.handleSubmit(e, text)
    } else {
      const sendText = typeof text === 'string' && text.trim() ? text.trim() : message.trim()
      if (sendText) {
        handlePlanningCommand(sendText)
      }
    }
  }

  let bgGlowColor = '#22d3ee'
  if (orbStatus === 'error') bgGlowColor = '#ef4444'
  else if (orbStatus === 'listening') bgGlowColor = '#34d399'
  else if (orbStatus === 'thinking') bgGlowColor = '#fbbf24'
  else if (orbStatus === 'speaking') bgGlowColor = '#22d3ee'

  // Cek apakah ada rich data di mode Voice
  const showRichCardInVoice =
    currentMode === 'voice' &&
    currentResponse &&
    !currentResponse.isThinking &&
    isRichContent(currentResponse.text, currentResponse)

  if (!chatContext) {
    return null
  }

  return (
    <div
      className="h-screen text-white overflow-hidden relative transition-colors duration-1000 bg-[#161618] rounded-xl border border-white/5 shadow-2xl font-sans"
      style={{
        backgroundColor: `color-mix(in srgb, ${bgGlowColor} 10%, rgba(22, 22, 24, ${config?.[0]?.windowOpacity ?? 0.95}))`
      }}
    >
      {/* Subtle Apple Ambient Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(10,132,255,0.06),transparent_60%)] pointer-events-none z-0" />

      {isBooting && !bootExpired && (
        <div className="fixed inset-0 bg-[#161618] flex flex-col items-center justify-center z-[200]">
          {/* z-[200]: boot veil harus di atas semua chrome (HUD z-50,
              player z-120), di bawah drag-drop veil (9999). Dulu z-999,
              turun ke z-40 saat rapihan z-index → HUD mengintip. */}
          <BootScreen showRecovery={false} />
        </div>
      )}

      {/* Floating System Menus (nav moved to persistent AppSidebar in MainLayout) */}
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />
      <LiteBadge />

      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-[#ff453a]/90 text-white px-4 py-2 rounded-2xl z-50 backdrop-blur shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* ── TOP FLOATING HUD: hanya di home (guard tunggal, lih. isHomeRoute) ── */}
      {isHomeRoute && (
      <>
      <div data-tauri-drag-region="" className="fixed top-0 left-60 right-0 h-14 z-30 pointer-events-auto" />

      {/* Center: Floating 4-Mode Switcher Dynamic Island (Icon-only) */}
      <div className="fixed top-3.5 left-1/2 -translate-x-1/2 z-30 flex items-center bg-[#1c1c1e]/80 backdrop-blur-2xl border border-white/15 p-1 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)] gap-1 shrink-0 pointer-events-auto">
        <button
          onClick={() => handleModeChange('chat')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            currentMode === 'chat'
              ? 'bg-[#0a84ff] text-white shadow-[0_0_15px_rgba(10,132,255,0.4)]'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
          title="Mode Chat"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleModeChange('voice')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            currentMode === 'voice'
              ? 'bg-[#0a84ff] text-white shadow-[0_0_15px_rgba(10,132,255,0.4)]'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
          title="Mode Voice (Jarvis)"
        >
          <Mic className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleModeChange('vision')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            currentMode === 'vision'
              ? 'bg-[#0a84ff] text-white shadow-[0_0_15px_rgba(10,132,255,0.4)]'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
          title="Mode Vision (Kamera)"
        >
          <Camera className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleModeChange('screen')}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
            currentMode === 'screen'
              ? 'bg-[#0a84ff] text-white shadow-[0_0_15px_rgba(10,132,255,0.4)]'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
          title="Mode Screen Share"
        >
          <Monitor className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Native Window Controls Capsule */}
      <div className="fixed top-3.5 right-4 z-30 flex items-center bg-[#1c1c1e]/80 backdrop-blur-2xl border border-white/15 px-3 py-1.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-auto">
        <WindowControls />
      </div>
      </>
      )}

      {/* ── MODE 1: VOICE MODE (JARVIS DEFAULT) ──────────────────────────────── */}
      {currentMode === 'voice' && (
        <div
          className={`relative z-10 w-full h-screen flex ${
            showRichCardInVoice
              ? 'flex-col md:flex-row items-center justify-between px-6 lg:px-12 pt-14 pb-20 gap-6'
              : 'flex-col items-center justify-center px-4'
          } overflow-hidden select-none transition-all duration-500`}
        >
          {/* Centered or Left Jarvis / Abelink Hero Orb */}
          <div
            className={`flex flex-col items-center justify-center transition-all duration-700 ease-out ${
              showRichCardInVoice
                ? 'w-full md:w-5/12 h-[35vh] md:h-full shrink-0'
                : 'w-full h-full'
            }`}
          >
            <div
              onMouseDown={handleOrbMouseDown}
              onMouseUp={handleOrbMouseUp}
              onTouchStart={handleOrbTouchStart}
              onTouchEnd={handleOrbTouchEnd}
              className="flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-500 ease-out"
              style={{
                transform: showRichCardInVoice ? 'scale(0.68)' : 'scale(1)'
              }}
              title="Tekan tombol panah (Arrow Left / Right), geser kursor, atau klik indikator di bawah untuk beralih gaya Orb"
            >
              {orbStyle === 'abelink' ? (
                <OrbVisualizer
                  status={orbStatus}
                  intensity={orbStatus === 'speaking' ? ttsIntensity : isRecording ? audioIntensity : 0}
                  mood={currentResponse?.mood || 'neutral'}
                  size="hero"
                />
              ) : (
                <JarvisOrb
                  status={orbStatus}
                  intensity={orbStatus === 'speaking' ? ttsIntensity : isRecording ? audioIntensity : 0}
                  size={showRichCardInVoice ? 480 : 700}
                />
              )}
            </div>
          </div>

          {/* Right Side: Rich Data Telemetry Card dengan viewport penuh */}
          {showRichCardInVoice && (
            <div className="w-full md:w-7/12 h-[55vh] md:h-[calc(100vh-140px)] flex flex-col bg-[#1c1c1e]/85 backdrop-blur-2xl border border-white/15 rounded-2xl p-5 shadow-2xl animate-[holo-enter_0.35s_ease-out_forwards] pointer-events-auto">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-xs text-[#0a84ff] shrink-0 font-medium">
                <span className="flex items-center gap-2 uppercase tracking-wider font-semibold">
                  <Eye className="w-4 h-4 text-[#0a84ff]" /> Data Output
                </span>
                <button
                  onClick={() => handleModeChange('chat')}
                  className="text-xs text-white/70 hover:text-white gap-1.5 rounded-full px-3 py-1 hover:bg-white/10 transition-colors flex items-center"
                >
                  <Maximize2 className="w-3 h-3" /> Mode Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar pr-1 text-sm text-white/90 leading-relaxed font-sans">
                <ResponseArea currentResponse={currentResponse} />
              </div>
            </div>
          )}

          {/* Bottom Dock Melayang: Audio Meter di Kiri, Status & Orb Dots di Tengah */}
          <div className="fixed bottom-6 inset-x-0 z-20 flex items-center justify-between px-8 pointer-events-none">
            {/* Kiri: Minimal Audio Level Meter */}
            <div className="flex items-center gap-2 opacity-60 pointer-events-auto">
              <div className="w-16 h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-info transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(8, audioIntensity * 100))}%` }}
                />
              </div>
            </div>

            {/* Tengah: Status Typography & Subtle Carousel Dots Indicator */}
            <div className="flex flex-col items-center gap-1.5 pointer-events-auto select-none">
              <div
                onClick={() => {
                  if (isRecording) {
                    setIsMicMuted(true)
                    cancelRecording()
                  } else {
                    setIsMicMuted(false)
                    startRecording()
                  }
                }}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                title="Klik untuk menyalakan/menjeda mikrofon"
              >
                <span className="font-mono text-xs tracking-widest text-info/90 animate-pulse">
                  {toastMessage
                    ? toastMessage
                    : isMicMuted
                    ? 'mic paused (klik untuk bicara)'
                    : isRecording
                    ? 'listening... (klik untuk jeda)'
                    : isProcessing
                    ? 'transcribing / thinking...'
                    : window.isAbelinkSpeaking
                    ? 'speaking...'
                    : 'standby (klik untuk bicara)'}
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                onClick={() => {
                  const nextStyle = orbStyle === 'jarvis' ? 'abelink' : 'jarvis'
                  setOrbStyle(nextStyle)
                  try {
                    localStorage.setItem('abelink:orb_style', nextStyle)
                  } catch (_) {}
                }}
                title="Klik untuk beralih gaya Orb"
              >
                <span
                  className={`h-1 rounded-full transition-all ${
                    orbStyle === 'jarvis' ? 'bg-info w-3.5' : 'bg-white/40 w-1'
                  }`}
                />
                <span
                  className={`h-1 rounded-full transition-all ${
                    orbStyle === 'abelink' ? 'bg-info w-3.5' : 'bg-white/40 w-1'
                  }`}
                />
              </div>
            </div>

            {/* Kanan: Spacer penyeimbang */}
            <div className="w-16 opacity-0" />
          </div>
        </div>
      )}
      {/* ── MODE 2: CLASSIC CHAT MODE ────────────────────────────────────────── */}
      {currentMode === 'chat' && (
        <div className="relative z-10 flex flex-col md:flex-row w-full h-screen pt-14 pb-[110px] px-4 lg:px-12 overflow-hidden">
          {/* Left Panel: Orb & Neural Flow */}
          <div className="w-full md:w-1/2 h-[35vh] md:h-full flex flex-col items-center justify-center relative">
            <div
              className="relative flex items-center justify-center w-full max-w-lg h-64 md:h-96"
              style={{
                transform: isMaxWindow ? 'scale(1)' : 'scale(0.65)',
                transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <ThoughtNeuralFlow processes={activeProcesses} />
              <div className="z-10 relative">
                <OrbVisualizer
                  status={orbStatus}
                  intensity={orbStatus === 'speaking' ? ttsIntensity : 0}
                  mood={currentResponse?.mood || 'neutral'}
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Scrollable Response Area */}
          <div
            className="w-full md:w-1/2 h-full flex flex-col overflow-y-auto no-scrollbar md:pl-8 md:pr-4 pt-4 md:pt-6"
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent, black 2rem, black calc(100% - 2rem), transparent)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent, black 2rem, black calc(100% - 2rem), transparent)'
            }}
          >
            <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-start pt-4 pb-20 min-h-full">
              {currentResponse ? (
                <ResponseArea currentResponse={currentResponse} />
              ) : (
                <div className="text-center opacity-40 font-mono text-sm mt-20">
                  Abelink siap menerima instruksi atau percakapan.
                </div>
              )}
            </div>
          </div>

          {/* Bottom Classic InputBar */}
          <InputBar
            onSubmit={(prompt) => {
              setIsSpeak(false)
              handleSubmit(prompt)
            }}
            isLoading={isLoading || isAgentBusy}
            isRecording={isRecording}
            isProcessing={isProcessing}
            audioIntensity={audioIntensity}
            onStartRecord={startRecording}
            onStopRecord={stopRecording}
            onStop={handleStop}
            source={inputSource}
            workspaceRoot={workspaceRoot}
            onSelectWorkspace={handleSelectWorkspace}
            sessionId={1}
          />
        </div>
      )}

      {/* ── MODE 3: VISION MODE (CAMERA + VOICE) ─────────────────────────────── */}
      {currentMode === 'vision' && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-hidden bg-black z-10">
          {/* Fullscreen Video Viewfinder */}
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-300 ${
                isCamMirrored ? 'scale-x-[-1]' : 'scale-x-1'
              }`}
            />
            {/* Ambient Dark Vignette Overlay */}
            <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/70 pointer-events-none" />
          </div>

          {/* Scanning HUD Overlay */}
          <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">

            {/* Corner Brackets */}
            <div className="absolute top-16 left-6 w-8 h-8 border-t-2 border-l-2 border-info/80" />
            <div className="absolute top-16 right-6 w-8 h-8 border-t-2 border-r-2 border-info/80" />
            <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-info/80" />
            <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-info/80" />

            {/* Target Crosshair */}
            <div className="absolute inset-0 m-auto w-16 h-16 border border-info/40 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-info rounded-full animate-ping" />
            </div>

            {/* Top Right Mini Orb */}
            <div className="absolute top-16 right-6">
              <JarvisOrb status={orbStatus} intensity={ttsIntensity || audioIntensity} size={80} />
            </div>
          </div>

          {camError && (
            <div className="relative z-20 max-w-md p-4 rounded-xl bg-black/85 border border-error/40 text-error text-xs font-mono text-center">
              {camError}
            </div>
          )}

          {/* Bottom Floating Snap Trigger */}
          <div className="absolute bottom-6 z-20 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const frame = captureCameraFrame()
                if (frame) {
                  const prompt = capsuleInput.trim() || 'Jelaskan objek apa yang ada di tangkapan kamera ini.'
                  const fullPrompt = `${prompt}\n\n[FRAME KAMERA]: ${frame}`
                  handlePlanningCommand(fullPrompt)
                  setCapsuleInput('')
                }
              }}
              className="btn btn-sm rounded-full bg-primary text-white font-semibold hover:bg-info shadow-[0_0_20px_rgba(10,132,255,0.5)] px-6"
            >
              Snap &amp; Tanya
            </button>
          </div>
        </div>
      )}

      {/* ── MODE 4: SCREEN SHARE MODE (LIVE STREAM LIKE GOOGLE MEET / ZOOM) ── */}
      {currentMode === 'screen' && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-hidden bg-black z-10">
          {screenStream || liveScreenFrame ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black/95 p-4 pt-16 pb-16">
              {/* Top Floating Control Bar ala Google Meet / Zoom */}
              <div className="absolute top-4 left-6 right-6 flex items-center justify-between pointer-events-auto z-30 select-none">
                <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-2xl border border-white/10 text-xs font-mono shadow-2xl">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <span className="text-red-400 font-bold tracking-wider">LIVE SCREEN</span>
                  <span className="text-white/30">|</span>
                  <span className="text-white/70 text-[11px]">
                    {screenStream?.getVideoTracks?.[0]?.label || 'Desktop Mirror (X11 Native)'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleStopScreenShare}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 border border-red-500/40 text-xs font-semibold backdrop-blur-2xl transition-all shadow-lg shadow-red-950/40"
                  title="Hentikan berbagi layar"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>

              {/* Main Live Viewport Screen Stream (Google Meet / Zoom WebRTC Video or Native Desktop Mirror) */}
              <div className="relative w-full h-full max-w-7xl max-h-[82vh] flex items-center justify-center rounded-xl overflow-hidden border border-info/20 bg-black/60 shadow-[0_0_50px_rgba(10,132,255,0.15)]">
                {screenStream ? (
                  <video
                    ref={screenVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : liveScreenFrame ? (
                  <img
                    src={liveScreenFrame}
                    alt="Live Desktop Stream"
                    className="w-full h-full object-contain select-none pointer-events-none"
                  />
                ) : null}
              </div>

              {/* Top Right Floating Mini Orb */}
              <div className="absolute top-16 right-6 pointer-events-none z-30">
                <JarvisOrb status={orbStatus} intensity={ttsIntensity || audioIntensity} size={80} />
              </div>

              {/* Bottom Center Floating Mini Dock for Screen Share */}
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/85 backdrop-blur-2xl border border-info/40 shadow-[0_8px_32px_rgba(0,0,0,0.85),0_0_25px_rgba(10,132,255,0.3)] pointer-events-auto select-none">
                {/* Live Indicator */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-bold tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                  <span>LIVE</span>
                </div>

                {/* Mic Audio Meter & Toggle (Icon-only) */}
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all border ${
                    isRecording
                      ? 'bg-[#0a84ff]/20 text-[#0a84ff] border-[#0a84ff]/40 shadow-[0_0_10px_rgba(10,132,255,0.3)]'
                      : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'
                  }`}
                  title={isRecording ? 'Matikan Mikrofon' : 'Nyalakan Mikrofon'}
                >
                  {isRecording ? <Mic className="w-4 h-4 text-[#0a84ff] animate-pulse" /> : <MicOff className="w-4 h-4" />}
                </button>

                {/* Mini Orb Indicator */}
                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                  <JarvisOrb status={orbStatus} intensity={ttsIntensity || audioIntensity} size={28} />
                </div>

                {/* Snap Screen Button (Icon-only) */}
                <button
                  type="button"
                  onClick={async () => {
                    const frame = await captureScreenFrame()
                    if (frame) {
                      const prompt = capsuleInput.trim() || 'Analisis dan jelaskan apa yang sedang tampil di layar ini.'
                      const fullPrompt = `${prompt}\n\n[FRAME LAYAR]: ${frame}`
                      handlePlanningCommand(fullPrompt)
                      setCapsuleInput('')
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[#0a84ff] hover:bg-[#0a84ff]/80 text-white shadow-[0_0_15px_rgba(10,132,255,0.4)] transition-all"
                  title="Tangkap frame layar dan analisa (Snap)"
                >
                  <Camera className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/15" />

                {/* Hentikan Share */}
                <button
                  type="button"
                  onClick={handleStopScreenShare}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff453a] text-white hover:bg-[#ff453a]/80 transition-all text-xs font-semibold shadow-lg"
                  title="Hentikan berbagi layar"
                >
                  <Square size={13} className="fill-current" /> Berhenti Share
                </button>
              </div>

              {/* Video Player Display */}
              {screenStream ? (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <img
                  src={liveScreenFrame}
                  alt="Live Screen"
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 text-center p-8 max-w-md">
              <Monitor className="w-16 h-16 text-[#0a84ff]/70 animate-pulse" />
              <h3 className="text-lg font-bold text-white tracking-wide">Live Screen Share</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Berbagi layar real-time untuk analisis visual.
              </p>
              <button
                onClick={handleStartScreenShare}
                className="px-7 py-2.5 rounded-full bg-[#0a84ff] text-white text-xs font-semibold hover:bg-[#0a84ff]/80 transition-all shadow-lg"
              >
                Mulai Share Screen
              </button>
              {screenError && (
                <p className="text-[#ff453a] text-xs font-mono mt-2 bg-[#ff453a]/10 border border-[#ff453a]/20 p-2.5 rounded-xl">
                  {screenError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Slide-out Drawers & Modals */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
      <MemoryVisualizer isOpen={isMemoryMapOpen} onClose={() => setIsMemoryMapOpen(false)} />
      <ChatStudioModal
        isOpen={isChatStudioOpen}
        onClose={() => setIsChatStudioOpen(false)}
        chatContext={chatContext}
      />

      {/* Smart Voice Setup Prompt Modal */}
      {showVoiceSetupModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-xl p-4 animate-fade-in pointer-events-auto">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#1c1c1e]/95 border border-white/15 shadow-2xl space-y-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0a84ff]/20 border border-[#0a84ff]/30 flex items-center justify-center text-[#0a84ff]">
                <Mic size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Setup Audio & Voice Engine</h3>
                <p className="text-[11px] opacity-60">Abelink belum mendeteksi konfigurasi STT aktif.</p>
              </div>
            </div>

            <p className="text-xs opacity-80 leading-relaxed">
              Untuk mengobrol menggunakan suara tanpa kendala, pilih salah satu opsi cepat di bawah:
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  const cfgs = await getAllConfig()
                  const c = cfgs[0] || {}
                  const defaultConn = {
                    id: 'conn-quick-local',
                    name: 'Local Gateway (127.0.0.1:20128)',
                    endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
                    apiKey: '',
                    model: DEFAULT_STT_MODEL,
                    enabled: true
                  }
                  await saveConfiguration({
                    ...c,
                    sttProvider: 'custom',
                    sttStrategy: 'fallback',
                    sttConnections: [defaultConn]
                  })
                  setShowVoiceSetupModal(false)
                }}
                className="px-4 py-2.5 rounded-xl bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 transition-all flex items-center justify-between text-xs font-medium w-full"
              >
                <span>Pakai Preset Cepat (127.0.0.1:20128)</span>
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] text-white/80">Rekomendasi</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowVoiceSetupModal(false)
                  navigate('/config#cfg-voice')
                }}
                className="px-4 py-2.5 rounded-xl border border-white/20 text-white hover:bg-white/10 transition-all text-xs font-medium w-full text-center"
              >
                Buka Pengaturan Audio & Provider
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowVoiceSetupModal(false)}
                className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
              >
                Nanti saja (Tutup)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AbelinkHome
