import { useState, useEffect } from 'react'
import MarkHome from './pages/MarkHome'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import TelegramBot from './pages/TelegramBot'
import Plugins from './pages/Plugins'
import Skills from './pages/Skills'
import SkillEditor from './pages/SkillEditor'
import Knowledge from './pages/Knowledge'
import Guidebook from './pages/Guidebook'
import RelationalGrowth from './pages/RelationalGrowth'
import GoogleWorkspace from './pages/GoogleWorkspace'
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig } from './api/db'
import { initOramaIndices, hydrateFromDexie } from './api/oramaStore'
import { pauseStaleAgentTasks } from './api/taskStore'
import { env } from '@huggingface/transformers'

// Global Transformers.js configuration
env.allowLocalModels = false
env.useBrowserCache = true
env.useFSCache = false

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = (event, action) => {
      // Navigate to Home (MarkHome) and trigger microphone auto-toggle
      navigate('/', { state: { autoToggleMic: Date.now() } })
    }

    if (window.api?.onLiveAudioShortcut) {
      window.api.onLiveAudioShortcut(handleShortcut)
    }

    const handleNavigate = (_event, path) => {
      if (typeof path === 'string' && path.startsWith('/')) navigate(path)
    }
    if (window.api?.onNavigate) {
      window.api.onNavigate(handleNavigate)
    }

    if (window.api?.onTgRequestAgentExecution) {
      window.api.onTgRequestAgentExecution((data) => {
        window.dispatchEvent(new CustomEvent('tg-admin-message', { detail: data }))
      })
    }

    return () => {
      if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('route-to-config')
        window.electron.ipcRenderer.removeAllListeners('tg:request-agent-execution')
      }
    }
  }, [navigate])

  return null
}

