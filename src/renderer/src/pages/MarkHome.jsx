import React, { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
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
import musicCoverFallback from '../assets/music-cover.png'
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
  const { isPlaying, currentTrack, isPlayerOpen } = useYoutubeMusic()

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isMemoryMapOpen, setIsMemoryMapOpen] = useState(false)
  const [currentResponse, setCurrentResponse] = useState(null)
  const isLong = currentResponse?.type === 'long'
  const [showMusicWidget, setShowMusicWidget] = useState(false)
  const [isMusicAnimatingOut, setIsMusicAnimatingOut] = useState(false)

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

  // Handle music widget exit animation
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
        }, 500) // Match the holo-dismiss duration
        return () => clearTimeout(timer)
      }
    }
  }, [isPlaying, currentTrack?.title, showMusicWidget])

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

      {/* Main Content Area — single centered column on short answers; two columns (orb+answer | details) on long */}
      <div
        className={`relative z-10 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-6 w-full h-full px-4 pt-[12vh] pb-48 lg:pt-[5vh] lg:pb-20 ${
          isLong ? 'overflow-hidden' : 'overflow-y-auto no-scrollbar'
        }`}
      >
        {/* Center Column — orb + answer. Full width on small screens; left half on lg+ */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-2xl lg:flex-1 lg:max-w-none lg:min-w-0 my-4">
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

          {/* Answer — no boundaries, natural flow */}
          {currentResponse && (
            <div className="w-full animate-[fade-up_0.4s_ease-out_forwards]">
              <ResponseArea currentResponse={currentResponse} />
            </div>
          )}
        </div>

        {/* Right Column — Detail Informasi. Stretch-height = row height; the ONLY scroll surface (contained, invisible scrollbar) */}
        {isLong && (
          <div className="hidden lg:block lg:flex-1 lg:min-w-0 overflow-y-auto no-scrollbar animate-[fade-up_0.4s_ease-out_forwards]">
            {currentResponse && <ResponseDetails currentResponse={currentResponse} />}
          </div>
        )}
      </div>

      {/* Bottom Input Area */}
      <InputBar
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          if (isSpeak) setIsSpeak(false) // Typing disables voice auto-reply
        }}
        onSubmit={() => {
          setIsSpeak(false) // Typing submit disables voice auto-reply
          handleSubmit()
        }}
        isLoading={isLoading || isAgentBusy}
        isRecording={isRecording}
        onToggleRecord={toggleRecording}
        onStop={handleStop}
        source={inputSource}
      />

      {/* Slide-out Drawers */}
      <HistoryDrawer isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />

      <MemoryVisualizer isOpen={isMemoryMapOpen} onClose={() => setIsMemoryMapOpen(false)} />
    </div>
  )
}

export default MarkHome
