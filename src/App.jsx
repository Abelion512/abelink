import { useState, useEffect } from 'react'
import MarkHome from './pages/MarkHome'
import Configuration from './pages/Configuration'
import LiveAudio from './pages/LiveAudio'
import TelegramBot from './pages/TelegramBot'
import Plugins from './pages/Plugins'
import Knowledge from './pages/Knowledge'
import Guidebook from './pages/Guidebook'
import RelationalGrowth from './pages/RelationalGrowth'
import GoogleWorkspace from './pages/GoogleWorkspace'
import Skills from './pages/Skills'
import SkillEditor from './pages/SkillEditor'
import Subagents from './pages/Subagents'
import ChatStudio from './pages/ChatStudio'
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig, saveConfiguration } from './api/db'
import { initOramaIndices, hydrateFromDexie } from './api/oramaStore'
import { pauseStaleAgentTasks } from './api/taskStore'
import { setLiteMode } from './api/vectorMemory'
import WhatNew from './components/WhatNew'
import whatsNewData from './data/whats-new.json'

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

  useEffect(() => {
    if (window.api?.onWindowMaximized) {
      window.api.onWindowMaximized((max) => setIsMax(max))
    }
  }, [])

  return (
    <div className="absolute top-0 left-0 right-0 h-10 z-[9999] [-webkit-app-region:no-drag] flex items-center justify-between px-4 pointer-events-none text-white">
      {/* Invisible left spacer to balance the right controls */}
      <div className="flex-1"></div>

      {/* Center Drag Grip */}
      <div
        data-tauri-drag-region=""
        className="flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity gap-2"
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
          onClick={() => window.api?.windowFullscreen()}
          className="text-white/70 hover:text-white transition-colors flex items-center justify-center p-2"
          title="Fullscreen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 3-9 9" />
            <path d="M21 3h-6" />
            <path d="M21 3v6" />
            <path d="m3 21 9-9" />
            <path d="M3 21h6" />
            <path d="M3 21v-6" />
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

const MainLayout = ({ isStandalone = false }) => {
  const location = useLocation()
  const isHome = location.pathname === '/'

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
              <Route path="/chat" element={<ChatStudio />} />
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
              <Route path="/subagents" element={<Subagents />} />
            </Routes>
          </div>
        </div>
      )}
    </div>
  )
}

// ── First Boot: pilih Mulai Fresh / Restore data lama ────────────────────
// Muncul HANYA sekali (flag localStorage) saat wizard terdeteksi + profil
// Electron lama ada. Restore = alur export/import JSON (engine beda: Chromium
// LevelDB tak bisa dibaca langsung oleh WebKit).
const FirstBootChoiceScreen = ({ profiles, onFresh, onRestore }) => (
  <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
    <div className="max-w-md w-full bg-base-200/95 border border-white/10 rounded-2xl shadow-2xl p-7 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold">Data Mark versi lama terdeteksi</h2>
      <p className="text-sm opacity-70 leading-relaxed">
        Ditemukan {profiles.length} profil Mark era lama di folder konfigurasi. Karena mesin
        browser berbeda (Chromium → WebKit), datanya tidak bisa dibaca langsung — tapi tetap aman
        dan bisa dipulihkan lewat file export JSON dari Mark versi lama (Settings → Export DB).
      </p>
      <div className="flex flex-col gap-2 pt-1">
        <button className="btn btn-primary" onClick={onRestore}>
          Restore dari Export JSON
        </button>
        <button className="btn btn-ghost" onClick={onFresh}>
          Mulai Fresh (abaikan data lama)
        </button>
      </div>
      <p className="text-[11px] opacity-40">
        Pilihan ini hanya ditanyakan sekali. Kamu masih bisa impor manual kapan saja lewat menu
        Configuration.
      </p>
    </div>
  </div>
)

