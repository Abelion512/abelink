import { useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import OrbVisualizer from '../components/core/OrbVisualizer'
import InputBar from '../components/core/InputBar'
import ResponseArea, { ResponseDetails } from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import HistoryDrawer from '../components/core/HistoryDrawer'
import ProcessPanel from '../components/core/ProcessPanel'
import ThoughtNeuralFlow from '../components/core/ThoughtNeuralFlow'
import MemoryVisualizer from '../components/core/MemoryVisualizer'
import BrowserPreviewWidget from '../components/core/BrowserPreviewWidget'
import YoutubeMusicPlayer from '../components/YoutubeMusicPlayer'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useMemoryGroomer } from '../hooks/useMemoryGroomer'
import { useVAD } from '../hooks/useVAD'

const MarkHome = () => {
  const chatContext = useChat()
  // message = LOCAL state (bukan context) — keystroke tidak re-render halaman lain
  const [message, setMessage] = useState('')
  const {
    chatData,
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
    isBooting
  } = chatContext
  useMemoryGroomer(true) // Aktifkan Hippocampus Engine (auto-groom memori)
  const { isPlaying } = useYoutubeMusic() // Initialize YT Music context

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const isLong = currentResponse?.type === 'long'
  const [activeMode, setActiveMode] = useState(null) // null | 'chat' | 'voice' | 'camera' | 'screen'

  // Mode-swap transition: orb morphs before leaving to /live-audio (no hard page cut)
  const [isSwapping, setIsSwapping] = useState(null)

  const goVoice = () => {
    if (isSwapping) return
    setIsSwapping('voice')
    setTimeout(() => navigate('/live-audio', { state: { morphed: Date.now() } }), 450)
  }

  useEffect(() => {
    const handleOpenMap = () => setIsMemoryMapOpen(true)
    window.addEventListener('open-memory-map', handleOpenMap)
    return () => window.removeEventListener('open-memory-map', handleOpenMap)
  }, [])

  const handleVoiceTranscript = (text) => {
    setIsSpeak(true) // Sets global state
    handlePlanningCommand(text, null, false, null, { forceSpeak: true }) // Pass forceSpeak option
    setMessage('') // Clear local input (voice sudah dikirim)
  }

  const { isRecording, toggleRecording, toastMessage } = useVAD({
    onTranscript: handleVoiceTranscript
  })

  const location = useLocation()
  const navigate = useNavigate()
  const hasAutoStartedRef = useRef(false)

  useEffect(() => {
    if (location.state?.autoStartMic) {
      if (hasAutoStartedRef.current !== location.state.autoStartMic) {
        hasAutoStartedRef.current = location.state.autoStartMic
        toggleRecording()
      }
    }
  }, [location.state?.autoStartMic, toggleRecording])

  // Sync orb status based on isLoading
  useEffect(() => {
    if (isLoading) {
      // If last message is thinking, then thinking. Else speaking/executing
      const lastMsg = chatData[chatData.length - 1]
      if (lastMsg?.isThinking) {
        setOrbStatus('thinking')
      } else if (lastMsg?.isSearching) {
        setOrbStatus('thinking')
      } else if (lastMsg?.role === 'ai' && lastMsg?.content?.includes('Mengeksekusi plugin')) {
        setOrbStatus('thinking')
      } else {
        setOrbStatus('listening')
      }
    } else {
      setOrbStatus('idle')
    }
  }, [isLoading, chatData, setOrbStatus])

  // Override orb status when music is playing
  useEffect(() => {
    if (isPlaying && orbStatus === 'idle') {
      setOrbStatus('playing')
    }
  }, [isPlaying, orbStatus, setOrbStatus])

  // Derived currentResponse from chatData
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const lastItem = chatData[chatData.length - 1]

      if (lastItem.role === 'ai') {
        if (lastItem.isThinking || lastItem.isSearching) {
          // It's a loading state, we might show a short text
          setCurrentResponse({
            text: lastItem.content || 'Memproses instruksi...',
            type: 'short'
          })
        } else {
          // Final response
          setCurrentResponse({
            text: lastItem.content,
            type:
              lastItem.content?.length > 600 ? 'long' : 'short',
            reasoning: lastItem.reasoning || null,
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood,
            options: lastItem.options || null,
            optionsDefault: lastItem.optionsDefault ?? null,
            onPick: handleOptionPick
          })

          // Trigger holographic beam (speaking animation) to project the text
          if (!lastItem.isThinking) {
            setOrbStatus('speaking')
            setTimeout(() => setOrbStatus('idle'), 2500) // Project the beam for 2.5 seconds
          }
        }
      } else {
        // User message, we can clear current response or show "Processing..."
        if (isLoading) {
          setCurrentResponse({
            text: 'Memproses...',
            type: 'short'
          })
        } else {
          setCurrentResponse({
            text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
            type: 'short'
          })
        }
      }
    } else {
      // Empty chat
      setCurrentResponse({
        text: 'Halo, saya Mark. Ada yang bisa saya bantu hari ini?',
        type: 'short'
      })
    }
  }, [chatData, isLoading, isSpeak, setOrbStatus])

  // Drop zone global: seluruh window Mark menerima drop file → teruskan ke InputBar
  useEffect(() => {
    const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
    const onDrop = (e) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (files && files.length) {
        window.dispatchEvent(new CustomEvent('mark:attach-files', { detail: { files: Array.from(files) } }))
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const handleSubmit = (e, text) => {
    const msg = text ?? message
    if (chatContext.handleSubmit) {
      chatContext.handleSubmit(e, msg)
    } else {
      if (msg.trim()) {
        handlePlanningCommand(msg)
      }
    }
    setMessage('') // Clear local input
    // stay in chat mode after submit
    setActiveMode('chat')
  }

  // Pilihan dari OptionsPicker — kirim langsung via inputText (hindari stale state message)
  const handleOptionPick = (label) => {
    const text = `Pilih: ${label}`
    if (chatContext.handleSubmit) {
      chatContext.handleSubmit(null, text)
    } else {
      handlePlanningCommand(text)
    }
    setActiveMode('chat')
  }

  return (
    <div className="h-screen bg-[var(--base-300)] text-white overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {isBooting && (
        <div className="fixed inset-0 bg-base-300 flex flex-col items-center justify-center gap-5 z-[999]">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
            Membangunkan Mark...
          </p>
        </div>
      )}

      {/* Floating UI Elements */}
      <FloatingMenu onOpenHistory={() => setIsHistoryOpen(true)} />
      <StatusIndicator notifications={notifications} />
      <ProcessPanel processes={activeProcesses} onDismiss={dismissProcess} />
      <BrowserPreviewWidget />

      {toastMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 glass glass-hover shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* Main Content Area — single centered column on short answers; two columns (orb+answer | details) on long */}
      <div
        className={`relative z-10 flex flex-col md:flex-row items-center md:items-stretch justify-center gap-4 md:gap-6 w-full h-full px-4 pt-[12vh] pb-48 md:pt-[5vh] md:pb-20 overflow-y-auto no-scrollbar`}
      >
        {/* Center Column — orb + answer. Full width on small screens; left half on md+ */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-2xl md:flex-1 md:max-w-none md:min-w-0 my-4">
          <div className={`relative flex items-center justify-center ${isSwapping === 'voice' ? 'animate-[orb-to-voice_0.45s_ease-in_forwards]' : ''}`}>
            <ThoughtNeuralFlow processes={activeProcesses} />
            <OrbVisualizer
              status={orbStatus}
              intensity={0.5}
              mood={currentResponse?.mood || 'neutral'}
            />
          </div>
          {/* Answer — no boundaries, natural flow; max-h cegah overflow ke tombol */}
          {currentResponse && (
            <div className="w-full max-h-[45vh] overflow-y-auto no-scrollbar animate-[fade-up_0.4s_ease-out_forwards]">
              <ResponseArea currentResponse={currentResponse} />
            </div>
          )}
        </div>

        {/* Right Column — Detail Informasi. Stretch-height = row height; the ONLY scroll surface (contained, invisible scrollbar) */}
        {isLong && (
          <div className="hidden md:block md:flex-1 md:min-w-0 overflow-y-auto no-scrollbar animate-[fade-up_0.4s_ease-out_forwards]">
            {currentResponse && <ResponseDetails currentResponse={currentResponse} />}
          </div>
        )}
      </div>

      {/* 4-Mode Bottom Bar — bar mode SELALU konsisten; InputBar baris terpisah saat chat */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 flex flex-col items-center gap-3">
        {/* Chat input row — hanya saat mode chat */}
        {activeMode === 'chat' && (
          <div className="w-full flex items-center gap-2 animate-[fade-up_0.2s_ease-out_forwards]">
            <div className="flex-1 min-w-0">
              <InputBar
                onSubmit={(finalPrompt) => { setIsSpeak(false); handleSubmit(null, finalPrompt) }}
                isLoading={isLoading || isAgentBusy}
                isRecording={isRecording}
                onToggleRecord={toggleRecording}
                onStop={handleStop}
                source={inputSource}
              />
            </div>
            <button onClick={() => setActiveMode(null)}
              className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border border-white/10 hover:border-red-400/50 transition-all duration-300 active:scale-90 text-white/50 hover:text-red-400 glass glass-hover"
              title="Tutup Chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        )}

        {/* Mode bar — selalu 4 tombol identik, aktif di-highlight */}
        <div className="flex items-center justify-center gap-2 animate-[fade-up_0.15s_ease-out_forwards]">
          <button onClick={() => setActiveMode(activeMode === 'chat' ? null : 'chat')}
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-90 ${
              activeMode === 'chat'
                ? 'bg-white/15 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.12)]'
                : 'glass glass-hover text-white/70 hover:border-white/30'
            }`} title="Chat Mode">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </button>
          <button onClick={goVoice}
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-90 ${
              activeMode === 'voice'
                ? 'bg-white/15 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.12)]'
                : 'glass glass-hover text-white/70 hover:border-white/30'
            }`} title="Voice Mode">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>
          <button onClick={() => setActiveMode('camera')}
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-90 ${
              activeMode === 'camera'
                ? 'bg-white/15 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.12)]'
                : 'glass glass-hover text-white/70 hover:border-white/30'
            }`} title="Camera Mode">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
          <button onClick={() => setActiveMode('screen')}
            className={`w-11 h-11 rounded-full flex items-center justify-center border border-white/10 transition-all duration-300 active:scale-90 ${
              activeMode === 'screen'
                ? 'bg-white/15 border-white/30 text-white shadow-[0_0_16px_rgba(255,255,255,0.12)]'
                : 'glass glass-hover text-white/70 hover:border-white/30'
            }`} title="Share Screen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </button>
        </div>
      </div>

      {/* Slide-out Drawers */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      <MemoryVisualizer isOpen={isMemoryMapOpen} onClose={() => setIsMemoryMapOpen(false)} />

      {/* YouTube Music — bottom-right corner FAB player */}
      <YoutubeMusicPlayer />
    </div>
  )
}

export default MarkHome
