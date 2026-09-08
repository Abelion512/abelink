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
  FaSlidersH,
  FaCalendarAlt,
  FaHdd,
  FaEnvelope,
  FaTelegramPlane,
  FaGithub,
  FaTerminal
} from 'react-icons/fa'
import { useConfirm } from '../../hooks/useConfirm'
import { getCachedSkills } from '../../api/skillsCache'

const PLANNED_MCP_CONNECTORS = [
  {
    id: 'context7',
    name: 'CONTEXT7',
    url: 'https://mcp.context7.com/mcp/oauth',
    description: 'Library documentation, real-time code snippet lookup, and API reference.'
  },
  {
    id: 'drive',
    name: 'Google Drive',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    description: 'Google Drive MCP server for searching, reading, and indexing cloud files.'
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    url: 'https://calendarmcp.googleapis.com/mcp/v1',
    description: 'Google Calendar MCP server for schedule inspection and event creation.'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    description: 'Google Gmail MCP server for email search and drafting.'
  },
  {
    id: 'mermaid',
    name: 'Mermaid',
    url: 'https://chatgpt.mermaid.ai/anthropic/mcp',
    description: 'Architecture diagramming, flowchart, and visual schema generation.'
  }
]

const BUILTIN_SKILLS = [
  {
    id: 'systematic-engineering',
    name: 'Systematic Engineering',
    badge: 'Disiplin Rekayasa',
    desc: 'Menegakkan siklus sistematis: Brainstorm -> Spec -> Plan -> TDD -> Verify sebelum eksekusi perubahan kode.',
    icon: FaCubes
  },
  {
    id: 'execution-discipline',
    name: 'Execution Discipline',
    badge: 'Stabilitas Sistem',
    desc: 'Menjamin eksekusi perintah terminal deterministik dan memverifikasi output sebelum melanjutkan langkah berikutnya.',
    icon: FaTerminal
  },
  {
    id: 'durable-planner',
    name: 'Durable Task Planner (/plan)',
    badge: 'Multi-Step Tasks',
    desc: 'Perencanaan tugas bertahap berdaya tahan tinggi dengan checkpoint verification dan penanganan kegagalan otomatis.',
    icon: FaBrain
  },
  {
    id: 'root-cause-debugger',
    name: 'Root-Cause Debugger',
    badge: 'Analisis Mendalam',
    desc: 'Mewajibkan investigasi akar masalah teknis mendalam dengan bukti empiris error sebelum melakukan patching kode.',
    icon: FaSearch
  }
]

