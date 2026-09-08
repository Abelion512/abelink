import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import OrbVisualizer from '../components/core/OrbVisualizer'
import JarvisOrb from '../components/core/JarvisOrb'
import InputBar from '../components/core/InputBar'
import ResponseArea from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import HistoryDrawer from '../components/core/HistoryDrawer'
import ProcessPanel from '../components/core/ProcessPanel'
import ThoughtNeuralFlow from '../components/core/ThoughtNeuralFlow'
import MemoryVisualizer from '../components/core/MemoryVisualizer'
import BrowserPreviewWidget from '../components/core/BrowserPreviewWidget'
import { ChatStudioModal } from '../components/core/ChatStudioModal'
import WindowControls from '../components/core/WindowControls'
import {
  Mic,
  MessageSquare,
  Camera,
  Monitor,
  StopCircle,
  Send,
  Maximize2,
  Sparkles,
  Volume2,
  VolumeX,
  RefreshCw,
  Eye,
  Layers
} from 'lucide-react'
import LiteBadge from '../components/core/LiteBadge'
import musicCoverFallback from '../assets/music-cover.png'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useVAD } from '../hooks/useVAD'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { db, setSessionWorkspace } from '../api/db'

/**
 * Deteksi apakah respons AI mengandung data terstruktur/kaya (rich content)
 * seperti tabel, kode, gambar, link, atau daftar data.
 * Sesuai aturan: pada mode Voice (Jarvis), teks percakapan biasa tidak ditampilkan
 * agar layar tetap bersih, KECUALI jika AI memberikan data terstruktur.
 */
const isRichContent = (text, resp) => {
  if (!resp && !text) return false
  if (resp?.youtubeData || resp?.pluginResult || (resp?.sources && resp.sources.length > 0)) {
    return true
  }
  if (!text || typeof text !== 'string') return false
  if (text.includes('|') && text.includes('\n|')) return true // Tabel markdown
  if (text.includes('```')) return true // Code block
  if (text.includes('![') || text.includes('data:image/')) return true // Gambar
  if (text.includes('http://') || text.includes('https://')) return true // Link eksternal
  const listCount = text.split('\n').filter((l) => l.trim().startsWith('- ') || l.trim().match(/^\d+\./)).length
  if (listCount >= 3) return true // Daftar item/data penting
  return false
}

