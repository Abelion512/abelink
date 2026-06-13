import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import WhatsappBot from './pages/WhatsappBot'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { getAllConfig } from './api/db'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = () => {
      // Force autoStart dengan timestamp agar state selalu unik dan termakan useEffect
      navigate('/live-audio', { state: { autoStart: Date.now() } })
    }

    if (window.api?.onLiveAudioShortcut) {
      window.api.onLiveAudioShortcut(handleShortcut)
    }

    return () => {
      if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }
    }
  }, [navigate])

  return null
}

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkConfig = async () => {
      const data = await getAllConfig()
      if (!data || data.length === 0) {
        setHasConfig(false)
      } else {
        setHasConfig(true)
      }
      setIsChecking(false)
    }
    checkConfig()
  }, [])

  if (isChecking) {
    return (
      <div className="h-screen w-screen bg-base-300 flex flex-col items-center justify-center gap-5">
        <span className="loading loading-infinity w-16 text-primary"></span>
        <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
          Membangunkan Mark...
        </p>
      </div>
    )
  }

  if (!hasConfig) {
    return (
      <Configuration 
        isFirstSetup={true} 
        onSetupComplete={() => setHasConfig(true)} 
      />
    )
  }

  const isStandalone = window.location.hash.includes('whatsapp-bot')

  return (
    <YoutubeMusicProvider>
      <ChatProvider>
        <HashRouter>
          <GlobalListener />
          <div className="h-screen flex flex-col overflow-hidden">
            {!isStandalone && <Navbar />}
            <div className={!isStandalone ? "h-[calc(100vh-4rem)] mt-16" : "h-screen w-full"}>
              <Routes>
                <Route path="/" element={<Chat />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/live-audio" element={<LiveAudio />} />
                <Route path="/whatsapp-bot" element={<WhatsappBot />} />
              </Routes>
            </div>
          </div>
          {!isStandalone && <YoutubeMusicPlayer />}
        </HashRouter>
      </ChatProvider>
    </YoutubeMusicProvider>
  )
}

export default App
