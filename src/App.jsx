import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import MarkHome from './pages/MarkHome'
// Route-level code splitting: halaman berat (Monaco, force-graph, syntax
// highlighter, Monaco-based editor) hanya diunduh saat pertama kali dibuka.
// MarkHome tetap eager — wajib selalu mounted agar listener AI/Telegram
// tidak pernah mati (lihat komentar di MainLayout).
const Configuration = lazy(() => import('./pages/Configuration'))
const LiveAudio = lazy(() => import('./pages/LiveAudio'))
const TelegramBot = lazy(() => import('./pages/TelegramBot'))
const Plugins = lazy(() => import('./pages/Plugins'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const Guidebook = lazy(() => import('./pages/Guidebook'))
const RelationalGrowth = lazy(() => import('./pages/RelationalGrowth'))
const GoogleWorkspace = lazy(() => import('./pages/GoogleWorkspace'))
const Connectors = lazy(() => import('./pages/Connectors'))
const Skills = lazy(() => import('./pages/Skills'))
const SkillEditor = lazy(() => import('./pages/SkillEditor'))
const Subagents = lazy(() => import('./pages/Subagents'))
const ChatStudio = lazy(() => import('./pages/ChatStudio'))
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
import { detectHardwareProfile, getProfileConfig } from './utils/autoProfile'
import whatsNewData from './data/whats-new.json'
import { initErrorGuard } from './utils/errorGuard'
import DropAnywhere from './components/core/DropAnywhere'

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
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
  const isTelegram = location.pathname === '/telegram-bot'

  // Drop global satu titik: event 'mark:files-dropped' (detail = array item
  // {name,path,size,type}) bisa dikonsumsi InputBar/komponen lain mana pun.
  const handleGlobalDrop = useCallback((items) => {
    if (items && items.length > 0) {
      window.dispatchEvent(new CustomEvent('mark:files-dropped', { detail: items }))
    }
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent rounded-xl">
      {/* Hide WindowControls on Telegram page — it has its own header with controls */}
      {!isStandalone && !isTelegram && <WindowControls />}
      <DropAnywhere onFilesDropped={handleGlobalDrop} />
      {/* Base Home Page - Always Mounted so AI Agent & Telegram Listeners Never Die */}
      {/* Hidden on Telegram page to prevent overlap with TelegramBot's own header */}
      <div className={`h-full w-full ${isTelegram ? 'hidden' : ''}`}>
        <MarkHome />
      </div>

      {/* Floating Glass Sub-page Overlay */}
      {!isHome && (
        <div className="fixed inset-0 z-50 flex flex-col animate-fade-in bg-transparent pointer-events-none">
          <div className="flex-1 pointer-events-auto h-full w-full flex flex-col min-h-0 overflow-hidden">
            <Suspense
              fallback={
                <div className="h-full w-full flex flex-col items-center justify-center gap-4">
                  <span className="loading loading-infinity w-12 text-primary"></span>
                  <p className="text-xs font-semibold tracking-[0.2em] text-white/40 uppercase animate-pulse">
                    Memuat modul
                  </p>
                </div>
              }
            >
              <Routes>
                <Route path="/chat" element={<ChatStudio />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/plugins" element={<Plugins />} />
                <Route path="/skills" element={<Skills />} />
                <Route path="/skill-editor/:id" element={<SkillEditor />} />
                <Route path="/live-audio" element={<LiveAudio />} />
                <Route path="/telegram-bot" element={<TelegramBot />} />
                <Route path="/google-workspace" element={<GoogleWorkspace />} />
                <Route path="/connectors" element={<Connectors />} />
                <Route path="/knowledge" element={<Knowledge />} />
                <Route path="/guidebook" element={<Guidebook />} />
                <Route path="/relational" element={<RelationalGrowth />} />
                <Route path="/subagents" element={<Subagents />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}

// ── First Boot: pilih Mulai Fresh / Restore data lama ────────────────────
// Muncul sebagai modal overlay HANYA sekali (flag localStorage) saat legacy
// profiles Electron lama terdeteksi. Restore = alur export/import JSON
// (engine beda: Chromium LevelDB tak bisa dibaca langsung oleh WebKit).
const FirstBootChoiceScreen = ({ profiles, onFresh, onRestore }) => (
  <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
    <div className="max-w-md w-full bg-base-200/95 border border-white/10 rounded-2xl shadow-2xl p-7 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold">Data Mark versi lama terdeteksi</h2>
      <p className="text-sm opacity-70 leading-relaxed">
        Ditemukan {profiles.length} profil Mark era lama di folder konfigurasi. Karena mesin browser
        berbeda (Chromium → WebKit), datanya tidak bisa dibaca langsung — tapi tetap aman dan bisa
        dipulihkan lewat file export JSON dari Mark versi lama (Settings → Export DB).
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

  // Error guard: deteksi error/warning umum + auto-fix
  useEffect(() => {
    initErrorGuard()
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

      // 1. Init Orama + Hydrate — SELALU jalan (fitur tidak pernah mati);
      // profil hanya mengatur urutan. ensureIndices() di oramaStore idempoten,
      // jadi pemanggilan eksplisit di sini hanyalah eager-load.
      // Analogy: n8n spawn worker saat boot kalau profile-nya kencang.
      let profileConfig = null
      try {
        let ramGB = null
        if (lm?.totalRAMGB && lm.totalRAMGB > 0) ramGB = lm.totalRAMGB
        profileConfig = getProfileConfig(detectHardwareProfile(ramGB))
        if (profileConfig.eagerLoad.includes('orama')) {
          setLoadingText('Memuat Knowledge Base...')
          await initOramaIndices()
          await hydrateFromDexie((current, total) => {
            setLoadingText(`Mengindeks memori percakapan lama (${current}/${total})...`)
          })
          console.log('[App] Orama indices ready (eager)')
        } else {
          console.log('[App] Orama lazy — dibuat on-demand saat pertama dipakai')
        }
      } catch (e) {
        console.error('[App] Failed to init Orama:', e)
      }

      // 1.5 Load Embeddings Model — TETAP dimuat walau lite mode: lite hanya
      // berarti WASM mungkin lambat, bukan alasan kehilangan embedding nyata.
      // Worker punya fallback ladder SIMD -> scalar -> CPU (embedding.worker.js).
      try {
        const shouldLoadVectors = profileConfig?.eagerLoad.includes('vectors')
        if (shouldLoadVectors) {
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
        } else {
          console.log('[App] Vector model skipped — lazy-load on demand')
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

      // 2.5 Apply hardware profile (auto-detected, saved to localStorage)
      // No modal — detection runs silently in background. User can change in Settings.
      try {
        const savedProfile = localStorage.getItem('mark:resource-mode')
        if (!savedProfile) {
          const detected = detectHardwareProfile()
          const cfg = getProfileConfig(detected)
          localStorage.setItem('mark:resource-mode', detected)
          console.log(`[Profile] Auto-detected: ${cfg.label} (${detected})`)
          window.dispatchEvent(new CustomEvent('profile-applied', { detail: cfg }))
        }
      } catch (e) {
        console.warn('[Profile] Detection failed, using default STANDARD:', e)
      }

      setIsChecking(false)
    }
    checkConfig()
  }, [])

  const settleChoice = useCallback(async (value) => {
    localStorage.setItem('mark:first-boot-choice', value)
    const defaultConfig = {
      id: 1,
      model: 'google/gemma-3-4b',
      geminiWebModel: 'gemini-3.6-flash',
      temperature: 1.0,
      context: 10,
      aiProvider: 'gemini-web',
      awarenessEnabled: false,
      windowOpacity: 1,
      lastSeenWhatsNewVersion: null
    }
    await saveConfiguration(defaultConfig)
    setHasConfig(true)
    if (value === 'restore') {
      // Restore dijalankan DI LATAR BELAKANG: user langsung diarahkan ke
      // MarkHome dan diberi tahu lewat toast kanan-atas saat impor selesai
      // (tidak memblokir first-run experience). Impor manual tetap tersedia
      // di Configuration > Data Controls bila user melewatkan file ini.
      window.location.replace('/#/config?legacy-import=1')
      return
    }
    window.location.replace('/')
  }, [])

  // First-boot logic: legacy profile chooser as modal overlay
  const choiceMade = localStorage.getItem('mark:first-boot-choice')
  const showLegacyChooser =
    !hasConfig &&
    Array.isArray(legacyProfiles) &&
    legacyProfiles.length > 0 &&
    !choiceMade &&
    !wizardAutoImport

  // Fresh install (no legacy profiles): auto-create config immediately
  useEffect(() => {
    if (!hasConfig && !showLegacyChooser && !choiceMade && !wizardAutoImport) {
      settleChoice('fresh')
    }
  }, [hasConfig, showLegacyChooser, choiceMade, wizardAutoImport, settleChoice])

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
    <>
      {showLegacyChooser && (
        <FirstBootChoiceScreen
          profiles={legacyProfiles}
          onFresh={() => settleChoice('fresh')}
          onRestore={() => settleChoice('restore')}
        />
      )}
      <HashRouter>
        <ApprovalProvider>
          <YoutubeMusicProvider>
            <ChatProvider>
              <GlobalListener />
              <MainLayout isStandalone={isStandalone} />
              {showWhatsNew && !isChecking && hasConfig && (
                <WhatNew onClose={handleWhatsNewClose} />
              )}
              <div style={{ display: isStandalone ? 'none' : 'block' }}>
                <YoutubeMusicPlayer />
              </div>
              <GlobalCameraManager />
            </ChatProvider>
          </YoutubeMusicProvider>
        </ApprovalProvider>
      </HashRouter>
    </>
  )
}

export default App
