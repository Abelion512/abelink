import { useState, useEffect, useCallback, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import {
  FaPlug,
  FaCubes,
  FaBrain,
  FaShieldAlt,
  FaRobot,
  FaSearch,
  FaSyncAlt,
  FaPlus,
  FaFolderOpen,
  FaEdit,
  FaTrash,
  FaTimes,
  FaCheckCircle,
  FaExclamationTriangle,
  FaLock,
  FaUnlock,
  FaHistory,
  FaCode,
  FaCalendarAlt,
  FaHdd,
  FaEnvelope,
  FaGithub,
  FaTerminal,
  FaChevronDown,
  FaChevronUp,
  FaCopy,
  FaExternalLinkAlt
} from 'react-icons/fa'
import { useConfirm } from '../../hooks/useConfirm'
import { getCachedSkills } from '../../api/skillsCache'

const PLANNED_MCP_CONNECTORS = [
  {
    id: 'google-calendar-mcp',
    name: 'Google Calendar (Official MCP)',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    description: 'Server MCP resmi Google Calendar (Streamable HTTP + OAuth 2.0 Bearer).',
    authType: 'oauth',
    oauthProvider: 'google',
    scopes: ['https://www.googleapis.com/auth/calendar']
  },
  {
    id: 'context7',
    name: 'Context7 MCP',
    url: 'https://mcp.context7.com/mcp/oauth',
    description: 'Dokumentasi pustaka, snippet kode real-time, dan referensi API resmi.'
  }
]

const BUILTIN_SKILLS = [
  {
    id: 'systematic-engineering',
    name: 'Systematic Engineering',
    desc: 'Disiplin investigasi bertahap sebelum modifikasi kode.',
    icon: FaCubes
  },
  {
    id: 'execution-discipline',
    name: 'Execution Discipline',
    desc: 'Verifikasi deterministik via test suite sebelum commit.',
    icon: FaTerminal
  },
  {
    id: 'durable-planner',
    name: 'Durable Task Planner (/plan)',
    desc: 'Rencana kerja persisten untuk tugas bertahap multi-langkah.',
    icon: FaBrain
  },
  {
    id: 'root-cause-debugger',
    name: 'Root-Cause Debugger',
    desc: 'Analisis akar masalah mendalam sebelum memberikan solusi.',
    icon: FaSearch
  }
]

export default function CapabilitiesHub({
  config,
  setConfig,
  handleAwarenessEnabledChange,
  handleCompactionEnabledChange,
  handleBuiltinPluginChange,
  handleRtkCompressChange,
  isDevMode = false
}) {
  const { confirm, ModalComponent } = useConfirm()
  const [activeTab, setActiveTab] = useState('connectors')

  // ── Browser Extension State & Modal ───────────────────────────────────────
  const [extInstall, setExtInstall] = useState(null)
  const [extGuideOpen, setExtGuideOpen] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  // Watchdog Fase C3: pill status + reconnect manual (bounded di sidecar).
  const [browserConnected, setBrowserConnected] = useState(null)
  const [browserReconnecting, setBrowserReconnecting] = useState(false)
  const [browserNote, setBrowserNote] = useState('')

  const checkBrowserStatus = useCallback(async () => {
    try {
      if (!window.api?.runNodeFunction) {
        setBrowserConnected(null)
        return
      }
      const st = await window.api.runNodeFunction('browser:status')
      const live = Array.isArray(st?.sessions) && st.sessions.some((s) => s.connected)
      setBrowserConnected(!!live)
    } catch {
      setBrowserConnected(null)
    }
  }, [])

  const handleBrowserReconnect = useCallback(async () => {
    if (browserReconnecting) return
    setBrowserReconnecting(true)
    setBrowserNote('')
    try {
      const r = await window.api?.runNodeFunction('browser:reconnect')
      if (r?.ok) {
        setBrowserConnected(true)
        setBrowserNote(r.reused ? 'Extension tersambung (sesi dipakai ulang).' : 'Extension tersambung kembali.')
      } else {
        setBrowserConnected(false)
        setBrowserNote(
          r?.reason === 'launch-budget-exhausted'
            ? 'Batas peluncuran tercapai: tunggu ~1 menit atau klik Connect di popup extension.'
            : r?.reason === 'auto-launch-off'
              ? 'Auto-launch nonaktif: aktifkan toggle di atas atau buka browser manual.'
              : `Reconnect gagal (${r?.reason || 'no-handshake'}): pastikan extension aktif.`
        )
      }
    } catch (e) {
      setBrowserConnected(false)
      setBrowserNote(`Reconnect gagal: ${e?.message || String(e)}`)
    } finally {
      setBrowserReconnecting(false)
    }
  }, [browserReconnecting])

  const handleInitExtension = async () => {
    try {
      if (!window.api?.ensureExtensionFiles) {
        setExtInstall({ error: 'Runtime desktop belum mendukung.' })
        return
      }
      const dir = await window.api.ensureExtensionFiles()
      setExtInstall({ dir })
      setExtGuideOpen(true)
    } catch (e) {
      setExtInstall({ error: e?.message || String(e) })
    }
  }

  // ── Google Workspace State & Modal ────────────────────────────────────────
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleModalOpen, setGoogleModalOpen] = useState(false)
  const [googleClientId, setGoogleClientId] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('abelink:google_oauth_creds') || '{}')
      return saved.clientId || ''
    } catch {
      return ''
    }
  })
  const [googleClientSecret, setGoogleClientSecret] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('abelink:google_oauth_creds') || '{}')
      return saved.clientSecret || ''
    } catch {
      return ''
    }
  })
  const [googleLoading, setGoogleLoading] = useState(false)

  const checkGoogleStatus = useCallback(async () => {
    try {
      if (window.api?.googleStatus) {
        const isConn = await window.api.googleStatus()
        setGoogleConnected(!!isConn)
      }
    } catch (e) {
      console.warn('[CapabilitiesHub] Status Google check warning:', e)
    }
  }, [])

  const handleGoogleConnect = async (customId, customSecret) => {
    const id = (typeof customId === 'string' ? customId : googleClientId || '').trim()
    const secret = (typeof customSecret === 'string' ? customSecret : googleClientSecret || '').trim()
    if (!id || !secret) {
      setGoogleModalOpen(true)
      return
    }

    try {
      localStorage.setItem('abelink:google_oauth_creds', JSON.stringify({ clientId: id, clientSecret: secret }))
    } catch (_) {}

    setGoogleLoading(true)
    try {
      const res = await window.api?.googleConnect?.(id, secret)
      if (res?.success) {
        setGoogleConnected(true)
        setGoogleModalOpen(false)
        try {
          await window.api?.authorizeCapability?.('google-calendar-mcp', ['https://www.googleapis.com/auth/calendar'])
        } catch (_) {}
        await refreshCapabilityState()
      } else {
        alert(`Otorisasi Google gagal: ${res?.error || 'Periksa kredensial OAuth Anda'}`)
      }
    } catch (e) {
      alert(`Gagal menghubungkan Google: ${e.message || e}`)
    } finally {
      setGoogleLoading(false)
    }
  }

  const onGoogleConnectClick = () => {
    if (googleClientId.trim() && googleClientSecret.trim()) {
      handleGoogleConnect(googleClientId, googleClientSecret)
    } else {
      setGoogleModalOpen(true)
    }
  }

  const handleGoogleDisconnect = async () => {
    const res = await confirm({
      title: 'Putuskan Google Workspace?',
      message: 'Akses ke Google Calendar, Drive, dan Gmail akan dinonaktifkan.',
      confirmText: 'Putuskan',
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.googleDisconnect?.()
      setGoogleConnected(false)
    } catch (e) {
      alert(`Gagal memutuskan Google: ${e.message || e}`)
    }
  }

  // ── MCP Connectors State & Modal ──────────────────────────────────────────
  const [connectors, setConnectors] = useState([])
  const [connections, setConnections] = useState({})
  const [auditLogs, setAuditLogs] = useState([])
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpSearch, setMcpSearch] = useState('')
  const [busyConnectorKey, setBusyConnectorKey] = useState(null)
  const [showAuditDrawer, setShowAuditDrawer] = useState(false)
  const [addMcpModalOpen, setAddMcpModalOpen] = useState(false)
  const [newMcpForm, setNewMcpForm] = useState({ id: '', name: '', url: '', description: '', headers: '' })

  const AUDIT_PAGE = 30

  const loadMcpData = useCallback(async () => {
    setMcpLoading(true)
    try {
      let cat = null
      let aud = []
      let conns = {}
      if (window.api?.listCapabilities) {
        // capabilities:list mengembalikan ARRAY connector (bukan {connectors}).
        cat = await window.api.listCapabilities().catch(() => null)
      }
      if (window.api?.listCapabilityConnections) {
        conns = await window.api.listCapabilityConnections().catch(() => ({}))
      }
      if (window.api?.readCapabilityAudit) {
        aud = await window.api.readCapabilityAudit(AUDIT_PAGE, 0).catch(() => [])
      }

      let customMcp = []
      try {
        customMcp = JSON.parse(localStorage.getItem('abelink:custom_mcp') || '[]')
      } catch (_) {}

      // Daftarkan custom MCP ke sidecar (proses terpisah) agar authorize/
      // revoke mengenal id-nya; tanpa ini authorize selalu "tidak dikenal".
      if (customMcp.length > 0 && window.api?.registerCustomConnectors) {
        await window.api.registerCustomConnectors(customMcp).catch(() => [])
      }

      const builtin = Array.isArray(cat) ? cat : cat?.connectors || []
      const combined = [
        ...PLANNED_MCP_CONNECTORS,
        ...builtin,
        ...customMcp.map((c) => ({ ...c, transport: 'mcp', custom: true }))
      ]
      // Custom MCP menang atas built-in dengan id sama (idempoten dgn sidecar).
      const unique = Array.from(new Map(combined.map((c) => [c.id, c])).values())

      setConnectors(unique)
      setConnections(conns || {})
      setAuditLogs(Array.isArray(aud) ? aud : aud?.entries || [])
    } catch (e) {
      console.error('[CapabilitiesHub] Data MCP error:', e)
    } finally {
      setMcpLoading(false)
    }
  }, [])

  // Refresh ringan: hanya koneksi + audit terbaru, tanpa refetch katalog.
  const refreshCapabilityState = useCallback(async () => {
    try {
      const [conns, aud] = await Promise.all([
        window.api?.listCapabilityConnections?.().catch(() => ({})),
        window.api?.readCapabilityAudit?.(AUDIT_PAGE, 0).catch(() => [])
      ])
      if (conns) setConnections(conns)
      setAuditLogs(Array.isArray(aud) ? aud : aud?.entries || [])
    } catch (e) {
      console.error('[CapabilitiesHub] Refresh connections error:', e)
    }
  }, [])

  const handleLoadMoreAudit = async () => {
    try {
      const more = await window.api?.readCapabilityAudit?.(AUDIT_PAGE, auditLogs.length).catch(() => [])
      const list = Array.isArray(more) ? more : more?.entries || []
      if (list.length > 0) setAuditLogs((prev) => [...prev, ...list])
    } catch (e) {
      console.error('[CapabilitiesHub] Load more audit error:', e)
    }
  }

  const handleAuthorizeConnector = async (connectorId, scopes) => {
    if (connectorId === 'google-calendar-mcp' && !googleConnected) {
      if (googleClientId.trim() && googleClientSecret.trim()) {
        handleGoogleConnect(googleClientId, googleClientSecret)
        return
      }
      setGoogleModalOpen(true)
      return
    }
    setBusyConnectorKey(`${connectorId}:auth`)
    try {
      await window.api?.authorizeCapability?.(connectorId, scopes)
      await refreshCapabilityState()
    } catch (e) {
      if (String(e?.message || e).includes('OAUTH_REQUIRED') || String(e?.code || '').includes('OAUTH_REQUIRED')) {
        if (googleClientId.trim() && googleClientSecret.trim()) {
          handleGoogleConnect(googleClientId, googleClientSecret)
        } else {
          setGoogleModalOpen(true)
        }
      } else {
        alert(`Gagal otorisasi: ${e.message || e}`)
      }
    } finally {
      setBusyConnectorKey(null)
    }
  }

  const handleRevokeConnector = async (connectorId) => {
    const res = await confirm({
      title: 'Putuskan Koneksi MCP?',
      message: `Putuskan koneksi dari connector "${connectorId}"?`,
      confirmText: 'Putuskan',
      isError: true
    })
    if (!res.isConfirmed) return

    setBusyConnectorKey(`${connectorId}:revoke`)
    try {
      await window.api?.revokeCapability?.(connectorId)
      await refreshCapabilityState()
    } catch (e) {
      alert(`Gagal memutuskan: ${e.message || e}`)
    } finally {
      setBusyConnectorKey(null)
    }
  }

  const handleSaveNewMcp = () => {
    if (!newMcpForm.id.trim() || !newMcpForm.url.trim()) {
      alert('ID dan URL MCP server wajib diisi.')
      return
    }
    try {
      let parsedHeaders = {}
      if (newMcpForm.headers.trim()) {
        try {
          const parsed = JSON.parse(newMcpForm.headers)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('format')
          }
          parsedHeaders = parsed
        } catch (_) {
          alert('Header harus JSON objek, misal {"CONTEXT7_API_KEY": "..."}.')
          return
        }
      }
      const current = JSON.parse(localStorage.getItem('abelink:custom_mcp') || '[]')
      const updated = [
        ...current.filter((c) => c.id !== newMcpForm.id.trim()),
        {
          id: newMcpForm.id.trim(),
          name: newMcpForm.name.trim() || newMcpForm.id.trim(),
          url: newMcpForm.url.trim(),
          description: newMcpForm.description.trim() || 'Custom MCP Server',
          headers: parsedHeaders
        }
      ]
      localStorage.setItem('abelink:custom_mcp', JSON.stringify(updated))
      setAddMcpModalOpen(false)
      setNewMcpForm({ id: '', name: '', url: '', description: '', headers: '' })
      loadMcpData()
    } catch (e) {
      alert(`Gagal menyimpan server MCP: ${e.message || e}`)
    }
  }

  // ── Plugins State & Modal ─────────────────────────────────────────────────
  const [plugins, setPlugins] = useState([])
  const [pluginsLoading, setPluginsLoading] = useState(true)
  const [gitPluginUrl, setGitPluginUrl] = useState('')
  const [gitPluginLoading, setGitPluginLoading] = useState(false)
  const [editingPlugin, setEditingPlugin] = useState(null)
  const [pluginForm, setPluginForm] = useState({
    name: '',
    description: '',
    actions: [{ name: 'run', description: '', triggerHint: '', code: 'return "ok";' }],
    isEdit: false
  })
  const [pluginSyntaxErrors, setPluginSyntaxErrors] = useState([])

  const loadPlugins = useCallback(async () => {
    if (!window.api?.getPlugins) {
      setPluginsLoading(false)
      return
    }
    setPluginsLoading(true)
    try {
      const data = await window.api.getPlugins()
      setPlugins(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Gagal memuat plugin:', e)
    } finally {
      setPluginsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!editingPlugin) return
    const errors = []
    pluginForm.actions.forEach((act, idx) => {
      if (act.code) {
        try {
          // Compile-check sintaks SAJA — konstruktor tidak mengeksekusi body.
          // Kode connector user tidak pernah dijalankan di renderer.
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
          new AsyncFunction('query', act.code)
          errors[idx] = null
        } catch (err) {
          errors[idx] = err.message
        }
      } else {
        errors[idx] = null
      }
    })
    setPluginSyntaxErrors(errors)
  }, [pluginForm.actions, editingPlugin])

  const handleInstallGitPlugin = async () => {
    const url = gitPluginUrl.trim()
    if (!url) {
      alert('Masukkan shorthand GitHub (owner/repo) atau tautan URL.')
      return
    }
    setGitPluginLoading(true)
    try {
      if (window.api?.installPluginFromGit) {
        const res = await window.api.installPluginFromGit(url)
        if (res?.success) {
          setGitPluginUrl('')
          await loadPlugins()
        } else {
          alert(`Gagal memasang plugin: ${res?.error || 'Kesalahan repositori'}`)
        }
      } else {
        alert('Fitur instalasi git plugin belum aktif di runtime sidecar.')
      }
    } catch (e) {
      alert(`Gagal mengunduh plugin: ${e.message || e}`)
    } finally {
      setGitPluginLoading(false)
    }
  }

  const handleOpenNewPluginModal = () => {
    setPluginForm({
      name: '',
      description: '',
      actions: [
        {
          name: 'run',
          description: 'Fungsi utama plugin',
          triggerHint: 'ketika user meminta ...',
          code: `// query berisi argumen dari pengguna\nreturn "Hasil eksekusi plugin";`
        }
      ],
      isEdit: false
    })
    setEditingPlugin({ mode: 'new' })
  }

  const handleOpenEditPluginModal = (plugin) => {
    setPluginForm({
      name: plugin.name,
      description: plugin.description || '',
      actions:
        plugin.actions && plugin.actions.length > 0
          ? plugin.actions.map((a) => ({ ...a }))
          : [{ name: 'run', description: '', triggerHint: '', code: 'return "ok";' }],
      isEdit: true
    })
    setEditingPlugin({ mode: 'edit', originalName: plugin.name })
  }

  const handleSavePlugin = async () => {
    if (!pluginForm.name.trim()) {
      alert('Nama plugin wajib diisi.')
      return
    }
    if (pluginSyntaxErrors.some(Boolean)) {
      alert('Perbaiki syntax error JavaScript pada aksi sebelum menyimpan.')
      return
    }

    try {
      await window.api?.createPlugin?.({
        name: pluginForm.name.trim(),
        description: pluginForm.description.trim(),
        actions: pluginForm.actions,
        isEdit: pluginForm.isEdit
      })
      setEditingPlugin(null)
      await loadPlugins()
    } catch (e) {
      alert(`Gagal menyimpan plugin: ${e.message || e}`)
    }
  }

  const handleDeletePlugin = async (name) => {
    const res = await confirm({
      title: 'Hapus Plugin?',
      message: `Hapus plugin "${name}" secara permanen dari sistem?`,
      confirmText: 'Ya, Hapus',
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.deletePlugin?.(name)
      await loadPlugins()
    } catch (e) {
      alert(`Gagal menghapus plugin: ${e.message || e}`)
    }
  }

  const handleTogglePlugin = async (name, currentStatus) => {
    try {
      await window.api?.togglePlugin?.(name, !currentStatus)
      await loadPlugins()
    } catch (e) {
      alert(`Gagal mengubah status: ${e.message || e}`)
    }
  }

  // ── Skills State & Modal ──────────────────────────────────────────────────
  const [skills, setSkills] = useState([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const [editingSkill, setEditingSkill] = useState(null)
  const [skillFormName, setSkillFormName] = useState('')
  const [skillFormContent, setSkillFormContent] = useState('')

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const list = await getCachedSkills({ force: true })
      setSkills(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Gagal memuat skills:', e)
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const handleOpenNewSkill = () => {
    const defaultTemplate = `---
name: skill-baru
description: Deskripsi singkat keahlian operasional ini...
---

# Panduan Operasional

Petunjuk eksekusi dan batasan tindakan untuk AI:
1. Langkah inspeksi awal
2. Langkah eksekusi solusi

## Critical Rules
- Selalu uji asumsi sebelum melakukan modifikasi file.
`
    setSkillFormName('')
    setSkillFormContent(defaultTemplate)
    setEditingSkill({ isNew: true })
  }

  const handleOpenEditSkill = async (skillName) => {
    try {
      const content = (await window.api?.getSkill?.(skillName)) || ''
      setSkillFormName(skillName)
      setSkillFormContent(content)
      setEditingSkill({ isNew: false, originalName: skillName })
    } catch (e) {
      alert(`Gagal membaca skill: ${e.message || e}`)
    }
  }

  const handleSaveSkill = async () => {
    const rawName = skillFormName.trim().replace(/\s+/g, '-').toLowerCase()
    if (!rawName) {
      alert('Nama skill tidak boleh kosong.')
      return
    }
    try {
      await window.api?.saveSkill?.(rawName, skillFormContent)
      setEditingSkill(null)
      await loadSkills()
    } catch (e) {
      alert(`Gagal menyimpan skill: ${e.message || e}`)
    }
  }

  const handleDeleteSkill = async (skillName) => {
    const res = await confirm({
      title: 'Hapus Skill?',
      message: `Hapus skill "${skillName}" dari direktori lokal?`,
      confirmText: 'Ya, Hapus',
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.deleteSkill?.(skillName)
      await loadSkills()
    } catch (e) {
      alert(`Gagal menghapus skill: ${e.message || e}`)
    }
  }

  const handleInstallSkillPackage = async () => {
    try {
      const filePaths = await window.api?.showOpenDialog?.()
      if (filePaths && filePaths.length > 0) {
        for (const p of filePaths) {
          await window.api?.installSkill?.(p)
        }
        await loadSkills()
      }
    } catch (e) {
      alert(`Gagal menginstal package skill: ${e.message || e}`)
    }
  }

  // ── Approval Policies State ───────────────────────────────────────────────
  const [approvalPolicies, setApprovalPolicies] = useState([])
  const [policiesLoading, setPoliciesLoading] = useState(true)

  const loadApprovalPolicies = useCallback(async () => {
    if (!window.api?.approvalPolicyList) {
      setPoliciesLoading(false)
      return
    }
    setPoliciesLoading(true)
    try {
      const list = await window.api.approvalPolicyList()
      setApprovalPolicies(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Gagal memuat kebijakan:', e)
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  // ── Initial Mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    checkGoogleStatus()
    checkBrowserStatus()
    loadMcpData()
    loadPlugins()
    loadSkills()
    loadApprovalPolicies()
  }, [checkGoogleStatus, checkBrowserStatus, loadMcpData, loadPlugins, loadSkills, loadApprovalPolicies])

  // Progres launch/reconnect dari sidecar (pola ai:status): tampilkan sebagai
  // catatan di card Browse Use selama proses bounded berjalan.
  useEffect(() => {
    if (!window.api?.onBrowserStatus) return undefined
    const off = window.api.onBrowserStatus((msg) => {
      if (typeof msg === 'string' && msg) setBrowserNote(msg)
    })
    return () => { try { off?.() } catch {} }
  }, [])

  const filteredConnectors = useMemo(() => {
    if (!mcpSearch.trim()) return connectors
    const q = mcpSearch.toLowerCase()
    return connectors.filter(
      (c) =>
        c.id?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
    )
  }, [connectors, mcpSearch])

  return (
    <div className="space-y-6">
      <ModalComponent />

      {/* ── Sub-Nav Tabs (Apple Segmented Control Pill) ── */}
      <div className="flex items-center justify-start">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-neutral-900/60 backdrop-blur-2xl border border-white/[0.08] shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('connectors')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 ${
              activeTab === 'connectors'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <FaPlug size={11} />
            <span>Connectors</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'connectors'
                  ? 'bg-black/10 text-black font-semibold'
                  : 'bg-white/[0.06] text-neutral-400'
              }`}
            >
              {connectors.length + (googleConnected ? 3 : 0) + 1}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('plugins')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 ${
              activeTab === 'plugins'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <FaCubes size={11} />
            <span>Plugins</span>
            {plugins.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  activeTab === 'plugins'
                    ? 'bg-black/10 text-black font-semibold'
                    : 'bg-white/[0.06] text-neutral-400'
                }`}
              >
                {plugins.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 ${
              activeTab === 'skills'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <FaBrain size={11} />
            <span>Skills</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                activeTab === 'skills'
                  ? 'bg-black/10 text-black font-semibold'
                  : 'bg-white/[0.06] text-neutral-400'
              }`}
            >
              {BUILTIN_SKILLS.length + skills.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 ${
              activeTab === 'security'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <FaShieldAlt size={11} />
            <span>Keamanan</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: CONNECTORS ── */}
      {activeTab === 'connectors' && (
        <div className="space-y-5">
          {/* Top Hero Grid: Browser Companion & Google Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card: Browser Companion Bridge */}
            <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] hover:border-white/15 p-6 shadow-2xl flex flex-col justify-between space-y-5 transition-all duration-300">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-neutral-800/90 border border-white/10 flex items-center justify-center text-white/90 shadow-sm shrink-0">
                      <FaPlug size={18} className="text-white/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold tracking-tight text-white/95">Browse Use</h4>
                        {browserConnected === true ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Tersambung
                          </span>
                        ) : browserConnected === false ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" /> Terputus
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Kontrol peramban Chrome via ekstensi pendamping lokal.
                      </p>
                    </div>
                  </div>
                </div>

                {browserNote ? (
                  <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-neutral-300">
                    {browserNote}
                  </div>
                ) : null}

                <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                    <span className="text-xs text-neutral-300">Tutup tab grup otomatis saat tugas selesai</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white"
                      checked={!!config.browserAutoCloseTabs}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, browserAutoCloseTabs: e.target.checked }))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                    <span className="text-xs text-neutral-300">Buka peramban OS otomatis bila ekstensi belum tersambung</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white"
                      checked={config.browserAutoLaunch !== false}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, browserAutoLaunch: e.target.checked }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06] flex-wrap">
                <button
                  type="button"
                  onClick={handleBrowserReconnect}
                  disabled={browserReconnecting}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  title="Sapu sesi mati lalu sambungkan ulang extension"
                >
                  <FaSyncAlt size={10} className={browserReconnecting ? 'animate-spin' : ''} />
                  <span>{browserReconnecting ? 'Menghubungkan...' : 'Hubungkan Ulang'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleInitExtension}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all"
                >
                  Panduan Pemasangan
                </button>
                {extInstall?.dir && (
                  <button
                    type="button"
                    onClick={() => window.api?.openFolder?.(extInstall.dir)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-400 hover:text-white transition-all flex items-center gap-1.5"
                    title="Buka folder berkas ekstensi di file manager"
                  >
                    <FaFolderOpen size={11} />
                    <span>Folder</span>
                  </button>
                )}
              </div>
            </div>

            {/* Card: Google Workspace */}
            <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] hover:border-white/15 p-6 shadow-2xl flex flex-col justify-between space-y-5 transition-all duration-300">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-neutral-800/90 border border-white/10 flex items-center justify-center text-blue-400 shadow-sm shrink-0">
                      <FaCalendarAlt size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold tracking-tight text-white/95">Google Workspace</h4>
                        {googleConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Terhubung
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Sinkronisasi Calendar, Drive, dan Gmail via OAuth 2.0 resmi.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3-Service status row */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {[
                    { name: 'Calendar', icon: FaCalendarAlt, color: 'text-blue-400' },
                    { name: 'Drive', icon: FaHdd, color: 'text-amber-400' },
                    { name: 'Gmail', icon: FaEnvelope, color: 'text-rose-400' }
                  ].map((svc) => {
                    const SvcIcon = svc.icon
                    return (
                      <div
                        key={svc.name}
                        className="px-3 py-2.5 rounded-2xl bg-neutral-800/40 border border-white/[0.06] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <SvcIcon className={svc.color} size={12} />
                          <span className="text-xs font-medium text-neutral-300">{svc.name}</span>
                        </div>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            googleConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-neutral-600'
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    className="rounded-full px-4 py-1.5 text-xs font-medium border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <FaUnlock size={10} />
                    <span>Putuskan Sesi</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 w-full justify-between sm:justify-start">
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={onGoogleConnectClick}
                      className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      title={googleClientId.trim() ? '1-Click: Buka langsung login page Google di browser' : 'Hubungkan Google Workspace'}
                    >
                      <FaLock size={10} />
                      <span>{googleLoading ? 'Membuka Browser...' : 'Hubungkan'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoogleModalOpen(true)}
                      className="rounded-full p-2 border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-all"
                      title="Atur Kredensial OAuth (Client ID & Secret)"
                    >
                      <FaEdit size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: MCP Protocol Gateway */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold tracking-tight text-white/95">MCP Connectors</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                    {filteredConnectors.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Standar Model Context Protocol untuk koneksi alat eksternal dan API secara terisolasi.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <FaSearch className="absolute left-3.5 text-neutral-400 pointer-events-none" size={11} />
                  <input
                    type="text"
                    placeholder="Cari connector..."
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                    className="rounded-full pl-9 pr-3.5 py-1.5 bg-white/[0.05] border border-white/[0.08] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.08] w-40 sm:w-48 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddMcpModalOpen(true)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <FaPlus size={9} />
                  <span>Tambah MCP</span>
                </button>
                <button
                  type="button"
                  onClick={loadMcpData}
                  disabled={mcpLoading}
                  className="rounded-full p-2 border border-white/10 hover:border-white/20 bg-white/[0.04] text-neutral-400 hover:text-white transition-all disabled:opacity-50"
                  title="Segarkan daftar"
                >
                  <FaSyncAlt size={11} className={mcpLoading ? 'animate-spin text-white' : ''} />
                </button>
              </div>
            </div>

            {mcpLoading ? (
              <div className="p-8 text-center text-neutral-400 text-xs flex flex-col items-center gap-2.5">
                <span className="loading loading-spinner loading-sm text-white"></span>
                Memuat katalog MCP...
              </div>
            ) : filteredConnectors.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-neutral-800/20 border border-dashed border-white/10 text-xs text-neutral-400">
                Tidak ada connector MCP yang cocok dengan pencarian.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {filteredConnectors.map((c) => {
                  const isConnected = !!connections[c.id]
                  const isBusy = busyConnectorKey?.startsWith(`${c.id}:`)
                  const isGoogle = c.id?.toLowerCase().includes('google')
                  const isContext7 = c.id?.toLowerCase().includes('context7')

                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 p-4 flex flex-col justify-between gap-3.5 transition-all duration-200"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90 shrink-0">
                              {isGoogle ? (
                                <FaCalendarAlt className="text-blue-400" size={15} />
                              ) : isContext7 ? (
                                <FaBrain className="text-purple-400" size={15} />
                              ) : (
                                <FaPlug className="text-neutral-300" size={15} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-semibold text-white/95 truncate">
                                {c.name || c.id}
                              </h5>
                              <p className="font-mono text-[10px] text-neutral-400 truncate">
                                {c.id}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isConnected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Terhubung
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border border-white/10 bg-white/[0.03] text-neutral-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" /> Offline
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          {c.description || 'Tidak ada deskripsi.'}
                        </p>

                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          {(c.transport === 'mcp' || c.custom) && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              {c.id.includes('google') ? 'Official MCP' : 'MCP'}
                            </span>
                          )}
                          {c.authType === 'oauth' && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              OAuth 2.0
                            </span>
                          )}
                        </div>

                        {c.url && (
                          <div className="text-[10px] font-mono text-neutral-400 truncate bg-white/[0.02] px-2.5 py-1 rounded-lg border border-white/[0.04]">
                            {c.url}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-end">
                        {isConnected ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRevokeConnector(c.id)}
                            className="rounded-full px-3.5 py-1 text-xs font-medium border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all disabled:opacity-50"
                          >
                            Putus
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAuthorizeConnector(c.id, c.scopes || [])}
                            className="rounded-full px-4 py-1 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                          >
                            {isBusy ? 'Memproses...' : 'Otorisasi'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Collapsible MCP Audit Log Drawer */}
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowAuditDrawer(!showAuditDrawer)}
                className="w-full flex items-center justify-between py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FaHistory size={11} className="text-sky-400" />
                  <span className="font-medium">Riwayat Audit Eksekusi MCP</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-white/[0.06] text-neutral-400">
                    {auditLogs.length}
                  </span>
                </span>
                {showAuditDrawer ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
              </button>

              {showAuditDrawer && (
                <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {auditLogs.length === 0 ? (
                    <p className="text-[11px] text-neutral-500 italic py-1">Belum ada jejak eksekusi.</p>
                  ) : (
                    <>
                      {auditLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-800/40 border border-white/[0.05] text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                log.status === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'
                              }`}
                            />
                            <span className="font-mono text-neutral-200 truncate">
                              {log.connectorId || log.connector || 'system'}:{log.op || 'call'}
                            </span>
                          </div>
                          <span className="text-neutral-400 text-[10px] shrink-0 font-mono">
                            {log.ts
                              ? new Date(log.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                              : log.timestamp
                                ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                                : '-'}
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleLoadMoreAudit}
                        className="w-full py-1.5 text-xs text-neutral-400 hover:text-white transition-colors text-center"
                      >
                        Muat lebih banyak riwayat
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: PLUGINS ── */}
      {activeTab === 'plugins' && (
        <div className="space-y-5">
          {/* Built-in Automations (Cupertino Settings Grid) */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold tracking-tight text-white/95">Built-in Automations</h4>
                <p className="text-xs text-neutral-400">
                  Modul optimasi performa dan perilaku otonom agen bawaan sistem.
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                5 Terpasang
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Awareness */}
              <div className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-white/95">Awareness Engine</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Pantau jendela aktif OS untuk mengambil inisiatif proaktif otomatis.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                  checked={config.awarenessEnabled !== false}
                  onChange={handleAwarenessEnabledChange}
                />
              </div>

              {/* Session Compaction */}
              <div className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-white/95">Session Compaction</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Ringkas konteks kerja sesi (budget 525K) agar percakapan masif tetap muat.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                  checked={config.sessionCompactionEnabled !== false}
                  onChange={handleCompactionEnabledChange}
                />
              </div>

              {/* Caveman */}
              <div className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-white/95">Caveman Mode</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Instruksikan respons padat terarah tanpa basa-basi kalimat pengantar.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                  checked={config.builtinPlugins?.caveman !== false}
                  onChange={handleBuiltinPluginChange('caveman')}
                />
              </div>

              {/* Ponytail */}
              <div className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-white/95">Ponytail (YAGNI)</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Prioritaskan pemanfaatan modul yang sudah tersedia di arsitektur sistem.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                  checked={config.builtinPlugins?.ponytail !== false}
                  onChange={handleBuiltinPluginChange('ponytail')}
                />
              </div>

              {/* Rtk */}
              <div className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all md:col-span-2">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-white/95">Rtk Output Compression</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Kompresi cerdas pada luaran terminal berukuran masif sebelum masuk context model.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                  checked={config.rtkCompress !== false}
                  onChange={handleRtkCompressChange}
                />
              </div>
            </div>
          </div>

          {/* Custom Plugins */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold tracking-tight text-white/95">Custom Plugins</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                    {plugins.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Ekstensi JavaScript mandiri untuk memperluas toolset agen.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openPluginFolder?.()}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
                {isDevMode && (
                  <button
                    type="button"
                    onClick={handleOpenNewPluginModal}
                    className="rounded-full px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <FaCode size={11} />
                    <span>Tulis Plugin</span>
                  </button>
                )}
              </div>
            </div>

            {/* Spotlight GitHub Installer */}
            <div className="flex items-center gap-2 p-1 rounded-full bg-white/[0.04] border border-white/[0.08] focus-within:border-white/25 focus-within:bg-white/[0.06] transition-all">
              <div className="pl-3.5 pr-1 text-neutral-400">
                <FaGithub size={13} />
              </div>
              <input
                type="text"
                placeholder="Pasang repositori GitHub (contoh: user/abelink-plugin-custom)..."
                value={gitPluginUrl}
                onChange={(e) => setGitPluginUrl(e.target.value)}
                className="bg-transparent border-none outline-none font-mono text-xs text-white placeholder-neutral-500 flex-1 px-1"
              />
              <button
                type="button"
                onClick={handleInstallGitPlugin}
                disabled={gitPluginLoading || !gitPluginUrl.trim()}
                className="rounded-full px-4 py-1 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm shrink-0 disabled:opacity-50"
              >
                {gitPluginLoading ? 'Mengunduh...' : 'Pasang'}
              </button>
            </div>

            {pluginsLoading ? (
              <div className="p-8 text-center text-neutral-400 text-xs flex flex-col items-center gap-2.5">
                <span className="loading loading-spinner loading-sm text-white"></span>
                Memuat plugin kustom...
              </div>
            ) : plugins.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-neutral-800/20 border border-dashed border-white/10 text-xs text-neutral-400">
                Belum ada plugin kustom yang terpasang di direktori aplikasi.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {plugins.map((p) => {
                  const isEnabled = p.isEnabled !== false
                  return (
                    <div
                      key={p.name}
                      className="rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 p-4 flex flex-col justify-between gap-3.5 transition-all duration-200"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-neutral-300 shrink-0">
                              <FaCubes size={15} />
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-semibold text-white/95 truncate">{p.name}</h5>
                              <p className="font-mono text-[10px] text-neutral-400">
                                {p.actions?.length || 0} aksi terdefinisi
                              </p>
                            </div>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${
                              isEnabled
                                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : 'border border-white/10 bg-white/[0.03] text-neutral-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-400' : 'bg-neutral-500'}`}
                            />
                            {isEnabled ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>

                        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          {p.description || 'Tidak ada deskripsi.'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePlugin(p.name, isEnabled)}
                          className="rounded-full px-3 py-1 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all"
                        >
                          {isEnabled ? 'Matikan' : 'Nyalakan'}
                        </button>
                        {isDevMode && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPluginModal(p)}
                            className="rounded-full p-1.5 border border-white/10 bg-white/[0.04] text-neutral-400 hover:text-white transition-all"
                            title="Edit kode plugin"
                          >
                            <FaEdit size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePlugin(p.name)}
                          className="rounded-full p-1.5 border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                          title="Hapus plugin"
                        >
                          <FaTrash size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: SKILLS ── */}
      {activeTab === 'skills' && (
        <div className="space-y-5">
          {/* Built-in Skills */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold tracking-tight text-white/95">Built-in Superpowers</h4>
                <p className="text-xs text-neutral-400">
                  Pola kerja dan disiplin nalar inti yang disuntikkan ke prompt perencana.
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                4 Pola
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {BUILTIN_SKILLS.map((skill) => {
                const SkillIcon = skill.icon
                const isSkillActive = config?.builtinSkills?.[skill.id] !== false
                return (
                  <div
                    key={skill.id}
                    className="p-4 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 flex items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90 shrink-0">
                        <SkillIcon size={16} />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-white/95 truncate">{skill.name}</div>
                        <p className="text-[11px] text-neutral-400 leading-relaxed line-clamp-1">{skill.desc}</p>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      className="toggle toggle-sm border-white/20 bg-neutral-800 checked:bg-white checked:border-white shrink-0"
                      checked={isSkillActive}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          builtinSkills: {
                            ...(prev.builtinSkills || {}),
                            [skill.id]: e.target.checked
                          }
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom Skills (SKILL.md) */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold tracking-tight text-white/95">Custom Skills (SKILL.md)</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                    {skills.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Keahlian operasional terstruktur yang didefinisikan lewat format Markdown standar.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openSkillsFolder?.()}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Folder</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallSkillPackage}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all"
                  title="Impor arsip skill .zip atau .tar.gz"
                >
                  <span>Impor Arsip</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSkill}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                >
                  <FaPlus size={9} />
                  <span>Skill Baru</span>
                </button>
              </div>
            </div>

            {skillsLoading ? (
              <div className="p-8 text-center text-neutral-400 text-xs flex flex-col items-center gap-2.5">
                <span className="loading loading-spinner loading-sm text-white"></span>
                Memuat skills...
              </div>
            ) : skills.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-neutral-800/20 border border-dashed border-white/10 text-xs text-neutral-400">
                Belum ada skill kustom tersimpan. Klik "Skill Baru" untuk menulis instruksi.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {skills.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 p-4 flex flex-col justify-between gap-3.5 transition-all duration-200"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90 shrink-0">
                            <FaBrain size={15} className="text-purple-400" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-xs font-semibold text-white/95 truncate">{s.name}</h5>
                            <span className="font-mono text-[9px] text-neutral-400">XDG Store</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                        {s.description || 'Tidak ada deskripsi.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/[0.04] flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSkill(s.name)}
                        className="rounded-full px-3 py-1 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                        title="Edit instruksi skill"
                      >
                        <FaEdit size={11} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(s.name)}
                        className="rounded-full p-1.5 border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                        title="Hapus skill"
                      >
                        <FaTrash size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: SECURITY ── */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          {/* 3-Tier Overview (Spacious Cupertino frosted cards) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-5 rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-tight text-emerald-400">Tier 1: Read-Only</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Otomatis
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Membaca berkas, status sistem, dan inspeksi jendela aktif tanpa memutus alur kerja.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-sky-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-tight text-sky-400">Tier 2: Netral</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Per Sesi
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Perintah shell non-destruktif dan perambanan web. Persetujuan cukup diberikan sekali per sesi.
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-rose-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-tight text-rose-400">Tier 3: Destruktif</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Native RFD
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Modifikasi berkas OS, git commit, dan instalasi plugin. Wajib dialog verifikasi native.
              </p>
            </div>
          </div>

          {/* Granular Policies */}
          <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold tracking-tight text-white/95">Kebijakan Persetujuan Granular</h4>
                <p className="text-xs text-neutral-400">
                  Atur perilaku konfirmasi untuk setiap rumpun aksi sidecar secara terisolasi.
                </p>
              </div>

              <button
                type="button"
                className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all"
                onClick={async () => {
                  try {
                    await window.api?.approvalPolicyResetSession?.()
                    await loadApprovalPolicies()
                  } catch {}
                }}
              >
                Reset Izin Sesi
              </button>
            </div>

            {policiesLoading ? (
              <div className="p-8 text-center text-neutral-400 text-xs">Memuat kebijakan...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {approvalPolicies.map((p) => (
                  <div
                    key={p.family}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-800/30 backdrop-blur-md border border-white/[0.06] hover:border-white/15 transition-all"
                  >
                    <span className="text-xs font-mono text-neutral-300">{p.family}</span>
                    <select
                      className="rounded-full bg-neutral-800 px-3 py-1 border border-white/10 text-xs text-white focus:outline-none focus:border-white/30"
                      value={p.policy}
                      onChange={async (e) => {
                        const next = e.target.value
                        try {
                          await window.api?.approvalPolicySet?.(p.family, next)
                          setApprovalPolicies((prev) =>
                            prev.map((x) => (x.family === p.family ? { ...x, policy: next } : x))
                          )
                        } catch {}
                      }}
                    >
                      <option value="ask">Tanya tiap kali</option>
                      <option value="session">Sekali per sesi</option>
                      <option value="always">Selalu izinkan</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL 1: PANDUAN EKSTENSI BROWSER ── */}
      {extGuideOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90">
                  <FaPlug size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white/95">Pemasangan Ekstensi Peramban</h3>
                  <p className="text-[11px] text-neutral-400">Hubungkan browser Chromium ke engine Abelink.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="rounded-full p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-neutral-300">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <span className="text-[11px] text-neutral-400 block font-medium">Folder Berkas Ekstensi:</span>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[10px] text-neutral-200 truncate select-all">
                    {extInstall?.dir || 'Memeriksa folder...'}
                  </code>
                  {extInstall?.dir && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(extInstall.dir)
                        setCopiedPath(true)
                        setTimeout(() => setCopiedPath(false), 2000)
                      }}
                      className="rounded-full p-1.5 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-all shrink-0"
                      title="Salin path folder"
                    >
                      {copiedPath ? <FaCheckCircle size={11} className="text-emerald-400" /> : <FaCopy size={11} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-white/90">3 Langkah di Chrome / Brave / Edge:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-neutral-300 text-xs pl-1">
                  <li>
                    Buka <code className="font-mono text-neutral-200 px-1.5 py-0.5 rounded-md bg-white/[0.06]">chrome://extensions</code> di browser.
                  </li>
                  <li>
                    Aktifkan tombol <b>Developer mode</b> di pojok kanan atas.
                  </li>
                  <li>
                    Klik <b>Load unpacked</b> lalu pilih folder berkas di atas.
                  </li>
                </ol>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3.5">
              {extInstall?.dir && (
                <button
                  type="button"
                  onClick={() => window.api?.openFolder?.(extInstall.dir)}
                  className="rounded-full px-4 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: TAMBAH MCP CUSTOM ── */}
      {addMcpModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90">
                  <FaPlug size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white/95">Tambah Server MCP</h3>
                  <p className="text-[11px] text-neutral-400">Daftarkan endpoint gateway Model Context Protocol.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="rounded-full p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-neutral-300">ID Server (kebab-case)</label>
                <input
                  type="text"
                  placeholder="contoh: sqlite-mcp"
                  value={newMcpForm.id}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, id: e.target.value })}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-neutral-300">Nama Tampilan</label>
                <input
                  type="text"
                  placeholder="contoh: SQLite Database Connector"
                  value={newMcpForm.name}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, name: e.target.value })}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-neutral-300">URL Endpoint Gateway</label>
                <input
                  type="text"
                  placeholder="https://... atau http://localhost:..."
                  value={newMcpForm.url}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, url: e.target.value })}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-neutral-300">Deskripsi Singkat</label>
                <input
                  type="text"
                  placeholder="Deskripsi fungsi alat atau cakupan akses..."
                  value={newMcpForm.description}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, description: e.target.value })}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-neutral-300">Header Auth (opsional, JSON)</label>
                <input
                  type="text"
                  placeholder='misal {"CONTEXT7_API_KEY": "..."}'
                  value={newMcpForm.headers}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, headers: e.target.value })}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
                <p className="text-[10px] text-neutral-400">Disimpan terisolasi di sidecar lokal, tidak dikirim ke context model.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3.5">
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="rounded-full px-4 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNewMcp}
                className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm"
              >
                Simpan Connector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: GOOGLE OAUTH ── */}
      {googleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 custom-scrollbar">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-blue-400">
                  <FaLock size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white/95">Kredensial OAuth Google Cloud</h3>
                  <p className="text-[11px] text-neutral-400">Simpan sekali untuk otentikasi 1-klik langsung di browser.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="rounded-full p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <FaTimes size={13} />
              </button>
            </div>

            {/* Quick Setup Guide Accordion */}
            <details className="group rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3.5 text-xs">
              <summary className="cursor-pointer font-medium text-white/90 flex items-center justify-between">
                <span>Panduan Penyiapan Google Cloud Console</span>
                <span className="text-[10px] text-neutral-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-2.5 space-y-1.5 text-[11px] text-neutral-300 leading-relaxed border-t border-white/[0.06] pt-2">
                <p>1. Buka <strong>Google Cloud Console</strong> &gt; buat Proyek baru &gt; aktifkan <strong>Google Calendar API</strong>.</p>
                <p>2. Menu <strong>OAuth consent screen</strong> &gt; pilih tipe <strong>External</strong> &gt; lengkapi data dasar.</p>
                <p>3. Menu <strong>Credentials</strong> &gt; <strong>Create Credentials</strong> &gt; <strong>OAuth client ID</strong> &gt; tipe <strong>Desktop App</strong>.</p>
                <p>4. Salin <strong>Client ID</strong> dan <strong>Client Secret</strong> ke form berikut.</p>
              </div>
            </details>

            {/* Form Inputs */}
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-neutral-300">Client ID OAuth</label>
                <input
                  type="text"
                  placeholder="xxxxxx.apps.googleusercontent.com"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-neutral-300">Client Secret OAuth</label>
                <input
                  type="password"
                  placeholder="GOCSPX-xxxxxx"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3.5">
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="rounded-full px-4 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={googleLoading || !googleClientId.trim() || !googleClientSecret.trim()}
                onClick={() => handleGoogleConnect(googleClientId, googleClientSecret)}
                className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <FaExternalLinkAlt size={11} />
                <span>{googleLoading ? 'Membuka Browser...' : 'Simpan & Buka Login Browser'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: EDIT/CREATE PLUGIN (MONACO) ── */}
      {editingPlugin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90">
                  <FaCubes size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white/95">
                    {editingPlugin.mode === 'new' ? 'Buat Plugin Baru' : `Edit Plugin: ${pluginForm.name}`}
                  </h3>
                  <p className="text-[11px] text-neutral-400">Modul ekstensi runtime JavaScript terisolasi.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="rounded-full p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-300">Nama Plugin</label>
                  <input
                    type="text"
                    disabled={editingPlugin.mode === 'edit'}
                    placeholder="misal: stock-checker"
                    value={pluginForm.name}
                    onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-300">Deskripsi Singkat</label>
                  <input
                    type="text"
                    placeholder="Fungsi utama plugin..."
                    value={pluginForm.description}
                    onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-tight text-white/90 uppercase">Aksi &amp; Kode JS</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPluginForm({
                        ...pluginForm,
                        actions: [
                          ...pluginForm.actions,
                          { name: `action_${pluginForm.actions.length + 1}`, description: '', triggerHint: '', code: 'return "ok";' }
                        ]
                      })
                    }
                    className="rounded-full px-3 py-1 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <FaPlus size={9} /> Tambah Aksi
                  </button>
                </div>

                {pluginForm.actions.map((act, index) => (
                  <div key={index} className="p-4 rounded-2xl bg-neutral-800/40 border border-white/[0.06] space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nama aksi (misal: query)"
                        value={act.name}
                        onChange={(e) => {
                          const updated = [...pluginForm.actions]
                          updated[index].name = e.target.value
                          setPluginForm({ ...pluginForm, actions: updated })
                        }}
                        className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-1.5 font-mono text-xs text-white flex-1 focus:outline-none focus:border-white/25"
                      />
                      <input
                        type="text"
                        placeholder="Trigger hint..."
                        value={act.triggerHint}
                        onChange={(e) => {
                          const updated = [...pluginForm.actions]
                          updated[index].triggerHint = e.target.value
                          setPluginForm({ ...pluginForm, actions: updated })
                        }}
                        className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-1.5 text-xs text-white flex-1 focus:outline-none focus:border-white/25"
                      />
                      {pluginForm.actions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = pluginForm.actions.filter((_, i) => i !== index)
                            setPluginForm({ ...pluginForm, actions: updated })
                          }}
                          className="rounded-full p-1.5 border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                        >
                          <FaTrash size={10} />
                        </button>
                      )}
                    </div>

                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <Editor
                        height="140px"
                        language="javascript"
                        theme="vs-dark"
                        value={act.code}
                        onChange={(val) => {
                          const updated = [...pluginForm.actions]
                          updated[index].code = val || ''
                          setPluginForm({ ...pluginForm, actions: updated })
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 12,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false
                        }}
                      />
                    </div>

                    {pluginSyntaxErrors[index] && (
                      <p className="text-xs text-rose-400 font-mono flex items-center gap-1.5">
                        <FaExclamationTriangle size={11} />
                        Syntax Error: {pluginSyntaxErrors[index]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3.5">
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="rounded-full px-4 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePlugin}
                className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm"
              >
                Simpan Plugin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: EDIT/CREATE SKILL (MONACO) ── */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-purple-400">
                  <FaBrain size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white/95">
                    {editingSkill.isNew ? 'Buat Skill Baru' : `Edit Skill: ${skillFormName}`}
                  </h3>
                  <p className="text-[11px] text-neutral-400">Berkas instruksi operasional format SKILL.md.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="rounded-full p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-300">Nama Skill (kebab-case)</label>
                <input
                  type="text"
                  disabled={!editingSkill.isNew}
                  placeholder="misal: git-commit-helper"
                  value={skillFormName}
                  onChange={(e) => setSkillFormName(e.target.value)}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-300">Isi Berkas SKILL.md</label>
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <Editor
                    height="320px"
                    language="markdown"
                    theme="vs-dark"
                    value={skillFormContent}
                    onChange={(val) => setSkillFormContent(val || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3.5">
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="rounded-full px-4 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSkill}
                className="rounded-full px-5 py-1.5 text-xs font-semibold bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm"
              >
                Simpan Skill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
