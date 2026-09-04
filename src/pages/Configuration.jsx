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
  FaExclamationTriangle
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
        // WebKitGTK/wry bisa menolak getUserMedia tanpa dialog izin — tampilkan
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
const withSttFallback = (cfg) =>
  cfg.localWhisperModel?.startsWith('groq') && !cfg.groqApiKey?.trim()
    ? { ...cfg, localWhisperModel: 'whisper-small' }
    : cfg

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
    cameraEnabled: true
  })
  const [relationalTraits, setRelationalTraits] = useState(null)
  const [memories, setMemories] = useState([])
  const [audioDevices, setAudioDevices] = useState([])
  const [videoDevices, setVideoDevices] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const { confirm, ModalComponent } = useConfirm()
  const chatContext = useChat()
  const navigate = useNavigate()

  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [activeSection, setActiveSection] = useState('cfg-general')
  const [pluginCount, setPluginCount] = useState(null)
  const [skillCount, setSkillCount] = useState(null)
  const [connStats, setConnStats] = useState(null) // { total, connected, connectionless, auditOk }
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

  // Enumerasi mic/kamera LAZY — hanya saat dibutuhkan (wizard atau section
  // Audio/Kamera dibuka). getUserMedia di mount memicu warning dobel WebKitGTK
  // dan memperlambat buka halaman tanpa alasan.
  const enumerateMediaDevices = () => {
    if (devicesLoadedRef.current) return
    if (!navigator.mediaDevices?.getUserMedia?.enumerateDevices) {
      // Batas webview Linux (WebKitGTK) — bukan error aplikasi. Log sekali saja.
      if (!mediaInfoLogged) {
        mediaInfoLogged = true
        console.info(
          '[Config] Media devices API tidak tersedia di webview ini; daftar mic/kamera dikosongkan.'
        )
      }
      return
    }
    devicesLoadedRef.current = true
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const mics = devices.filter((d) => d.kind === 'audioinput')
            const cameras = devices.filter((d) => d.kind === 'videoinput')
            setAudioDevices(mics)
            setVideoDevices(cameras)
          })
          .catch((err) => console.error('Error enumerating devices', err))

        // Stop stream immediately since we just needed permission
        stream.getTracks().forEach((track) => track.stop())
      })
      .catch(() => {
        // WebKitGTK/wry dapat menolak permintaan izin tanpa dialog. Bukan fatal:
        // daftar perangkat kosong dan pengguna tetap bisa menyimpan config.
        console.warn(
          '[Config] Izin mic/kamera tidak diberikan oleh lingkungan webview; pilihan perangkat dikosongkan.'
        )
      })
  }

  useEffect(() => {
    loadConfig()
    loadMemories()
  }, [])

  useEffect(() => {
    if (activeSection === 'cfg-camera' && !devicesLoadedRef.current) {
      enumerateMediaDevices()
    }
  }, [activeSection])

  // Ringkasan capabilities untuk sidebar Chips (load-when-needed: hanya saat
  // section terkait aktif, tidak pernah memblok mount halaman).
  useEffect(() => {
    let cancelled = false
    const loadSummary = async () => {
      try {
        if (activeSection === 'cfg-plugins' && window.api?.getPlugins && pluginCount === null) {
          const list = await window.api.getPlugins()
          if (!cancelled) setPluginCount(Array.isArray(list) ? list.length : 0)
        } else if (activeSection === 'cfg-skills' && window.api?.getSkills && skillCount === null) {
          const list = await window.api.getSkills()
          if (!cancelled) setSkillCount(Array.isArray(list) ? list.length : 0)
        } else if (
          activeSection === 'cfg-connectors' &&
          window.api?.listCapabilities &&
          connStats === null
        ) {
          const [caps, conns, audit] = await Promise.all([
            window.api.listCapabilities(),
            window.api.listCapabilityConnections(),
            window.api.readCapabilityAudit(30)
          ])
          if (!cancelled) {
            setConnStats({
              total: Array.isArray(caps) ? caps.length : 0,
              connected: Object.keys(conns || {}).length,
              connectionless: (caps || []).filter((c) => !c.scopes?.length).length,
              auditOk: (audit || []).filter((e) => e.status === 'ok').length
            })
          }
        }
      } catch {
        // Ringkasan best-effort — kegagalan sidecar tidak boleh memblok UI config.
      }
    }
    loadSummary()
    return () => {
      cancelled = true
    }
  }, [activeSection, pluginCount, skillCount, connStats])

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
  // Wizard tidak ikut — dia punya alur "Simpan & Mulai" eksplisit.
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
      new RegExp(`\\b(${config.ownerName || 'Mada'}|${config.ownerName || 'Mazees'})\\b`, 'i').test(
        prompt
      )
    await confirm({
      title: 'Dump System Prompt',
      message:
        `Panjang: ${prompt.length} chars.${copied ? ' Disalin ke clipboard.' : ' Clipboard tidak tersedia.'}` +
        (leak
          ? `\n\nPERINGATAN: terdeteksi nama ${config.ownerName || 'Mada'} di prompt padahal ownerName kosong - lacak blok sumbernya lewat isi clipboard.`
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
    if (config.localWhisperModel?.startsWith('groq') && !config.groqApiKey?.trim()) {
      if (isFirstSetup) {
        // Wizard TIDAK BOLEH macet karena STT cloud: fallback otomatis ke lokal.
        console.info(
          '[Configuration] STT Groq dipilih tanpa API Key saat setup - otomatis fallback ke Whisper Small lokal.'
        )
        effectiveConfig = { ...config, localWhisperModel: 'whisper-small' }
        setConfig(effectiveConfig)
      } else {
        await confirm({
          title: 'Groq API Key Kosong',
          message:
            'Engine STT dipilih Groq Cloud, tapi API Key masih kosong. Isi key di bagian Voice, atau ganti engine ke Local Offline (Whisper Small).',
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
  // Deteksi model LM Studio (localhost:1234/v1/models) — LAZY: hanya saat
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
  // Built-in plugins (ponytail/caveman) — always-on by default, toggle per fitur.
  const handleBuiltinPluginChange = (key) => (e) =>
    setConfig((prev) => ({
      ...prev,
      builtinPlugins: { ...(prev.builtinPlugins || {}), [key]: e.target.checked }
    }))
  // rtk (kompresi output tool di layer EKSEKUSI sidecar) — default ON,
  // no-op senyap bila binary `rtk` tidak terpasang di PATH.
  const handleRtkCompressChange = (e) =>
    setConfig((prev) => ({ ...prev, rtkCompress: e.target.checked }))
  const handlePersonalityChange = (e) =>
    setConfig((prev) => ({ ...prev, personality: e.target.value }))
  const handleTemperatureChange = (e) =>
    setConfig((prev) => ({ ...prev, temperature: e.target.value }))
  const handleContextChange = (e) => setConfig((prev) => ({ ...prev, context: e.target.value }))
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
    <div className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Sidebar + Content Layout */}
      <div className="relative z-10 flex h-full">
        <ConfigSidebar
          isFirstSetup={isFirstSetup}
          activeSection={activeSection}
          onNavigate={handleSidebarNavigate}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden ml-4 min-w-0">
          <div className="pt-4 pr-4">
            {/* Page Header */}
            <div className="flex items-center gap-4">
              {!isFirstSetup && (
                <button onClick={handleBack} className="btn btn-ghost btn-sm btn-circle">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="1.2em"
                    height="1.2em"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <div>
                <h1 className="text-2xl font-bold">Pengaturan Mark</h1>
                <p className="opacity-50 text-sm mt-1">
                  Sesuaikan perilaku Mark dengan preferensimu.
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {saveStatus && !isFirstSetup && (
                  <span
                    className={`badge badge-sm ${
                      saveStatus.state === 'error'
                        ? 'badge-error'
                        : saveStatus.state === 'saved'
                          ? 'badge-success badge-outline'
                          : 'badge-warning badge-outline'
                    }`}
                  >
                    {saveStatus.state === 'pending'
                      ? 'Perubahan…'
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
              className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-model' ? 'hidden' : ''}`}
            >
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">Model</h2>

              {/* Provider Selector */}
              <div id="tour-ai-provider" className="space-y-1.5">
                <p className="text-sm font-semibold">Provider</p>
                <select
                  className="select select-bordered w-full font-medium"
                  value={config.aiProvider || 'gemini-web'}
                  onChange={(e) => handleAiProviderChange(e.target.value)}
                >
                  <option value="gemini-web">Gemini (Gratis)</option>
                  <option value="groq">Groq Cloud (Free tier)</option>
                  <option value="lm-studio">LM Studio</option>
                  <option value="custom">Custom API</option>
                </select>
              </div>

              {/* Effort Ladder — pola vendor 2026 (Fable 5.1, Astra, Gemini 3.8):
                  model yang sama, biaya & kualitas diatur effort. */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Reasoning Effort</p>
                <select
                  className="select select-bordered w-full font-medium"
                  value={config.effortLevel || 'low'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, effortLevel: e.target.value }))}
                >
                  <option value="low">Low — hemat token (default, untuk ReAct loop pendek)</option>
                  <option value="medium">Medium — seimbang untuk tugas menengah</option>
                  <option value="high">High — maksimal untuk misi panjang/berat</option>
                </select>
                <p className="text-xs opacity-50">
                  Model yang sama bisa jauh lebih murah di effort rendah (pola Fable 5.1: Low/Medium
                  ≈ model generasi sebelumnya full-effort). Untuk trading-support dengan wallet
                  mandiri, default low menjaga biaya marginal minimum.
                </p>
              </div>

              {config.aiProvider === 'gemini-web' || !config.aiProvider ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Model Gemini</p>
                    <select
                      className="select select-bordered w-full"
                      value={config.geminiWebModel || 'gemini-3.6-flash'}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, geminiWebModel: e.target.value }))
                      }
                    >
                      <option value="gemini-3.6-flash">
                        gemini-3.6-flash (Model Utama Terbaru)
                      </option>
                      <option value="gemini-3.5-flash">gemini-3.5-flash (Stabil & Seimbang)</option>
                      <option value="gemini-3.5-flash-thinking">
                        gemini-3.5-flash-thinking (Penalaran Mendalam)
                      </option>
                      <option value="gemini-3.5-flash-thinking-lite">
                        gemini-3.5-flash-thinking-lite (Penalaran Cepat)
                      </option>
                      <option value="gemini-auto">gemini-auto (Otomatis Server)</option>
                      <option value="gemini-flash-lite">gemini-flash-lite (Super Cepat)</option>
                    </select>
                    <p className="text-xs opacity-50 mt-1">
                      Provider bawaan tanpa API Key. Membutuhkan koneksi internet (tidak mendukung
                      input gambar).
                    </p>
                  </div>
                </div>
              ) : config.aiProvider === 'groq' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold">Groq Model</p>
                    <input
                      type="text"
                      list="groq-model-options"
                      placeholder="llama-3.1-8b-instant"
                      className="input input-bordered w-full"
                      value={config.customModel || ''}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                      }
                    />
                    <datalist id="groq-model-options">
                      <option value="llama-3.1-8b-instant">
                        llama-3.1-8b-instant (free, tercepat)
                      </option>
                      <option value="llama-3.3-70b-versatile">
                        llama-3.3-70b-versatile (free, kuat)
                      </option>
                      <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (free)</option>
                      <option value="moonshotai/kimi-k2-instruct">
                        moonshotai/kimi-k2-instruct
                      </option>
                      <option value="qwen/qwen3-32b">qwen/qwen3-32b</option>
                    </datalist>
                    <p className="text-xs opacity-50">
                      Free tier luas + latensi terendah untuk model open (Llama/Qwen/Kimi). Pakai
                      API Key yang sama dengan Voice STT — ambil gratis di console.groq.com/keys.
                    </p>
                  </div>
                  {!config.groqApiKey?.trim() && (
                    <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex gap-2 items-start">
                      <FaExclamationTriangle className="text-warning mt-0.5 shrink-0" size={12} />
                      <p className="text-xs opacity-80">
                        Groq API Key kosong — isi di bagian Voice di bawah (Key dipakai bersama
                        untuk chat dan STT).
                      </p>
                    </div>
                  )}
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
                  <p className="text-sm font-semibold">Model Selector (LM Studio)</p>
                  {lmStudioModels.length > 0 && (
                    <>
                      <p className="text-xs text-success">
                        {lmStudioModels.length} model lokal terdeteksi di LM Studio (port 1234) —
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
                    placeholder="Contoh: google/gemma-3-4b"
                    className="input input-bordered w-full"
                    value={config.model || ''}
                    onChange={handleModelChange}
                  />
                  <datalist id="lmstudio-model-options">
                    {lmStudioModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <p className="text-xs opacity-40">
                    Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
                  </p>
                </div>
              )}
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
                <p className="text-[11px] text-warning/80">
                  Eksperimental: butuh restart pertama kali &amp; dapat menimbulkan artefak di
                  WebKitGTK.
                </p>
              </div>

              {/* Awareness Engine Toggle */}
              <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Awareness Engine</p>
                    <p className="text-xs opacity-50 mt-1">
                      Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara
                      proaktif di latar belakang.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={config.awarenessEnabled !== false}
                    onChange={handleAwarenessEnabledChange}
                  />
                </div>
              </div>

              {/* Built-in Plugins (ponytail + caveman) */}
              <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Ponytail (hemat kode)</p>
                    <p className="text-xs opacity-50 mt-1">
                      Ladder YAGNI: pakai ulang kode yang ada, stdlib, fitur platform, satu baris —
                      sebelum menulis kode baru. Validasi &amp; keamanan tidak pernah dipotong.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={config.builtinPlugins?.ponytail !== false}
                    onChange={handleBuiltinPluginChange('ponytail')}
                  />
                </div>
              </div>
              <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Caveman (hemat token jawaban)</p>
                    <p className="text-xs opacity-50 mt-1">
                      Jawaban super-ringkas; kode, perintah, path, dan pesan error tetap utuh.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={config.builtinPlugins?.caveman !== false}
                    onChange={handleBuiltinPluginChange('caveman')}
                  />
                </div>
              </div>
              <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Rtk (kompresi output tool)</p>
                    <p className="text-xs opacity-50 mt-1">
                      Output tool panjang (shell/git/grep) dikompres sebelum masuk konteks AI. No-op
                      otomatis bila binary `rtk` tidak terpasang.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={config.rtkCompress !== false}
                    onChange={handleRtkCompressChange}
                  />
                </div>
              </div>
            </section>

            {/* ── Personalization ── */}
            <section
              id="cfg-personalization"
              className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-personalization' ? 'hidden' : ''}`}
            >
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                Personalization
              </h2>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Nama Panggilan</p>
                <input
                  className="input input-bordered w-full"
                  placeholder="Contoh: Abel"
                  value={config.ownerName || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, ownerName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Pekerjaan / Bidang</p>
                <select
                  className="select select-bordered w-full"
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
                <p className="text-xs opacity-40">
                  Membantu Mark menyesuaikan analogi &amp; gaya penjelasan.
                </p>
              </div>

              {/* System Persona */}
              <div id="tour-persona" className="space-y-1.5 p-2 -mx-2 rounded-lg">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
                  <textarea
                    className="textarea w-full h-72 leading-relaxed no-scrollbar resize-none"
                    placeholder="Deskripsikan kepribadian Mark..."
                    value={config.personality}
                    onChange={handlePersonalityChange}
                  />
                </div>
              </div>
              <div id="tour-temperature" className="space-y-2 p-2 -mx-2 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Temperature</p>
                  <span className="font-mono text-sm text-primary font-bold">
                    {config.temperature}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  className="range range-primary range-xs w-full"
                  onChange={handleTemperatureChange}
                />
                <div className="flex justify-between px-2.5 mt-2 text-xs">
                  <span>0</span>
                  <span>0.2</span>
                  <span>0.4</span>
                  <span>0.6</span>
                  <span>0.8</span>
                  <span>1.0</span>
                </div>
              </div>

              {/* Context Window */}
              <div id="tour-context" className="space-y-2 p-2 -mx-2 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Riwayat Pesan</p>
                  <span className="font-mono text-sm text-primary font-bold">{config.context}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="22"
                  step="2"
                  value={config.context}
                  className="range range-primary range-xs w-full"
                  onChange={handleContextChange}
                />
                <div className="flex justify-between mt-2 text-xs">
                  <span>2</span>
                  <span>6</span>
                  <span>10</span>
                  <span>14</span>
                  <span>18</span>
                  <span>22</span>
                </div>
                <p className="text-xs opacity-40">
                  Jumlah <b>pesan obrolan</b> yang dikirim sebagai konteks — bukan token window.
                  Batas token model (mis. 1.048.576) adalah unit yang berbeda.
                </p>
              </div>
            </section>

            {/* ── Capabilities ── */}
            <div
              id="cfg-capabilities"
              className={`${activeSection !== 'cfg-capabilities' ? 'hidden' : ''} space-y-6`}
            >
              {/* Camera Settings */}
              <div
                id="cfg-camera"
                className={`space-y-6 p-2 -mx-2 rounded-lg scroll-mt-4 ${activeSection !== 'cfg-camera' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5 flex items-center gap-2">
                  Kamera
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

              {/* TTS Settings */}
              <div
                id="cfg-audio-voice"
                className={`space-y-6 p-2 -mx-2 rounded-lg scroll-mt-4 ${activeSection !== 'cfg-audio-voice' ? 'hidden' : ''}`}
              >
                <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5">
                  Audio & Voice Engine
                </h2>

                {/* STT Engine Selection */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Mesin Transkripsi Suara (STT)</p>
                  <select
                    className="select select-bordered w-full"
                    value={config.localWhisperModel || 'whisper-small'}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, localWhisperModel: e.target.value }))
                    }
                  >
                    <option value="whisper-small">Local Offline (Whisper Small)</option>
                    <option value="groq-whisper">Groq API Cloud (Whisper Large-v3)</option>
                    <option value="groq-whisper-turbo">
                      Groq API Cloud (Whisper Large-v3 Turbo)
                    </option>
                  </select>
                  <p className="text-xs opacity-40">
                    Pilih "Groq API Cloud" untuk transkripsi via internet yang sangat ringan di
                    sistem.
                  </p>
                </div>

                {config.localWhisperModel?.startsWith('groq') && (
                  <div id="tour-groq-key" className="space-y-1.5 p-2 -mx-2 rounded-lg">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold">
                        Groq API Key{' '}
                        <span className="text-xs font-normal opacity-60">
                          (Khusus untuk Voice Speech-to-Text)
                        </span>
                      </p>
                      <a
                        href="https://console.groq.com/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-xs btn-outline btn-primary"
                      >
                        Ambil API Key
                      </a>
                    </div>
                    <div className="relative w-full">
                      <input
                        type={showGroqKey ? 'text' : 'password'}
                        placeholder="Contoh: gsk_xxxxxxxxxxxxxxxxx"
                        className="input input-bordered w-full pr-10"
                        value={config.groqApiKey || ''}
                        onChange={handleGroqApiKeyChange}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                        onClick={handleToggleGroqKey}
                        title={showGroqKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                      >
                        {showGroqKey ? (
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
                    <p className="text-xs opacity-40">
                      API Key Groq ini digunakan khusus untuk fitur transkripsi suara mikrofon
                      (Whisper STT).
                    </p>
                  </div>
                )}

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

            {/* ── Plugins ── */}
            <div
              id="cfg-plugins"
              className={`space-y-4 p-2 -mx-2 rounded-lg ${activeSection !== 'cfg-plugins' ? 'hidden' : ''}`}
            >
              <h3 className="text-sm font-bold uppercase tracking-wider opacity-70">Plugins</h3>
              <p className="text-xs text-white/50">
                Fungsi kustom buatanmu (kode JS) yang dipahami Mark secara otomatis — lengkap dengan
                Monaco editor di halaman penuhnya.
              </p>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-base-100 border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <FaCubes className="text-primary" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {pluginCount === null ? 'Memuat...' : `${pluginCount} plugin terpasang`}
                  </p>
                  <p className="text-xs opacity-50">
                    Plugin berjalan selalu aktif (always-on) dalam setiap sesi agent.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/plugins')}
                  className="btn btn-sm btn-outline shrink-0"
                >
                  Kelola <FaExternalLinkAlt size={10} />
                </button>
              </div>
            </div>

            {/* ── Skills ── */}
            <div
              id="cfg-skills"
              className={`space-y-4 p-2 -mx-2 rounded-lg ${activeSection !== 'cfg-skills' ? 'hidden' : ''}`}
            >
              <h3 className="text-sm font-bold uppercase tracking-wider opacity-70">Mark Skills</h3>
              <p className="text-xs text-white/50">
                Keterampilan yang Mark pelajari sendiri dari percakapan (SKILL.md) — bisa kamu edit,
                ekspor, atau hapus.
              </p>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-base-100 border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <FaBrain className="text-primary" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {skillCount === null ? 'Memuat...' : `${skillCount} skill tersimpan`}
                  </p>
                  <p className="text-xs opacity-50">
                    Tersimpan di folder XDG lokal — bisa dibaca langsung dari shell.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/skills')}
                  className="btn btn-sm btn-outline shrink-0"
                >
                  Kelola <FaExternalLinkAlt size={10} />
                </button>
              </div>
            </div>

            {/* ── Connectors (MCP) ── */}
            <div
              id="cfg-connectors"
              className={`space-y-4 p-2 -mx-2 rounded-lg ${activeSection !== 'cfg-connectors' ? 'hidden' : ''}`}
            >
              <h3 className="text-sm font-bold uppercase tracking-wider opacity-70">
                Connectors (MCP)
              </h3>
              <p className="text-xs text-white/50">
                Kemampuan pluggable ala Claude connectors: katalog, otorisasi scope, dan jejak audit
                — semua keputusan approval tetap native (rfd), bukan di renderer.
              </p>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-base-100 border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <FaPlug className="text-primary" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  {connStats === null ? (
                    <p className="text-sm font-semibold">Memuat...</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold">
                        {connStats.total} connector · {connStats.connected} terhubung ·{' '}
                        {connStats.connectionless} connection-less
                      </p>
                      <p className="text-xs opacity-50">
                        {connStats.auditOk} eksekusi ter-audit sukses (30 entri terakhir).
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => navigate('/connectors')}
                  className="btn btn-sm btn-outline shrink-0"
                >
                  Buka <FaExternalLinkAlt size={10} />
                </button>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-success/5 border border-success/20">
                <FaShieldAlt className="text-success mt-0.5 shrink-0" size={12} />
                <p className="text-[11px] opacity-70">
                  Connector berbahaya (shell, fs-write) selalu melewati dialog persetujuan NATIVE di
                  Rust main thread — model tidak bisa menyetujui dirinya sendiri.
                </p>
              </div>
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

          <div className="divider"></div>

          {/* ── Telegram Bot Settings ── */}

          {!isFirstSetup && (
            <>
              <div className="divider"></div>

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
            {/* Mode normal: AUTOSAVE penuh — tombol simpan manual dihapus. */}
          </div>
        </div>
        <ModalComponent />
      </div>
    </div>
  )
}

export default Configuration