function App() {
  const [hasConfig, setHasConfig] = useState(true)
  const [isChecking, setIsChecking] = useState(true)
  const [loadingText, setLoadingText] = useState('Membangunkan Mark...')
  const [showRecovery, setShowRecovery] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [legacyProfiles, setLegacyProfiles] = useState(null) // null = belum dicek
  const [wizardAutoImport, setWizardAutoImport] = useState(false)

  // Deteksi profil era Electron hanya saat wizard aktif (first boot tanpa config).
  useEffect(() => {
    if (isChecking || hasConfig || !window.api?.legacyDetectProfiles) return
    let alive = true
    window.api
      .legacyDetectProfiles()
      .then((paths) => {
        if (alive) setLegacyProfiles(paths || [])
      })
      .catch(() => alive && setLegacyProfiles([]))
    return () => {
      alive = false
    }
  }, [isChecking, hasConfig])

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRecovery(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [])

  // What's New dibuka manual dari item teratas hamburger (bukan auto-popup).
  useEffect(() => {
    const openWhatNew = () => setShowWhatsNew(true)
    window.addEventListener('mark:open-whats-new', openWhatNew)
    return () => window.removeEventListener('mark:open-whats-new', openWhatNew)
  }, [])

  useEffect(() => {
    const checkConfig = async () => {
      // 0. Detect lite mode FIRST — set flag before any hydration so generateVector
      //    uses hash embeddings instead of triggering WASM extractor load.
      let lm = null
      try {
        lm = await window.api.getLiteMode()
        setLiteMode(lm.isLite)
      } catch (e) {
        console.error('[App] Failed to get lite mode status:', e)
      }

      // 1. Init Orama and Hydrate from Dexie
      try {
        setLoadingText('Memuat Knowledge Base...')
        await initOramaIndices()
        await hydrateFromDexie((current, total) => {
          setLoadingText(`Mengindeks memori percakapan lama (${current}/${total})...`)
        })
        // Recovery saat boot: task yang terputus tidak boleh tetap berstatus running.
        const pausedTaskCount = await pauseStaleAgentTasks('app_restart')
        if (pausedTaskCount > 0) {
          console.log(`[App] ${pausedTaskCount} durable task dipause setelah restart.`)
        }
        console.log('[App] Orama indices ready!')
      } catch (e) {
        console.error('[App] Failed to init Orama:', e)
      }

      // 1.5 Load Embeddings Model (skip in lite mode)
      try {
        if (!lm?.isLite) {
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
        }
      } catch (e) {
        console.error('[App] Failed to load Transformers:', e)
      }

      // 1.6 Voice Engine (Whisper) sengaja TIDAK di-preload di boot —
      // transcribeAudioLocal memuat model saat pertama kali dipakai
      // (lazy by design, lihat src/api/localWhisper.js). Boot jadi lebih cepat.

      // 2. Load config
      const data = await getAllConfig()
      if (!data || data.length === 0) {
        setHasConfig(false)
      } else {
        setHasConfig(true)
        if (window.api && window.api.syncConfig) {
          window.api.syncConfig(data[0])
        }
        // Terapkan alpha jendela tersimpan via CSS var (transparansi eksperimental).
        try {
          document.documentElement.style.setProperty(
            '--win-alpha',
            String(typeof data[0].windowOpacity === 'number' ? data[0].windowOpacity : 1)
          )
        } catch (_) {}
        // --- What's New: TIDAK auto-popup lagi. Modal dibuka dari item
        // teratas hamburger; badge dihitung dari mirror localStorage.
        try {
          if (localStorage.getItem('mark:last-seen-whats-new') === null) {
            localStorage.setItem('mark:last-seen-whats-new', '')
          }
        } catch (_) {}
        // -----------------
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
    // Wizard setup tetap butuh kontrol window (minimize/close dsb.) —
    // jangan biarkan cabang ini tampil tanpa titlebar.
    const choiceMade = localStorage.getItem('mark:first-boot-choice')
    const showChooser =
      Array.isArray(legacyProfiles) && legacyProfiles.length > 0 && !choiceMade && !wizardAutoImport

    const settleChoice = (value) => {
      localStorage.setItem('mark:first-boot-choice', value)
      if (!choiceMade) localStorage.setItem('mark:first-boot-choice', value)
    }

    return (
      <>
        <WindowControls />
        {showChooser ? (
          <FirstBootChoiceScreen
            profiles={legacyProfiles}
            onFresh={() => {
              settleChoice('fresh')
              setLegacyProfiles([])
            }}
            onRestore={() => {
              settleChoice('restore')
              setWizardAutoImport(true)
            }}
          />
        ) : (
          <Configuration
            isFirstSetup={true}
            initialLegacyImport={wizardAutoImport}
            onSetupComplete={() => {
              if (!localStorage.getItem('mark:first-boot-choice')) {
                localStorage.setItem('mark:first-boot-choice', 'setup-complete')
              }
              window.location.reload()
            }}
          />
        )}
      </>
    )
  }

  const isStandalone = window.location.hash.includes('telegram-bot')

  const handleWhatsNewClose = async () => {
    setShowWhatsNew(false)
    try {
      const data = await getAllConfig()
      if (data && data.length > 0) {
        await saveConfiguration({ ...data[0], lastSeenWhatsNewVersion: whatsNewData.version })
      }
      // Mirror untuk badge hamburger.
      try {
        localStorage.setItem('mark:last-seen-whats-new', whatsNewData.version)
      } catch (_) {}
    } catch (e) {
      console.error('[App] Gagal simpan lastSeenWhatsNewVersion:', e)
    }
  }

  return (
    <ApprovalProvider>
      <YoutubeMusicProvider>
        <ChatProvider>
          <HashRouter>
            <GlobalListener />
            <MainLayout isStandalone={isStandalone} />
            {showWhatsNew && !isChecking && hasConfig && (
              <WhatNew onClose={handleWhatsNewClose} />
            )}
            <div style={{ display: isStandalone ? 'none' : 'block' }}>
              <YoutubeMusicPlayer />
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
