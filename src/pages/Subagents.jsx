import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  ArrowLeft,
  Plus,
  Trash2,
  Cpu,
  Activity,
  CheckCircle,
  X,
  Radio,
  Layers
} from 'lucide-react'
import SubagentIntercom from '../components/subagent/SubagentIntercom'
import SubagentTopologyMap from '../components/subagent/SubagentTopologyMap'
import { runSubagentTurn } from '../api/subagent/subagentExecutor'
import { subagentStore } from '../api/subagent/subagentStore'
import { useConfirm } from '../hooks/useConfirm'

export default function Subagents() {
  const navigate = useNavigate()
  const [selectedSubagentId, setSelectedSubagentId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [subagents, setSubagents] = useState([])
  const [viewMode, setViewMode] = useState('topology') // 'topology' | 'intercom'

  // Modal State untuk Spawn Manual
  const [isSpawnModalOpen, setIsSpawnModalOpen] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('')
  const [newAgentGoal, setNewAgentGoal] = useState('')
  const [isSpawning, setIsSpawning] = useState(false)

  const loadSubagents = async () => {
    try {
      const list = await subagentStore.listSubagents(filterStatus)
      setSubagents(list || [])
      if (!selectedSubagentId && list && list.length > 0) {
        setSelectedSubagentId(list[0].id)
      }
    } catch (err) {
      console.error('[Subagents] Load error:', err)
    }
  }

  useEffect(() => {
    loadSubagents()
    const interval = setInterval(loadSubagents, 1200)
    return () => clearInterval(interval)
  }, [filterStatus, selectedSubagentId])

  const activeCount = subagents?.filter((s) => s.status === 'running').length || 0

  const handleSendMessageFromTopology = async (id, messageText) => {
    try {
      await runSubagentTurn(id, messageText)
      await loadSubagents()
    } catch (err) {
      console.error('[Topology] Send error:', err)
    }
  }

  const handleSpawnManual = async (e) => {
    e.preventDefault()
    if (!newAgentName.trim() || !newAgentGoal.trim() || isSpawning) return

    setIsSpawning(true)
    try {
      const sub = await subagentStore.createSubagent({
        name: newAgentName.trim(),
        role: newAgentRole.trim() || 'Technical Specialist',
        goal: newAgentGoal.trim(),
        status: 'running'
      })

      // Jalankan initial turn
      runSubagentTurn(sub.id, newAgentGoal.trim()).catch((err) => {
        console.error('[Subagent Spawn Error]', err)
      })

      setSelectedSubagentId(sub.id)
      setIsSpawnModalOpen(false)
      setNewAgentName('')
      setNewAgentRole('')
      setNewAgentGoal('')
      await loadSubagents()
    } catch (err) {
      console.error('[Spawn Subagent Failed]', err)
    } finally {
      setIsSpawning(false)
    }
  }

  const { confirm, ModalComponent } = useConfirm()

  const handleDeleteSubagent = async (id, e) => {
    e.stopPropagation()
    const result = await confirm({
      title: 'Hapus Sub-Agent',
      message: 'Apakah kamu yakin ingin menghapus sub-agent ini beserta riwayatnya?',
      isError: true,
      confirmText: 'Hapus',
      cancelText: 'Batal'
    })
    if (result?.isConfirmed) {
      await subagentStore.deleteSubagent(id)
      if (selectedSubagentId === id) {
        setSelectedSubagentId(null)
      }
      await loadSubagents()
    }
  }

  return (
    <div className="h-screen bg-[#080B09] text-zinc-200 overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.04),transparent_40%)] pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-hidden flex flex-col">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-5 w-full flex-1 flex flex-col overflow-hidden">
          {/* Page Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali ke Dashboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.1em"
                  height="1.1em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-semibold text-white tracking-tight">Sub-Agents</h1>
                  <span className="text-[11px] text-zinc-500 font-mono tracking-wide">/ Mission Control</span>
                  {activeCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      {activeCount} active
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Orkestrasi dan pantau agen otonom yang bekerja secara paralel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* View Mode Toggle: Topologi vs Intercom */}
              <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/[0.08] font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('topology')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'topology'
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  title="Tampilan Topologi Visual"
                >
                  <Activity className="w-3.5 h-3.5" /> Topologi
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('intercom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'intercom'
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' }}
                  title="Tampilan Intercom Feed"
                >
                  <Bot className="w-3.5 h-3.5" /> Intercom
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSpawnModalOpen(true)}
                className="btn btn-sm rounded-xl gap-1.5 px-3.5 font-medium bg-cyan-500 text-black hover:bg-cyan-400 border-none shadow-sm shadow-cyan-500/20 transition-all text-xs"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <Plus className="w-3.5 h-3.5" /> New Agent
              </button>
            </div>
          </div>

          {/* Main Workspace Area */}
          <div className="flex-1 flex overflow-hidden rounded-3xl bg-black/40 border border-white/[0.08] p-3.5 gap-3.5 backdrop-blur-xl shadow-2xl">
            {viewMode === 'topology' ? (
              <SubagentTopologyMap
                subagents={subagents}
                selectedId={selectedSubagentId}
                onSelectAgent={setSelectedSubagentId}
                onOpenIntercom={(id) => {
                  setSelectedSubagentId(id)
                  setViewMode('intercom')
                }}
                onSendMessage={handleSendMessageFromTopology}
              />
            ) : (
              <>
                {/* Left Panel: Clean Agent List */}
                <div className="w-72 flex flex-col bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden flex-none">
                  {/* Filter Tabs */}
                  <div className="p-2 border-b border-white/[0.06]">
                    <div className="flex gap-1 p-0.5 bg-black/40 rounded-xl w-full border border-white/[0.05]">
                      <button
                        type="button"
                        onClick={() => setFilterStatus('all')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'all'
                            ? 'bg-white/[0.08] text-white shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('running')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'running'
                            ? 'bg-cyan-500/20 text-cyan-300 shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Running
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('idle')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'idle'
                            ? 'bg-white/[0.08] text-zinc-300 shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Idle
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('completed')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300 shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Selesai
                      </button>
                    </div>
                  </div>

                  {/* List Body */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {!subagents || subagents.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2">
                        <Layers className="w-6 h-6 stroke-[1.5] text-zinc-600" />
                        <p className="text-xs">Belum ada sub-agent aktif.</p>
                      </div>
                    ) : (
                      subagents.map((agent) => {
                        const isSelected = agent.id === selectedSubagentId
                        const isRunning = agent.status === 'running'
                        const isIdle = agent.status === 'idle'
                        return (
                          <div
                            key={agent.id}
                            onClick={() => setSelectedSubagentId(agent.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                              isSelected
                                ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.08)]'
                                : 'bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1] hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full flex-none ${
                                    isRunning
                                      ? 'bg-cyan-400 animate-pulse'
                                      : isIdle
                                        ? 'bg-cyan-600/70'
                                        : agent.status === 'completed'
                                          ? 'bg-emerald-400'
                                          : agent.status === 'failed' || agent.status === 'killed'
                                            ? 'bg-rose-400'
                                            : 'bg-zinc-600'
                                  }`}
                                />
                                <span className="font-semibold text-xs truncate text-zinc-200">{agent.name}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteSubagent(agent.id, e)}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-all p-0.5"
                                title="Hapus Agent"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <p className="text-[11px] text-zinc-400 truncate pl-4 mb-2">
                              {agent.role || 'Specialist'}
                            </p>

                            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pl-4">
                              <span>Langkah: {agent.turnCount || 0}</span>
                              <span>
                                {new Date(agent.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Intercom Conversation */}
                <div className="flex-1 flex flex-col bg-white/[0.01] rounded-2xl border border-white/[0.06] overflow-hidden">
                  {selectedSubagentId ? (
                    <SubagentIntercom
                      subagentId={selectedSubagentId}
                      onClose={() => setSelectedSubagentId(null)}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3 p-8 text-center">
                      <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
                        <Bot className="w-8 h-8 stroke-[1.5] text-zinc-400" />
                      </div>
                      <p className="text-xs font-medium text-zinc-400">
                        Pilih sub-agent di panel kiri untuk memantau eksekusi live.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal Spawn Agent */}
      {isSpawnModalOpen && (
        <div className="modal modal-open bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1311] border border-white/[0.1] rounded-2xl max-w-md w-full shadow-2xl p-5 text-zinc-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-white">
                <Cpu className="w-4 h-4 text-cyan-400" /> Spawn Sub-Agent Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsSpawnModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSpawnManual} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-400">Nama Agen</label>
                <input
                  type="text"
                  placeholder="misal: Code-Refactorer / Web-Researcher"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] focus:border-cyan-500/50 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-400">Role / Spesialisasi</label>
                <input
                  type="text"
                  placeholder="misal: Frontend Developer / Security Researcher"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] focus:border-cyan-500/50 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-400">Tujuan & Instruksi Misi</label>
                <textarea
                  placeholder="Deskripsikan instruksi teknis yang harus diselesaikan sub-agent..."
                  value={newAgentGoal}
                  onChange={(e) => setNewAgentGoal(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/[0.1] focus:border-cyan-500/50 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-600 h-24 resize-none"
                  required
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSpawnModalOpen(false)}
                  disabled={isSpawning}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newAgentName.trim() || !newAgentGoal.trim() || isSpawning}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50 text-xs font-medium shadow-sm shadow-cyan-500/20 transition-all flex items-center gap-1.5"
                >
                  {isSpawning ? <span className="loading loading-spinner loading-xs" /> : 'Mulai Eksekusi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ModalComponent />
    </div>
  )
}
