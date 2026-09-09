import { useState, useEffect, useRef } from 'react'
import {
  FaSave,
  FaCheckCircle,
  FaTrash,
  FaTimes,
  FaMoon,
  FaSun,
  FaEye,
  FaEyeSlash,
  FaRobot,
  FaBrain,
  FaTerminal,
  FaVolumeUp,
  FaDatabase,
  FaCog,
  FaQuestionCircle,
  FaCubes,
  FaPlug,
  FaShieldAlt,
  FaExternalLinkAlt,
  FaExclamationTriangle,
  FaUser,
  FaFire,
  FaHeart,
  FaBolt,
  FaSmile,
  FaSlidersH,
  FaPlus,
  FaArrowUp,
  FaArrowDown,
  FaMicrophone
} from 'react-icons/fa'
import {
  getAllMemory,
  getAllConfig,
  saveConfiguration,
  deleteMemory,
  db,
  getRelationship,
  saveRelationship
} from '../api/db'
import { getExtractor } from '../api/vectorMemory'
import 'driver.js/dist/driver.css'
import { startDriverTour } from '../utils/driverTour'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { useChat } from '../contexts/ChatContext'
import ConfigSidebar from '../components/ConfigSidebar'
import CapabilitiesHub from '../components/config/CapabilitiesHub'
import { transcribeToEndpoint, getHardwareSttSupport } from '../api/sttRouter'
import { loadWhisper } from '../api/localWhisper'

// Plausibilitas endpoint custom: cukup base /v1 (OpenAI maupun Anthropic),
// URL lengkap /chat/completions, atau domain yang jelas anthropic.
const isCustomEndpointPlausible = (raw, protocol) => {
  const ep = (raw || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(ep)) return false
  if (/\/(chat\/completions|v1)$/.test(ep)) return true
  return /anthropic/i.test(ep) || protocol === 'anthropic'
}

const ConfigCameraPreview = ({ deviceId, enabled }) => {
  const videoRef = useRef(null)
  const [camError, setCamError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let isMounted = true
    setCamError('')
    const startCamera = async () => {
      try {
        const constraints = {
          video: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch((e) => console.error(e))
        } else {
          stream.getTracks().forEach((t) => t.stop())
        }
      } catch (err) {
        // WebKitGTK/wry bisa menolak getUserMedia tanpa dialog izin  -  tampilkan
        // pesan ramah sekali per percobaan, jangan spam console.
        if (isMounted)
          setCamError(
            'Preview kamera tidak tersedia: izin ditolak atau lingkungan webview tidak mengizinkan akses kamera.'
          )
      }
    }
    startCamera()
    return () => {
      isMounted = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, enabled])

  if (!enabled) return null

  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video relative flex items-center justify-center shadow-inner">
      {camError ? (
        <p className="text-xs opacity-60 text-center px-4">{camError}</p>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs font-mono text-white backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
        </>
      )}
    </div>
  )
}

let mediaInfoLogged = false

// Fallback STT senyap yang sama untuk autosave & first-setup: wizard/mode
// otomatis tidak boleh macet karena STT cloud tanpa key.
const withSttFallback = (cfg) => {
  if (cfg.sttProvider === 'groq' && !cfg.groqApiKey?.trim()) {
    return { ...cfg }
  }
  return cfg
}

