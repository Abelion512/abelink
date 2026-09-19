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
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
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

  const handleGoogleConnect = async () => {
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      alert('Client ID dan Client Secret wajib diisi.')
      return
    }
    setGoogleLoading(true)
    try {
      const res = await window.api?.googleConnect?.(googleClientId.trim(), googleClientSecret.trim())
      if (res?.success) {
        setGoogleConnected(true)
        setGoogleModalOpen(false)
      } else {
        alert(`Otorisasi Google gagal: ${res?.error || 'Periksa kredensial OAuth Anda'}`)
      }
    } catch (e) {
      alert(`Gagal menghubungkan Google: ${e.message || e}`)
    } finally {
      setGoogleLoading(false)
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
    setBusyConnectorKey(`${connectorId}:auth`)
    try {
      await window.api?.authorizeCapability?.(connectorId, scopes)
      await refreshCapabilityState()
    } catch (e) {
      alert(`Gagal otorisasi: ${e.message || e}`)
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
    loadMcpData()
    loadPlugins()
    loadSkills()
    loadApprovalPolicies()
  }, [checkGoogleStatus, loadMcpData, loadPlugins, loadSkills, loadApprovalPolicies])

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

      {/* ── Sub-Nav Tabs (Clean Floating Pills ala Claude.ai) ── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-base-200/50 border border-white/5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setActiveTab('connectors')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'connectors' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <FaPlug size={12} />
          <span>Connectors</span>
          <span className="badge badge-xs badge-neutral opacity-80">
            {connectors.length + (googleConnected ? 3 : 0) + 1}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plugins')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'plugins' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <FaCubes size={12} />
          <span>Plugins</span>
          {plugins.length > 0 && (
            <span className="badge badge-xs badge-neutral opacity-80">{plugins.length}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'skills' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <FaBrain size={12} />
          <span>Skills</span>
          <span className="badge badge-xs badge-neutral opacity-80">
            {BUILTIN_SKILLS.length + skills.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'security' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <FaShieldAlt size={12} />
          <span>Keamanan</span>
        </button>
      </div>

      {/* ── TAB 1: CONNECTORS ── */}
      {activeTab === 'connectors' && (
        <div className="space-y-4">
          {/* Card: Browser Companion Bridge */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white/90">Browse Use</span>
              </div>
              <p className="text-xs text-white/50">
                Control Chrome via extension
              </p>
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] text-white/60 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-xs"
                    checked={!!config.browserAutoCloseTabs}
                    onChange={(e) =>
                      setConfig((prev) => {
                        const updated = { ...prev, browserAutoCloseTabs: e.target.checked }
                        if (window.api?.syncConfig) window.api.syncConfig(updated)
                        return updated
                      })
                    }
                  />
                  <span>Tutup tab grup otomatis saat tugas selesai</span>
                </label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] text-white/60 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-xs"
                    checked={config.browserAutoLaunch !== false}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, browserAutoLaunch: e.target.checked }))
                    }
                  />
                  <span>Bukakan browser OS otomatis bila extension belum tersambung</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={handleInitExtension}
                className="btn btn-xs btn-outline border-white/10 hover:border-primary/50 text-white/80 rounded-xl"
              >
                Panduan Pemasangan
              </button>
              {extInstall?.dir && (
                <button
                  type="button"
                  onClick={() => window.api?.openFolder?.(extInstall.dir)}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                  title="Buka folder berkas ekstensi di file manager"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
              )}
            </div>
          </div>

          {/* Card: Google Workspace */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">Google Workspace</span>
                  {googleConnected ? (
                    <span className="badge badge-xs badge-info gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Terhubung
                    </span>
                  ) : (
                    <span className="badge badge-xs badge-ghost border-white/10 opacity-70 text-[10px]">Offline</span>
                  )}
                </div>
                <p className="text-xs text-white/50">
                  Sinkronisasi Google Calendar, Drive, dan Gmail via OAuth 2.0 resmi.
                </p>
              </div>

              <div>
                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    className="btn btn-xs btn-outline border-error/40 text-error hover:bg-error/10 rounded-xl gap-1"
                  >
                    <FaUnlock size={10} />
                    <span>Putuskan</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGoogleModalOpen(true)}
                    className="btn btn-xs btn-primary rounded-xl gap-1"
                  >
                    <FaLock size={10} />
                    <span>Hubungkan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Clean service status row */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { name: 'Calendar', icon: FaCalendarAlt, color: 'text-blue-400' },
                { name: 'Drive', icon: FaHdd, color: 'text-amber-400' },
                { name: 'Gmail', icon: FaEnvelope, color: 'text-red-400' }
              ].map((svc) => {
                const SvcIcon = svc.icon
                return (
                  <div
                    key={svc.name}
                    className="px-3 py-2 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <SvcIcon className={svc.color} size={12} />
                      <span className="text-xs font-medium text-white/80">{svc.name}</span>
                    </div>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${googleConnected ? 'bg-info animate-pulse' : 'bg-white/20'}`}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section: MCP Protocol Gateway */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">MCP Connectors</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{filteredConnectors.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari connector..."
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                    className="input input-xs input-bordered rounded-xl pl-7 pr-3 bg-base-100/60 border-white/10 text-xs w-40 focus:w-48 transition-all"
                  />
                  <FaSearch className="absolute left-2.5 top-2 text-white/30" size={10} />
                </div>
                <button
                  type="button"
                  onClick={() => setAddMcpModalOpen(true)}
                  className="btn btn-xs btn-primary rounded-xl gap-1"
                >
                  <FaPlus size={9} />
                  <span>Tambah MCP</span>
                </button>
                <button
                  type="button"
                  onClick={loadMcpData}
                  disabled={mcpLoading}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl"
                  title="Segarkan daftar"
                >
                  <FaSyncAlt size={10} className={mcpLoading ? 'animate-spin text-primary' : ''} />
                </button>
              </div>
            </div>

            {mcpLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat katalog MCP...
              </div>
            ) : filteredConnectors.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                Tidak ada connector MCP yang cocok dengan pencarian.
              </div>
            ) : (
              <div className="grid gap-2">
                {filteredConnectors.map((c) => {
                  const isConnected = !!connections[c.id]
                  const isBusy = busyConnectorKey?.startsWith(`${c.id}:`)
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-white/5 bg-base-100/40 p-3.5 flex items-center justify-between gap-3 hover:border-white/15 transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/90">{c.name || c.id}</span>
                          <span className="font-mono text-[10px] text-white/40">{c.id}</span>
                          {c.custom && (
                            <span className="badge badge-xs badge-info text-[9px]" title="Terdaftar & terotorisasi; eksekusi tool menyusul Fase F3">MCP</span>
                          )}
                          {isConnected ? (
                            <span className="badge badge-xs badge-info text-[9px]">Terhubung</span>
                          ) : (
                            <span className="badge badge-xs badge-ghost border-white/10 text-[9px] opacity-60">Offline</span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/50 truncate max-w-xl">
                          {c.description || c.url || 'Tidak ada deskripsi.'}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isConnected ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRevokeConnector(c.id)}
                            className="btn btn-xs btn-outline border-error/40 text-error hover:bg-error/10 rounded-xl"
                          >
                            Putus
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAuthorizeConnector(c.id, c.scopes || [])}
                            className="btn btn-xs btn-ghost border border-white/10 hover:border-primary/40 text-white/80 rounded-xl"
                          >
                            Otorisasi
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Collapsible MCP Audit Log Drawer */}
            <div className="pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowAuditDrawer(!showAuditDrawer)}
                className="w-full flex items-center justify-between py-1 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <FaHistory size={11} className="text-info" />
                  <span>Riwayat Audit Eksekusi MCP</span>
                  <span className="badge badge-xs badge-neutral text-[9px]">{auditLogs.length}</span>
                </span>
                {showAuditDrawer ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
              </button>

              {showAuditDrawer && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {auditLogs.length === 0 ? (
                    <p className="text-[11px] text-white/40 italic py-1">Belum ada jejak eksekusi.</p>
                  ) : (
                    <>
                      {auditLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-base-100/50 border border-white/5 text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${log.status === 'ok' ? 'bg-info' : 'bg-error'}`}
                            />
                            <span className="font-mono text-white/80 truncate">
                              {log.connectorId || log.connector || 'system'}:{log.op || 'call'}
                            </span>
                          </div>
                          <span className="text-white/40 text-[10px]">
                            {log.ts ? new Date(log.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : (log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')}
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleLoadMoreAudit}
                        className="w-full py-1 text-[11px] text-white/50 hover:text-white/80 transition-colors"
                      >
                        Muat lagi
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
        <div className="space-y-4">
          {/* Built-in Automations (Compact Grid) */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white/90">Built-in Automations</span>
              <span className="badge badge-xs badge-neutral opacity-80">4 Aktif</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {/* Awareness */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Awareness Engine</div>
                  <p className="text-[11px] text-white/50 truncate">Pantau window aktif untuk inisiatif proaktif.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.awarenessEnabled !== false}
                  onChange={handleAwarenessEnabledChange}
                />
              </div>

              {/* Session Compaction */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Session Compaction</div>
                  <p className="text-[11px] text-white/50 truncate">Ringkas konteks sesi (budget 525K) agar debat panjang tetap muat.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.sessionCompactionEnabled !== false}
                  onChange={handleCompactionEnabledChange}
                />
              </div>

              {/* Caveman */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Caveman Mode</div>
                  <p className="text-[11px] text-white/50 truncate">Kompresi respons padat tanpa basa-basi pengantar.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.builtinPlugins?.caveman !== false}
                  onChange={handleBuiltinPluginChange('caveman')}
                />
              </div>

              {/* Ponytail */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Ponytail (YAGNI)</div>
                  <p className="text-[11px] text-white/50 truncate">Prioritaskan modul yang sudah ada di sistem.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.builtinPlugins?.ponytail !== false}
                  onChange={handleBuiltinPluginChange('ponytail')}
                />
              </div>

              {/* Internet-First (D1) */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Internet-First Research</div>
                  <p className="text-[11px] text-white/50 truncate">Fakta dunia luar wajib cari referensi dulu sebelum klaim.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.builtinPlugins?.internetFirst !== false}
                  onChange={handleBuiltinPluginChange('internetFirst')}
                />
              </div>

              {/* Rtk */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">Rtk Output Compression</div>
                  <p className="text-[11px] text-white/50 truncate">Kompresi cerdas pada luaran terminal masif.</p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-xs shrink-0"
                  checked={config.rtkCompress !== false}
                  onChange={handleRtkCompressChange}
                />
              </div>
            </div>
          </div>

          {/* Custom Plugins */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">Custom Plugins</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{plugins.length}</span>
                </div>
                <p className="text-xs text-white/50">
                  Ekstensi JavaScript mandiri untuk menambah kemampuan agen.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openPluginFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
                {isDevMode && (
                  <button
                    type="button"
                    onClick={handleOpenNewPluginModal}
                    className="btn btn-xs btn-primary rounded-xl gap-1"
                  >
                    <FaCode size={10} />
                    <span>Tulis Kode</span>
                  </button>
                )}
              </div>
            </div>

            {/* Compact GitHub Installer */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Pasang via GitHub (contoh: owner/repo)..."
                value={gitPluginUrl}
                onChange={(e) => setGitPluginUrl(e.target.value)}
                className="input input-xs input-bordered rounded-xl bg-base-100/60 border-white/10 font-mono text-xs flex-1"
              />
              <button
                type="button"
                onClick={handleInstallGitPlugin}
                disabled={gitPluginLoading || !gitPluginUrl.trim()}
                className="btn btn-xs btn-primary rounded-xl shrink-0"
              >
                {gitPluginLoading ? 'Mengunduh...' : 'Pasang'}
              </button>
            </div>

            {pluginsLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat plugin kustom...
              </div>
            ) : plugins.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                Belum ada plugin kustom yang terpasang.
              </div>
            ) : (
              <div className="grid gap-2">
                {plugins.map((p) => {
                  const isEnabled = p.isEnabled !== false
                  return (
                    <div
                      key={p.name}
                      className="rounded-xl border border-white/5 bg-base-100/40 p-3.5 flex items-center justify-between gap-3 hover:border-white/15 transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/90">{p.name}</span>
                          <span className="badge badge-xs badge-neutral text-[9px]">{p.actions?.length || 0} aksi</span>
                          <span className={`badge badge-xs text-[9px] ${isEnabled ? 'badge-info' : 'badge-ghost opacity-50'}`}>
                            {isEnabled ? 'Aktif' : 'Mati'}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 truncate">
                          {p.description || 'Tidak ada deskripsi.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePlugin(p.name, isEnabled)}
                          className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl text-[11px]"
                        >
                          {isEnabled ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        {isDevMode && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPluginModal(p)}
                            className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                            title="Edit kode plugin"
                          >
                            <FaEdit size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePlugin(p.name)}
                          className="btn btn-xs btn-ghost border border-white/10 text-error hover:bg-error/10 rounded-xl"
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
        <div className="space-y-4">
          {/* Built-in Skills */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white/90">Built-in Superpowers</span>
              <span className="badge badge-xs badge-neutral opacity-80">4 Pola</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {BUILTIN_SKILLS.map((skill) => {
                const SkillIcon = skill.icon
                const isSkillActive = config?.builtinSkills?.[skill.id] !== false
                return (
                  <div
                    key={skill.id}
                    className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SkillIcon className="text-primary shrink-0" size={13} />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-white/90 truncate">{skill.name}</div>
                        <p className="text-[11px] text-white/50 truncate">{skill.desc}</p>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-xs shrink-0"
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
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">Custom Skills (SKILL.md)</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{skills.length}</span>
                </div>
                <p className="text-xs text-white/50">
                  Keahlian operasional berbasis berkas instruksi Markdown terstruktur.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openSkillsFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallSkillPackage}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                  title="Impor arsip skill .zip atau .tar.gz"
                >
                  <span>Impor Arsip</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSkill}
                  className="btn btn-xs btn-primary rounded-xl gap-1"
                >
                  <FaPlus size={9} />
                  <span>Skill Baru</span>
                </button>
              </div>
            </div>

            {skillsLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat skills...
              </div>
            ) : skills.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                Belum ada skill kustom tersimpan. Klik "Skill Baru" untuk menulis instruksi.
              </div>
            ) : (
              <div className="grid gap-2">
                {skills.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-xl border border-white/5 bg-base-100/40 p-3.5 flex items-center justify-between gap-3 hover:border-white/15 transition-all"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white/90">{s.name}</span>
                        <span className="badge badge-xs badge-ghost border-white/10 font-mono text-[9px]">XDG</span>
                      </div>
                      <p className="text-[11px] text-white/50 truncate">
                        {s.description || 'Tidak ada deskripsi.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSkill(s.name)}
                        className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                        title="Edit instruksi skill"
                      >
                        <FaEdit size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(s.name)}
                        className="btn btn-xs btn-ghost border border-white/10 text-error hover:bg-error/10 rounded-xl"
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
        <div className="space-y-4">
          {/* 3-Tier Overview (Spacious horizontal cards) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-base-200/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-info">Tier 1: Read-Only</span>
                <span className="badge badge-xs badge-info text-[9px]">Otomatis</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Membaca file, cek status sistem, dan inspeksi window aktif tanpa konfirmasi.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-base-200/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-info">Tier 2: Netral</span>
                <span className="badge badge-xs badge-info text-[9px]">Per Sesi</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Perintah shell non-destruktif dan scraping web. Izin diberikan sekali per sesi.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-base-200/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-error">Tier 3: Destruktif</span>
                <span className="badge badge-xs badge-error text-[9px]">Native RFD</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                Menulis/hapus file OS, git commit, dan plugin. Selalu verifikasi dialog sistem.
              </p>
            </div>
          </div>

          {/* Granular Policies */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-white/90">Kebijakan Approval Granular</span>
                <p className="text-xs text-white/50">
                  Tentukan respon konfirmasi untuk tiap kategori aksi sidecar.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-xs btn-outline border-white/10 hover:border-warning/50 text-white/70 rounded-xl"
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
              <div className="p-6 text-center text-white/40 text-xs">Memuat kebijakan...</div>
            ) : (
              <div className="grid gap-2 pt-1">
                {approvalPolicies.map((p) => (
                  <div
                    key={p.family}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-base-100/40 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <span className="text-xs font-mono text-white/80">{p.family}</span>
                    <select
                      className="select select-bordered select-xs bg-base-300/80 rounded-lg text-xs"
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                <FaPlug className="text-primary" size={13} />
                Pemasangan Ekstensi Browser
              </h3>
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/70">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                <span className="text-[11px] text-white/40 block">Folder Berkas Ekstensi:</span>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[10px] text-primary truncate">
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
                      className="btn btn-xs btn-ghost border border-white/10 rounded-lg shrink-0"
                      title="Salin path folder"
                    >
                      {copiedPath ? <FaCheckCircle size={10} className="text-info" /> : <FaCopy size={10} />}
                    </button>
                  )}
                </div>
              </div>

              <p className="font-medium text-white/90">3 Langkah Mudah di Chrome / Brave / Edge:</p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-white/70">
                <li>Buka <code className="font-mono text-primary px-1 py-0.5 rounded bg-black/40">chrome://extensions</code> di browser Anda.</li>
                <li>Aktifkan sakelar <b>Developer mode</b> di pojok kanan atas.</li>
                <li>Klik tombol <b>Load unpacked</b> dan pilih folder di atas.</li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              {extInstall?.dir && (
                <button
                  type="button"
                  onClick={() => window.api?.openFolder?.(extInstall.dir)}
                  className="btn btn-sm btn-ghost rounded-xl gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka di File Manager</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="btn btn-sm btn-primary rounded-xl"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: TAMBAH MCP CUSTOM ── */}
      {addMcpModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                <FaPlug className="text-primary" size={13} />
                Tambah Server MCP Kustom
              </h3>
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-white/70">ID Server (kebab-case)</label>
                <input
                  type="text"
                  placeholder="contoh: sqlite-mcp"
                  value={newMcpForm.id}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, id: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">Nama Tampilan</label>
                <input
                  type="text"
                  placeholder="contoh: SQLite Database Connector"
                  value={newMcpForm.name}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, name: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">URL Endpoint Gateway</label>
                <input
                  type="text"
                  placeholder="https://... atau http://localhost:..."
                  value={newMcpForm.url}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, url: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">Deskripsi Singkat</label>
                <input
                  type="text"
                  placeholder="Deskripsi alat atau scope akses..."
                  value={newMcpForm.description}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, description: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">Header Auth (opsional, JSON)</label>
                <input
                  type="text"
                  placeholder='misal {"CONTEXT7_API_KEY": "..."}'
                  value={newMcpForm.headers}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, headers: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
                <p className="text-[10px] text-white/40">Disimpan lokal + sidecar saja, tidak pernah ke chat/model.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveNewMcp}
                className="btn btn-sm btn-primary rounded-xl"
              >
                Simpan Connector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: GOOGLE OAUTH ── */}
      {googleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                <FaLock className="text-primary" size={13} />
                Hubungkan Google Workspace
              </h3>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <FaTimes size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-white/60 leading-relaxed">
                Masukkan Client ID dan Client Secret dari Google Cloud Console dengan scope Calendar, Drive, dan Gmail.
              </p>
              <div className="space-y-1">
                <label className="font-semibold text-white/70">Client ID</label>
                <input
                  type="text"
                  placeholder="xxxxxx.apps.googleusercontent.com"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-white/70">Client Secret</label>
                <input
                  type="password"
                  placeholder="GOCSPX-xxxxxx"
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={googleLoading}
                onClick={handleGoogleConnect}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {googleLoading ? 'Menghubungkan...' : 'Otorisasi Akun'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: EDIT/CREATE PLUGIN (MONACO) ── */}
      {editingPlugin && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <FaCubes className="text-primary" size={16} />
                <h3 className="text-base font-bold text-white/90">
                  {editingPlugin.mode === 'new' ? 'Buat Plugin Baru' : `Edit Plugin: ${pluginForm.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">Nama Plugin</label>
                  <input
                    type="text"
                    disabled={editingPlugin.mode === 'edit'}
                    placeholder="misal: stock-checker"
                    value={pluginForm.name}
                    onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })}
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">Deskripsi Singkat</label>
                  <input
                    type="text"
                    placeholder="Fungsi utama plugin..."
                    value={pluginForm.description}
                    onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })}
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Aksi &amp; Kode JS</span>
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
                    className="btn btn-xs btn-ghost border border-white/10 rounded-xl gap-1"
                  >
                    <FaPlus size={9} /> Tambah Aksi
                  </button>
                </div>

                {pluginForm.actions.map((act, index) => (
                  <div key={index} className="p-3 rounded-2xl bg-base-200/60 border border-white/5 space-y-2.5">
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
                        className="input input-xs input-bordered rounded-lg bg-base-100 font-mono flex-1 text-xs"
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
                        className="input input-xs input-bordered rounded-lg bg-base-100 flex-1 text-xs"
                      />
                      {pluginForm.actions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = pluginForm.actions.filter((_, i) => i !== index)
                            setPluginForm({ ...pluginForm, actions: updated })
                          }}
                          className="btn btn-xs btn-ghost text-error rounded-lg"
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
                      <p className="text-xs text-error font-mono flex items-center gap-1.5">
                        <FaExclamationTriangle size={11} />
                        Syntax Error: {pluginSyntaxErrors[index]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePlugin}
                className="btn btn-sm btn-primary rounded-xl"
              >
                Simpan Plugin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: EDIT/CREATE SKILL (MONACO) ── */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <FaBrain className="text-primary" size={16} />
                <h3 className="text-base font-bold text-white/90">
                  {editingSkill.isNew ? 'Buat Skill Baru' : `Edit Skill: ${skillFormName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Nama Skill (kebab-case)</label>
                <input
                  type="text"
                  disabled={!editingSkill.isNew}
                  placeholder="misal: git-commit-helper"
                  value={skillFormName}
                  onChange={(e) => setSkillFormName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Isi Berkas SKILL.md</label>
                <div className="rounded-xl overflow-hidden border border-white/10">
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

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSkill}
                className="btn btn-sm btn-primary rounded-xl"
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