const MarkHome = () => {
  const chatContext = useChat()
  const safeContext = chatContext ?? {}
  const {
    chatData = [],
    message,
    setMessage,
    isLoading,
    isAgentBusy,
    isSpeak,
    setIsSpeak,
    handlePlanningCommand,
    orbStatus,
    setOrbStatus,
    notifications,
    activeProcesses,
    dismissProcess,
    inputSource,
    handleStop,
    isBooting,
    requestCameraCaptureRef,
    config,
    canCheckInNow
  } = safeContext

  if (!chatContext) {
    return null
  }

  const { isPlaying, currentTrack, isPlayerOpen } = useYoutubeMusic()
  useMemoryGroomer(true) // Hippocampus Engine

  const location = useLocation()
  const navigate = useNavigate()

  // ── 4 MODE WORKSPACE: voice (Jarvis default) | chat | vision | screen ────
  const queryParams = new URLSearchParams(location.search)
  const initialMode =
    queryParams.get('mode') ||
    localStorage.getItem('mark:preferred_mode') ||
    'voice'

  const [currentMode, setCurrentMode] = useState(initialMode)
  const [capsuleInput, setCapsuleInput] = useState('')
  const [orbStyle, setOrbStyle] = useState(() => {
    try {
      return localStorage.getItem('mark:orb_style') || 'jarvis'
    } catch (_) {
      return 'jarvis'
    }
  })

  // Drag / Slide with cursor handler untuk beralih Orb
  const dragStartXRef = useRef(null)
  const handleOrbMouseDown = (e) => {
    dragStartXRef.current = e.clientX
  }
  const handleOrbMouseUp = (e) => {
    if (dragStartXRef.current === null) return
    const deltaX = e.clientX - dragStartXRef.current
    if (Math.abs(deltaX) > 30) {
      const nextStyle = orbStyle === 'jarvis' ? 'mark' : 'jarvis'
      setOrbStyle(nextStyle)
      try {
        localStorage.setItem('mark:orb_style', nextStyle)
      } catch (_) {}
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
        const nextStyle = orbStyle === 'jarvis' ? 'mark' : 'jarvis'
        setOrbStyle(nextStyle)
        try {
          localStorage.setItem('mark:orb_style', nextStyle)
        } catch (_) {}
      }
    }
    dragStartXRef.current = null
  }

  const handleModeChange = (newMode) => {
    setCurrentMode(newMode)
    try {
      localStorage.setItem('mark:preferred_mode', newMode)
    } catch (_) {}
  }

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isChatStudioOpen, setIsChatStudioOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false)
  const [isMaxWindow, setIsMaxWindow] = useState(false)
  const [ttsIntensity, setTtsIntensity] = useState(0)
  const [workspaceRoot, setWorkspaceRoot] = useState(null)
  const [winState, setWinState] = useState({ isMaximized: false, isFullScreen: false })

  // ── Vision & Screen Share Refs & State ──────────────────────────────────
  const videoRef = useRef(null)
  const screenVideoRef = useRef(null)
  const [camStream, setCamStream] = useState(null)
  const [camError, setCamError] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [screenError, setScreenError] = useState(null)

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
      if (window.isMarkSpeaking) {
        setOrbStatus('speaking')
      } else {
        setOrbStatus((prev) => (prev === 'speaking' ? 'idle' : prev))
      }
    }
    window.addEventListener('mark-intensity', handleTtsIntensity)
    return () => window.removeEventListener('mark-intensity', handleTtsIntensity)
  }, [setOrbStatus])

  useEffect(() => {
    if (window.api?.onWindowMaximized) {
      window.api.onWindowMaximized((isMax) => {
        setIsMaxWindow(isMax)
      })
    }

    const handleOpenMap = () => setIsMemoryMapOpen(true)
    const handleOpenChat = () => setIsChatStudioOpen(true)

    window.addEventListener('open-memory-map', handleOpenMap)
    window.addEventListener('open-chat-studio', handleOpenChat)

    return () => {
      window.removeEventListener('open-memory-map', handleOpenMap)
      window.removeEventListener('open-chat-studio', handleOpenChat)
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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.8)
    } catch (e) {
      console.warn('[Vision] Frame capture error:', e)
      return null
    }
  }, [])

  // ── Screen capture helper ───────────────────────────────────────────────
  const captureScreenFrame = useCallback(async () => {
    if (screenVideoRef.current && screenStream) {
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
    if (window.api?.takeScreenshot) {
      try {
        const res = await window.api.takeScreenshot()
        if (res?.base64) return `data:image/png;base64,${res.base64}`
      } catch (_) {}
    }
    return null
  }, [screenStream])

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
      handlePlanningCommand(finalPrompt, null, false, null, { forceSpeak: true })
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
    toastMessage
  } = useVAD({
    onTranscript: handleVoiceTranscript
  })

  // ── Lifecycle for Camera Stream in Vision Mode ───────────────────────────
  useEffect(() => {
    if (currentMode === 'vision') {
      let activeStream = null
      setCamError(null)
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then((stream) => {
          activeStream = stream
          setCamStream(stream)
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.warn('[Vision] Camera access error:', err)
          setCamError('Kamera tidak dapat diakses atau izin ditolak sistem.')
        })

      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop())
        }
        setCamStream(null)
      }
    }
  }, [currentMode])

  // ── Screen Share Starter ────────────────────────────────────────────────
  const handleStartScreenShare = async () => {
    setScreenError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      })
      setScreenStream(stream)
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream
      }
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null)
      }
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.message?.includes('Invalid constraint')) {
        // Fallback anggun: gunakan native screenshot jika xdg-desktop-portal WebKitGTK tidak merespon
        if (window.api?.takeScreenshot) {
          const res = await window.api.takeScreenshot().catch(() => null)
          if (res?.base64) {
            setScreenStream('native-snapshot')
            return
          }
        }
        setScreenError('Desktop screencast PipeWire belum aktif. Abelink akan menggunakan native capture saat snap.')
      } else if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        setScreenError(null)
      } else {
        setScreenError('Share screen dibatalkan atau izin tidak diberikan.')
      }
    }
  }

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

  // Music widget exit animation
  useEffect(() => {
    const hasTrack = isPlaying && currentTrack?.title
    if (hasTrack) {
      setIsMusicAnimatingOut(false)
      setShowMusicWidget(true)
    } else {
      if (showMusicWidget) {
        setIsMusicAnimatingOut(true)
        const timer = setTimeout(() => {
          setShowMusicWidget(false)
          setIsMusicAnimatingOut(false)
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget])

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

  // Response extraction
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const lastItem = chatData[chatData.length - 1]
      if (lastItem.role === 'ai') {
        if (lastItem.isThinking || lastItem.isSearching) {
          setCurrentResponse({
            text: lastItem.content || 'Memproses instruksi...',
            type: 'short',
            isThinking: true,
            mood: lastItem.mood || 'neutral'
          })
        } else {
          setCurrentResponse({
            text: lastItem.content,
            type:
              lastItem.content?.length > 200 || lastItem.content?.includes('\n')
                ? 'long'
                : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood || 'neutral'
          })
        }
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

  const handleCapsuleSubmit = (e) => {
    e?.preventDefault?.()
    const val = capsuleInput.trim()
    if (!val) return
    setIsSpeak(false)
    handlePlanningCommand(val)
    setCapsuleInput('')
  }

  const mood = currentResponse?.mood || 'neutral'
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

  return (
    <div
      className="h-screen text-white overflow-hidden relative transition-colors duration-1000 bg-transparent rounded-xl border border-white/5 shadow-2xl font-['Inter',sans-serif]"
      style={{
        backgroundColor: `color-mix(in srgb, ${bgGlowColor} 10%, rgba(0,0,0,${config?.[0]?.windowOpacity ?? 0.88}))`
      }}
    >
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-slow-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes scanline-pass {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(1000%); }
        }
      `}</style>

      {/* Hologram Grid Backdrop */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] opacity-25 pointer-events-none mix-blend-overlay z-0" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03] pointer-events-none mix-blend-screen z-0" />

      {isBooting && (
        <div className="fixed inset-0 bg-base-300 flex flex-col items-center justify-center gap-5 z-[999]">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
            Membangunkan Abelink...
          </p>
        </div>
      )}

      {/* Floating System Menus */}
      <FloatingMenu onOpenHistory={() => setIsHistoryOpen(true)} />
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />
      <BrowserPreviewWidget />
      <LiteBadge />

      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* ── TOP FLOATING HUD: Transparent Drag Strip & Independent Floating Controls ─────── */}
      <div data-tauri-drag-region="" className="fixed top-0 inset-x-0 h-14 z-30 pointer-events-auto" />

      {/* Center: Floating 4-Mode Switcher Capsule */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center bg-black/60 backdrop-blur-2xl border border-white/10 p-1 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] gap-1 shrink-0 pointer-events-auto">
        <button
          onClick={() => handleModeChange('voice')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            currentMode === 'voice'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Jarvis Voice Mode (Hands-free Voice Dialogue)"
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Voice</span>
        </button>

        <button
          onClick={() => handleModeChange('chat')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            currentMode === 'chat'
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_15px_rgba(var(--p)/0.3)]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Classic Chat Mode (Full Markdown & History)"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => handleModeChange('vision')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            currentMode === 'vision'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Camera Vision Mode (Live Camera + Voice)"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Vision</span>
        </button>

        <button
          onClick={() => handleModeChange('screen')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            currentMode === 'screen'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
          title="Screen Share Mode (Desktop Inspection + Voice)"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Screen</span>
        </button>
      </div>

      {/* Right: Floating Studio Button & Native Window Controls Capsule */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-2xl border border-white/10 px-2.5 py-1.5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.6)] pointer-events-auto">
        <button
          onClick={() => setIsChatStudioOpen(true)}
          className="h-7 px-2.5 btn btn-ghost btn-xs text-white/80 hover:text-white rounded-full flex items-center gap-1.5 transition-all hover:bg-white/10"
          title="Buka Chat Studio"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-medium hidden md:inline">Studio</span>
        </button>
        <div className="h-3.5 w-px bg-white/15" />
        <WindowControls />
      </div>

      {/* ── MODE 1: VOICE MODE (JARVIS DEFAULT) ──────────────────────────────── */}
      {currentMode === 'voice' && (
        <div className="relative z-10 w-full h-screen flex flex-col items-center justify-center px-4 overflow-hidden select-none">
          {/* Centered Jarvis / Mark Hero Orb */}
          <div
            onMouseDown={handleOrbMouseDown}
            onMouseUp={handleOrbMouseUp}
            onTouchStart={handleOrbTouchStart}
            onTouchEnd={handleOrbTouchEnd}
            className="flex flex-col items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-300"
            title="Geser kursor ke kiri/kanan untuk beralih gaya Orb"
          >
            {orbStyle === 'mark' ? (
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
                size={540}
              />
            )}

            {/* Minimalist Jarvis Status Typography */}
            <div className="flex flex-col items-center gap-1 mt-4 select-none pointer-events-none">
              <span className="font-mono text-xs tracking-widest text-cyan-400/90 animate-pulse">
                {isRecording
                  ? 'listening...'
                  : isProcessing
                  ? 'thinking...'
                  : window.isMarkSpeaking
                  ? 'speaking...'
                  : 'standby'}
              </span>
              <span className="font-mono text-[9px] tracking-[0.35em] text-cyan-500/50 uppercase">
                ABELINK
              </span>
            </div>

            {/* Subtle Carousel Dots Indicator */}
            <div className="flex items-center gap-1.5 mt-3 opacity-30 hover:opacity-80 transition-opacity">
              <span
                className={`h-1.5 rounded-full transition-all ${
                  orbStyle === 'jarvis' ? 'bg-cyan-400 w-3.5' : 'bg-white/40 w-1.5'
                }`}
              />
              <span
                className={`h-1.5 rounded-full transition-all ${
                  orbStyle === 'mark' ? 'bg-cyan-400 w-3.5' : 'bg-white/40 w-1.5'
                }`}
              />
            </div>
          </div>

          {/* Bottom Left Minimal Audio Level Meter */}
          <div className="fixed bottom-6 left-6 z-20 flex items-center gap-2 pointer-events-none opacity-60">
            <div className="w-16 h-0.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(8, audioIntensity * 100))}%` }}
              />
            </div>
          </div>

          {/* Rich Data Telemetry Card: HANYA tampil jika ada data terstruktur */}
          {showRichCardInVoice && (
            <div className="mt-6 max-w-xl w-full bg-black/70 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl p-4 shadow-[0_8px_32px_rgba(34,211,238,0.2)] animate-[holo-enter_0.3s_ease-out_forwards] max-h-56 overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-mono text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> DATA OUTPUT
                </span>
                <button
                  onClick={() => handleModeChange('chat')}
                  className="btn btn-ghost btn-xs text-white/60 hover:text-white gap-1"
                >
                  <Maximize2 className="w-3 h-3" /> Mode Chat
                </button>
              </div>
              <div className="text-xs text-white/90 leading-relaxed font-sans">
                <ResponseArea currentResponse={currentResponse} />
              </div>
            </div>
          )}
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
              className="w-full h-full object-cover"
            />
            {/* Ambient Dark Vignette Overlay */}
            <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/70 pointer-events-none" />
          </div>

          {/* Scanning HUD Overlay */}
          <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
            {/* Corner Brackets */}
            <div className="absolute top-16 left-6 w-8 h-8 border-t-2 border-l-2 border-cyan-400/80" />
            <div className="absolute top-16 right-6 w-8 h-8 border-t-2 border-r-2 border-cyan-400/80" />
            <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-cyan-400/80" />
            <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-cyan-400/80" />

            {/* Target Crosshair */}
            <div className="absolute inset-0 m-auto w-16 h-16 border border-cyan-400/40 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
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
              className="btn btn-sm rounded-full bg-cyan-500 text-black font-semibold hover:bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.5)] px-6"
            >
              Snap &amp; Ask Abelink
            </button>
          </div>
        </div>
      )}

      {/* ── MODE 4: SCREEN SHARE MODE ────────────────────────────────────────── */}
      {currentMode === 'screen' && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center overflow-hidden bg-black z-10">
          {screenStream ? (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center">
              {screenStream === 'native-snapshot' ? (
                <div className="flex flex-col items-center gap-3 text-cyan-400 font-mono text-xs select-none">
                  <Monitor className="w-16 h-16 animate-pulse text-cyan-400" />
                  <span className="tracking-widest">NATIVE LINUX SCREEN CAPTURE READY</span>
                  <span className="text-white/40 text-[10px]">Klik Capture untuk menganalisis layar desktop Anda</span>
                </div>
              ) : (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              )}
              {/* Top Right Mini Orb */}
              <div className="absolute top-16 right-6 pointer-events-none">
                <JarvisOrb status={orbStatus} intensity={ttsIntensity || audioIntensity} size={80} />
              </div>

              {/* Bottom Snap Button */}
              <div className="absolute bottom-6 z-20 flex items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const frame = await captureScreenFrame()
                    if (frame) {
                      const prompt = capsuleInput.trim() || 'Analisis dan jelaskan isi tampilan layar ini.'
                      const fullPrompt = `${prompt}\n\n[FRAME LAYAR]: ${frame}`
                      handlePlanningCommand(fullPrompt)
                      setCapsuleInput('')
                    }
                  }}
                  className="btn btn-sm rounded-full bg-purple-500 text-white font-semibold hover:bg-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)] px-6"
                >
                  Capture &amp; Ask Abelink
                </button>
              </div>
            </div>
          ) : (
            <div className="relative z-20 flex flex-col items-center gap-4 text-center p-6 select-none max-w-lg">
              <Monitor className="w-16 h-16 text-purple-400/60 animate-bounce" />
              <h3 className="text-lg font-bold text-white">Share Screen Desktop</h3>
              <p className="text-xs text-white/50">
                Bagikan jendela aplikasi atau seluruh layar monitor agar Abelink dapat membaca kode, dokumen, atau menganalisis workflow Anda.
              </p>
              <button
                onClick={handleStartScreenShare}
                className="btn btn-primary btn-sm rounded-full px-6 shadow-lg shadow-primary/20"
              >
                Pilih Layar / Jendela
              </button>
              {screenError && (
                <p className="text-error text-xs font-mono mt-2 bg-error/10 border border-error/20 p-2 rounded-xl">
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
    </div>
  )
}

export default MarkHome
