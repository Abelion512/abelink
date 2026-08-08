import { useState, useEffect, lazy, Suspense } from 'react'
const MarkHome = lazy(() => import('./pages/MarkHome'))
const Configuration = lazy(() => import('./pages/Configuration'))
const Guidebook = lazy(() => import('./pages/Guidebook'))
const Plugins = lazy(() => import('./pages/Plugins'))
const LiveAudio = lazy(() => import('./pages/LiveAudio'))
const WhatsappBot = lazy(() => import('./pages/WhatsappBot'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const RelationalGrowth = lazy(() => import('./pages/RelationalGrowth'))
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig, saveConfiguration } from './api/db'
import { getExtractor } from './api/vectorMemory'
import { runWhatsappAgent } from './api/waAgent'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = () => {
      // Navigate to Home (MarkHome) and trigger microphone auto-start
      navigate('/', { state: { autoStartMic: Date.now() } })
    }

    if (window.api?.onLiveAudioShortcut) {
      window.api.onLiveAudioShortcut(handleShortcut)
    }

    if (window.api?.onWaAdminRequest) {
      window.api.onWaAdminRequest(async (data) => {
        // Simpan ke DB agar Configuration.jsx bisa membaca
        const configs = await getAllConfig()
        if (configs && configs[0]) {
          const cfg = configs[0]
          const pending = cfg.waPendingAdmins || []
          const existingIdx = pending.findIndex((p) => p.id === data.id)
          if (existingIdx !== -1) {
            pending[existingIdx] = data
          } else {
            pending.push(data)
          }
          await saveConfiguration({ ...cfg, waPendingAdmins: pending })
        }
      })
    }

    const handleRouteToConfig = () => {
      navigate('/config', { state: { highlightAdmin: true } })
    }

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('route-to-config', handleRouteToConfig)
    }

    if (window.api?.onWaRequestAgentExecution) {
      window.api.onWaRequestAgentExecution(async (data) => {
        const { text, isAdmin, senderName, jid, isGroup, msgId, chatSession } = data
        if (isAdmin) {
          window.dispatchEvent(new CustomEvent('wa-admin-message', { detail: data }))
        } else {
          // Single Fetch Agent for Non-Admin via waAgent
          const result = await runWhatsappAgent(text, senderName, jid, isGroup, chatSession)
          window.api.sendWaAgentExecutionDone({ jid, result, msgId })
        }
      })
    }

    // Web search logic moved to waAutonomous.js for better modularity

    return () => {
      if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('route-to-config')
        window.electron.ipcRenderer.removeAllListeners('wa:admin-request') // if this is the actual channel name
        window.electron.ipcRenderer.removeAllListeners('wa:request-agent-execution') // if this is the channel name
      }
    }
  }, [navigate])

  return null
}

import { ensureOramaReady } from './api/oramaStore'

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [loadingText, setLoadingText] = useState('Membangunkan Mark...')

  useEffect(() => {
    const checkConfig = async () => {
      // 1. Init Orama and Hydrate from Dexie
      try {
        setLoadingText('Memuat Knowledge Base...')
        await ensureOramaReady()
        console.log('[App] Orama indices ready!')
      } catch (e) {
        console.error('[App] Failed to init Orama:', e)
      }

      // 1.5 Load Embeddings Model
      try {
        setLoadingText('Memuat Memori Kognitif...')
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
      <div className="h-screen w-screen bg-base-300 flex flex-col items-center justify-center gap-5">
        <span className="loading loading-infinity w-16 text-primary"></span>
        <p className="text-sm font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
          {loadingText}
        </p>
      </div>
    )
  }

  if (!hasConfig) {
    return <Suspense fallback={<div className="h-screen w-screen bg-base-300 flex items-center justify-center"><span className="loading loading-infinity w-16 text-primary"></span></div>}><Configuration isFirstSetup={true} onSetupComplete={() => window.location.reload()} /></Suspense>
  }

  const isStandalone = window.location.hash.includes('whatsapp-bot')
  const pageFallback = <div className="flex items-center justify-center h-screen bg-base-300"><span className="loading loading-infinity w-16 text-primary"></span></div>

  return (
    <ApprovalProvider>
      <YoutubeMusicProvider>
        <ChatProvider>
          <HashRouter>
            <GlobalListener />
            <div className="h-screen flex flex-col overflow-hidden">
              <div className="h-screen w-full">
                <Routes>
                  <Route path="/" element={<Suspense fallback={pageFallback}><MarkHome /></Suspense>} />
                  <Route path="/config" element={<Suspense fallback={pageFallback}><Configuration /></Suspense>} />
                  <Route path="/plugins" element={<Suspense fallback={pageFallback}><Plugins /></Suspense>} />
                  <Route path="/live-audio" element={<Suspense fallback={pageFallback}><LiveAudio /></Suspense>} />
                  <Route path="/whatsapp-bot" element={<Suspense fallback={pageFallback}><WhatsappBot /></Suspense>} />
                  <Route path="/knowledge" element={<Suspense fallback={pageFallback}><Knowledge /></Suspense>} />
                  <Route path="/guidebook" element={<Suspense fallback={pageFallback}><Guidebook /></Suspense>} />
                  <Route path="/relational" element={<Suspense fallback={pageFallback}><RelationalGrowth /></Suspense>} />
                </Routes>
              </div>
            </div>
            <div style={{ display: isStandalone ? 'none' : 'block' }}>
            </div>
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
