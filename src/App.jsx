import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import AbelinkHome from './pages/AbelinkHome'
// Route-level code splitting: halaman berat (Monaco, force-graph, syntax
// highlighter, Monaco-based editor) hanya diunduh saat pertama kali dibuka.
// AbelinkHome tetap eager  -  wajib selalu mounted agar listener AI/Telegram
// tidak pernah mati (lihat komentar di MainLayout).
const Configuration = lazy(() => import('./pages/Configuration'))
const TelegramBot = lazy(() => import('./pages/TelegramBot'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const Guidebook = lazy(() => import('./pages/Guidebook'))
const RelationalGrowth = lazy(() => import('./pages/RelationalGrowth'))
const Subagents = lazy(() => import('./pages/Subagents'))
const ChatStudio = lazy(() => import('./pages/ChatStudio'))
const Trajectory = lazy(() => import('./pages/Trajectory'))
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { ChatProvider } from './contexts/ChatContext'
import { YoutubeMusicProvider } from './contexts/YoutubeMusicContext'
import { ApprovalProvider } from './contexts/ApprovalContext'
import { YoutubeMusicPlayer } from './components/YoutubeMusicPlayer'
import { GlobalCameraManager } from './components/GlobalCameraManager'
import { getAllConfig, saveConfiguration } from './api/db'
import { initOramaIndices, hydrateFromDexie } from './api/oramaStore'
import { pauseStaleTasks } from './api/engine/taskRuntime'
import { setLiteMode } from './api/vectorMemory'
import WhatNew from './components/WhatNew'
import { detectHardwareProfile, getProfileConfig } from './utils/autoProfile'
import whatsNewData from './data/whats-new.json'
import { initErrorGuard } from './utils/errorGuard'
import DropAnywhere from './components/core/DropAnywhere'
import WindowControls from './components/core/WindowControls'
import { WindowResizeFrame } from './components/core/WindowResizeFrame'
import SpotlightBar from './components/core/SpotlightBar'
import AutomationHUD from './components/core/AutomationHUD'
import AppSidebar from './components/core/AppSidebar'
import BootScreen from './components/core/BootScreen'
import { DotGridSpotlight } from './components/core/DotGridSpotlight'
import { MobiusLoader } from './components/core/MobiusLoader'

const GlobalListener = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = (event, action) => {
      // Navigate to Home (AbelinkHome) and trigger microphone auto-toggle
      navigate('/', { state: { autoToggleMic: Date.now() } })
    }

    let unlistenShortcut = null
    if (window.api?.onLiveAudioShortcut) {
      unlistenShortcut = window.api.onLiveAudioShortcut(handleShortcut)
    }

    let unlistenTg = null
    if (window.api?.onTgRequestAgentExecution) {
      unlistenTg = window.api.onTgRequestAgentExecution((data) => {
        window.dispatchEvent(new CustomEvent('tg-admin-message', { detail: data }))
      })
    }

    return () => {
      if (typeof unlistenShortcut === 'function') {
        unlistenShortcut()
      } else if (window.api?.removeLiveAudioShortcut) {
        window.api.removeLiveAudioShortcut()
      }

      if (typeof unlistenTg === 'function') {
        unlistenTg()
      }
    }
  }, [navigate])

  return null
}