const WindowControls = () => {
  const [isMax, setIsMax] = useState(false)
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    if (window.api?.onWindowMaximized) {
      window.api.onWindowMaximized((max) => setIsMax(max))
    }
    if (window.api?.onWindowFullscreen) {
      window.api.onWindowFullscreen((fs) => setIsFs(fs))
    }
  }, [])

  return (
    <div className="absolute top-0 left-0 right-0 h-10 z-[9999] flex items-center justify-between px-4 pointer-events-none text-white">
      {/* Invisible left spacer to balance the right controls */}
      <div className="flex-1"></div>

      {/* Center Drag Grip */}
      <div
        className="flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity gap-2 [-webkit-app-region:drag]"
        title="Tahan dan geser untuk memindahkan"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="9" r="1" />
          <circle cx="19" cy="9" r="1" />
          <circle cx="5" cy="9" r="1" />
          <circle cx="12" cy="15" r="1" />
          <circle cx="19" cy="15" r="1" />
          <circle cx="5" cy="15" r="1" />
        </svg>
      </div>

      {/* Right Controls */}
      <div className="flex-1 flex justify-end gap-3 [-webkit-app-region:no-drag] opacity-50 hover:opacity-100 transition-opacity pointer-events-auto">
        <button
          onClick={() => window.api?.windowMinimize()}
          className="text-white/70 hover:text-white transition-colors flex items-center justify-center p-2"
          title="Minimize"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 7h12v2H2z" />
          </svg>
        </button>
        <button
          onClick={() => window.api?.windowMaximize()}
          className="text-white/70 hover:text-white transition-colors flex items-center justify-center p-2"
          title={isMax ? 'Restore' : 'Maximize'}
        >
          {isMax ? (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M4 4h7v7H4V4zm2 2v3h3V6H6z" />
              <path d="M7 2h7v7h-2V4H7V2z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M2 2h12v12H2V2zm2 2v8h8V4H4z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => window.api?.windowFullscreen()}
          className="text-white/70 hover:text-white transition-colors flex items-center justify-center p-2"
          title={isFs ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFs ? (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 6V2h4v1H3v3H2zm12 0V3h-3V2h4v4h-1zM3 10v3h3v1H2v-4h1zm10 3h3v-3h1v4h-4v-1z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 3h4v1H4v2H3V3zm6 0h4v3h-1V4h-3V3zM3 10h1v2h2v1H3v-3zm9 0h1v3h-3v-1h2v-2z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => window.api?.windowClose()}
          className="text-white/70 hover:text-red-500 transition-colors flex items-center justify-center p-2"
          title="Close"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3.707 3.293a1 1 0 0 1 1.414 0L8 6.586l2.879-2.879a1 1 0 1 1 1.414 1.414L9.414 8l2.879 2.879a1 1 0 0 1-1.414 1.414L8 9.414l-2.879 2.879a1 1 0 1 1-1.414-1.414L6.586 8 3.707 5.121a1 1 0 0 1 0-1.414z"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

const GlobalDropZone = () => {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const hasFiles = (e) => e.dataTransfer?.types?.includes('Files')
    const handleDragEnter = (e) => {
      if (hasFiles(e)) setIsDragging(true)
    }
    const handleDragOver = (e) => {
      if (hasFiles(e)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const handleDragLeave = (e) => {
      if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
    }
    const handleDrop = (e) => {
      e.preventDefault()
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) {
        window.dispatchEvent(new CustomEvent('mark-files-dropped', { detail: files }))
      }
    }
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  if (!isDragging) return null
  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center">
      <div className="glass glass-hover border-2 border-dashed border-white/40 rounded-3xl px-10 py-8 flex flex-col items-center gap-3 text-white animate-pulse">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <span className="text-lg font-semibold">Lepaskan file untuk melampirkan</span>
      </div>
    </div>
  )
}

const StandaloneMusicPlayer = () => {
  const location = useLocation()
  if (location.pathname.includes('telegram-bot')) return null
  return <YoutubeMusicPlayer />
}

const MainLayout = () => {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isStandalone = location.pathname.includes('telegram-bot')

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent rounded-xl">
      {!isStandalone && <WindowControls />}
      {/* Base Home Page - Always Mounted so AI Agent & Telegram Listeners Never Die */}
      <div className="h-full w-full">
        <MarkHome />
      </div>

      {/* Floating Glass Sub-page Overlay */}
      {!isHome && (
        <div className="fixed inset-0 z-50 flex flex-col animate-fade-in bg-transparent pointer-events-none">
          <div className="flex-1 pointer-events-auto h-full w-full flex flex-col min-h-0 overflow-hidden">
            <Routes>
              <Route path="/config" element={<Configuration />} />
              <Route path="/plugins" element={<Plugins />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/skill-editor/:id" element={<SkillEditor />} />
              <Route path="/live-audio" element={<LiveAudio />} />
              <Route path="/telegram-bot" element={<TelegramBot />} />
              <Route path="/google-workspace" element={<GoogleWorkspace />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/guidebook" element={<Guidebook />} />
              <Route path="/relational" element={<RelationalGrowth />} />
            </Routes>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [loadingText, setLoadingText] = useState('Membangunkan Mark...')
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRecovery(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const checkConfig = async () => {
      // 1. Init Orama and Hydrate from Dexie
      try {
        setLoadingText('Memuat Knowledge Base...')
        await initOramaIndices()
        await hydrateFromDexie()
        // Recovery saat boot: task yang terputus tidak boleh tetap berstatus running.
        const pausedTaskCount = await pauseStaleAgentTasks('app_restart')
        if (pausedTaskCount > 0) {
          console.log(`[App] ${pausedTaskCount} durable task dipause setelah restart.`)
        }
        console.log('[App] Orama indices ready!')
      } catch (e) {
        console.error('[App] Failed to init Orama:', e)
      }

      // 1.5 Load Embeddings Model
      try {
        setLoadingText('Memuat Memori Kognitif...')
        const { getExtractor } = await import('./api/vectorMemory')
        let memStats = {}
        await getExtractor((info) => {
          if (info.status === 'initiate') {
            memStats[info.file] = { loaded: 0, total: info.total || 0 }
          } else if (info.status === 'progress') {
            if (memStats[info.file]) {
              memStats[info.file].loaded = info.loaded
              memStats[info.file].total = info.total
            }
            const values = Object.values(memStats)
            const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
            const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
            if (totalBytes > 0) {
              const percent = Math.round((loadedBytes / totalBytes) * 100)
              const loadedMB = (loadedBytes / 1024 / 1024).toFixed(1)
              const totalMB = (totalBytes / 1024 / 1024).toFixed(1)
              setLoadingText(`Mengunduh Memori AI... ${percent}% (${loadedMB}MB / ${totalMB}MB)`)
            }
          } else if (info.status === 'done' || info.status === 'ready') {
            setLoadingText('Membangunkan Mark...')
          }
        })
      } catch (e) {
        console.error('[App] Failed to load Transformers:', e)
      }

      // 1.6 Load Local STT (Whisper) Model
      try {
        setLoadingText('Memuat Voice Engine...')
        const { loadWhisper } = await import('./api/localWhisper')
        let sttStats = {}
        await loadWhisper((info) => {
          if (info.status === 'initiate') {
            sttStats[info.file] = { loaded: 0, total: info.total || 0 }
          } else if (info.status === 'progress') {
            if (sttStats[info.file]) {
              sttStats[info.file].loaded = info.loaded
              sttStats[info.file].total = info.total
            }
            const values = Object.values(sttStats)
            const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
            const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
            if (totalBytes > 0) {
              const percent = Math.round((loadedBytes / totalBytes) * 100)
              const loadedMB = (loadedBytes / 1024 / 1024).toFixed(1)
              const totalMB = (totalBytes / 1024 / 1024).toFixed(1)
              setLoadingText(`Mengunduh Voice Engine... ${percent}% (${loadedMB}MB / ${totalMB}MB)`)
            }
          } else if (info.status === 'done' || info.status === 'ready') {
            setLoadingText('Membangunkan Mark...')
          }
        })
      } catch (e) {
        console.error('[App] Failed to load Whisper STT:', e)
      }

      // 2. Load config
      const data = await getAllConfig()
      if (!data || data.length === 0) {
        setHasConfig(false)
      } else {
        setHasConfig(true)
        if (window.api && window.api.syncConfig) {
          window.api.syncConfig(data[0])
        }
      }
      setIsChecking(false)
    }
    checkConfig()
  }, [])

  if (isChecking) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-base-300 rounded-xl flex flex-col">
        <WindowControls />
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <span className="loading loading-infinity w-16 text-primary"></span>
          <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse text-center px-4">
            {loadingText}
          </p>
          {showRecovery && (
            <div className="absolute bottom-10 flex flex-col items-center animate-fade-in">
              <p className="text-xs text-white/40 mb-3 text-center max-w-xs">
                Proses pemuatan memakan waktu lebih lama dari biasanya. Jika terjebak, bersihkan
                cache model.
              </p>
              <button
                onClick={async () => {
                  try {
                    await caches.delete('transformers-cache')
                    console.log('Cache cleared')
                    window.location.reload()
                  } catch (e) {
                    console.error('Failed to clear cache', e)
                    window.location.reload()
                  }
                }}
                className="btn btn-outline btn-error btn-sm"
              >
                Hapus Cache Model & Muat Ulang
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!hasConfig) {
    return <Configuration isFirstSetup={true} onSetupComplete={() => window.location.reload()} />
  }

  return (
    <ApprovalProvider>
      <YoutubeMusicProvider>
        <ChatProvider>
          <HashRouter>
            <GlobalListener />
            <GlobalDropZone />
            <MainLayout />
            <StandaloneMusicPlayer />
            <GlobalCameraManager />
            <GlobalCameraManager />
            <webview
              id="global-ai-search-webview"
              src="about:blank"
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
              style={{ display: 'none' }}
            />
          </HashRouter>
        </ChatProvider>
      </YoutubeMusicProvider>
    </ApprovalProvider>
  )
}

export default App
