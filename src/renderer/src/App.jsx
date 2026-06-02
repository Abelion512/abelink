import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Chat from './pages/Chat'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { useNavigate } from 'react-router-dom'

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
  return (
    <YoutubeMusicProvider>
      <ChatProvider>
        <HashRouter>
          <GlobalListener />
          <div className="h-screen flex flex-col">
            <Navbar />
            <div className="h-[calc(100vh-4rem)] mt-16">
              <Routes>
                <Route path="/" element={<Chat />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/live-audio" element={<LiveAudio />} />
              </Routes>
            </div>
          </div>
          <YoutubeMusicPlayer />
        </HashRouter>
      </ChatProvider>
    </YoutubeMusicProvider>
  )
}

export default App
