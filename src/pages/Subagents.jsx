import React, { useState, useEffect } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Cpu,
  Activity,
  X,
  Layers
} from 'lucide-react'
import SubagentIntercom from '../components/subagent/SubagentIntercom'
import SubagentTopologyMap from '../components/subagent/SubagentTopologyMap'
import { runSubagentTurn } from '../api/subagent/subagentExecutor'
import { subagentStore } from '../api/subagent/subagentStore'
import { MobiusLoader } from '../components/core/MobiusLoader'
import { useConfirm } from '../hooks/useConfirm'

export default function Subagents() {
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
    const interval = setInterval(loadSubagents, 2000)
    return () => clearInterval(interval)
  }, [filterStatus])

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
      title: 'Hapus Sub-Agent?',
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
    <div className="h-screen bg-[#161618] text-white overflow-hidden relative select-none">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(10,132,255,0.06),transparent_60%)] pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-hidden flex flex-col">
        {/* Page Header with Safe Area Gutter */}
        <div className="h-14 pl-16 pr-28 border-b border-white/10 flex items-center justify-between bg-[#1c1c1e]/80 backdrop-blur-xl shrink-0 z-30 select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-sm font-semibold text-white tracking-wide">Sub-Agents</h1>
              <span className="text-xs text-white/40 font-mono tracking-wide">/ Mission Control</span>
              {activeCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#0a84ff]/15 text-[#0a84ff] border border-[#0a84ff]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff] animate-pulse" />
                  {activeCount} aktif
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' }}>
            {/* View Mode Toggle: Topologi vs Intercom */}
            <div className="flex items-center p-0.5 bg-white/5 rounded-full border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('topology')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'topology'
                    ? 'bg-[#0a84ff] text-white shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Tampilan Topologi Visual"
              >
                <Activity className="w-3.5 h-3.5" /> Topologi
              </button>
              <button
                type="button"
                onClick={() => setViewMode('intercom')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'intercom'
                    ? 'bg-[#0a84ff] text-white shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Tampilan Intercom Feed"
              >
                <Bot className="w-3.5 h-3.5" /> Intercom
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsSpawnModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 text-xs font-medium shadow-md shadow-[#0a84ff]/20 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Agent
            </button>
          </div>
        </div>

        {/* Main Workspace Area: Seamless Single Canvas */}
        <div className="flex-1 flex overflow-hidden">
          {viewMode === 'topology' ? (
            <div className="flex-1 p-4 overflow-hidden">
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
            </div>
          ) : (
            <>
              {/* Left Panel: Clean Agent List */}
              <div className="w-80 flex flex-col bg-[#1c1c1e]/40 border-r border-white/10 overflow-hidden flex-none">
                {/* Filter Tabs */}
                <div className="p-3 border-b border-white/10">
                  <div className="flex gap-1 p-0.5 bg-black/40 rounded-xl w-full border border-white/5">
                      <button
                        type="button"
                        onClick={() => setFilterStatus('all')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'all'
                            ? 'bg-white/15 text-white shadow-sm font-semibold'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('running')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'running'
                            ? 'bg-[#0a84ff] text-white shadow-sm font-semibold'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Running
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('idle')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'idle'
                            ? 'bg-white/15 text-white shadow-sm font-semibold'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Idle
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterStatus('completed')}
                        className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                          filterStatus === 'completed'
                            ? 'bg-[#30d158]/20 text-[#30d158] shadow-sm font-semibold'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Selesai
                      </button>
                    </div>
                  </div>

                  {/* List Body */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {!subagents || subagents.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40 gap-2">
                        <Layers className="w-6 h-6 stroke-[1.5] text-white/30" />
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
                                ? 'bg-[#0a84ff] border-transparent text-white shadow-md'
                                : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full flex-none ${
                                    isRunning
                                      ? 'bg-[#30d158] animate-pulse'
                                      : isIdle
                                        ? 'bg-[#0a84ff]'
                                        : agent.status === 'completed'
                                          ? 'bg-white/60'
                                          : agent.status === 'failed' || agent.status === 'killed'
                                            ? 'bg-[#ff453a]'
                                            : 'bg-white/20'
                                  }`}
                                />
                                <span className="font-semibold text-xs truncate text-white">{agent.name}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteSubagent(agent.id, e)}
                                className={`opacity-0 group-hover:opacity-100 transition-all p-0.5 ${
                                  isSelected
                                    ? 'text-white/80 hover:text-white'
                                    : 'text-white/40 hover:text-[#ff453a]'
                                }`}
                                title="Hapus Agent"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <p className={`text-[11px] truncate pl-4 mb-2 ${isSelected ? 'text-white/80' : 'text-white/50'}`}>
                              {agent.role || 'Specialist'}
                            </p>

                            <div className={`flex items-center justify-between text-[10px] font-mono pl-4 ${isSelected ? 'text-white/70' : 'text-white/40'}`}>
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
                <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
                  {selectedSubagentId ? (
                    <SubagentIntercom
                      subagentId={selectedSubagentId}
                      onClose={() => setSelectedSubagentId(null)}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/40 gap-3 p-8 text-center">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <Bot className="w-8 h-8 stroke-[1.5] text-white/60" />
                      </div>
                      <p className="text-xs font-medium text-white/60">
                        Pilih sub-agent di panel kiri untuk memantau eksekusi live.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      {/* Modal Spawn Agent */}
      {isSpawnModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#1c1c1e] border border-white/15 rounded-3xl max-w-md w-full shadow-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-white">
                <Cpu className="w-4 h-4 text-[#0a84ff]" /> Spawn Sub-Agent Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsSpawnModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSpawnManual} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-white/60">Nama Agen</label>
                <input
                  type="text"
                  placeholder="misal: Code-Refactorer / Web-Researcher"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white outline-none transition-all placeholder:text-white/30"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-white/60">Role / Spesialisasi</label>
                <input
                  type="text"
                  placeholder="misal: Frontend Developer / Security Researcher"
                  value={newAgentRole}
                  onChange={(e) => setNewAgentRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white outline-none transition-all placeholder:text-white/30"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5 text-white/60">Tujuan & Instruksi Misi</label>
                <textarea
                  placeholder="Deskripsikan instruksi teknis yang harus diselesaikan sub-agent..."
                  value={newAgentGoal}
                  onChange={(e) => setNewAgentGoal(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white outline-none transition-all placeholder:text-white/30 h-24 resize-none"
                  required
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSpawnModalOpen(false)}
                  disabled={isSpawning}
                  className="px-3.5 py-1.5 text-xs text-white/60 hover:text-white transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newAgentName.trim() || !newAgentGoal.trim() || isSpawning}
                  className="px-4 py-2 rounded-xl bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 disabled:opacity-40 text-xs font-medium shadow-md shadow-[#0a84ff]/20 transition-all flex items-center gap-1.5"
                >
                  {isSpawning ? <MobiusLoader size={14} /> : 'Mulai Eksekusi'}
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
