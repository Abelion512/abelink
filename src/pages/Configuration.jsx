import { useState, useEffect, useRef } from 'react'
import {
  getAllMemory,
  getAllConfig,
  saveConfiguration,
  db
} from '../api/db'
import { getExtractor } from '../api/vectorMemory'
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

let mediaInfoLogged = false

const Configuration = ({
  isFirstSetup = false,
  onSetupComplete = null,
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
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [fullMode, setFullMode] = useState(() => {
    try {
      return localStorage.getItem('abelink:fullmode') === '1'
    } catch (_) {
      return false
    }
  })
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()

  const [activeSection, setActiveSection] = useState('cfg-general')
  const [saveStatus, setSaveStatus] = useState(null)
  const savedSnapshotRef = useRef('')
  const hydratedRef = useRef(false)
  const autosaveTimerRef = useRef(null)
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
    setWhisperProgress('Mengunduh model Whisper lokal...')
    try {
      await loadWhisper((progress) => {
        if (progress?.status === 'progress' && progress?.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100)
          setWhisperProgress(`Mengunduh ${progress.file || 'model'}: ${pct}%`)
        } else if (progress?.status === 'done') {
          setWhisperProgress('Model berhasil dimuat ke memori.')
        }
      }, config.localWhisperModel || 'whisper-small')
      setWhisperLoaded(true)
      setWhisperProgress('Model Whisper lokal siap digunakan!')
    } catch (err) {
      setWhisperProgress(`Gagal memuat model: ${err.message}`)
    } finally {
      setWhisperLoading(false)
    }
  }

  const handleTestConnection = async (conn) => {
    if (!conn.endpoint || !conn.endpoint.trim()) {
      setConnTestResults((prev) => ({
        ...prev,
        [conn.id]: { ok: false, msg: 'Endpoint URL belum diisi.' }
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
          msg: `Aktif (${latency}ms): "${text || 'Audio diterima'}"`
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
    loadConfig()
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

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) {
      const merged = {
        ...config,
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
        if (chatContext?.setConfig) chatContext.setConfig([eff])
        setSaveStatus({ state: 'saved', at: new Date() })
      } catch (e) {
        console.error('[Config] Autosave gagal:', e)
        setSaveStatus({ state: 'error' })
      }
    }, 700)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [config, isFirstSetup])

  const handleImportLegacy = async () => {
    try {
      const pick = await window.api?.legacyImportPickAndRead?.()
      if (!pick?.content) return
      const parsed = JSON.parse(pick.content)
      const { importInto } = await import('dexie-export-import')
      await importInto(db, parsed, { overwriteValues: true })
      await confirm({
        title: 'Impor Berhasil',
        message: 'Data lama sudah digabung ke database ini. Halaman akan dimuat ulang.',
        hideCancel: true,
        confirmText: 'Muat Ulang'
      })
      window.location.reload()
    } catch (err) {
      if (String(err).includes('__canceled__')) return
      console.error('[Config] Import legacy gagal:', err)
      await confirm({
        title: 'Impor Gagal',
        message: String(err?.message || err),
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    }
  }

  const handleDumpPrompt = async () => {
    const { getLastSystemPrompt } = await import('../api/ai/planning')
    const prompt = getLastSystemPrompt()
    if (!prompt) {
      await confirm({
        title: 'Dump System Prompt',
        message: 'Belum ada prompt tersimpan - jalankan satu giliran obrolan dulu.',
        hideCancel: true,
        confirmText: 'Tutup'
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
      title: 'Dump System Prompt',
      message:
        `Panjang: ${prompt.length} chars.${copied ? ' Disalin ke clipboard.' : ' Clipboard tidak tersedia.'}` +
        (leak
          ? `\n\nPERINGATAN: terdeteksi nama ${config.ownerName || 'owner'} di prompt padahal ownerName kosong - lacak blok sumbernya lewat isi clipboard.`
          : ''),
      isError: leak,
      hideCancel: true,
      confirmText: 'Tutup'
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
  }, [initialLegacyImport, location.search])

  const handleClearAllChat = async () => {
    const result = await confirm({
      title: 'Hapus Semua Chat?',
      message: 'Semua riwayat sesi chat akan dihapus permanen dan tidak bisa dikembalikan.',
      isError: true,
      confirmText: 'Ya, Hapus Semua'
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
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 custom-scrollbar">
          <div className="p-6 sm:p-8 w-full">
            {/* Page Header */}
            <header className="flex items-center justify-between gap-4 mb-8 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3.5">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white/90">Pengaturan Abelink</h1>
                </div>
              </div>
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
                      ? 'Menunggu simpan…'
                      : saveStatus.state === 'saving'
                        ? 'Menyimpan…'
                        : saveStatus.state === 'error'
                          ? 'Gagal autosave'
                          : `Tersimpan ${saveStatus.at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
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
                  Capabilities &amp; Integrations
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
                />

                <DeveloperSection
                  activeSection={activeSection}
                  devHarness={devHarness}
                  setDevHarness={setDevHarness}
                  onDumpPrompt={handleDumpPrompt}
                />
              </>
            )}

            {isDownloadingModel && (
              <div className="w-full max-w-xs my-4 ml-auto">
                <div className="flex justify-between text-xs mb-1">
                  <span>Mengunduh Model Embeddings...</span>
                  <span>{downloadProgress}%</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={downloadProgress}
                  max="100"
                ></progress>
              </div>
            )}
          </div>
        </div>
        <ModalComponent />
      </div>
    </div>
  )
}

export default Configuration