const MainLayout = ({ isStandalone = false }) => {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isTelegram = location.pathname === '/telegram-bot'
  const [windowMode, setWindowMode] = useState('dashboard')

  useEffect(() => {
    if (window.api?.onWindowModeChanged) {
      const unlisten = window.api.onWindowModeChanged((mode) => {
        if (mode === 'spotlight' || mode === 'dashboard') {
          setWindowMode(mode)
        }
      })
      return () => {
        if (typeof unlisten === 'function') unlisten()
      }
    }
  }, [])

  // Drop global satu titik: event 'abelink:files-dropped' (detail = array item
  // {name,path,size,type}) bisa dikonsumsi InputBar/komponen lain mana pun.
  const handleGlobalDrop = useCallback((items) => {
    if (items && items.length > 0) {
      window.dispatchEvent(new CustomEvent('abelink:files-dropped', { detail: items }))
    }
  }, [])

  const isSpotlight = windowMode === 'spotlight'

  return (
    <div className={`relative h-screen w-screen overflow-hidden bg-transparent rounded-xl flex items-stretch justify-start ${isSpotlight ? 'p-1 items-center justify-center' : ''}`}>
      {/* Edge & Corner Resize Frame for Frameless Window (Semua Halaman) */}
      <WindowResizeFrame />

      {isSpotlight && (
        <SpotlightBar
          onExpandDashboard={() => {
            setWindowMode('dashboard')
            window.api?.windowSetMode?.('dashboard')
          }}
        />
      )}

      {/* Persistent macOS-style sidebar: lives at MainLayout level so it
          persists across home + sub-page overlay (AbelinkHome owns History
          state and listens for 'abelink:open-history'). */}
      {!isSpotlight && <AppSidebar />}

      {/* Content area beside the sidebar */}
      <div className="flex-1 h-full min-w-0 flex flex-col min-h-0">
      {/* Base Home Page - Always Mounted so AI Agent & Telegram Listeners Never Die */}
      {/* Hidden when not on home or in spotlight to prevent overlapping headers & controls */}
      <div className={`h-full w-full ${!isHome || isSpotlight ? 'hidden' : ''}`}>
        <AbelinkHome />
      </div>

      {!isSpotlight && (
        <>
          {/* WindowControls at Top Right for Sub-pages */}
          {!isStandalone && !isHome && (
            <div className="absolute top-2.5 right-4 z-50 pointer-events-auto">
              <WindowControls />
            </div>
          )}
          <DropAnywhere onFilesDropped={handleGlobalDrop} />
          <AutomationHUD />

          {/* Floating Glass Sub-page Overlay */}
          {!isHome && (
            <div className="relative flex-1 flex flex-col animate-fade-in bg-transparent pointer-events-none min-h-0">
              <DotGridSpotlight
                dotColor="rgba(255,255,255,0.05)"
                activeDotColor="rgba(10,132,255,0.12)"
                spacing={12}
                className="pointer-events-none"
              />
              <div className="relative flex-1 pointer-events-auto h-full w-full flex flex-col min-h-0 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="h-full w-full flex flex-col items-center justify-center gap-4">
                        <MobiusLoader size={48} className="text-primary" />
                        <p className="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase animate-pulse">
                          Memuat modul
                        </p>
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/chat" element={<ChatStudio />} />
                    <Route path="/config" element={<Configuration />} />
                    <Route path="/live-audio" element={<Navigate to="/?mode=voice" replace />} />
                    <Route path="/telegram-bot" element={<TelegramBot />} />
                    <Route path="/knowledge" element={<Knowledge />} />
                    <Route path="/guidebook" element={<Guidebook />} />
                    <Route path="/relational" element={<RelationalGrowth />} />
                    <Route path="/subagents" element={<Subagents />} />
                    <Route path="/trajectory" element={<Trajectory />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}

// ── First Boot: pilih Mulai Fresh / Restore data lama ────────────────────
// Muncul sebagai modal overlay HANYA sekali (flag localStorage) saat legacy
// profiles Electron lama terdeteksi. Restore = alur export/import JSON
// (engine beda: Chromium LevelDB tak bisa dibaca langsung oleh WebKit).
const FirstBootChoiceScreen = ({ profiles, onFresh, onRestore }) => (
  <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-base-200/95 border border-white/10 rounded-xl shadow-2xl p-7 space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold">Data Abelink versi lama terdeteksi</h2>
      <p className="text-sm opacity-70 leading-relaxed">
        Ditemukan {profiles.length} profil Abelink era lama di folder konfigurasi. Karena mesin browser
        berbeda (Chromium → WebKit), datanya tidak bisa dibaca langsung  -  tapi tetap aman dan bisa
        dipulihkan lewat file export JSON dari Abelink versi lama (Settings → Export DB).
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
    window.addEventListener('abelink:open-whats-new', openWhatNew)
    return () => window.removeEventListener('abelink:open-whats-new', openWhatNew)
  }, [])

  useEffect(() => {
    let alive = true
    const checkConfig = async () => {
      // 0. Detect lite mode FIRST  -  set flag before any hydration so generateVector
      //    uses hash embeddings instead of triggering WASM extractor load.
      let lm = null
      let fullMode = null
      try {
        fullMode = localStorage.getItem('abelink:fullmode')
      } catch (_) {}
      try {
        lm = await window.api.getLiteMode()
        if (alive) setLiteMode(fullMode === '1' ? false : lm.isLite)
      } catch (e) {
        console.error('[App] Failed to get lite mode status:', e)
      }

      // Parkir task running dari sesi sebelumnya  -  fire-and-forget, idempoten
      // (pauseStaleTasks: running/waiting_user -> paused, step running -> pending).
      pauseStaleTasks('app_restart').catch((e) => {
        console.warn('[App] Failed to pause stale agent tasks:', e)
      })

      // 2. Load config  -  runs BEFORE heavy background work so first paint is fast.
      const data = await getAllConfig()
      if (!data || data.length === 0) {
        if (alive) setHasConfig(false)
      } else {
        if (alive) setHasConfig(true)
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
          if (localStorage.getItem('abelink:last-seen-whats-new') === null) {
            localStorage.setItem('abelink:last-seen-whats-new', '')
          }
        } catch (_) {}
        // -----------------
      }

      // 2.5 Apply hardware profile (auto-detected, saved to localStorage)
      // No modal  -  detection runs silently in background. User can change in Settings.
      try {
        const savedProfile = localStorage.getItem('abelink:resource-mode')
        if (!savedProfile) {
          const detected = detectHardwareProfile()
          const cfg = getProfileConfig(detected)
          localStorage.setItem('abelink:resource-mode', detected)
          console.log(`[Profile] Auto-detected: ${cfg.label} (${detected})`)
          window.dispatchEvent(new CustomEvent('profile-applied', { detail: cfg }))
        }
      } catch (e) {
        console.warn('[Profile] Detection failed, using default STANDARD:', e)
      }

      if (alive) setIsChecking(false)

      // Post-boot: full-mode prompt (once, same localStorage keys) + heavy
      // preloads (Orama hydrate, vector model)  -  non-blocking background work.
      // Mode penuh: ditawarkan SEKALI saat boot, hanya bila RAM > 16GB.
      // Bila user memilih penuh, gate RAM diabaikan sesi ini dan seterusnya
      // (pilihan tersimpan; diubah via Configuration).
      ;(async () => {
        try {
          if (fullMode === null && lm?.totalRAMGB > 16 && window.api?.nativeConfirm) {
            try {
              const yes = await window.api.nativeConfirm(
                'RAM di atas 16GB terdeteksi. Aktifkan Mode Penuh (coba fitur berat dulu, degradasi hanya bila benar-benar gagal)?'
              )
              fullMode = yes ? '1' : '0'
              try {
                localStorage.setItem('abelink:fullmode', fullMode)
                localStorage.setItem('abelink:fullmode-asked', '1')
              } catch (_) {}
              if (alive && fullMode === '1') setLiteMode(false)
            } catch (_) {}
          }
        } catch (e) {
          console.warn('[App] Full-mode prompt failed:', e)
        }

        // 1. Init Orama + Hydrate  -  SELALU jalan (fitur tidak pernah mati);
        // profil hanya mengatur urutan. ensureIndices() di oramaStore idempoten,
        // jadi pemanggilan eksplisit di sini hanyalah eager-load.
        // Analogy: n8n spawn worker saat boot kalau profile-nya kencang.
        let profileConfig = null
        try {
          let ramGB = null
          if (lm?.totalRAMGB && lm.totalRAMGB > 0) ramGB = lm.totalRAMGB
          profileConfig = getProfileConfig(detectHardwareProfile(ramGB))
          if (profileConfig.eagerLoad.includes('orama')) {
            await initOramaIndices()
            await hydrateFromDexie()
            console.log('[App] Orama indices ready (eager, background)')
          } else {
            console.log('[App] Orama lazy  -  dibuat on-demand saat pertama dipakai')
          }
        } catch (e) {
          console.error('[App] Failed to init Orama:', e)
        }

        // 1.5 Load Embeddings Model  -  TETAP dimuat walau lite mode: lite hanya
        // berarti WASM mungkin lambat, bukan alasan kehilangan embedding nyata.
        // Worker punya fallback ladder SIMD -> scalar -> CPU (embedding.worker.js).
        try {
          const shouldLoadVectors = profileConfig?.eagerLoad.includes('vectors')
          if (shouldLoadVectors) {
            const { getExtractor } = await import('./api/vectorMemory')
            await getExtractor()
          } else {
            console.log('[App] Vector model skipped  -  lazy-load on demand')
          }
        } catch (e) {
          console.error('[App] Failed to load Transformers:', e)
        }

        // 1.6 Voice Engine (Whisper) sengaja TIDAK di-preload di boot  -
        // transcribeAudioLocal memuat model saat pertama kali dipakai
        // (lazy by design, lihat src/api/localWhisper.js). Boot jadi lebih cepat.
      })().catch((e) => {
        console.error('[App] Background preload failed:', e)
      })
    }
    checkConfig()
    return () => {
      alive = false
    }
  }, [])

  const settleChoice = useCallback(async (value) => {
    localStorage.setItem('abelink:first-boot-choice', value)
    const defaultConfig = {
      id: 1,
      model: 'google/gemma-3-4b',
      geminiWebModel: 'gemini-latest',
      temperature: 1.0,
      context: 20,
      aiProvider: 'gemini-web',
      awarenessEnabled: false,
      windowOpacity: 1,
      lastSeenWhatsNewVersion: null
    }
    await saveConfiguration(defaultConfig)
    setHasConfig(true)
    if (value === 'restore') {
      // Restore dijalankan DI LATAR BELAKANG: user langsung diarahkan ke
      // AbelinkHome dan diberi tahu lewat toast kanan-atas saat impor selesai
      // (tidak memblokir first-run experience). Impor manual tetap tersedia
      // di Configuration > Data Controls bila user melewatkan file ini.
      window.location.replace('/#/config?legacy-import=1')
      return
    }
    window.location.replace('/')
  }, [])

  // First-boot logic: legacy profile chooser as modal overlay
  const choiceMade = localStorage.getItem('abelink:first-boot-choice')
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
    const handleClearCache = async () => {
      try {
        await caches.delete('transformers-cache')
        console.log('Cache cleared')
        window.location.reload()
      } catch (e) {
        console.error('Failed to clear cache', e)
        window.location.reload()
      }
    }
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-base-300 rounded-xl flex flex-col">
        <div className="absolute top-2.5 right-4 z-50">
          <WindowControls />
        </div>
        <BootScreen showRecovery={showRecovery} onClearCache={handleClearCache} />
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
        localStorage.setItem('abelink:last-seen-whats-new', whatsNewData.version)
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