const Configuration = ({
  isFirstSetup = false,
  onSetupComplete = null,
  initialLegacyImport = false
}) => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 1,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'gemini-web',
    geminiWebModel: 'gemini-3.6-flash',
    customApiProtocol: 'auto',
    groqModel: 'llama-3.1-8b-instant',
    tgBotToken: '',
    tgAdminIds: '',
    micDeviceId: 'default',
    awarenessEnabled: true,
    cameraDeviceId: 'default',
    cameraEnabled: true,
    sttProvider: 'custom',
    customSttEndpoint: 'http://localhost:20128/v1/audio/transcriptions',
    customSttApiKey: '',
    customSttModel: 'selfhosted-stt/whisper-1',
    sttEnableCombo: false,
    sttFallbackEndpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    sttFallbackApiKey: '',
    sttFallbackModel: 'whisper-large-v3-turbo'
  })
  const [relationalTraits, setRelationalTraits] = useState(null)
  const [memories, setMemories] = useState([])
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [extInstall, setExtInstall] = useState(null)
  const [fullMode, setFullMode] = useState(() => {
    try {
      return localStorage.getItem('mark:fullmode') === '1'
    } catch (_) {
      return false
    }
  })
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()
  const navigate = useNavigate()

  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [showCustomSttKey, setShowCustomSttKey] = useState(false)
  const [showFallbackSttKey, setShowFallbackSttKey] = useState(false)
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
  const [legacyProfiles, setLegacyProfiles] = useState([])
  const [relationship, setRelationship] = useState({
    warmth: 0.5,
    sarcasm_level: 0.5,
    trust: 0.5,
    energy: 0.5,
    obedience: 0.8
  })

  const [testingStt, setTestingStt] = useState(false)
  const [sttTestResult, setSttTestResult] = useState(null)
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
      })
      setWhisperLoaded(true)
      setWhisperProgress('Model Whisper lokal siap digunakan!')
    } catch (err) {
      setWhisperProgress(`Gagal memuat model: ${err.message}`)
    } finally {
      setWhisperLoading(false)
    }
  }

  const handleAddConnection = (preset = null) => {
    const newConn = preset || {
      id: `conn-${Date.now()}`,
      name: 'Custom Gateway',
      endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
      apiKey: '',
      model: 'selfhosted-stt/whisper-1',
      enabled: true
    }
    setConfig((prev) => ({
      ...prev,
      sttConnections: [...(prev.sttConnections || []), newConn]
    }))
  }

  const handleUpdateConnection = (id, field, value) => {
    setConfig((prev) => ({
      ...prev,
      sttConnections: (prev.sttConnections || []).map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      )
    }))
  }

  const handleRemoveConnection = (id) => {
    setConfig((prev) => ({
      ...prev,
      sttConnections: (prev.sttConnections || []).filter((c) => c.id !== id)
    }))
  }

  const handleMoveConnection = (idx, delta) => {
    setConfig((prev) => {
      const list = [...(prev.sttConnections || [])]
      const targetIdx = idx + delta
      if (targetIdx < 0 || targetIdx >= list.length) return prev
      const temp = list[idx]
      list[idx] = list[targetIdx]
      list[targetIdx] = temp
      return { ...prev, sttConnections: list }
    })
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
      const dummyPcm = new Float32Array(8000)
      const text = await transcribeToEndpoint(dummyPcm, {
        endpoint: conn.endpoint.trim(),
        apiKey: conn.apiKey?.trim() || '',
        model: conn.model?.trim() || 'selfhosted-stt/whisper-1',
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

  useEffect(() => {
    getRelationship('owner').then((rel) => {
      if (rel) setRelationship(rel)
    })
  }, [])

  const handleTraitChange = (traitKey, value) => {
    setRelationship((prev) => {
      const next = { ...prev, [traitKey]: value }
      saveRelationship(next)
      return next
    })
  }

  const handlePresetSelect = (presetKey) => {
    setConfig((prev) => ({ ...prev, personaPreset: presetKey }))
    let traits = {}
    let personaPrompt = ''
    switch (presetKey) {
      case 'digital-twin':
        traits = { warmth: 0.7, sarcasm_level: 0.35, trust: 0.85, energy: 0.75, obedience: 0.9 }
        personaPrompt =
          'Kamu adalah Klon Digital (Digital Twin) dari user. Pelajari gaya diksi, preferensi pemecahan masalah, dan ritme berpikir user. Berikan respons seolah-olah user sedang berdialog dengan versi terbaik dan paling objektif dari dirinya sendiri.'
        break
      case 'jarvis':
        traits = { warmth: 0.4, sarcasm_level: 0.2, trust: 0.9, energy: 0.8, obedience: 1.0 }
        personaPrompt =
          'Kamu adalah Abelink, asisten pribadi AI dengan pembawaan tenang, sangat efisien, sopan, dan sigap mengeksekusi tugas tanpa basa-basi berlebih layaknya sistem Jarvis.'
        break
      case 'cynical-partner':
        traits = { warmth: 0.3, sarcasm_level: 0.75, trust: 0.85, energy: 0.65, obedience: 0.6 }
        personaPrompt =
          'Kamu adalah partner teknis yang kritis, sinis ringan, berorientasi bukti empiris dan data teknis. Selalu uji asumsi user dan anti-halusinasi.'
        break
      case 'autonomous-engineer':
        traits = { warmth: 0.2, sarcasm_level: 0.1, trust: 0.95, energy: 0.9, obedience: 0.9 }
        personaPrompt =
          'Kamu adalah Autonomous Systematic Engineer. Mengadopsi prinsip Superpowers: Brainstorm -> Spec -> Plan -> TDD -> Verify. Komunikasi singkat, padat, berorientasi terminal dan hasil tes deterministik.'
        break
      case 'casual-buddy':
        traits = { warmth: 0.9, sarcasm_level: 0.4, trust: 0.75, energy: 0.8, obedience: 0.7 }
        personaPrompt =
          'Kamu adalah teman akrab yang santai, lu/gue, hangat, suportif, dan selalu siap mendengarkan serta membantu dengan bahasa santai sehari-hari.'
        break
      default:
        break
    }
    if (presetKey !== 'custom') {
      setConfig((prev) => ({ ...prev, personality: personaPrompt }))
      setRelationship((prev) => {
        const next = { ...prev, ...traits }
        saveRelationship(next)
        return next
      })
    }
  }

  const handleTestVoice = async () => {
    setPlayingTest(true)
    const testText =
      'Halo bro! Gue Mark, asisten pribadi lo. Gimana suara gue sekarang? Udah mantap belum?'
    try {
      const audioBase64 = await window.api.textToSpeech(testText, config.ttsRate, config.ttsPitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audio.onended = () => setPlayingTest(false)
        await audio.play()
      } else {
        setPlayingTest(false)
      }
    } catch (error) {
      console.error('Gagal test suara:', error)
      setPlayingTest(false)
    }
  }

  // Batasi pemanggilan enumerateDevices hanya saat tab Voice & Video dibuka:
  // pemindaian webcam/mic memicu spin-up hardware, menyalakan LED indikator,
  // dan memperlambat buka halaman tanpa alasan.
  const enumerateMediaDevices = () => {
    if (devicesLoadedRef.current) return
    if (!navigator.mediaDevices?.enumerateDevices) {
      // Batas webview Linux (WebKitGTK)  -  bukan error aplikasi. Log sekali saja.
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
        if (mics.length === 0 && cameras.length === 0) {
          console.warn(
            '[Config] Izin mic/kamera tidak diberikan oleh lingkungan webview; pilihan perangkat dikosongkan.'
          )
        }
      } catch (err) {
        console.error('Error enumerating devices', err)
      }
    }
    probeDevices()
  }

  useEffect(() => {
    loadConfig()
    loadMemories()
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
    if (!isFirstSetup || !window.api?.legacyDetectProfiles) return
    window.api
      .legacyDetectProfiles()
      .then((paths) => setLegacyProfiles(paths || []))
      .catch(() => {})
  }, [isFirstSetup])

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) {
      const merged = {
        ...config,
        ...data[0],
        aiProvider: data[0].aiProvider || 'gemini-web',
        geminiWebModel: data[0].geminiWebModel || 'gemini-3.6-flash',
        micDeviceId: data[0].micDeviceId || 'default',
        awarenessEnabled: data[0].awarenessEnabled ?? true
      }
      setConfig(merged)
      // Baseline snapshot: setelah titik ini, perubahan config dianggap dirty
      // dan memicu autosave (hydration tidak boleh memicu simpan).
      savedSnapshotRef.current = JSON.stringify(merged)
    }
    hydratedRef.current = true
  }

  const loadMemories = async () => {
    setLoadingMemory(true)
    const data = await getAllMemory()
    setMemories(data)
    setLoadingMemory(false)
  }

  // ── Autosave: debounce 700ms setelah perubahan terakhir (mode normal) ──
  // Wizard tidak ikut  -  dia punya alur "Simpan & Mulai" eksplisit.
  useEffect(() => {
    if (!hydratedRef.current || isFirstSetup) return
    const snap = JSON.stringify(config)
    if (snap === savedSnapshotRef.current) return
    setSaveStatus({ state: 'pending' })
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setSaveStatus({ state: 'saving' })
        const eff = withSttFallback(config)
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

  // Opasitas window: TIDAK bisa diimplement di Tauri 2.11 (API set_opacity
  // hanya ada di v1). Handler lama dihapus; lihat session log untuk limitasi.

  // Impor database legacy dari export JSON versi lama (dexie-export-import).
  const handleImportLegacy = async () => {
    try {
      const pick = await window.api.legacyImportPickAndRead()
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

  // Audit injeksi: salin system prompt terakhir ke clipboard + deteksi nama
  // yang tidak dideklarasikan user (bukti, bukan teori).
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
    const leak =
      !config.ownerName?.trim() &&
      new RegExp(`\\b(${config.ownerName || 'owner'}|${config.ownerName || 'user'})\\b`, 'i').test(
        prompt
      )
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

  // Auto-buka dialog impor saat user memilih "Restore" di layar first boot.
  // Sinyalnya query ?legacy-import=1 pada hash route (dari App.jsx settleChoice)
  // atau prop initialLegacyImport (kompatibilitas). URL dibersihkan setelahnya
  // agar refresh tidak memicu dialog lagi.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLegacyImport, location.search])

  const handleDeleteMemory = async (mem) => {
    const result = await confirm({
      title: 'Hapus Memori?',
      message: `Yakin ingin menghapus memori ini?\n"${mem.summary || mem.memory}"`,
      isError: true,
      confirmText: 'Ya, Hapus'
    })

    if (result.isConfirmed) {
      await deleteMemory({ id: mem.id })
      setMemories((prev) => prev.filter((m) => m.id !== mem.id))
    }
  }

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
      // Privacy: chatTurns & indeks pencarian juga harus ikut dihapus,
      // kalau tidak chat lama tetap bisa ditemukan lewat memory search
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
    a.download = `mark-chat-history-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveConfiguration = async () => {
    // Validasi API Key
    let effectiveConfig = config
    if (!config.customSttEndpoint?.trim() && !config.sttFallbackEndpoint?.trim()) {
      if (!isFirstSetup) {
        await confirm({
          title: 'Endpoint STT Kosong',
          message:
            'Endpoint STT belum diisi. Masukkan URL endpoint STT (contoh: http://localhost:20128/v1/audio/transcriptions atau gunakan preset 9router/Groq).',
          isError: true,
          hideCancel: true,
          confirmText: 'Tutup'
        })
        return
      }
    }

    if (config.aiProvider === 'custom') {
      const endpoint = (config.customEndpoint || '').trim().replace(/\/+$/, '')
      const isHttp = /^https?:\/\//i.test(endpoint)
      const openaiStyle = /\/(chat\/completions|v1)$/.test(endpoint)
      const anthropicStyle = /anthropic/i.test(endpoint) || config.customApiProtocol === 'anthropic'
      if (!isHttp || (!openaiStyle && !anthropicStyle)) {
        alert(
          'Gagal Menyimpan: Custom Endpoint URL tidak valid. Gunakan salah satu format:\n' +
            '- OpenAI-Compatible: akhiri dengan /v1 atau /chat/completions (contoh: https://api.openai.com/v1)\n' +
            '- Anthropic-Compatible: URL berisi "anthropic" atau pilih protokol Anthropic (contoh: https://api.anthropic.com/v1).'
        )
        return
      }
    }

    setIsDownloadingModel(true)
    setDownloadProgress(0)

    try {
      let extStats = {}
      await getExtractor((info) => {
        if (info.status === 'initiate') {
          extStats[info.file] = { loaded: 0, total: info.total || 0 }
        } else if (info.status === 'progress') {
          if (extStats[info.file]) {
            extStats[info.file].loaded = info.loaded
            extStats[info.file].total = info.total
          }
          const values = Object.values(extStats)
          const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
          const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((loadedBytes / totalBytes) * 100))
          }
        } else if (info.status === 'done' || info.status === 'ready') {
          setDownloadProgress(100)
        }
      })
    } catch (e) {
      console.error(e)
    }
    setIsDownloadingModel(false)
    await saveConfiguration(effectiveConfig)

    // Update global state without reloading the page
    if (chatContext && chatContext.setConfig) {
      chatContext.setConfig([effectiveConfig])
    }

    if (isFirstSetup && onSetupComplete) {
      onSetupComplete()
    } else {
      // Kembali ke halaman chat
      window.location.href = '#/'
    }
  }

  const groupedMemories = memories.reduce((acc, mem) => {
    const type = mem.type || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(mem)
    return acc
  }, {})

  const typeBadgeColor = {
    profile: 'badge-primary',
    preference: 'badge-secondary',
    skill: 'badge-accent',
    project: 'badge-info',
    transaction: 'badge-warning',
    goal: 'badge-success',
    relationship: 'badge-error',
    fact: 'badge-neutral',
    other: 'badge-ghost'
  }

  const handleAiProviderChange = (provider) =>
    setConfig((prev) => ({ ...prev, aiProvider: provider }))
  const handleModelChange = (e) => setConfig((prev) => ({ ...prev, model: e.target.value }))
  const handleGroqApiKeyChange = (e) =>
    setConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))
  const handleCustomEndpointChange = (e) =>
    setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))
  // Deteksi daftar model dari endpoint custom via sidecar (ai:list-models).
  const [customModels, setCustomModels] = useState([])
  const [detectingModels, setDetectingModels] = useState(false)
  const [modelDetectError, setModelDetectError] = useState('')
  // Deteksi model LM Studio (localhost:1234/v1/models)  -  LAZY: hanya saat
  // section Model dibuka dan provider = lm-studio. Tanpa server -> error
  // senyap, input manual tetap berfungsi (degrades gracefully).
  const [lmStudioModels, setLmStudioModels] = useState([])
  const [lmDetectAttempted, setLmDetectAttempted] = useState(false)
  useEffect(() => {
    if (activeSection !== 'cfg-model' || config.aiProvider !== 'lm-studio' || lmDetectAttempted)
      return
    setLmDetectAttempted(true)
    let alive = true
    window.api
      .detectCustomModels('http://localhost:1234/v1', '', 'openai')
      .then((list) => {
        if (alive && Array.isArray(list) && list.length > 0) setLmStudioModels(list)
      })
      .catch(() => {}) // server mati -> biarkan input manual
    return () => {
      alive = false
    }
  }, [activeSection, config.aiProvider, lmDetectAttempted])
  const handleDetectModels = async () => {
    setDetectingModels(true)
    setModelDetectError('')
    try {
      const list = await window.api.detectCustomModels(
        config.customEndpoint,
        config.customApiKey,
        config.customApiProtocol || 'auto'
      )
      if (Array.isArray(list) && list.length > 0) {
        setCustomModels(list)
        if (!config.customModel && list.length > 0) {
          setConfig((prev) => ({ ...prev, customModel: list[0] }))
        }
      } else {
        setModelDetectError('Endpoint tidak mengembalikan daftar model.')
      }
    } catch (err) {
      setModelDetectError(`Deteksi gagal: ${err?.message || err}`)
    } finally {
      setDetectingModels(false)
    }
  }
  const handleCustomApiKeyChange = (e) =>
    setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))
  const handleCustomModelChange = (e) =>
    setConfig((prev) => ({ ...prev, customModel: e.target.value }))
  const handleAwarenessEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))
  // Built-in plugins (ponytail/caveman)  -  always-on by default, toggle per fitur.
  const handleBuiltinPluginChange = (key) => (e) =>
    setConfig((prev) => ({
      ...prev,
      builtinPlugins: { ...(prev.builtinPlugins || {}), [key]: e.target.checked }
    }))
  // rtk (kompresi output tool di layer EKSEKUSI sidecar)  -  default ON,
  // no-op senyap bila binary `rtk` tidak terpasang di PATH.
  const handleRtkCompressChange = (e) =>
    setConfig((prev) => ({ ...prev, rtkCompress: e.target.checked }))
  const handlePersonalityChange = (e) =>
    setConfig((prev) => ({ ...prev, personality: e.target.value }))
  const handleMicDeviceIdChange = (e) =>
    setConfig((prev) => ({ ...prev, micDeviceId: e.target.value }))
  const handleCameraDeviceIdChange = (e) =>
    setConfig((prev) => ({ ...prev, cameraDeviceId: e.target.value }))
  const handleCameraEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, cameraEnabled: e.target.checked }))
  const handleTtsRateChange = (e) => setConfig((prev) => ({ ...prev, ttsRate: e.target.value }))
  const handleTtsPitchChange = (e) => setConfig((prev) => ({ ...prev, ttsPitch: e.target.value }))

  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)

  const normalizeShortcut = (val) => {
    if (!val) return 'CommandOrControl+Alt+M'
    return val
      .replace(/\bctrl\b/gi, 'CommandOrControl')
      .replace(/\bcontrol\b/gi, 'CommandOrControl')
      .replace(/\bcmd\b/gi, 'CommandOrControl')
      .replace(/\bmeta\b/gi, 'CommandOrControl')
  }

  const handleShortcutKeyChange = (e) => {
    const rawVal = e.target.value
    const normalized = normalizeShortcut(rawVal)
    setConfig((prev) => {
      const updated = { ...prev, shortcutKey: normalized }
      if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
      return updated
    })
  }

  const handleShortcutRecorderKeyDown = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    const modifiers = []
    if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')

    let keyName = e.key.toUpperCase()
    if (e.code === 'Space' || keyName === ' ') keyName = 'Space'

    const fullShortcut = [...modifiers, keyName].join('+')

    setConfig((prev) => {
      const updated = { ...prev, shortcutKey: fullShortcut }
      if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
      return updated
    })
    setIsRecordingShortcut(false)
  }
  const handleBack = () => window.history.back()
  const handleToggleGroqKey = () => setShowGroqKey(!showGroqKey)
  const handleToggleCustomKey = () => setShowCustomKey(!showCustomKey)

  const handleTgAdminIdsChange = (e) =>
    setConfig((prev) => ({ ...prev, tgAdminIds: e.target.value }))

  const handleSidebarNavigate = (id) => setActiveSection(id)

  return (
    <div className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-base-300/90 rounded-2xl border border-white/10 shadow-2xl flex">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Sidebar + Content Layout */}
      <div className="relative z-10 flex h-full w-full">
        <ConfigSidebar
          isFirstSetup={isFirstSetup}
          activeSection={activeSection}
          onNavigate={handleSidebarNavigate}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 custom-scrollbar">
          <div className="p-6 sm:p-8 max-w-4xl mx-auto w-full">
            {/* Page Header */}
            <div className="flex items-center justify-between gap-4 mb-8 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3.5">
                {!isFirstSetup && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="btn btn-sm btn-circle btn-ghost border border-white/10 hover:bg-white/10 text-white/70"
                    title="Kembali"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="1.1em"
                      height="1.1em"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white/90">Pengaturan Abelink</h1>
                </div>
              </div>
              <div className="flex items-center gap-2 mr-44">
                {saveStatus && !isFirstSetup && (
                  <span
                    className={`badge badge-sm font-medium ${
                      saveStatus.state === 'error'
                        ? 'badge-error'
                        : saveStatus.state === 'saved'
                          ? 'badge-success badge-outline'
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
            </div>

            {/* ── Model ── */}
            <section
              id="cfg-model"
              className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-model' ? 'hidden' : ''}`}
            >
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">Model</h2>
              </div>

              {/* Provider Selector Cards */}
              <div id="tour-ai-provider" className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Provider</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'gemini-web', name: 'Gemini Web', icon: FaRobot },
                    { id: 'lm-studio', name: 'LM Studio', icon: FaTerminal },
                    { id: 'custom', name: 'Custom API', icon: FaPlug }
                  ].map((prov) => {
                    const isSelected = (config.aiProvider || 'gemini-web') === prov.id
                    const ProvIcon = prov.icon
                    return (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => handleAiProviderChange(prov.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-primary/15 border-primary/40 shadow-sm'
                            : 'bg-base-100/40 border-white/5 hover:border-white/15 hover:bg-base-100/70'
                        }`}
                      >
                        <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-white/80'}`}>
                          {prov.name}
                        </span>
                        <ProvIcon size={13} className={isSelected ? 'text-primary' : 'text-white/30'} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {config.aiProvider === 'gemini-web' || !config.aiProvider ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Model</p>
                    <select
                      className="select select-bordered w-full"
                      value={config.geminiWebModel || 'gemini-3.6-flash'}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, geminiWebModel: e.target.value }))}>
                      <option value="gemini-3.7-flash">gemini-3.7-flash (Terbaru 2026)</option>
                      <option value="gemini-3.6-flash">gemini-3.6-flash (Model Utama Terbaru)</option>
                      <option value="gemini-3.5-flash">gemini-3.5-flash (Stabil & Seimbang)</option>
                      <option value="gemini-3.5-flash-thinking">gemini-3.5-flash-thinking (Penalaran Mendalam)</option>
                      <option value="gemini-3.5-flash-thinking-lite">gemini-3.5-flash-thinking-lite (Penalaran Cepat)</option>
                      <option value="gemini-auto">gemini-auto (Otomatis Server)</option>
                      <option value="gemini-flash-lite">gemini-flash-lite (Super Cepat)</option>
                    </select>
                  </div>
                </div>
              ) : config.aiProvider === 'custom' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Endpoint URL</p>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1"
                      className={`input input-bordered w-full ${config.customEndpoint && !isCustomEndpointPlausible(config.customEndpoint, config.customApiProtocol) ? 'input-warning' : ''}`}
                      value={config.customEndpoint || ''}
                      onChange={handleCustomEndpointChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Protokol API</p>
                    <select
                      className="select select-bordered w-full font-medium"
                      value={config.customApiProtocol || 'auto'}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, customApiProtocol: e.target.value }))
                      }
                    >
                      <option value="auto">Auto-Detect (disarankan)</option>
                      <option value="openai">OpenAI-Compatible (/v1/chat/completions)</option>
                      <option value="anthropic">Anthropic-Compatible (/v1/messages)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold">Model ID</p>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        disabled={detectingModels || !config.customEndpoint}
                        onClick={handleDetectModels}
                        title="Ambil daftar model dari endpoint (GET /models)"
                      >
                        {detectingModels ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          'Deteksi Model'
                        )}
                      </button>
                    </div>
                    {modelDetectError && (
                      <p className="text-xs text-error mt-1">{modelDetectError}</p>
                    )}
                    <input
                      type="text"
                      list="custom-model-options"
                      placeholder={
                        customModels.length > 0
                          ? `${customModels.length} model terdeteksi - klik untuk memilih`
                          : 'Contoh: gpt-4o-mini'
                      }
                      className="input input-bordered w-full"
                      value={config.customModel || ''}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                      }
                    />
                    <datalist id="custom-model-options">
                      {customModels.map((m) => (
                        <option key={m} value={m} />
                      ))}
                      {/* 9Router combo presets  -  model combo umum (endpoint lokal
                          OpenAI-compatible: localhost:20128, dsb.) */}
                      <option value="deepseek-v3.2" />
                      <option value="deepseek-r1-0528" />
                      <option value="qwen3.8-max" />
                      <option value="qwen3.5-plus" />
                      <option value="glm-5.3" />
                      <option value="glm-5.3-flash" />
                      <option value="kimi-k3" />
                      <option value="claude-opus-4.8" />
                      <option value="claude-sonnet-4.6" />
                      <option value="gpt-5.6-sol" />
                      <option value="gpt-6-astra" />
                      <option value="nemotron-3-ultra" />
                      <option value="nemotron-3.5-lightning" />
                      <option value="muse-spark-2.1" />
                      <option value="minimax-m2" />
                      <option value="hy3" />
                      <option value="mimo-2.5" />
                      <option value="laguna-s" />
                      <option value="laguna-xs-2.1" />
                      <option value="big-pickle" />
                      <option value="kilo-auto/free" />
                      <option value="kilo-free" />
                      <option value="openrouter/free" />
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">API Key</p>
                    <div className="relative w-full">
                      <input
                        type={showCustomKey ? 'text' : 'password'}
                        placeholder="Masukkan API Key (jika diperlukan)"
                        className="input input-bordered w-full pr-10"
                        value={config.customApiKey || ''}
                        onChange={handleCustomApiKeyChange}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                        onClick={handleToggleCustomKey}
                        title={showCustomKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                      >
                        {showCustomKey ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" x2="22" y1="2" y2="22" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Model</p>
                  {lmStudioModels.length > 0 && (
                    <>
                      <p className="text-xs text-success">
                        {lmStudioModels.length} model lokal terdeteksi di LM Studio (port 1234)  - 
                        pilih di bawah atau ketik manual.
                      </p>
                      <select
                        className="select select-bordered w-full"
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            setConfig((prev) => ({ ...prev, model: e.target.value }))
                        }}
                      >
                        <option value="">-- Pilih model terdeteksi --</option>
                        {lmStudioModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <input
                    type="text"
                    list="lmstudio-model-options"
                    placeholder="Contoh: google/gemma-3-4b, glm-5.3, deepseek-v3.2, kimi-k3"
                    className="input input-bordered w-full"
                    value={config.model || ''}
                    onChange={handleModelChange}
                  />
                  <datalist id="lmstudio-model-options">
                    {lmStudioModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                    {/* 9Router combo presets  -  nama model combo umum */}
                    <option value="deepseek-v3.2" />
                    <option value="deepseek-r1-0528" />
                    <option value="qwen3.8-max" />
                    <option value="glm-5.3" />
                    <option value="glm-5.3-flash" />
                    <option value="kimi-k3" />
                    <option value="claude-opus-4.8" />
                    <option value="claude-sonnet-4.6" />
                    <option value="gpt-5.6-sol" />
                    <option value="gpt-6-astra" />
                    <option value="nemotron-3-ultra" />
                    <option value="nemotron-3.5-lightning" />
                    <option value="muse-spark-2.1" />
                    <option value="minimax-m2" />
                    <option value="hy3" />
                    <option value="mimo-2.5" />
                    <option value="laguna-s" />
                    <option value="laguna-xs-2.1" />
                    <option value="big-pickle" />
                    <option value="kilo-auto" />
                    <option value="openrouter/free" />
                  </datalist>
                </div>
              )}

              {/* Effort Ladder  -  pola vendor 2026 (Fable 5.1, Astra, Gemini 3.8):
                  model yang sama, biaya & kualitas diatur effort. */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Reasoning</p>
                <select
                  className="select select-bordered w-full font-medium"
                  value={config.effortLevel || 'low'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, effortLevel: e.target.value }))}
                >
                  <option value="auto">Auto  -  naik otomatis sesuai kompleksitas tugas</option>
                  <option value="low">Low  -  hemat token (default, untuk ReAct loop pendek)</option>
                  <option value="medium">Medium  -  seimbang untuk tugas menengah</option>
                  <option value="high">High  -  penalaran mendalam</option>
                  <option value="xhigh">xHigh  -  penalaran ekstra mendalam</option>
                  <option value="max">Max  -  maksimal penalaran, refleksi & verifikasi</option>
                  <option value="ultra">Ultra  -  Max + Workflow/Orchestration multi-agent</option>
                </select>
              </div>
            </section>

            {/* ── General ── */}
            <section
              id="cfg-general"
              className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-general' ? 'hidden' : ''}`}
            >
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">General</h2>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Bahasa</p>
                <select
                  className="select select-bordered w-full"
                  value={config.language || 'id'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, language: e.target.value }))}
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Mode performa */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Mode Performa</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={fullMode}
                    onChange={(e) => {
                      const v = e.target.checked
                      setFullMode(v)
                      try {
                        localStorage.setItem('mark:fullmode', v ? '1' : '0')
                        localStorage.setItem('mark:fullmode-asked', '1')
                      } catch (_) {}
                    }}
                  />
                  Mode penuh (coba fitur berat dulu, degradasi bila gagal)
                </label>
              </div>

              {/* Preferensi jendela: transparansi (sinkron lewat syncConfig) */}
              <div className="space-y-2 p-2 -mx-2 rounded-lg bg-base-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Transparansi Jendela</p>
                  <span className="font-mono text-sm text-primary font-bold">
                    {Math.round((config.windowOpacity ?? 0.85) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={config.windowOpacity ?? 0.85}
                  className="range range-primary range-xs w-full"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    document.documentElement.style.setProperty('--win-alpha', String(val))
                    setConfig((prev) => {
                      const newConfig = { ...prev, windowOpacity: val }
                      if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
                      return newConfig
                    })
                  }}
                />
                <div className="flex justify-between mt-2 text-xs opacity-50">
                  <span>10%</span>
                  <span>100%</span>
                </div>
              </div>
            </section>

            {/* ── Personalization ── */}
            <section
              id="cfg-personalization"
              className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-personalization' ? 'hidden' : ''}`}
            >
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  Personalization
                </h2>
              </div>

              {/* Card 1: User Profile & Context */}
              <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <FaUser className="text-primary" size={13} />
                  Profile
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-white/70">Username</p>
                    <input
                      className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
                      placeholder="Contoh: Abel"
                      value={config.ownerName || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, ownerName: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-white/70">Work on:</p>
                    <select
                      className="select select-sm select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
                      value={config.occupation || ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, occupation: e.target.value }))}
                    >
                      <option value="">- Pilih bidang -</option>
                      {[
                        'Software Engineer',
                        'Pelajar / Mahasiswa',
                        'Content Creator',
                        'Penulis',
                        'Data Scientist',
                        'Desainer',
                        'Musisi / Artis',
                        'Entrepreneur',
                        'Lainnya'
                      ].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 2: Persona & Writing Style Presets */}
              <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                    <FaRobot className="text-primary" size={14} />
                    Kloning Gaya Bicara &amp; Persona
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'digital-twin',
                      name: 'Digital Twin',
                      badge: 'Clone Mode',
                      icon: FaUser
                    },
                    {
                      id: 'jarvis',
                      name: 'Jarvis Protocol',
                      badge: 'Executive',
                      icon: FaRobot
                    },
                    {
                      id: 'cynical-partner',
                      name: 'Cynical Partner',
                      badge: 'Data-Driven',
                      icon: FaTerminal
                    },
                    {
                      id: 'autonomous-engineer',
                      name: 'Autonomous Engineer',
                      badge: 'Superpowers',
                      icon: FaCubes
                    },
                    {
                      id: 'casual-buddy',
                      name: 'Teman Akrab',
                      badge: 'Companion',
                      icon: FaSmile
                    },
                    {
                      id: 'custom',
                      name: 'Kustom Mandiri',
                      badge: 'Manual',
                      icon: FaSlidersH
                    }
                  ].map((preset) => {
                    const IconComponent = preset.icon
                    const isSelected = (config.personaPreset || 'cynical-partner') === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetSelect(preset.id)}
                        className={`text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-primary/15 border-primary/40 shadow-sm'
                            : 'bg-base-100/50 border-white/5 hover:border-white/15 hover:bg-base-100/80'
                        }`}
                      >
                        <span className="text-xs font-semibold text-white/90 flex items-center gap-2">
                          <IconComponent className={isSelected ? 'text-primary' : 'text-white/40'} size={13} />
                          {preset.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-primary/30 text-primary-content font-bold'
                              : 'bg-white/5 text-white/40'
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Card 3: Relational Growth Trait Dials */}
              <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                    <FaSlidersH className="text-primary" size={13} />
                    Dinamika Relasi &amp; Emosi
                  </h3>
                </div>

                <div className="space-y-3.5 pt-1">
                  {[
                    {
                      key: 'sarcasm_level',
                      name: 'Level Sarkasme & Roasting',
                      icon: FaFire,
                      color: 'text-orange-400'
                    },
                    {
                      key: 'warmth',
                      name: 'Empati & Kehangatan',
                      icon: FaHeart,
                      color: 'text-pink-400'
                    },
                    {
                      key: 'trust',
                      name: 'Kepercayaan Relasional',
                      icon: FaShieldAlt,
                      color: 'text-emerald-400'
                    },
                    {
                      key: 'energy',
                      name: 'Energi & Proaktivitas',
                      icon: FaBolt,
                      color: 'text-amber-400'
                    },
                    {
                      key: 'obedience',
                      name: 'Kepatuhan Instruksi',
                      icon: FaRobot,
                      color: 'text-blue-400'
                    }
                  ].map((trait) => {
                    const TraitIcon = trait.icon
                    const val = (relationship && relationship[trait.key]) ?? 0.5
                    const percent = Math.round(val * 100)
                    return (
                      <div
                        key={trait.key}
                        className="p-3 rounded-xl bg-base-100/40 border border-white/5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <TraitIcon className={trait.color} size={13} />
                            <span className="text-xs font-semibold text-white/80">{trait.name}</span>
                          </div>
                          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                            {percent}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={val}
                          className="range range-primary range-xs w-full"
                          onChange={(e) => handleTraitChange(trait.key, parseFloat(e.target.value))}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Card 4: System Directives Prompt */}
              <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                    <FaTerminal className="text-primary" size={12} />
                    System Prompt
                  </h3>
                </div>
                <textarea
                  className="textarea w-full h-44 leading-relaxed no-scrollbar resize-none font-mono text-xs bg-base-100/60 border-white/10 rounded-xl"
                  placeholder="Tambahkan instruksi kustom atau gaya penulisan spesifik untuk Mark..."
                  value={config.personality || ''}
                  onChange={handlePersonalityChange}
                />
              </div>
            </section>

            {/* ── Hardware / Media (Voice & Video) ── */}
            <div
              id="cfg-voice-video"
              className={`${activeSection !== 'cfg-voice-video' && activeSection !== 'cfg-camera' && activeSection !== 'cfg-audio-voice' ? 'hidden' : ''} space-y-8`}
            >
              {/* Camera Settings */}
              <div
                id="cfg-camera"
                className={`space-y-6 p-5 rounded-2xl bg-base-200/40 border border-white/5 scroll-mt-4 ${activeSection === 'cfg-audio-voice' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-80 mb-5 flex items-center gap-2">
                  <FaEye className="text-primary text-base" />
                  Kamera & Vision Fisik
                </h2>

                <div className="form-control">
                  <label className="label cursor-pointer p-0">
                    <span className="label-text text-sm font-semibold">Aktifkan Kamera AI</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={config.cameraEnabled !== false}
                      onChange={handleCameraEnabledChange}
                    />
                  </label>
                  <span className="text-xs opacity-50 mt-2 block">
                    Mengizinkan Mark menggunakan kamera (jika diminta) untuk melihat dunia fisik.
                  </span>
                </div>

                {config.cameraEnabled !== false && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Perangkat Kamera</p>
                    <select
                      className="select select-bordered w-full"
                      value={config.cameraDeviceId || 'default'}
                      onChange={handleCameraDeviceIdChange}
                    >
                      <option value="default">Default System Camera</option>
                      {videoDevices.map((cam) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          {cam.label || `Camera ${cam.deviceId.substring(0, 5)}...`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {config.cameraEnabled !== false && (
                  <ConfigCameraPreview
                    deviceId={config.cameraDeviceId}
                    enabled={config.cameraEnabled !== false}
                  />
                )}
              </div>

              {/* TTS & Audio Settings */}
              <div
                id="cfg-audio-voice"
                className={`space-y-6 p-5 rounded-2xl bg-base-200/40 border border-white/5 scroll-mt-4 ${activeSection === 'cfg-camera' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-80 mb-5 flex items-center gap-2">
                  <FaVolumeUp className="text-primary text-base" />
                  Audio & Voice Engine
                </h2>

                {/* Speech To Text (STT) Engine: Custom Multi-Provider Audio Router & Local Whisper */}
                <div id="tour-stt-provider" className="space-y-4 p-4.5 rounded-2xl bg-base-200/40 border border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">Speech To Text (STT) Engine</p>
                      <p className="text-xs opacity-60">
                        Multi-Provider Audio Router (OpenAI /v1/audio/transcriptions) & Local Whisper On-Device
                      </p>
                    </div>
                  </div>

                  {/* Hardware Auto-Detect Notice */}
                  {hardwareSupport && (
                    <div
                      className={`text-xs p-3 rounded-xl border flex items-start gap-2.5 ${
                        hardwareSupport.isLowEnd
                          ? 'bg-warning/10 border-warning/30 text-warning'
                          : 'bg-info/10 border-info/30 text-info'
                      }`}
                    >
                      {hardwareSupport.isLowEnd ? (
                        <FaExclamationTriangle className="text-sm shrink-0 mt-0.5" />
                      ) : (
                        <FaCheckCircle className="text-sm shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold">
                          {hardwareSupport.isLowEnd
                            ? 'Laptop Spek Terbatas:'
                            : 'Hardware Memadai:'}
                        </span>{' '}
                        {hardwareSupport.reason} ({hardwareSupport.cores} CPU cores terdeteksi)
                      </div>
                    </div>
                  )}

                  {/* Mode Switcher: Custom vs Local Whisper */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-base-300/60 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, sttProvider: 'custom' }))}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                        config.sttProvider !== 'whisper'
                          ? 'bg-primary text-primary-content shadow-md'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <FaBolt className="text-xs" />
                      <span>Custom Audio Router (Multi-Provider)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, sttProvider: 'whisper' }))}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                        config.sttProvider === 'whisper'
                          ? 'bg-primary text-primary-content shadow-md'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <FaMicrophone className="text-xs" />
                      <span>Local Whisper (On-Device)</span>
                    </button>
                  </div>

                  {/* PANEL 1: LOCAL WHISPER */}
                  {config.sttProvider === 'whisper' && (
                    <div className="space-y-3 p-4 rounded-xl bg-base-300/40 border border-white/10 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Model Whisper Lokal</span>
                        <span className="badge badge-xs badge-primary font-mono">ON-DEVICE</span>
                      </div>
                      <p className="text-xs opacity-60">
                        Memproses ucapan sepenuhnya di dalam laptop via WebAssembly. Bebas kuota dan tanpa koneksi internet, namun membutuhkan RAM dan CPU yang cukup.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs opacity-75 font-semibold">Pilihan Model</p>
                          <select
                            className="select select-bordered select-sm w-full font-mono text-xs"
                            value={config.localWhisperModel || 'whisper-small'}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, localWhisperModel: e.target.value }))
                            }
                          >
                            <option value="whisper-tiny">whisper-tiny (~75 MB, Paling Cepat)</option>
                            <option value="whisper-small">whisper-small (~150 MB, Akurasi Standar)</option>
                          </select>
                        </div>

                        <div className="space-y-1 flex flex-col justify-end">
                          <button
                            type="button"
                            disabled={whisperLoading}
                            onClick={handleDownloadWhisper}
                            className="btn btn-sm btn-primary gap-2"
                          >
                            {whisperLoading ? (
                              <>
                                <span className="loading loading-spinner loading-xs" />
                                <span>Mengunduh Model...</span>
                              </>
                            ) : whisperLoaded ? (
                              <>
                                <FaCheckCircle />
                                <span>Model Siap di Memori</span>
                              </>
                            ) : (
                              <>
                                <FaMicrophone />
                                <span>Unduh & Siapkan Model</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {whisperProgress && (
                        <div className="p-2.5 rounded-lg bg-base-200 border border-white/10 text-xs font-mono text-cyan-300">
                          {whisperProgress}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PANEL 2: CUSTOM AUDIO ROUTER (MULTI-PROVIDER COMBO) */}
                  {config.sttProvider !== 'whisper' && (
                    <div className="space-y-4 animate-fade-in">
                      {/* Strategy & Language Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-base-300/40 border border-white/10">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold opacity-75">Strategi Routing</p>
                          <select
                            className="select select-bordered select-sm w-full text-xs font-semibold"
                            value={config.sttStrategy || 'fallback'}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, sttStrategy: e.target.value }))
                            }
                          >
                            <option value="fallback">Fallback (Priority Chain: Failover jika Error)</option>
                            <option value="round-robin">Round Robin (Distribusi Bergantian)</option>
                          </select>
                          <span className="text-[10px] opacity-50 block">
                            {config.sttStrategy === 'round-robin'
                              ? 'Request audio digilir antar seluruh koneksi aktif untuk meratakan kuota.'
                              : 'Mencoba koneksi urutan #1. Jika gagal (CORS/429/timeout), otomatis failover ke urutan berikutnya.'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold opacity-75">Bahasa Transkripsi Utama</p>
                          <select
                            className="select select-bordered select-sm w-full text-xs font-semibold"
                            value={config.sttLanguage || 'id'}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, sttLanguage: e.target.value }))
                            }
                          >
                            <option value="id">Bahasa Indonesia (id)</option>
                            <option value="en">English (en)</option>
                            <option value="zh">Mandarin / Chinese (zh)</option>
                          </select>
                          <span className="text-[10px] opacity-50 block">
                            Bahasa yang dikirim ke parameter model transkripsi.
                          </span>
                        </div>
                      </div>

                      {/* Connection Cards List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider opacity-60">
                            Daftar Koneksi Gateway ({(config.sttConnections || []).length})
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleAddConnection({
                                  id: `conn-${Date.now()}`,
                                  name: 'Local Gateway (127.0.0.1)',
                                  endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
                                  apiKey: '',
                                  model: 'selfhosted-stt/whisper-1',
                                  enabled: true
                                })
                              }
                              className="btn btn-xs btn-outline hover:btn-info text-[11px]"
                            >
                              + 127.0.0.1
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAddConnection({
                                  id: `conn-${Date.now()}`,
                                  name: 'Groq Whisper Cloud',
                                  endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
                                  apiKey: config.groqApiKey || '',
                                  model: 'whisper-large-v3-turbo',
                                  enabled: true
                                })
                              }
                              className="btn btn-xs btn-outline hover:btn-success text-[11px]"
                            >
                              + Groq Cloud
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAddConnection({
                                  id: `conn-${Date.now()}`,
                                  name: 'Whisper.cpp Local',
                                  endpoint: 'http://127.0.0.1:8080/v1/audio/transcriptions',
                                  apiKey: '',
                                  model: 'whisper-1',
                                  enabled: true
                                })
                              }
                              className="btn btn-xs btn-outline hover:btn-accent text-[11px]"
                            >
                              + Whisper.cpp
                            </button>
                          </div>
                        </div>

                        {(config.sttConnections || []).map((conn, idx) => {
                          const testResult = connTestResults[conn.id]
                          const isTesting = testingConnId === conn.id

                          return (
                            <div
                              key={conn.id}
                              className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                                conn.enabled
                                  ? 'bg-base-300/50 border-cyan-500/25 shadow-sm'
                                  : 'bg-base-300/20 border-white/5 opacity-60'
                              }`}
                            >
                              {/* Header Card */}
                              <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="badge badge-sm badge-neutral font-mono font-bold">
                                    #{idx + 1}
                                  </span>
                                  {idx === 0 && config.sttStrategy === 'fallback' && (
                                    <span className="badge badge-xs badge-info font-bold">PRIORITAS UTAMA</span>
                                  )}
                                  <input
                                    type="text"
                                    className="input input-xs input-ghost font-bold text-xs text-white max-w-[180px] p-0 focus:px-1"
                                    value={conn.name}
                                    onChange={(e) =>
                                      handleUpdateConnection(conn.id, 'name', e.target.value)
                                    }
                                    placeholder="Nama Koneksi..."
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {/* Toggle Active */}
                                  <label className="flex items-center gap-1 cursor-pointer mr-1">
                                    <input
                                      type="checkbox"
                                      className="toggle toggle-xs toggle-primary"
                                      checked={conn.enabled}
                                      onChange={(e) =>
                                        handleUpdateConnection(conn.id, 'enabled', e.target.checked)
                                      }
                                    />
                                  </label>

                                  {/* Reorder Buttons */}
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveConnection(idx, -1)}
                                    className="btn btn-ghost btn-xs btn-square text-xs disabled:opacity-20"
                                    title="Pindahkan Ke Atas"
                                  >
                                    <FaArrowUp />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === (config.sttConnections || []).length - 1}
                                    onClick={() => handleMoveConnection(idx, 1)}
                                    className="btn btn-ghost btn-xs btn-square text-xs disabled:opacity-20"
                                    title="Pindahkan Ke Bawah"
                                  >
                                    <FaArrowDown />
                                  </button>

                                  {/* Delete Button */}
                                  {(config.sttConnections || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveConnection(conn.id)}
                                      className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/15 ml-1"
                                      title="Hapus Koneksi"
                                    >
                                      <FaTrash />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Form Inputs */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                <div className="space-y-1 sm:col-span-2">
                                  <span className="opacity-70 font-semibold">Endpoint URL</span>
                                  <input
                                    type="text"
                                    placeholder="http://127.0.0.1:20128/v1/audio/transcriptions"
                                    className="input input-bordered input-xs w-full font-mono"
                                    value={conn.endpoint || ''}
                                    onChange={(e) =>
                                      handleUpdateConnection(conn.id, 'endpoint', e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-1">
                                  <span className="opacity-70 font-semibold">Model Name</span>
                                  <input
                                    type="text"
                                    placeholder="whisper-large-v3-turbo"
                                    className="input input-bordered input-xs w-full font-mono"
                                    value={conn.model || ''}
                                    onChange={(e) =>
                                      handleUpdateConnection(conn.id, 'model', e.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-1 sm:col-span-3">
                                  <span className="opacity-70 font-semibold">API Key / Token (Opsional bila lokal)</span>
                                  <input
                                    type="password"
                                    placeholder="sk-..."
                                    className="input input-bordered input-xs w-full font-mono"
                                    value={conn.apiKey || ''}
                                    onChange={(e) =>
                                      handleUpdateConnection(conn.id, 'apiKey', e.target.value)
                                    }
                                  />
                                </div>
                              </div>

                              {/* Test Button & Result */}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={isTesting}
                                  onClick={() => handleTestConnection(conn)}
                                  className="btn btn-xs btn-outline btn-info gap-1.5"
                                >
                                  {isTesting ? (
                                    <>
                                      <span className="loading loading-spinner loading-xs" />
                                      <span>Menguji Latensi...</span>
                                    </>
                                  ) : (
                                    <>
                                      <FaBolt className="text-[10px]" />
                                      <span>Test Koneksi</span>
                                    </>
                                  )}
                                </button>

                                {testResult && (
                                  <span
                                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                                      testResult.ok
                                        ? 'bg-success/15 border-success/30 text-success'
                                        : 'bg-error/15 border-error/30 text-error'
                                    }`}
                                  >
                                    {testResult.msg}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {/* Add Connection Bottom Button */}
                        <button
                          type="button"
                          onClick={() => handleAddConnection()}
                          className="btn btn-sm btn-outline btn-block border-dashed border-white/20 hover:border-cyan-400/50 hover:bg-cyan-500/10 gap-2 text-xs"
                        >
                          <FaPlus />
                          <span>Tambah Koneksi Gateway Kustom Baru</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Microphone Source Selection */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Mikrofon (Voice Input)</p>
                  <select
                    className="select select-bordered w-full"
                    value={config.micDeviceId || 'default'}
                    onChange={handleMicDeviceIdChange}
                  >
                    <option value="default">Default System Microphone</option>
                    {audioDevices.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label || `Microphone ${mic.deviceId.substring(0, 5)}...`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* TTS Rate */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">TTS Rate (Kecepatan Suara)</p>
                    <span className="font-mono text-sm text-primary font-bold">
                      {config.ttsRate}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={config.ttsRate}
                    className="range range-primary range-xs w-full"
                    onChange={handleTtsRateChange}
                  />
                  <div className="flex justify-between mt-2 text-xs">
                    <span>-50%</span>
                    <span>-25%</span>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                  </div>
                </div>

                {/* TTS Pitch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">TTS Pitch (Nada Suara)</p>
                    <span className="font-mono text-sm text-primary font-bold">
                      {config.ttsPitch}hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={config.ttsPitch}
                    className="range range-primary range-xs w-full"
                    onChange={handleTtsPitchChange}
                  />
                  <div className="flex justify-between mt-2 text-xs">
                    <span>-50hz</span>
                    <span>-25hz</span>
                    <span>0hz</span>
                    <span>25hz</span>
                    <span>50hz</span>
                  </div>
                </div>

                {/* Test TTS Button */}
                <div className="pt-2">
                  <button
                    className={`btn btn-soft btn-sm gap-2 ${playingTest ? 'btn-disabled' : ''}`}
                    onClick={handleTestVoice}
                    disabled={playingTest}
                  >
                    {playingTest ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1.2em"
                        height="1.2em"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                      </svg>
                    )}
                    Test Suara Mark
                  </button>
                  <p className="text-[10px] opacity-30 mt-1.5 px-1">
                    *Klik untuk mendengar suara Mark dengan settingan di atas tanpa perlu simpan
                    dulu.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Capabilities (MCP, Plugins, Skills, Automation, Security) ── */}
            <div
              id="cfg-capabilities"
              className={`${activeSection !== 'cfg-capabilities' ? 'hidden' : ''} space-y-6`}
            >
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  Capabilities &amp; Integrations
                </h2>
                <p className="text-xs opacity-50 mt-1">
                  Kelola konektor eksternal (MCP), custom plugin JS, learned skills, otomatisasi sistem, dan kebijakan keamanan.
                </p>
              </div>

              <CapabilitiesHub
                config={config}
                setConfig={setConfig}
                handleAwarenessEnabledChange={handleAwarenessEnabledChange}
                handleBuiltinPluginChange={handleBuiltinPluginChange}
                handleRtkCompressChange={handleRtkCompressChange}
                isDevMode={devHarness}
              />
            </div>

          </div>
          {/* ── Global Shortcut Settings ── */}
          <section
            id="cfg-shortcut"
            className={`space-y-5 p-2 -mx-2 rounded-lg scroll-mt-4 ${activeSection !== 'cfg-shortcut' ? 'hidden' : ''}`}
          >
            <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
              Global Shortcut Key
            </h2>

            <div className="space-y-1.5">
              <div className="flex justify-between items-end">
                <p className="text-sm font-semibold">Tombol Panggilan Cepat</p>
                <span className="text-[10px] font-mono opacity-50">Aktif Lintas Aplikasi</span>
              </div>

              <div className="relative w-full">
                <input
                  type="text"
                  readOnly
                  onFocus={() => setIsRecordingShortcut(true)}
                  onBlur={() => setIsRecordingShortcut(false)}
                  onKeyDown={handleShortcutRecorderKeyDown}
                  value={
                    isRecordingShortcut
                      ? 'Tekan kombinasi tombol di keyboard...'
                      : (config.shortcutKey || 'CommandOrControl+Alt+M').replace(
                          /CommandOrControl|Control/g,
                          'Ctrl'
                        )
                  }
                  className={`input input-bordered w-full font-mono text-sm cursor-pointer select-none ${
                    isRecordingShortcut
                      ? 'input-primary border-2 animate-pulse bg-primary/10 text-primary font-bold'
                      : 'hover:border-primary/60'
                  }`}
                />
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs opacity-60 w-full mb-1">Preset Cepat:</span>
                {[
                  'CommandOrControl+Alt+M',
                  'CommandOrControl+Shift+Space',
                  'Alt+Space',
                  'CommandOrControl+Space',
                  'F9'
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setConfig((prev) => {
                        const updated = { ...prev, shortcutKey: preset }
                        if (window.api && window.api.syncConfig) window.api.syncConfig(updated)
                        return updated
                      })
                    }}
                    className={`btn btn-xs ${config.shortcutKey === preset ? 'btn-primary' : 'btn-ghost border-base-content/20'} font-mono`}
                  >
                    {preset.replace('CommandOrControl', 'Ctrl')}
                  </button>
                ))}
              </div>
              <span className="text-[11px] opacity-60 block mt-1">
                Cukup <b>klik kotak input di atas</b> lalu tekan kombinasi tombol di keyboard kamu
                (misal: <code>Ctrl+Alt+A</code>, <code>Alt+Space</code>, <code>F9</code>). Shortcut
                langsung aktif seketika di OS!
              </span>
            </div>
          </section>

          {/* ── Telegram Bot Settings ── */}

          {!isFirstSetup && (
            <>
              {/* ── Memory & Data ── */}
              <section
                id="cfg-memory-data"
                className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-memory-data' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  Data Controls
                </h2>

                {/* Chat History */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Chat History</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-outline btn-sm btn-error"
                      onClick={handleClearAllChat}
                    >
                      Hapus Semua Chat
                    </button>
                    <button className="btn btn-outline btn-sm btn-info" onClick={handleExportChat}>
                      Export Chat ke JSON
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={handleImportLegacy}>
                      Impor Export JSON Lama
                    </button>
                  </div>
                </div>
              </section>

              {/* -- Developer -- */}
              <section
                id="cfg-developer"
                className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-developer' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                  Developer
                </h2>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Debug Logging (JSONL)</p>
                  <p className="text-xs opacity-60">
                    Rekam reasoning &amp; tool-call ke file JSONL di folder data aplikasi. Default
                    OFF. Rotasi otomatis 50MB.
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      className="toggle toggle-warning toggle-sm"
                      checked={devHarness}
                      onChange={(e) => {
                        const v = e.target.checked
                        setDevHarness(v)
                        localStorage.setItem('devHarnessLogging', v ? '1' : '0')
                      }}
                    />
                    <span className="text-sm">{devHarness ? 'AKTIF' : 'OFF'}</span>
                  </label>
                </div>
                <button className="btn btn-outline btn-sm w-fit" onClick={handleDumpPrompt}>
                  Dump System Prompt (Audit)
                </button>
              </section>
            </>
          )}

          <div className="flex flex-col items-end pt-2">
            {isDownloadingModel && (
              <div className="w-full max-w-xs mb-4">
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
            {/* Mode normal: AUTOSAVE penuh  -  tombol simpan manual dihapus. */}
          </div>
        </div>
        <ModalComponent />
      </div>
    </div>
  )
}

export default Configuration
