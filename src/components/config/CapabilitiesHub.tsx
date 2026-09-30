import { useState, useEffect, useCallback, useMemo, type ChangeEvent } from 'react'
import {
  Plug,
  Boxes,
  Brain,
  Shield,
  Search,
  RefreshCw,
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  History,
  Code,
  Calendar,
  HardDrive,
  Mail,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'
import { getCachedSkills } from '../../api/skillsCache'
import { t, localeTag } from '../../api/locale'
import type { ConfigRow } from '../../api/db'



const PLANNED_MCP_CONNECTORS = [
  {
    id: 'context7',
    name: 'Context7 MCP',
    url: 'https://mcp.context7.com/mcp/oauth',
    description: 'Library docs, real-time code snippets, and official API references.'
  }
]

const BUILTIN_SKILLS = [
  {
    id: 'systematic-engineering',
    name: 'Systematic Engineering',
    desc: 'Staged investigation discipline before code changes.',
    icon: Boxes
  },
  {
    id: 'execution-discipline',
    name: 'Execution Discipline',
    desc: 'Deterministic verification via test suite before commit.',
    icon: Terminal
  },
  {
    id: 'durable-planner',
    name: 'Durable Task Planner (/plan)',
    desc: 'Persistent work plans for staged multi-step tasks.',
    icon: Brain
  },
  {
    id: 'root-cause-debugger',
    name: 'Root-Cause Debugger',
    desc: 'Deep root-cause analysis before offering solutions.',
    icon: Search
  }
]

const BUILTIN_SKILL_KEYS: Record<string, string[]> = {
  'systematic-engineering': ['cap.skillSystematic', 'cap.skillSystematicDesc'],
  'execution-discipline': ['cap.skillExecution', 'cap.skillExecutionDesc'],
  'durable-planner': ['cap.skillPlanner', 'cap.skillPlannerDesc'],
  'root-cause-debugger': ['cap.skillDebugger', 'cap.skillDebuggerDesc']
}

interface CapabilitiesHubProps {
  config: ConfigRow
  setConfig: (updater: (prev: ConfigRow) => ConfigRow) => void
  handleAwarenessEnabledChange: (e: ChangeEvent<HTMLInputElement>) => void
  handleCompactionEnabledChange: (e: ChangeEvent<HTMLInputElement>) => void
  handleBuiltinPluginChange: (key: string) => (e: ChangeEvent<HTMLInputElement>) => void
  handleRtkCompressChange: (e: ChangeEvent<HTMLInputElement>) => void
  isDevMode?: boolean
  language?: string
}

interface Connector {
  id: string
  name?: string
  description?: string
  url?: string
  scopes?: string[]
  transport?: string
  custom?: boolean
  [key: string]: unknown
}

type AuditEntry = {
  connectorId?: string
  connector?: string
  op?: string
  status?: string
  ts?: number | string
  timestamp?: number | string
  [key: string]: unknown
}

interface PluginAction {
  name: string
  description?: string
  triggerHint?: string
  code: string
  [key: string]: unknown
}

interface PluginRow {
  name: string
  description?: string
  actions?: PluginAction[]
  isEnabled?: boolean
  [key: string]: unknown
}

interface ExtInstallState {
  dir?: string
  error?: string
}

interface ApprovalPolicyRow {
  family: string
  policy: string
  [key: string]: unknown
}

export default function CapabilitiesHub({
  config,
  setConfig,
  handleAwarenessEnabledChange,
  handleCompactionEnabledChange,
  handleBuiltinPluginChange,
  handleRtkCompressChange,
  isDevMode = false,
  language = 'en'
}: CapabilitiesHubProps) {
  const { confirm, ModalComponent } = useConfirm()
  const [activeTab, setActiveTab] = useState<'connectors' | 'plugins' | 'skills' | 'security'>('connectors')

  // ── Browser Extension State & Modal ───────────────────────────────────────
  const [extInstall, setExtInstall] = useState<ExtInstallState | null>(null)
  const [extGuideOpen, setExtGuideOpen] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  // Watchdog Fase C3: pill status + reconnect manual (bounded di sidecar).
  const [browserConnected, setBrowserConnected] = useState<boolean | null>(null)
  const [browserReconnecting, setBrowserReconnecting] = useState(false)
  const [browserNote, setBrowserNote] = useState('')

  const checkBrowserStatus = useCallback(async () => {
    try {
      if (!window.api?.runNodeFunction) {
        setBrowserConnected(null)
        return
      }
      const st = (await window.api.runNodeFunction('browser:status')) as {
        sessions?: Array<{ connected?: boolean }>
      } | null
      const live = Array.isArray(st?.sessions) && !!st.sessions.some((s) => s.connected)
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
      const r = (await window.api?.runNodeFunction('browser:reconnect')) as {
        ok?: boolean
        reused?: boolean
        reason?: string
      } | null | undefined
      if (r?.ok) {
        setBrowserConnected(true)
        setBrowserNote(r.reused ? t(language, 'cap.extReused') : t(language, 'cap.extReconnected'))
      } else {
        setBrowserConnected(false)
        setBrowserNote(
          r?.reason === 'launch-budget-exhausted'
            ? t(language, 'cap.launchBudget')
            : r?.reason === 'auto-launch-off'
              ? t(language, 'cap.autoLaunchOff')
              : t(language, 'cap.reconnectFailed', r?.reason)
        )
      }
    } catch (e) {
      setBrowserConnected(false)
      setBrowserNote(t(language, 'cap.reconnectError', (e instanceof Error ? e.message : String(e)) || String(e)))
    } finally {
      setBrowserReconnecting(false)
    }
  }, [browserReconnecting, language])

  const handleInitExtension = async () => {
    try {
      if (!window.api?.ensureExtensionFiles) {
        setExtInstall({ error: t(language, 'cap.runtimeUnsupported') })
        return
      }
      const dir = (await window.api.ensureExtensionFiles()) as string
      setExtInstall({ dir })
      setExtGuideOpen(true)
    } catch (e) {
      setExtInstall({ error: (e instanceof Error ? e.message : String(e)) || String(e) })
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
      alert(t(language, 'cap.googleRequired'))
      return
    }
    setGoogleLoading(true)
    try {
      const res = (await window.api?.googleConnect?.(googleClientId.trim(), googleClientSecret.trim())) as {
        success?: boolean
        error?: string
      } | null | undefined
      if (res?.success) {
        setGoogleConnected(true)
        setGoogleModalOpen(false)
      } else {
        alert(t(language, 'cap.googleAuthFailed', res?.error))
      }
    } catch (e) {
      alert(t(language, 'cap.googleConnectFailed', (e instanceof Error ? e.message : String(e)) || e))
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleGoogleDisconnect = async () => {
    const res = await confirm({
      title: t(language, 'cap.googleDisconnectTitle'),
      message: t(language, 'cap.googleDisconnectMsg'),
      confirmText: t(language, 'cap.disconnect'),
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.googleDisconnect?.()
      setGoogleConnected(false)
    } catch (e) {
      alert(t(language, 'cap.googleDisconnectFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  // ── MCP Connectors State & Modal ──────────────────────────────────────────
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [connections, setConnections] = useState<Record<string, unknown>>({})
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpSearch, setMcpSearch] = useState('')
  const [busyConnectorKey, setBusyConnectorKey] = useState<string | null>(null)
  const [showAuditDrawer, setShowAuditDrawer] = useState(false)
  const [addMcpModalOpen, setAddMcpModalOpen] = useState(false)
  const [newMcpForm, setNewMcpForm] = useState({ id: '', name: '', url: '', description: '', headers: '' })

  const AUDIT_PAGE = 30

  const loadMcpData = useCallback(async () => {
    setMcpLoading(true)
    try {
      let cat: Connector[] | { connectors?: Connector[] } | null = null
      let aud: AuditEntry[] | { entries?: AuditEntry[] } = []
      let conns: Record<string, unknown> = {}
      if (window.api?.listCapabilities) {
        // capabilities:list mengembalikan ARRAY connector (bukan {connectors}).
        cat = (await window.api.listCapabilities().catch(() => null)) as Connector[] | null
      }
      if (window.api?.listCapabilityConnections) {
        conns = (await window.api.listCapabilityConnections().catch(() => ({}))) as Record<string, unknown>
      }
      if (window.api?.readCapabilityAudit) {
        aud = (await window.api.readCapabilityAudit(AUDIT_PAGE, 0).catch(() => [])) as AuditEntry[]
      }

      let customMcp: Connector[] = []
      try {
        customMcp = JSON.parse(localStorage.getItem('abelink:custom_mcp') || '[]') as Connector[]
      } catch (_) {}

      // Daftarkan custom MCP ke sidecar (proses terpisah) agar authorize/
      // revoke mengenal id-nya; tanpa ini authorize selalu "tidak dikenal".
      if (customMcp.length > 0 && window.api?.registerCustomConnectors) {
        await window.api.registerCustomConnectors(customMcp).catch(() => [])
      }

      const builtin = Array.isArray(cat) ? cat : (cat as { connectors?: Connector[] } | null)?.connectors || []
      const combined: Connector[] = [
        ...PLANNED_MCP_CONNECTORS,
        ...builtin,
        ...customMcp.map((c) => ({ ...c, transport: 'mcp', custom: true }))
      ]
      // Custom MCP menang atas built-in dengan id sama (idempoten dgn sidecar).
      const unique = Array.from(new Map(combined.map((c) => [c.id, c])).values())

      setConnectors(unique)
      setConnections(conns || {})
      setAuditLogs(Array.isArray(aud) ? aud : (aud as { entries?: AuditEntry[] })?.entries || [])
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
        window.api?.listCapabilityConnections?.().catch(() => ({})) as Promise<Record<string, unknown>>,
        window.api?.readCapabilityAudit?.(AUDIT_PAGE, 0).catch(() => []) as Promise<AuditEntry[]>
      ])
      if (conns) setConnections(conns)
      setAuditLogs(Array.isArray(aud) ? aud : (aud as { entries?: AuditEntry[] })?.entries || [])
    } catch (e) {
      console.error('[CapabilitiesHub] Refresh connections error:', e)
    }
  }, [])

  const handleLoadMoreAudit = async () => {
    try {
      const more = (await window.api?.readCapabilityAudit?.(AUDIT_PAGE, auditLogs.length).catch(() => [])) as
        | AuditEntry[]
        | { entries?: AuditEntry[] }
        | undefined
      const list = Array.isArray(more) ? more : more?.entries || []
      if (list.length > 0) setAuditLogs((prev) => [...prev, ...list])
    } catch (e) {
      console.error('[CapabilitiesHub] Load more audit error:', e)
    }
  }

  const handleAuthorizeConnector = async (connectorId: string, scopes: string[]) => {
    setBusyConnectorKey(`${connectorId}:auth`)
    try {
      await window.api?.authorizeCapability?.(connectorId, scopes)
      await refreshCapabilityState()
    } catch (e) {
      alert(t(language, 'cap.mcpAuthFailed', (e instanceof Error ? e.message : String(e)) || e))
    } finally {
      setBusyConnectorKey(null)
    }
  }

  const handleRevokeConnector = async (connectorId: string) => {
    const res = await confirm({
      title: t(language, 'cap.mcpRevokeTitle'),
      message: t(language, 'cap.mcpRevokeMsg', connectorId),
      confirmText: t(language, 'cap.revoke'),
      isError: true
    })
    if (!res.isConfirmed) return

    setBusyConnectorKey(`${connectorId}:revoke`)
    try {
      await window.api?.revokeCapability?.(connectorId)
      await refreshCapabilityState()
    } catch (e) {
      alert(t(language, 'cap.mcpRevokeFailed', (e instanceof Error ? e.message : String(e)) || e))
    } finally {
      setBusyConnectorKey(null)
    }
  }

  const handleSaveNewMcp = () => {
    if (!newMcpForm.id.trim() || !newMcpForm.url.trim()) {
      alert(t(language, 'cap.mcpIdUrlRequired'))
      return
    }
    try {
      let parsedHeaders: Record<string, unknown> = {}
      if (newMcpForm.headers.trim()) {
        try {
          const parsed = JSON.parse(newMcpForm.headers)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('format')
          }
          parsedHeaders = parsed
        } catch (_) {
          alert(t(language, 'cap.mcpHeaderFormat'))
          return
        }
      }
      const current = JSON.parse(localStorage.getItem('abelink:custom_mcp') || '[]') as Connector[] as Connector[]
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
      alert(t(language, 'cap.mcpSaveFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  // ── Plugins State & Modal ─────────────────────────────────────────────────
  const [plugins, setPlugins] = useState<PluginRow[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(true)
  const [gitPluginUrl, setGitPluginUrl] = useState('')
  const [gitPluginLoading, setGitPluginLoading] = useState(false)
  const [editingPlugin, setEditingPlugin] = useState<{ mode: 'new' | 'edit'; originalName?: string } | null>(null)
  const [pluginForm, setPluginForm] = useState<{ name: string; description: string; actions: PluginAction[]; isEdit: boolean }>({
    name: '',
    description: '',
    actions: [{ name: 'run', description: '', triggerHint: '', code: 'return "ok";' }],
    isEdit: false
  })
  const [pluginSyntaxErrors, setPluginSyntaxErrors] = useState<(string | null)[]>([])

  const loadPlugins = useCallback(async () => {
    if (!window.api?.getPlugins) {
      setPluginsLoading(false)
      return
    }
    setPluginsLoading(true)
    try {
      const data = await window.api.getPlugins()
      setPlugins(Array.isArray(data) ? (data as PluginRow[]) : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Failed to load plugins:', e)
    } finally {
      setPluginsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!editingPlugin) return
    // Validasi sync dibungkus async agar lolos set-state-in-effect.
    void (async () => {
      const errors: (string | null)[] = []
      pluginForm.actions.forEach((act, idx) => {
        if (act.code) {
          try {
            // Compile-check sintaks SAJA — konstruktor tidak mengeksekusi body.
            // Kode connector user tidak pernah dijalankan di renderer.
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
            new AsyncFunction('query', act.code)
            errors[idx] = null
          } catch (err) {
            errors[idx] = (err instanceof Error ? err.message : String(err))
          }
        } else {
          errors[idx] = null
        }
      })
      setPluginSyntaxErrors(errors)
    })()
  }, [pluginForm.actions, editingPlugin])

  const handleInstallGitPlugin = async () => {
    const url = gitPluginUrl.trim()
    if (!url) {
      alert(t(language, 'cap.gitUrlRequired'))
      return
    }
    setGitPluginLoading(true)
    try {
      if (window.api?.installPluginFromGit) {
        const res = (await window.api.installPluginFromGit(url)) as {
          success?: boolean
          error?: string
        } | null
        if (res?.success) {
          setGitPluginUrl('')
          await loadPlugins()
        } else {
          alert(t(language, 'cap.pluginInstallFailed', res?.error || t(language, 'cap.pluginRepoError')))
        }
      } else {
        alert(t(language, 'cap.gitInstallUnsupported'))
      }
    } catch (e) {
      alert(t(language, 'cap.pluginDownloadFailed', (e instanceof Error ? e.message : String(e)) || e))
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
          description: 'Main plugin function',
          triggerHint: 'when the user asks for ...',
          code: `// query holds user arguments\nreturn "Plugin execution result";`
        }
      ],
      isEdit: false
    })
    setEditingPlugin({ mode: 'new' })
  }

  const handleOpenEditPluginModal = (plugin: PluginRow) => {
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
      alert(t(language, 'cap.pluginNameRequired'))
      return
    }
    if (pluginSyntaxErrors.some(Boolean)) {
      alert(t(language, 'cap.pluginSyntaxFix'))
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
      alert(t(language, 'cap.pluginSaveFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  const handleDeletePlugin = async (name: string) => {
    const res = await confirm({
      title: t(language, 'cap.pluginDeleteTitle'),
      message: t(language, 'cap.pluginDeleteMsg', name),
      confirmText: t(language, 'cap.pluginDeleteYes'),
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.deletePlugin?.(name)
      await loadPlugins()
    } catch (e) {
      alert(t(language, 'cap.pluginDeleteFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  const handleTogglePlugin = async (name: string, currentStatus: boolean) => {
    try {
      await window.api?.togglePlugin?.(name, !currentStatus)
      await loadPlugins()
    } catch (e) {
      alert(t(language, 'cap.pluginToggleFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  // ── Skills State & Modal ──────────────────────────────────────────────────
  const [skills, setSkills] = useState<Array<{ name: string; description?: string }>>([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const [editingSkill, setEditingSkill] = useState<{ isNew: boolean; originalName?: string } | null>(null)
  const [skillFormName, setSkillFormName] = useState('')
  const [skillFormContent, setSkillFormContent] = useState('')

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const list = await getCachedSkills({ force: true })
      setSkills(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Failed to load skills:', e)
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const handleOpenNewSkill = () => {
    const defaultTemplate = `---
name: new-skill
description: ${t(language, 'cap.skillTemplateDesc')}
---

${t(language, 'cap.skillTemplateTitle')}

${t(language, 'cap.skillTemplateBody')}
1. ${t(language, 'cap.skillTemplateStep1')}
2. ${t(language, 'cap.skillTemplateStep2')}

## ${t(language, 'cap.skillTemplateRules')}
- ${t(language, 'cap.skillTemplateRule1')}
`
    setSkillFormName('')
    setSkillFormContent(defaultTemplate)
    setEditingSkill({ isNew: true })
  }

  const handleOpenEditSkill = async (skillName: string) => {
    try {
      const raw = (await window.api?.readSkill?.(skillName)) || ''
      const content = typeof raw === 'string' ? raw : String((raw as { content?: unknown })?.content ?? '')
      setSkillFormName(skillName)
      setSkillFormContent(content)
      setEditingSkill({ isNew: false, originalName: skillName })
    } catch (e) {
      alert(t(language, 'cap.skillReadFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  const handleSaveSkill = async () => {
    const rawName = skillFormName.trim().replace(/\s+/g, '-').toLowerCase()
    if (!rawName) {
      alert(t(language, 'cap.skillNameRequired'))
      return
    }
    try {
      await window.api?.saveSkill?.(rawName, skillFormContent)
      setEditingSkill(null)
      await loadSkills()
    } catch (e) {
      alert(t(language, 'cap.skillSaveFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  const handleDeleteSkill = async (skillName: string) => {
    const res = await confirm({
      title: t(language, 'cap.skillDeleteTitle'),
      message: t(language, 'cap.skillDeleteMsg', skillName),
      confirmText: t(language, 'cap.skillDeleteYes'),
      isError: true
    })
    if (!res.isConfirmed) return

    try {
      await window.api?.deleteSkill?.(skillName)
      await loadSkills()
    } catch (e) {
      alert(t(language, 'cap.skillDeleteFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  const handleInstallSkillPackage = async () => {
    try {
      const dlg = await window.api?.showOpenDialog?.()
      const filePaths = dlg?.filePaths ?? []
      if (filePaths.length > 0) {
        for (const p of filePaths) {
          await window.api?.installSkill?.(p)
        }
        await loadSkills()
      }
    } catch (e) {
      alert(t(language, 'cap.skillInstallFailed', (e instanceof Error ? e.message : String(e)) || e))
    }
  }

  // ── Approval Policies State ───────────────────────────────────────────────
  const [approvalPolicies, setApprovalPolicies] = useState<ApprovalPolicyRow[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)

  const loadApprovalPolicies = useCallback(async () => {
    if (!window.api?.approvalPolicyGet) {
      setPoliciesLoading(false)
      return
    }
    setPoliciesLoading(true)
    try {
      const list = await window.api.approvalPolicyGet()
      setApprovalPolicies(Array.isArray(list) ? (list as ApprovalPolicyRow[]) : [])
    } catch (e) {
      console.error('[CapabilitiesHub] Failed to load policies:', e)
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  // ── Initial Mount ─────────────────────────────────────────────────────────
  // Mount-load dibungkus async agar lolos set-state-in-effect.
  useEffect(() => {
    void (async () => {
      await checkGoogleStatus()
      await checkBrowserStatus()
      await loadMcpData()
      await loadPlugins()
      await loadSkills()
      await loadApprovalPolicies()
    })()
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

      {/* ── Sub-Nav Tabs (Clean Floating Pills ala Claude.ai) ── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-base-200/50 border border-white/5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setActiveTab('connectors')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'connectors' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <Plug size={12} />
          <span>{t(language, 'cap.tabConnectors')}</span>
          <span className="badge badge-xs badge-neutral opacity-80">
            {connectors.length + (googleConnected ? 3 : 0) + 1}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('plugins')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'plugins' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <Boxes size={12} />
          <span>{t(language, 'cap.tabPlugins')}</span>
          {plugins.length > 0 && (
            <span className="badge badge-xs badge-neutral opacity-80">{plugins.length}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'skills' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <Brain size={12} />
          <span>{t(language, 'cap.tabSkills')}</span>
          <span className="badge badge-xs badge-neutral opacity-80">
            {BUILTIN_SKILLS.length + skills.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${activeTab === 'security' ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
        >
          <Shield size={12} />
          <span>{t(language, 'cap.security')}</span>
        </button>
      </div>

      {/* ── TAB 1: CONNECTORS ── */}
      {activeTab === 'connectors' && (
        <div className="space-y-4">
          {/* Card: Browser Companion Bridge */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white/90">{t(language, 'cap.browseUse')}</span>
                {browserConnected === true ? (
                  <span className="badge badge-xs badge-success gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t(language, 'cap.connected')}
                  </span>
                ) : browserConnected === false ? (
                  <span className="badge badge-xs badge-ghost border-white/10 opacity-70 text-[10px]">{t(language, 'cap.disconnected')}</span>
                ) : null}
              </div>
              <p className="text-xs text-white/50">
                {t(language, 'cap.controlChrome')}
              </p>
              {browserNote ? (
                <p className="text-[11px] text-white/50">{browserNote}</p>
              ) : null}
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
                  <span>{t(language, 'cap.autoCloseTabs')}</span>
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
                  <span>{t(language, 'cap.autoLaunchBrowser')}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={handleBrowserReconnect}
                disabled={browserReconnecting}
                className="btn btn-xs btn-primary rounded-xl gap-1"
                title={t(language, 'cap.reconnectTitle')}
              >
                <RefreshCw size={10} className={browserReconnecting ? 'animate-spin' : ''} />
                <span>{browserReconnecting ? t(language, 'cap.reconnecting') : t(language, 'cap.reconnect')}</span>
              </button>
              <button
                type="button"
                onClick={handleInitExtension}
                className="btn btn-xs btn-outline border-white/10 hover:border-primary/50 text-white/80 rounded-xl"
              >
                {t(language, 'cap.installGuide')}
              </button>
              {extInstall?.dir && (
                <button
                  type="button"
                  onClick={() => {
                    if (extInstall?.dir) void window.api?.openFolder?.(extInstall.dir)
                  }}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                  title={t(language, 'cap.openExtFolderTitle')}
                >
                  <FolderOpen size={11} />
                  <span>{t(language, 'cap.openFolder')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Card: Google Workspace */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">{t(language, 'cap.googleWorkspace')}</span>
                  {googleConnected ? (
                    <span className="badge badge-xs badge-info gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t(language, 'cap.connected')}
                    </span>
                  ) : (
                    <span className="badge badge-xs badge-ghost border-white/10 opacity-70 text-[10px]">{t(language, 'cap.offline')}</span>
                    )}
                  </div>
                <p className="text-xs text-white/50">
                  {t(language, 'cap.googleSyncDesc')}
                </p>
              </div>

              <div>
                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    className="btn btn-xs btn-outline border-error/40 text-error hover:bg-error/10 rounded-xl gap-1"
                  >
                    <Unlock size={10} />
                    <span>{t(language, 'cap.disconnect')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGoogleModalOpen(true)}
                    className="btn btn-xs btn-primary rounded-xl gap-1"
                  >
                    <Lock size={10} />
                    <span>{t(language, 'cap.connect')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Clean service status row */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { name: 'Calendar', icon: Calendar, color: 'text-blue-400' },
                { name: 'Drive', icon: HardDrive, color: 'text-amber-400' },
                { name: 'Gmail', icon: Mail, color: 'text-red-400' }
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
                  <span className="text-sm font-semibold text-white/90">{t(language, 'cap.mcpConnectors')}</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{filteredConnectors.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t(language, 'cap.searchConnectors')}
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                    className="input input-xs input-bordered rounded-xl pl-7 pr-3 bg-base-100/60 border-white/10 text-xs w-40 focus:w-48 transition-all"
                  />
                  <Search className="absolute left-2.5 top-2 text-white/30" size={10} />
                </div>
                <button
                  type="button"
                  onClick={() => setAddMcpModalOpen(true)}
                  className="btn btn-xs btn-primary rounded-xl gap-1"
                >
                  <Plus size={9} />
                  <span>{t(language, 'cap.addMcp')}</span>
                </button>
                <button
                  type="button"
                  onClick={loadMcpData}
                  disabled={mcpLoading}
                  className="btn btn-xs btn-ghost border border-white/10 hover:bg-white/5 rounded-xl"
                  title={t(language, 'cap.refreshTitle')}
                >
                  <RefreshCw size={10} className={mcpLoading ? 'animate-spin text-primary' : ''} />
                </button>
              </div>
            </div>

            {mcpLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                {t(language, 'cap.loadingMcp')}
              </div>
            ) : filteredConnectors.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                {t(language, 'cap.noMcpMatch')}
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
                            <span className="badge badge-xs badge-info text-[9px]" title={t(language, 'cap.mcpCustomNote')}>MCP</span>
                          )}
                          {isConnected ? (
                            <span className="badge badge-xs badge-info text-[9px]">{t(language, 'cap.connected')}</span>
                          ) : (
                            <span className="badge badge-xs badge-ghost border-white/10 text-[9px] opacity-60">{t(language, 'cap.offline')}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/50 truncate max-w-xl">
                          {(c.id === 'context7' ? t(language, 'cap.context7Desc') : c.description) || c.url || t(language, 'cap.noDesc')}
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
                            {t(language, 'cap.revoke')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAuthorizeConnector(c.id, c.scopes || [])}
                            className="btn btn-xs btn-ghost border border-white/10 hover:border-primary/40 text-white/80 rounded-xl"
                          >
                            {t(language, 'cap.authorize')}
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
                  <History size={11} className="text-info" />
                  <span>{t(language, 'cap.auditHistory')}</span>
                  <span className="badge badge-xs badge-neutral text-[9px]">{auditLogs.length}</span>
                </span>
                {showAuditDrawer ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>

              {showAuditDrawer && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {auditLogs.length === 0 ? (
                    <p className="text-[11px] text-white/40 italic py-1">{t(language, 'cap.noAudit')}</p>
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
                            {log.ts ? new Date(log.ts).toLocaleTimeString(localeTag(language), { hour: '2-digit', minute: '2-digit' }) : (log.timestamp ? new Date(log.timestamp).toLocaleTimeString(localeTag(language), { hour: '2-digit', minute: '2-digit' }) : '-')}
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleLoadMoreAudit}
                        className="w-full py-1 text-[11px] text-white/50 hover:text-white/80 transition-colors"
                      >
                        {t(language, 'cap.loadMore')}
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
              <span className="text-sm font-semibold text-white/90">{t(language, 'cap.builtinAutomations')}</span>
              <span className="badge badge-xs badge-neutral opacity-80">{t(language, 'cap.activeCount', 4)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {/* Awareness */}
              <div className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.awareness')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.awarenessDesc')}</p>
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
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.compaction')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.compactionDesc')}</p>
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
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.caveman')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.cavemanDesc')}</p>
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
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.ponytail')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.ponytailDesc')}</p>
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
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.internetFirst')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.internetFirstDesc')}</p>
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
                  <div className="text-xs font-semibold text-white/90">{t(language, 'cap.rtk')}</div>
                  <p className="text-[11px] text-white/50 truncate">{t(language, 'cap.rtkDesc')}</p>
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
                  <span className="text-sm font-semibold text-white/90">{t(language, 'cap.customPlugins')}</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{plugins.length}</span>
                </div>
                <p className="text-xs text-white/50">
                  {t(language, 'cap.customPluginsDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openPluginFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                >
                  <FolderOpen size={11} />
                  <span>{t(language, 'cap.openFolder')}</span>
                </button>
                {isDevMode && (
                  <button
                    type="button"
                    onClick={handleOpenNewPluginModal}
                    className="btn btn-xs btn-primary rounded-xl gap-1"
                  >
                    <Code size={10} />
                    <span>{t(language, 'cap.writeCode')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Compact GitHub Installer */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={t(language, 'cap.gitPlaceholder')}
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
                {gitPluginLoading ? t(language, 'cap.downloading') : t(language, 'cap.installBtn')}
              </button>
            </div>

            {pluginsLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                {t(language, 'cap.loadingPlugins')}
              </div>
            ) : plugins.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                {t(language, 'cap.noPlugins')}
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
                          <span className="badge badge-xs badge-neutral text-[9px]">{t(language, 'cap.actionsCount', p.actions?.length || 0)}</span>
                          <span className={`badge badge-xs text-[9px] ${isEnabled ? 'badge-info' : 'badge-ghost opacity-50'}`}>
                            {isEnabled ? t(language, 'cap.enabled') : t(language, 'cap.disabled')}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 truncate">
                          {p.description || t(language, 'cap.noDesc')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePlugin(p.name, isEnabled)}
                          className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl text-[11px]"
                        >
                          {isEnabled ? t(language, 'cap.disable') : t(language, 'cap.enable')}
                        </button>
                        {isDevMode && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditPluginModal(p)}
                            className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                            title={t(language, 'cap.editPluginTitle')}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePlugin(p.name)}
                          className="btn btn-xs btn-ghost border border-white/10 text-error hover:bg-error/10 rounded-xl"
                          title={t(language, 'cap.deletePluginTitle')}
                        >
                          <Trash2 size={11} />
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
              <span className="text-sm font-semibold text-white/90">{t(language, 'cap.builtinSuperpowers')}</span>
              <span className="badge badge-xs badge-neutral opacity-80">{t(language, 'cap.patternsCount', 4)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {BUILTIN_SKILLS.map((skill) => {
                const SkillIcon = skill.icon
                const isSkillActive = config?.builtinSkills?.[skill.id] !== false
                const skillKeys = BUILTIN_SKILL_KEYS[skill.id] || []
                const skillName = skillKeys[0] ? t(language, skillKeys[0]) : skill.name
                const skillDesc = skillKeys[1] ? t(language, skillKeys[1]) : skill.desc
                return (
                  <div
                    key={skill.id}
                    className="p-3 rounded-xl bg-base-100/40 border border-white/5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SkillIcon className="text-primary shrink-0" size={13} />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-white/90 truncate">{skillName}</div>
                        <p className="text-[11px] text-white/50 truncate">{skillDesc}</p>
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
                  <span className="text-sm font-semibold text-white/90">{t(language, 'cap.customSkills')}</span>
                  <span className="badge badge-xs badge-neutral opacity-80">{skills.length}</span>
                </div>
                <p className="text-xs text-white/50">
                  {t(language, 'cap.customSkillsDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.api?.openSkillsFolder?.()}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl gap-1.5"
                >
                  <FolderOpen size={11} />
                  <span>{t(language, 'cap.openFolder')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleInstallSkillPackage}
                  className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                  title={t(language, 'cap.importArchiveTitle')}
                >
                  <span>{t(language, 'cap.importArchive')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSkill}
                  className="btn btn-xs btn-primary rounded-xl gap-1"
                >
                  <Plus size={9} />
                  <span>{t(language, 'cap.newSkill')}</span>
                </button>
              </div>
            </div>

            {skillsLoading ? (
              <div className="p-6 text-center text-white/40 text-xs flex flex-col items-center gap-2">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                {t(language, 'cap.loadingSkills')}
              </div>
            ) : skills.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-base-100/30 border border-dashed border-white/10 text-xs text-white/50">
                {t(language, 'cap.noSkills')}
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
                        {s.description || t(language, 'cap.noDesc')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSkill(s.name)}
                        className="btn btn-xs btn-ghost border border-white/10 text-white/70 rounded-xl"
                        title={t(language, 'cap.editSkillTitle')}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(s.name)}
                        className="btn btn-xs btn-ghost border border-white/10 text-error hover:bg-error/10 rounded-xl"
                        title={t(language, 'cap.deleteSkillTitle')}
                      >
                        <Trash2 size={11} />
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
                <span className="text-xs font-semibold text-info">{t(language, 'cap.tier1')}</span>
                <span className="badge badge-xs badge-info text-[9px]">{t(language, 'cap.auto')}</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                {t(language, 'cap.tier1Desc')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-base-200/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-info">{t(language, 'cap.tier2')}</span>
                <span className="badge badge-xs badge-info text-[9px]">{t(language, 'cap.perSession')}</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                {t(language, 'cap.tier2Desc')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-base-200/40 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-error">{t(language, 'cap.tier3')}</span>
                <span className="badge badge-xs badge-error text-[9px]">{t(language, 'cap.nativeRfd')}</span>
              </div>
              <p className="text-[11px] text-white/50 leading-relaxed">
                {t(language, 'cap.tier3Desc')}
              </p>
            </div>
          </div>

          {/* Granular Policies */}
          <div className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-white/90">{t(language, 'cap.granularPolicies')}</span>
                <p className="text-xs text-white/50">
                  {t(language, 'cap.granularDesc')}
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
                {t(language, 'cap.resetSession')}
              </button>
            </div>

            {policiesLoading ? (
              <div className="p-6 text-center text-white/40 text-xs">{t(language, 'cap.loadingPolicies')}</div>
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
                      <option value="ask">{t(language, 'cap.askEach')}</option>
                      <option value="session">{t(language, 'cap.oncePerSession')}</option>
                      <option value="always">{t(language, 'cap.alwaysAllow')}</option>
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
                <Plug className="text-primary" size={13} />
                {t(language, 'cap.extGuideTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-white/70">
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                <span className="text-[11px] text-white/40 block">{t(language, 'cap.extFolderLabel')}</span>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[10px] text-primary truncate">
                    {extInstall?.dir || t(language, 'cap.extFolderChecking')}
                  </code>
                  {extInstall?.dir && (
                    <button
                      type="button"
                      onClick={() => {
                        if (extInstall?.dir) void navigator.clipboard?.writeText(extInstall.dir)
                        setCopiedPath(true)
                        setTimeout(() => setCopiedPath(false), 2000)
                      }}
                      className="btn btn-xs btn-ghost border border-white/10 rounded-lg shrink-0"
                      title={t(language, 'cap.copyPathTitle')}
                    >
                      {copiedPath ? <CheckCircle2 size={10} className="text-info" /> : <Copy size={10} />}
                    </button>
                  )}
                </div>
              </div>

              <p className="font-medium text-white/90">{t(language, 'cap.extStepsTitle')}</p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-white/70">
                <li>{t(language, 'cap.extStep1a')} <code className="font-mono text-primary px-1 py-0.5 rounded bg-black/40">chrome://extensions</code> {t(language, 'cap.extStep1b')}</li>
                <li>{t(language, 'cap.extStep2a')} <b>Developer mode</b> {t(language, 'cap.extStep2b')}</li>
                <li>{t(language, 'cap.extStep3a')} <b>Load unpacked</b> {t(language, 'cap.extStep3b')}</li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              {extInstall?.dir && (
                <button
                  type="button"
                  onClick={() => {
                    if (extInstall?.dir) void window.api?.openFolder?.(extInstall.dir)
                  }}
                  className="btn btn-sm btn-ghost rounded-xl gap-1.5"
                >
                  <FolderOpen size={11} />
                  <span>{t(language, 'cap.openInFileManager')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExtGuideOpen(false)}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {t(language, 'cap.done')}
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
                <Plug className="text-primary" size={13} />
                {t(language, 'cap.addCustomMcp')}
              </h3>
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-white/70">{t(language, 'cap.mcpIdLabel')}</label>
                <input
                  type="text"
                  placeholder={t(language, 'cap.mcpIdPh')}
                  value={newMcpForm.id}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, id: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">{t(language, 'cap.mcpNameLabel')}</label>
                <input
                  type="text"
                  placeholder={t(language, 'cap.mcpNamePh')}
                  value={newMcpForm.name}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, name: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">{t(language, 'cap.mcpUrlLabel')}</label>
                <input
                  type="text"
                  placeholder={t(language, 'cap.mcpUrlPh')}
                  value={newMcpForm.url}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, url: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">{t(language, 'cap.mcpDescLabel')}</label>
                <input
                  type="text"
                  placeholder={t(language, 'cap.mcpDescPh')}
                  value={newMcpForm.description}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, description: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-white/70">{t(language, 'cap.mcpHeadersLabel')}</label>
                <input
                  type="text"
                  placeholder={t(language, 'cap.mcpHeadersPh')}
                  value={newMcpForm.headers}
                  onChange={(e) => setNewMcpForm({ ...newMcpForm, headers: e.target.value })}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
                <p className="text-[10px] text-white/40">{t(language, 'cap.mcpHeadersNote')}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => setAddMcpModalOpen(false)}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                {t(language, 'cap.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveNewMcp}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {t(language, 'cap.saveConnector')}
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
                <Lock className="text-primary" size={13} />
                {t(language, 'cap.connectGoogleTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setGoogleModalOpen(false)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-white/60 leading-relaxed">
                {t(language, 'cap.googleOAuthDesc')}
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
                {t(language, 'cap.cancel')}
              </button>
              <button
                type="button"
                disabled={googleLoading}
                onClick={handleGoogleConnect}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {googleLoading ? t(language, 'cap.connecting') : t(language, 'cap.authorizeAccount')}
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
                <Boxes className="text-primary" size={16} />
                <h3 className="text-base font-bold text-white/90">
                  {editingPlugin.mode === 'new' ? t(language, 'cap.newPlugin') : t(language, 'cap.editPlugin', pluginForm.name)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlugin(null)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">{t(language, 'cap.pluginName')}</label>
                  <input
                    type="text"
                    disabled={editingPlugin.mode === 'edit'}
                    placeholder={t(language, 'cap.pluginNamePh')}
                    value={pluginForm.name}
                    onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })}
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">{t(language, 'cap.pluginDesc')}</label>
                  <input
                    type="text"
                    placeholder={t(language, 'cap.pluginDescPh')}
                    value={pluginForm.description}
                    onChange={(e) => setPluginForm({ ...pluginForm, description: e.target.value })}
                    className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">{t(language, 'cap.actionsAndCode')}</span>
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
                    <Plus size={9} /> {t(language, 'cap.addAction')}
                  </button>
                </div>

                {pluginForm.actions.map((act, index) => (
                  <div key={index} className="p-3 rounded-2xl bg-base-200/60 border border-white/5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={t(language, 'cap.actionNamePh')}
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
                        placeholder={t(language, 'cap.triggerHintPh')}
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
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>

                    <div className="rounded-xl overflow-hidden border border-white/10">
                      <textarea
                        rows={6}
                        spellCheck={false}
                        placeholder={t(language, 'cap.actionCodePh')}
                        value={act.code}
                        onChange={(e) => {
                          const updated = [...pluginForm.actions]
                          updated[index].code = e.target.value
                          setPluginForm({ ...pluginForm, actions: updated })
                        }}
                        className="textarea textarea-bordered w-full font-mono text-xs bg-base-200 border-white/10 min-h-[140px]"
                      />
                    </div>

                    {pluginSyntaxErrors[index] && (
                      <p className="text-xs text-error font-mono flex items-center gap-1.5">
                        <AlertTriangle size={11} />
                        {t(language, 'cap.syntaxError', pluginSyntaxErrors[index])}
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
                {t(language, 'cap.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSavePlugin}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {t(language, 'cap.savePlugin')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: EDIT/CREATE SKILL ── */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] bg-base-300 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="text-primary" size={16} />
                <h3 className="text-base font-bold text-white/90">
                  {editingSkill.isNew ? t(language, 'cap.newSkillTitle') : t(language, 'cap.editSkill', skillFormName)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
                className="btn btn-xs btn-circle btn-ghost text-white/60 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">{t(language, 'cap.skillNameLabel')}</label>
                <input
                  type="text"
                  disabled={!editingSkill.isNew}
                  placeholder={t(language, 'cap.skillNamePh')}
                  value={skillFormName}
                  onChange={(e) => setSkillFormName(e.target.value)}
                  className="input input-sm input-bordered w-full rounded-xl bg-base-200 border-white/10 font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">{t(language, 'cap.skillFileLabel')}</label>
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <textarea
                    rows={14}
                    spellCheck={false}
                    placeholder="# SKILL.md"
                    value={skillFormContent}
                    onChange={(e) => setSkillFormContent(e.target.value)}
                    className="textarea textarea-bordered w-full font-mono text-xs bg-base-200 border-white/10 min-h-[320px]"
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
                {t(language, 'cap.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveSkill}
                className="btn btn-sm btn-primary rounded-xl"
              >
                {t(language, 'cap.saveSkill')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