export default function CapabilitiesHub({
  config,
  setConfig,
  handleAwarenessEnabledChange,
  handleBuiltinPluginChange,
  handleRtkCompressChange,
  isDevMode = false
}) {
  const { confirm, ModalComponent } = useConfirm()
  const [activeTab, setActiveTab] = useState('connectors')

  // ── Google Workspace Connectors State ─────────────────────────────────────
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
      console.warn('[CapabilitiesHub] Gagal cek status Google:', e)
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
      message: 'MARK tidak lagi dapat mengakses Google Calendar, Google Drive, dan Gmail.',
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

  // ── MCP Connectors State ──────────────────────────────────────────────────
  const [connectors, setConnectors] = useState([])
  const [connections, setConnections] = useState({})
  const [auditLogs, setAuditLogs] = useState([])
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpSearch, setMcpSearch] = useState('')
  const [busyConnectorKey, setBusyConnectorKey] = useState(null)

  const loadMcpData = useCallback(async () => {
    setMcpLoading(true)
    try {
      let cat = null
      let aud = []
      if (window.api?.capabilityCatalogGet) {
        cat = await window.api.capabilityCatalogGet().catch(() => null)
      }
      if (window.api?.capabilityAuditGet) {
        aud = await window.api.capabilityAuditGet({ limit: 30 }).catch(() => [])
      }

      let customMcp = []
      try {
        customMcp = JSON.parse(localStorage.getItem('mark:custom_mcp') || '[]')
      } catch (_) {}

      const combined = [...PLANNED_MCP_CONNECTORS, ...(cat?.connectors || []), ...customMcp]
      const unique = Array.from(new Map(combined.map((c) => [c.id, c])).values())

      setConnectors(unique)
      setConnections(cat?.connections || {})
      setAuditLogs(Array.isArray(aud) ? aud : aud?.entries || [])
    } catch (e) {
      console.error('[CapabilitiesHub] Gagal memuat data MCP:', e)
    } finally {
      setMcpLoading(false)
    }
  }, [])

  const handleAuthorizeConnector = async (connectorId, scopes) => {
    setBusyConnectorKey(`${connectorId}:auth`)
    try {
      await window.api?.capabilityAuthorize?.(connectorId, scopes)
      await loadMcpData()
    } catch (e) {
      alert(`Gagal otorisasi: ${e.message || e}`)
    } finally {
      setBusyConnectorKey(null)
    }
  }

  const handleRevokeConnector = async (connectorId) => {
    const res = await confirm({
      title: 'Putuskan Koneksi?',
      message: `Yakin ingin memutuskan koneksi connector "${connectorId}"?`,
      confirmText: 'Putuskan',
      isError: true
    })
    if (!res.isConfirmed) return

    setBusyConnectorKey(`${connectorId}:revoke`)
    try {
      await window.api?.capabilityRevoke?.(connectorId)
      await loadMcpData()
    } catch (e) {
      alert(`Gagal memutuskan: ${e.message || e}`)
    } finally {
      setBusyConnectorKey(null)
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
    actions: [{ name: '', description: '', triggerHint: '', code: '' }],
    isEdit: false
  })
  const [pluginSyntaxErrors, setPluginSyntaxErrors] = useState([])
  const [extInstall, setExtInstall] = useState(null)

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
      console.error('[CapabilitiesHub] Gagal memuat plugins:', e)
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
      alert('Masukkan URL atau shorthand repository GitHub (contoh: owner/repo)')
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
          alert(`Gagal memasang plugin: ${res?.error || 'Terjadi kesalahan'}`)
        }
      } else {
        alert('Fitur instalasi git plugin belum aktif di sidecar.')
      }
    } catch (e) {
      alert(`Gagal memasang plugin dari GitHub: ${e.message || e}`)
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
          code: '// query berisi parameter dari prompt user\nreturn "Hasil eksekusi plugin";'
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
          : [{ name: 'run', description: '', triggerHint: '', code: '' }],
      isEdit: true
    })
    setEditingPlugin({ mode: 'edit', originalName: plugin.name })
  }

  const handleSavePlugin = async () => {
    if (!pluginForm.name.trim()) {
      alert('Nama plugin wajib diisi.')
      return
    }
    const hasSyntaxErr = pluginSyntaxErrors.some(Boolean)
    if (hasSyntaxErr) {
      alert('Terdapat syntax error pada kode JavaScript action.')
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
      message: `Yakin ingin menghapus plugin "${name}"? Kode akan dihapus permanen.`,
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
      alert(`Gagal mengubah status plugin: ${e.message || e}`)
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
description: Deskripsi singkat tentang keahlian operasional ini...
---

# Instruksi Operasional

Tuliskan petunjuk operasional dan aturan mutlak untuk AI di sini.
- [ ] Langkah 1
- [ ] Langkah 2

## Critical Rules
- Selalu patuhi batas aman eksekusi sistem.
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
      console.error('[CapabilitiesHub] Gagal memuat kebijakan approval:', e)
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

      {/* ── Sub-Nav Tabs (Pill style ala Claude Customize) ── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-base-100/50 border border-white/5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab('connectors')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'connectors'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <FaPlug size={12} />
          <span>Connectors</span>
          <span className="badge badge-xs badge-neutral opacity-80">
            {connectors.length + (googleConnected ? 3 : 0)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plugins')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'plugins'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <FaCubes size={12} />
          <span>Plugins &amp; Otomasi</span>
          {plugins.length > 0 && (
            <span className="badge badge-xs badge-neutral opacity-80">{plugins.length}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'skills'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
          }`}
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
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'security'
              ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <FaShieldAlt size={12} />
          <span>Kebijakan Keamanan</span>
        </button>
      </div>

      {/* ── TAB 1: CONNECTORS ── */}
      {activeTab === 'connectors' && (
        <div className="space-y-6">
          {/* Built-in Connectors: Google Workspace */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <FaPlug className="text-primary" size={14} />
                  Built-in Connectors: Google Workspace
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Integrasi resmi produktivitas Google langsung ke konteks pemikiran MARK.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    className="btn btn-xs btn-outline border-error/40 text-error hover:bg-error/10 rounded-xl gap-1.5"
                  >
                    <FaUnlock size={10} />
                    <span>Putuskan Akun Google</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGoogleModalOpen(true)}
                    className="btn btn-xs btn-primary rounded-xl gap-1.5"
                  >
                    <FaLock size={10} />
                    <span>Hubungkan Google Workspace</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {[
                {
                  id: 'google-calendar',
                  name: 'Google Calendar',
                  desc: 'Melihat & Menjadwalkan Acara Kalender',
                  icon: FaCalendarAlt,
                  color: 'text-blue-400'
                },
                {
                  id: 'google-drive',
                  name: 'Google Drive',
                  desc: 'Membaca & Mencari Berkas Google Drive',
                  icon: FaHdd,
                  color: 'text-amber-400'
                },
                {
                  id: 'gmail',
                  name: 'Gmail',
                  desc: 'Membaca & Mengirim Email',
                  icon: FaEnvelope,
                  color: 'text-red-400'
                }
              ].map((prod) => {
                const ProdIcon = prod.icon
                return (
                  <div
                    key={prod.id}
                    className="p-4 rounded-2xl bg-base-100/60 border border-white/5 space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ProdIcon className={prod.color} size={14} />
                          <span className="text-xs font-semibold text-white/90">{prod.name}</span>
                        </div>
                        {googleConnected ? (
                          <span className="badge badge-xs badge-success gap-1 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Terhubung
                          </span>
                        ) : (
                          <span className="badge badge-xs badge-ghost border-white/10 text-[10px] opacity-70">
                            Belum Terhubung
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        {prod.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom Connectors: MCP Protocol */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <FaPlug className="text-primary" size={14} />
                  Custom Connectors: Gateway Protokol MCP
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Hubungkan server Model Context Protocol eksternal secara mandiri ke sistem MARK.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari connector..."
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                    className="input input-xs input-bordered rounded-xl pl-7 pr-3 bg-base-100/60 border-white/10 text-xs w-44 focus:w-56 transition-all"
                  />
                  <FaSearch className="absolute left-2.5 top-2 text-white/30" size={10} />
                </div>
                <button
                  type="button"
                  onClick={loadMcpData}
                  disabled={mcpLoading}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl"
                  title="Segarkan daftar connector"
                >
                  <FaSyncAlt size={10} className={mcpLoading ? 'animate-spin text-primary' : ''} />
                </button>
              </div>
            </div>

            {mcpLoading ? (
              <div className="p-8 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat katalog connector...
              </div>
            ) : filteredConnectors.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10">
                <FaPlug className="mx-auto text-white/20 mb-2" size={24} />
                <p className="text-xs text-white/60 font-medium">Belum ada connector MCP eksternal yang terdeteksi.</p>
                <p className="text-[11px] text-white/40 mt-1">
                  Tambahkan server MCP ke konfigurasi sistem MARK atau periksa sidecar runtime.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filteredConnectors.map((c) => {
                  const isConnected = !!connections[c.id]
                  const isBusy = busyConnectorKey?.startsWith(`${c.id}:`)
                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-white/5 bg-base-100/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-white/15 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white/90">{c.name || c.id}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/5">
                            {c.id}
                          </span>
                          {isConnected ? (
                            <span className="badge badge-xs badge-success gap-1 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Terhubung
                            </span>
                          ) : (
                            <span className="badge badge-xs badge-ghost border-white/10 opacity-70 text-[10px]">Offline</span>
                          )}
                        </div>
                        {c.url && (
                          <div className="font-mono text-[11px] text-cyan-400/80 truncate max-w-lg">
                            {c.url}
                          </div>
                        )}
                        <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
                          {c.description || 'Tidak ada deskripsi.'}
                        </p>
                        {c.scopes && c.scopes.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {c.scopes.map((s) => (
                              <span key={s} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-base-300/60 text-white/50">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {isConnected ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRevokeConnector(c.id)}
                            className="btn btn-xs btn-outline border-error/40 text-error hover:bg-error/10 rounded-xl"
                          >
                            <FaUnlock size={10} />
                            <span>Putus</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAuthorizeConnector(c.id, c.scopes || [])}
                            className="btn btn-xs btn-primary rounded-xl"
                          >
                            <FaLock size={10} />
                            <span>Otorisasi</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Jejak Audit MCP */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/70 flex items-center gap-2">
                <FaHistory className="text-info" size={12} />
                Jejak Audit Eksekusi MCP Terakhir
              </h4>
              <span className="text-[11px] text-white/40">{auditLogs.length} entri</span>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-white/40 italic py-2">Belum ada aktivitas eksekusi capability tercatat.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {auditLogs.slice(0, 15).map((log, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-base-100/40 border border-white/5 text-xs hover:bg-base-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          log.status === 'ok' ? 'bg-success' : log.status === 'error' ? 'bg-error' : 'bg-warning'
                        }`}
                      />
                      <span className="font-mono text-[11px] font-semibold text-white/80 truncate">
                        {log.connectorId || log.capabilityId || 'system'}:{log.op || 'call'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-white/40">
                      <span>{log.durationMs ? `${log.durationMs}ms` : ''}</span>
                      <span>
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: PLUGINS & AUTOMATION ── */}
      {activeTab === 'plugins' && (
        <div className="space-y-6">
          {/* Built-in Plugins: Otomasi & Kesadaran OS */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <FaRobot className="text-primary" size={14} />
                Built-in Plugins: Otomasi &amp; Kesadaran OS
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                Modul otomasi desktop, background window watcher, dan ekstensi browser bawaan sistem.
              </p>
            </div>

            <div className="divide-y divide-white/5 space-y-3">
              {/* Awareness Engine */}
              <div className="flex items-start justify-between gap-4 pt-2">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/90">Awareness Engine</span>
                    <span className="badge badge-xs badge-neutral text-[9px]">OS Proaktif</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Membaca aktivitas window aktif secara berkala untuk memulai dialog atau menawarkan bantuan proaktif.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm shrink-0"
                  checked={config.awarenessEnabled !== false}
                  onChange={handleAwarenessEnabledChange}
                />
              </div>

              {/* Browser Automation */}
              <div className="pt-3 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/90">Browser Automation</span>
                      <span className="badge badge-xs badge-neutral text-[9px]">Chromium</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      Otomatis menutup tab grup yang dibuka oleh task otomatisasi setelah tugas tuntas. Tab manual tetap aman.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm shrink-0"
                    checked={!!config.browserAutoCloseTabs}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, browserAutoCloseTabs: e.target.checked }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-xs btn-outline border-white/10 hover:border-primary/50 text-xs"
                      onClick={async () => {
                        setExtInstall(null)
                        try {
                          if (!window.api?.ensureExtensionFiles) {
                            setExtInstall({ error: 'Butuh desktop runtime terbaru.' })
                            return
                          }
                          const dir = await window.api.ensureExtensionFiles()
                          setExtInstall({ dir })
                        } catch (e) {
                          setExtInstall({ error: e?.message || String(e) })
                        }
                      }}
                    >
                      Pasang Extension Browser
                    </button>
                    {extInstall?.dir && (
                      <button
                        type="button"
                        onClick={() => window.api?.openFolder?.(extInstall.dir)}
                        className="btn btn-xs btn-primary text-xs gap-1.5"
                      >
                        <FaFolderOpen size={11} />
                        <span>Buka Folder Ekstensi</span>
                      </button>
                    )}
                    {extInstall?.error && (
                      <span className="text-[11px] text-error">Gagal: {extInstall.error}</span>
                    )}
                  </div>
                  {extInstall?.dir && (
                    <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 text-[11px] space-y-1 text-white/80">
                      <p className="text-success font-semibold flex items-center gap-1.5">
                        ✓ Folder ekstensi siap di: <code className="font-mono text-[10px] px-1 py-0.5 bg-black/50 rounded text-primary">{extInstall.dir}</code>
                      </p>
                      <p className="text-white/60">
                        Langkah aktivasi di Chrome / Chromium / Brave / Edge:
                      </p>
                      <ol className="list-decimal list-inside space-y-0.5 text-white/70 pl-1">
                        <li>Buka URL <code className="font-mono text-[10px] text-primary">chrome://extensions</code> di browser.</li>
                        <li>Aktifkan toggle <b>Developer mode</b> di pojok kanan atas.</li>
                        <li>Klik <b>Load unpacked</b> (Muat yang belum dibongkar), lalu pilih folder di atas.</li>
                        <li>Selesai! Ekstensi otomatis terhubung hijau tanpa perlu token manual.</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              {/* Ponytail */}
              <div className="flex items-start justify-between gap-4 pt-3">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/90">Ponytail</span>
                    <span className="badge badge-xs badge-ghost border-white/10 text-[9px]">YAGNI</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Prioritaskan pemanfaatan pustaka dan kode yang sudah ada sebelum mengusulkan pembuatan modul baru.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm shrink-0"
                  checked={config.builtinPlugins?.ponytail !== false}
                  onChange={handleBuiltinPluginChange('ponytail')}
                />
              </div>

              {/* Caveman */}
              <div className="flex items-start justify-between gap-4 pt-3">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/90">Caveman</span>
                    <span className="badge badge-xs badge-ghost border-white/10 text-[9px]">Token Saver</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Jawaban ringkas dan padat tanpa pengantar basa-basi. Blok kode dan output terminal tetap utuh.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm shrink-0"
                  checked={config.builtinPlugins?.caveman !== false}
                  onChange={handleBuiltinPluginChange('caveman')}
                />
              </div>

              {/* Rtk */}
              <div className="flex items-start justify-between gap-4 pt-3">
                <div className="space-y-0.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/90">Rtk</span>
                    <span className="badge badge-xs badge-ghost border-white/10 text-[9px]">Kompresi Output</span>
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Kompresi cerdas pada luaran terminal berukuran besar sebelum disuntikkan ke prompt AI.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm shrink-0"
                  checked={config.rtkCompress !== false}
                  onChange={handleRtkCompressChange}
                />
              </div>
            </div>
          </div>

          {/* Custom Plugins */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <FaCubes className="text-primary" size={14} />
                  Custom Plugins
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Pasang ekstensi mandiri dari repositori GitHub atau folder lokal.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openPluginFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>

                {isDevMode && (
                  <button
                    type="button"
                    onClick={handleOpenNewPluginModal}
                    className="btn btn-xs btn-primary rounded-xl gap-1.5"
                  >
                    <FaCode size={10} />
                    <span>Tulis Kode (Monaco)</span>
                  </button>
                )}
              </div>
            </div>

            {/* GitHub Installer Form */}
            <div className="p-3.5 rounded-xl bg-base-100/50 border border-white/5 space-y-2">
              <label className="text-xs font-semibold text-white/80 flex items-center gap-2">
                <FaGithub size={13} />
                <span>Pasang Plugin via GitHub / URL</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="owner/repo atau https://github.com/owner/repo"
                  value={gitPluginUrl}
                  onChange={(e) => setGitPluginUrl(e.target.value)}
                  className="input input-xs input-bordered rounded-xl bg-base-200/80 border-white/10 font-mono text-xs flex-1"
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
            </div>

            {pluginsLoading ? (
              <div className="p-8 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat plugin kustom...
              </div>
            ) : plugins.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10">
                <FaCubes className="mx-auto text-white/20 mb-2" size={24} />
                <p className="text-xs text-white/60 font-medium">Belum ada custom plugin yang terpasang.</p>
                <p className="text-[11px] text-white/40 mt-1">
                  Masukkan link repositori GitHub di atas untuk memasang ekstensi baru.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {plugins.map((p) => {
                  const isEnabled = p.isEnabled !== false
                  return (
                    <div
                      key={p.name}
                      className="rounded-2xl border border-white/5 bg-base-100/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-white/15 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white/90">{p.name}</span>
                          <span className="badge badge-xs badge-neutral border-white/10 text-[10px]">
                            {p.actions?.length || 0} aksi
                          </span>
                          <span
                            className={`badge badge-xs text-[10px] ${
                              isEnabled ? 'badge-success' : 'badge-ghost opacity-50'
                            }`}
                          >
                            {isEnabled ? 'Aktif' : 'Mati'}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 leading-relaxed">
                          {p.description || 'Tidak ada deskripsi.'}
                        </p>
                        {p.actions && p.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {p.actions.map((act, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-base-300/80 text-white/60"
                              >
                                {act.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleTogglePlugin(p.name, isEnabled)}
                          className="btn btn-xs btn-ghost border border-white/10 rounded-xl"
                        >
                          {isEnabled ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        {isDevMode && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPluginModal(p)}
                            className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl gap-1"
                          >
                            <FaEdit size={11} />
                            <span>Edit</span>
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
        <div className="space-y-6">
          {/* Built-in Skills (Superpowers) */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <FaBrain className="text-primary" size={14} />
                Built-in Skills: Superpowers Discipline
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                Keterampilan operasional tingkat sistem yang memandu disiplin pemikiran dan eksekusi AI.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {BUILTIN_SKILLS.map((skill) => {
                const SkillIcon = skill.icon
                const isSkillActive = config?.builtinSkills?.[skill.id] !== false
                return (
                  <div
                    key={skill.id}
                    className="p-4 rounded-2xl bg-base-100/60 border border-white/5 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <SkillIcon className="text-primary" size={13} />
                          <span className="text-xs font-semibold text-white/90">{skill.name}</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {skill.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        {skill.desc}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <span className="text-[10px] text-white/40">Status Keahlian</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary toggle-xs"
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
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom Skills */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <FaBrain className="text-primary" size={14} />
                  Custom Skills (SKILL.md)
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Keterampilan operasional terstruktur format Markdown yang dipelajari atau diimpor mandiri.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openSkillsFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl gap-1.5"
                >
                  <FaFolderOpen size={11} />
                  <span>Buka Folder</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallSkillPackage}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl gap-1.5"
                >
                  <span>Impor (.zip / .tar.gz)</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSkill}
                  className="btn btn-xs btn-primary rounded-xl gap-1.5"
                >
                  <FaPlus size={10} />
                  <span>Skill Baru</span>
                </button>
              </div>
            </div>

            {skillsLoading ? (
              <div className="p-8 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat skills lokal...
              </div>
            ) : skills.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10">
                <FaBrain className="mx-auto text-white/20 mb-2" size={24} />
                <p className="text-xs text-white/60 font-medium">Belum ada custom skill tersimpan.</p>
                <p className="text-[11px] text-white/40 mt-1">
                  Impor arsip package (.zip / .tar.gz) atau klik Skill Baru untuk membuat manual.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {skills.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-2xl border border-white/5 bg-base-100/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-white/15 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white/90">{s.name}</span>
                        <span className="badge badge-xs badge-neutral border-white/10 font-mono text-[10px]">
                          XDG
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
                        {s.description || 'Tidak ada deskripsi spesifik.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSkill(s.name)}
                        className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl gap-1"
                      >
                        <FaEdit size={11} />
                        <span>Edit</span>
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

      {/* ── TAB 4: SECURITY POLICIES (3-TIER MATRIX) ── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* 3-Tier Security Overview */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <FaShieldAlt className="text-warning" size={14} />
                Matriks Keamanan 3-Tier MARK
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                Klasifikasi hak akses deterministik untuk menjamin kedaulatan sistem operasi Anda.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-4 rounded-2xl bg-base-100/50 border border-success/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-success">Tier 1: Read-Only</span>
                  <span className="badge badge-xs badge-success">Aman Otomatis</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Membaca berkas lokal, memeriksa status sistem, dan inspeksi window aktif. Tidak memerlukan konfirmasi.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-base-100/50 border border-info/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-info">Tier 2: Netral</span>
                  <span className="badge badge-xs badge-info">Sesi Aktif</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Menjalankan perintah shell non-destruktif, scraping web, dan pencarian dokumen. Konfirmasi sekali per sesi.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-base-100/50 border border-error/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-error">Tier 3: Destruktif</span>
                  <span className="badge badge-xs badge-error">Native RFD</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Menulis/menghapus file OS, git commit/revert, kill proses, dan modifikasi plugin. Selalu konfirmasi dialog OS.
                </p>
              </div>
            </div>
          </div>

          {/* Detail Approval Policies Table */}
          <div className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Konfigurasi Granular Per Famili Aksi
                </h4>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Tentukan respon approval untuk masing-masing kategori aksi sidecar.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-xs btn-outline border-white/10 hover:border-warning/50 text-white/70 rounded-xl"
                onClick={async () => {
                  try {
                    await window.api?.approvalPolicyResetSession?.()
                    await loadApprovalPolicies()
                  } catch {
                    /* best-effort */
                  }
                }}
              >
                Reset Izin Sesi Ini
              </button>
            </div>

            {policiesLoading ? (
              <div className="p-8 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Memuat kebijakan approval...
              </div>
            ) : (
              <div className="grid gap-2">
                {approvalPolicies.map((p) => (
                  <div
                    key={p.family}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-base-100/50 border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-mono font-medium text-white/90">{p.family}</span>
                    </div>
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
                        } catch {
                          /* best-effort */
                        }
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

      {/* ── MODAL: GOOGLE WORKSPACE OAUTH ── */}
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

      {/* ── MODAL: EDIT / CREATE PLUGIN (MONACO EDITOR) ── */}
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
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">Deskripsi Singkat</label>
                  <input
                    type="text"
                    placeholder="Penjelasan fungsi plugin..."
                    value={pluginForm.description}
                    onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })}
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10"
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
                        placeholder="Nama aksi (contoh: check)"
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
                        placeholder="Trigger hint (contoh: ketika user tanya harga saham...)"
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

      {/* ── MODAL: EDIT / CREATE SKILL (MARKDOWN EDITOR) ── */}
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
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono"
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
