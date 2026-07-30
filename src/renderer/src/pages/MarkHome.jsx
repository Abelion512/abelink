import React, { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useChat } from '../contexts/ChatContext'
import OrbVisualizer from '../components/core/OrbVisualizer'
import InputBar from '../components/core/InputBar'
import ResponseArea from '../components/core/ResponseArea'
import StatusIndicator from '../components/core/StatusIndicator'
import FloatingMenu from '../components/core/FloatingMenu'
import HistoryDrawer from '../components/core/HistoryDrawer'
import ProcessPanel from '../components/core/ProcessPanel'
import ThoughtNeuralFlow from '../components/core/ThoughtNeuralFlow'
import MemoryVisualizer from '../components/core/MemoryVisualizer'
import BrowserPreviewWidget from '../components/core/BrowserPreviewWidget'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useVAD } from '../hooks/useVAD'

const MarkHome = () => {
  const chatContext = useChat()
  const {
    chatData,
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
    config
  } = chatContext
  const { isPlaying, currentTrack } = useYoutubeMusic()

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const [activeMode, setActiveMode] = useState(null) // null | 'chat' | 'voice' | 'camera' | 'screen'

  useEffect(() => {
    const handleOpenMap = () => setIsMemoryMapOpen(true)
    window.addEventListener('open-memory-map', handleOpenMap)
    return () => window.removeEventListener('open-memory-map', handleOpenMap)
  }, [])

  const handleVoiceTranscript = (text) => {
    setMessage(text)
    setIsSpeak(true) // Sets global state
    handlePlanningCommand(text, null, false, null, { forceSpeak: true }) // Pass forceSpeak option
  }

  const { isRecording, toggleRecording, toastMessage } = useVAD({
    onTranscript: handleVoiceTranscript
  })

  const location = useLocation()
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
              lastItem.content?.length > 200 || lastItem.content?.includes('\n') ? 'long' : 'short',
            sources: lastItem.sources || [],
            youtubeData: lastItem.youtubeData,
            youtubeSummary: lastItem.youtubeLink,
            pluginResult: lastItem.pluginExecution,
            isProactive: lastItem.isProactive,
            mood: lastItem.mood
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

  const handleSubmit = (e) => {
    if (chatContext.handleSubmit) {
      chatContext.handleSubmit(e)
    } else {
      if (message.trim()) {
        handlePlanningCommand(message)
      }
    }
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
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-error/90 text-white px-4 py-2 rounded-xl z-50 backdrop-blur shadow-lg animate-bounce text-sm">
          {toastMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col items-center w-full h-full px-4 pt-[12vh] pb-48 overflow-y-auto no-scrollbar">
        {/* The Orb — fixed size, center top */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-3xl my-4">
          <div className="relative flex items-center justify-center">
            <ThoughtNeuralFlow processes={activeProcesses} />
            <OrbVisualizer
              status={orbStatus}
              intensity={0.5}
              mood={currentResponse?.mood || 'neutral'}
            />
          </div>
          {/* Now Playing — inline text below orb */}
          {isPlaying && currentTrack?.title && (
            <div className="animate-[fade-up_0.4s_ease-out_forwards] text-center mt-2">
              <p className="text-white/80 text-sm font-light tracking-wide">
                ♪ {currentTrack.title}
              </p>
              {currentTrack.artist && (
                <p className="text-white/40 text-xs font-extralight">{currentTrack.artist}</p>
              )}
            </div>
          )}
        </div>

        {/* Response Area */}
        <div className="w-full max-w-2xl flex flex-col items-center gap-4 px-4">
          {/* Response — no boundaries, natural flow */}
          {currentResponse && (
            <div className="w-full animate-[fade-up_0.4s_ease-out_forwards]">
              <ResponseArea currentResponse={currentResponse} />
            </div>
          )}
        </div>
      </div>

      {/* 4-Mode Bottom Bar — chat button morphs into InputBar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        {activeMode === 'chat' ? (
          /* Chat mode: chat button expanded into full InputBar */
          <>
            <InputBar
              value={message}
              onChange={(e) => { setMessage(e.target.value); if (isSpeak) setIsSpeak(false) }}
              onSubmit={() => { setIsSpeak(false); handleSubmit() }}
              isLoading={isLoading || isAgentBusy}
              isRecording={isRecording}
              onToggleRecord={toggleRecording}
              onStop={handleStop}
              source={inputSource}
            />
            {/* Collapse button — X to close chat mode */}
            <button
              onClick={() => setActiveMode(null)}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-red-400/50 transition-all duration-300 active:scale-90 text-white/50 hover:text-red-400 shrink-0"
              title="Close Chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
            {/* Other 3 buttons */}
            <button onClick={() => setActiveMode(activeMode === 'voice' ? null : 'voice')}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shrink-0 ${activeMode === 'voice' ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 text-white/70'}`}
              title="Voice Mode"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>
            <button onClick={() => setActiveMode(activeMode === 'camera' ? null : 'camera')}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shrink-0 ${activeMode === 'camera' ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 text-white/70'}`}
              title="Camera"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></button>
            <button onClick={() => setActiveMode(activeMode === 'screen' ? null : 'screen')}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shrink-0 ${activeMode === 'screen' ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 text-white/70'}`}
              title="Share Screen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>
          </>
        ) : (
          /* 4 circle buttons — default collapsed state */
          <>
            <button onClick={() => setActiveMode('chat')}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 transition-all duration-300 active:scale-90 text-white/70" title="Chat Mode">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </button>
            <button onClick={() => setActiveMode(activeMode === 'voice' ? null : 'voice')}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 shrink-0 ${activeMode === 'voice' ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 text-white/70'}`}
              title="Voice Mode"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>
            <button onClick={() => setActiveMode('camera')}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 transition-all duration-300 active:scale-90 text-white/70" title="Camera Mode">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </button>
            <button onClick={() => setActiveMode('screen')}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 hover:border-green-500/50 transition-all duration-300 active:scale-90 text-white/70" title="Share Screen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </button>
          </>
        )}
      </div>

      {/* Slide-out Drawers */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      <MemoryVisualizer isOpen={isMemoryMapOpen} onClose={() => setIsMemoryMapOpen(false)} />
    </div>
  )
}

export default MarkHome
