import { useState, useEffect, useRef } from 'react'
import {
  getAllConfig,
  saveConfiguration,
  db
} from '../api/db'
import { useLocation } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/useChat'
import ConfigSidebar from '../components/config/ConfigSidebar'
import CapabilitiesHub from '../components/config/CapabilitiesHub'
import GeneralSection from '../components/config/GeneralSection'
import PersonalizationSection from '../components/config/PersonalizationSection'
import ModelSection from '../components/config/ModelSection'
import VoiceVideoSection from '../components/config/VoiceVideoSection'
import ShortcutsSection from '../components/config/ShortcutsSection'
import DataControlsSection from '../components/config/DataControlsSection'
import DeveloperSection from '../components/config/DeveloperSection'
import { getHardwareSttSupport, transcribeToEndpoint } from '../api/sttRouter'
import { loadWhisper } from '../api/localWhisper'
import { DEFAULT_STT_MODEL } from '../api/sttGuard'
import { tx, localeTag } from '../api/locale'

let mediaInfoLogged = false

const Configuration = ({
  isFirstSetup = false,
  onSetupComplete: _onSetupComplete = null,
  initialLegacyImport = false
}) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    effortLevel: 'auto',
    temperature: 1,
    context: 20,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-latest',
    customApiProtocol: 'auto',
    groqModel: 'llama-3.1-8b-instant',
    tgBotToken: '',
    tgAdminIds: '',
    micDeviceId: 'default',
    awarenessEnabled: true,
    sessionCompactionEnabled: true,    cameraDeviceId: 'default',
    cameraEnabled: true,
    sttProvider: 'custom',
    customSttEndpoint: 'http://localhost:20128/v1/audio/transcriptions',
    customSttApiKey: '',
    customSttModel: DEFAULT_STT_MODEL,
    sttEnableCombo: false,
    sttFallbackEndpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    sttFallbackApiKey: '',
    sttFallbackModel: 'whisper-large-v3-turbo'
  })

  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [fullMode, setFullMode] = useState(() => {
    try {
      return localStorage.getItem('abelink:fullmode') === '1'
    } catch (_) {
      return false
    }
  })
  const { confirm, ModalComponent } = useConfirm()
  // Setter dari useState stabil — dep pada fn ini, bukan pada objek context
  // yang identitasnya berubah tiap render (menambahkannya = loop autosave).
  const chatSetConfig = useChat()?.setConfig

  const [activeSection, setActiveSection] = useState('cfg-general')
  const [saveStatus, setSaveStatus] = useState(null)
  const savedSnapshotRef = useRef('')
  const hydratedRef = useRef(false)
  const autosaveTimerRef = useRef(null)
  // Snapshot initial state untuk hydration mount-time (efek [] membaca ini,
  // bukan `config`, agar exhaustive-deps terpenuhi tanpa loop).
  const initialConfigRef = useRef(null)
  if (initialConfigRef.current === null) initialConfigRef.current = config
  const devicesLoadedRef = useRef(false)
  const legacyImportFiredRef = useRef(false)
  const [devHarness, setDevHarness] = useState(
    () => localStorage.getItem('devHarnessLogging') === '1'
  )

  const [hardwareSupport, setHardwareSupport] = useState(null)
  const [whisperLoading, setWhisperLoading] = useState(false)
  const [whisperLoaded, setWhisperLoaded] = useState(false)
  const [whisperProgress, setWhisperProgress] = useState(null)
  const [testingConnId, setTestingConnId] = useState(null)
  const [connTestResults, setConnTestResults] = useState({})

  useEffect(() => {
    getHardwareSttSupport().then(setHardwareSupport)
  }, [])

  const handleDownloadWhisper = async () => {
    setWhisperLoading(true)
    setWhisperProgress(tx(config, 'cfg.whisperDownloading'))
    try {
      await loadWhisper((progress) => {
        if (progress?.status === 'progress' && progress?.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100)
          setWhisperProgress(tx(config, 'cfg.downloadingPct')(progress.file || 'model', pct))
        } else if (progress?.status === 'done') {
          setWhisperProgress(tx(config, 'cfg.whisperLoadedMem'))
        }
      }, config.localWhisperModel || 'whisper-small')
      setWhisperLoaded(true)
      setWhisperProgress(tx(config, 'cfg.whisperReady'))
    } catch (err) {
      setWhisperProgress(tx(config, 'cfg.whisperLoadFailed')(err.message))
    } finally {
      setWhisperLoading(false)
    }
  }

  const handleTestConnection = async (conn) => {
    if (!conn.endpoint || !conn.endpoint.trim()) {
      setConnTestResults((prev) => ({
        ...prev,
        [conn.id]: { ok: false, msg: tx(config, 'cfg.connNoEndpoint') }
      }))
      return
    }
    setTestingConnId(conn.id)
    const t0 = performance.now()
    try {
      // Nada uji 440Hz 0.5s (bukan sunyi digital): verifikasi konektivitas
      // tanpa memicu jalur halusinasi sunyi Whisper.
      const dummyPcm = new Float32Array(8000)
      for (let i = 0; i < dummyPcm.length; i++) {
        dummyPcm[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000)
      }
      const text = await transcribeToEndpoint(dummyPcm, {
        endpoint: conn.endpoint.trim(),
        apiKey: conn.apiKey?.trim() || '',
        model: conn.model?.trim() || DEFAULT_STT_MODEL,
        language: config.sttLanguage || 'id'
      })
      const latency = Math.round(performance.now() - t0)
      setConnTestResults((prev) => ({
        ...prev,
        [conn.id]: {
          ok: true,
          latency,
          msg: tx(config, 'cfg.connActive')(latency, text)
        }
      }))
    } catch (err) {
      setConnTestResults((prev) => ({
        ...prev,
        [conn.id]: { ok: false, msg: err.message }
      }))
    } finally {
      setTestingConnId(null)
    }
  }

  const enumerateMediaDevices = () => {
    if (devicesLoadedRef.current) return
    if (!navigator.mediaDevices?.enumerateDevices) {
      if (!mediaInfoLogged) {
        mediaInfoLogged = true
        console.info(
          '[Config] Media devices API tidak tersedia di webview ini; daftar mic/kamera dikosongkan.'
        )
      }
      return
    }
    devicesLoadedRef.current = true
    const probeDevices = async () => {
      if (navigator.mediaDevices.getUserMedia) {
        let audioStream = null
        let videoStream = null
        try {
          try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          } catch (_) {}
          try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
          } catch (_) {}
        } finally {
          if (audioStream) audioStream.getTracks().forEach((t) => t.stop())
          if (videoStream) videoStream.getTracks().forEach((t) => t.stop())
        }
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices.filter((d) => d.kind === 'audioinput')
        const cameras = devices.filter((d) => d.kind === 'videoinput')
        setAudioDevices(mics)
        setVideoDevices(cameras)
      } catch (err) {
        console.error('Error enumerating devices', err)
      }
    }
    probeDevices()
  }

  useEffect(() => {
    // Mount-time hydration: initial config dibaca via ref (efek jalan sekali),
    // jadi tidak ada dep eksternal — behavior-identical, tanpa loop.
    const hydrate = async () => {
      const data = await getAllConfig()
      if (data.length > 0) {
        const merged = {
          ...initialConfigRef.current,
          ...data[0],
          effortLevel: data[0].effortLevel || 'auto',
          aiProvider: data[0].aiProvider || 'gemini-web',
          geminiWebModel: data[0].geminiWebModel || 'gemini-latest',
          micDeviceId: data[0].micDeviceId || 'default',
          awarenessEnabled: data[0].awarenessEnabled ?? true,
          sessionCompactionEnabled: data[0].sessionCompactionEnabled ?? true
        }
        setConfig(merged)
        savedSnapshotRef.current = JSON.stringify(merged)
      }
      hydratedRef.current = true
    }
    hydrate()
  }, [])

  useEffect(() => {
    if (
      (activeSection === 'cfg-voice-video' ||
        activeSection === 'cfg-camera' ||
        activeSection === 'cfg-audio-voice') &&
      !devicesLoadedRef.current
    ) {
      enumerateMediaDevices()
    }
  }, [activeSection])

  useEffect(() => {
    if (!hydratedRef.current || isFirstSetup) return
    const snap = JSON.stringify(config)
    if (snap === savedSnapshotRef.current) return
    setSaveStatus({ state: 'pending' })
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus({ state: 'saving' })
        const eff = config
        await saveConfiguration(eff)
        savedSnapshotRef.current = JSON.stringify(eff)
        if (chatSetConfig) chatSetConfig([eff])
        setSaveStatus({ state: 'saved', at: new Date() })
      } catch (e) {
        console.error('[Config] Autosave gagal:', e)
        setSaveStatus({ state: 'error' })
      }
    }, 700)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [config, isFirstSetup, chatSetConfig])

  // useCallback agar efek legacy-import di bawah stabil; one-shot dijaga
  // legacyImportFiredRef sehingga perubahan identitas aman (tanpa re-fire).
  const handleImportLegacy = useCallback(async () => {
    try {
      const pick = await window.api?.legacyImportPickAndRead?.()
      if (!pick?.content) return
      const parsed = JSON.parse(pick.content)
      const { importInto } = await import('dexie-export-import')
      await importInto(db, parsed, { overwriteValues: true })
      await confirm({
        title: tx(config, 'cfg.importOkTitle'),
        message: tx(config, 'cfg.importOkMsg'),
        hideCancel: true,
        confirmText: tx(config, 'cfg.reload')
      })
      window.location.reload()
    } catch (err) {
      if (String(err).includes('__canceled__')) return
      console.error('[Config] Import legacy gagal:', err)
      await confirm({
        title: tx(config, 'cfg.importFailTitle'),
        message: String(err?.message || err),
        isError: true,
        hideCancel: true,
        confirmText: tx(config, 'cfg.close')
      })
    }
  }, [config, confirm])

  const handleDumpPrompt = async () => {
    const { getLastSystemPrompt } = await import('../api/ai/planning')
    const prompt = getLastSystemPrompt()
    if (!prompt) {
      await confirm({
        title: tx(config, 'cfg.dumpTitle'),
        message: tx(config, 'cfg.dumpEmpty'),
        hideCancel: true,
        confirmText: tx(config, 'cfg.close')
      })
      return
    }
    let copied = false
    try {
      await navigator.clipboard.writeText(prompt)
      copied = true
    } catch (_) {}
    const ownerName = config.ownerName?.trim()
    // Guard: tanpa ownerName, pola (owner|user) hanya false-positive.
    const leak =
      !!ownerName &&
      new RegExp(`\\b(${ownerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i').test(prompt)
    await confirm({
      title: tx(config, 'cfg.dumpTitle'),
      message:
        tx(config, 'cfg.dumpLen')(prompt.length, copied) +
        (leak ? tx(config, 'cfg.dumpLeakWarn')(config.ownerName) : ''),
      isError: leak,
      hideCancel: true,
      confirmText: tx(config, 'cfg.close')
    })
  }

  const location = useLocation()
  useEffect(() => {
    const wantsImport =
      (initialLegacyImport || location.search.includes('legacy-import=1')) &&
      !legacyImportFiredRef.current &&
      handleImportLegacy
    if (wantsImport) {
      legacyImportFiredRef.current = true
      handleImportLegacy()
      if (location.search.includes('legacy-import=1')) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.hash.split('?')[0]
        )
      }
    }
  // legacyImportFiredRef guard membuat re-run aman (one-shot).
  }, [initialLegacyImport, location.search, handleImportLegacy])

  const handleClearAllChat = async () => {
    const result = await confirm({
      title: tx(config, 'cfg.clearChatTitle'),
      message: tx(config, 'cfg.clearChatMsg'),
      isError: true,
      confirmText: tx(config, 'cfg.clearChatYes')
    })

    if (result.isConfirmed) {
      await db.sessions.clear()
      await db.chatArchive.clear()
      await db.chatTurns.clear()
      try {
        const { resetSearchIndices } = await import('../api/oramaStore')
        await resetSearchIndices()
      } catch (err) {
        console.error('[Configuration] Gagal mereset indeks pencarian:', err)
      }
    }
  }

  const handleExportChat = async () => {
    const session = await db.sessions.get(1)
    const exportData = session ? session.data : []
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abelink-chat-history-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAwarenessEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))
  const handleCompactionEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, sessionCompactionEnabled: e.target.checked }))
  const handleBuiltinPluginChange = (key) => (e) =>
    setConfig((prev) => ({
      ...prev,
      builtinPlugins: { ...(prev.builtinPlugins || {}), [key]: e.target.checked }
    }))
  const handleRtkCompressChange = (e) =>
    setConfig((prev) => ({ ...prev, rtkCompress: e.target.checked }))
  const handlePersonalityChange = (e) =>
    setConfig((prev) => ({ ...prev, personality: e.target.value }))

  return (
    <div className="h-screen text-white overflow-hidden relative bg-base-300/90 rounded-lg border border-white/10 shadow-2xl flex">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Sidebar + Content Layout */}
      <div className="relative z-10 flex h-full w-full">
        <ConfigSidebar
          isFirstSetup={isFirstSetup}
          activeSection={activeSection}
          onNavigate={setActiveSection}
          occupation={config.occupation}
          isDevMode={devHarness}
          language={config.language}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 custom-scrollbar">
          <div className="p-6 sm:p-8 w-full">
            {/* Page Header */}
            <header className="flex items-center justify-between gap-4 mb-8 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3.5"></div>
              <div className="flex items-center gap-2">
                {saveStatus && !isFirstSetup && (
                  <span
                    className={`badge badge-sm font-medium ${
                      saveStatus.state === 'error'
                        ? 'badge-error'
                        : saveStatus.state === 'saved'
                          ? 'badge-info badge-outline'
                          : 'badge-warning badge-outline'
                    }`}
                  >
                    {saveStatus.state === 'pending'
                      ? tx(config, 'cfg.savedWaiting')
                      : saveStatus.state === 'saving'
                        ? tx(config, 'cfg.savedSaving')
                        : saveStatus.state === 'error'
                          ? tx(config, 'cfg.savedError')
                          : tx(config, 'cfg.savedAt')(saveStatus.at.toLocaleTimeString(localeTag(config), { hour: '2-digit', minute: '2-digit' }))}
                  </span>
                )}
              </div>
            </header>

            {/* ── General ── */}
            <GeneralSection
              config={config}
              setConfig={setConfig}
              fullMode={fullMode}
              setFullMode={setFullMode}
              activeSection={activeSection}
            />

            {/* ── Personalization ── */}
            <PersonalizationSection
              config={config}
              setConfig={setConfig}
              handlePersonalityChange={handlePersonalityChange}
              activeSection={activeSection}
            />

            {/* ── Model ── */}
            <ModelSection
              config={config}
              setConfig={setConfig}
              activeSection={activeSection}
            />

            {/* ── Voice & Video ── */}
            <div
              id="cfg-voice-video"
              className={
                activeSection !== 'cfg-voice-video' &&
                activeSection !== 'cfg-camera' &&
                activeSection !== 'cfg-audio-voice'
                  ? 'hidden'
                  : ''
              }
            >
              <VoiceVideoSection
                config={config}
                setConfig={setConfig}
                activeSection={activeSection}
                videoDevices={videoDevices}
                audioDevices={audioDevices}
                hardwareSupport={hardwareSupport}
                whisperLoading={whisperLoading}
                whisperLoaded={whisperLoaded}
                whisperProgress={whisperProgress}
                onDownloadWhisper={handleDownloadWhisper}
                testingConnId={testingConnId}
                connTestResults={connTestResults}
                onTestConnection={handleTestConnection}
              />
            </div>

            {/* ── Capabilities (MCP, Plugins, Skills, System) ── */}
            <div
              id="cfg-capabilities"
              className={`${activeSection !== 'cfg-capabilities' ? 'hidden' : ''} space-y-6`}
            >
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  {tx(config, 'cfg.capabilitiesTitle')}
                </h2>
              </div>

              <CapabilitiesHub
                config={config}
                setConfig={setConfig}
                handleAwarenessEnabledChange={handleAwarenessEnabledChange}
                handleCompactionEnabledChange={handleCompactionEnabledChange}
                handleBuiltinPluginChange={handleBuiltinPluginChange}
                handleRtkCompressChange={handleRtkCompressChange}
                isDevMode={devHarness}
                language={config.language}
              />
            </div>

            {/* ── Global Shortcut ── */}
            <ShortcutsSection
              config={config}
              setConfig={setConfig}
              activeSection={activeSection}
            />

            {/* ── Data Controls & Developer ── */}
            {!isFirstSetup && (
              <>
                <DataControlsSection
                  activeSection={activeSection}
                  onClearAllChat={handleClearAllChat}
                  onExportChat={handleExportChat}
                  onImportLegacy={handleImportLegacy}
                  language={config.language}
                />

                <DeveloperSection
                  activeSection={activeSection}
                  devHarness={devHarness}
                  setDevHarness={setDevHarness}
                  onDumpPrompt={handleDumpPrompt}
                  language={config.language}
                />
              </>
            )}

          </div>
        </div>
        <ModalComponent />
      </div>
    </div>
  )
}

export default Configuration
