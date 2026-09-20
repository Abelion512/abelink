import React, { useState, useMemo } from 'react'
import {
  Brain,
  Bot,
  Activity,
  Send,
  Terminal,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

// Primary Abelink Cyan Theme
const PRIMARY = '#06b6d4'
const PRIMARY_DARK = '#083344'
const WHITE = '#ffffff'

export default function SubagentTopologyMap({
  subagents = [],
  selectedId = null,
  onSelectAgent = () => {},
  onOpenIntercom = () => {},
  onSendMessage = () => {}
}) {
  const [hoveredId, setHoveredId] = useState(null)
  const [quickInput, setQuickInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  // Filter agent untuk topologi:
  // Saat ada sub-agent yang sedang berjalan (running), HANYA tampilkan yang aktif agar diagram fokus & tidak penuh.
  // Saat semua tugas selesai / idle, tampilkan seluruh sub-agent yang standby.
  const displayAgents = useMemo(() => {
    const running = subagents.filter((a) => a.status === 'running')
    if (running.length > 0) {
      return running
    }
    return subagents
  }, [subagents])

  // Layout geometry for constellation placement
  const totalAgents = displayAgents.length
  const center = { x: 450, y: 280 }
  const radius = Math.min(220, Math.max(150, totalAgents * 28))

  const nodes = useMemo(() => {
    if (totalAgents === 0) return []
    return displayAgents.map((agent, index) => {
      const angle = (index / totalAgents) * 2 * Math.PI - Math.PI / 2
      const x = center.x + radius * Math.cos(angle)
      const y = center.y + radius * Math.sin(angle)
      return {
        ...agent,
        x,
        y,
        angle
      }
    })
  }, [displayAgents, totalAgents, center.x, center.y, radius])

  const selectedAgent = useMemo(
    () => subagents.find((a) => a.id === selectedId) || null,
    [subagents, selectedId]
  )

  const activeCount = subagents.filter((a) => a.status === 'running').length
  const idleCount = subagents.filter((a) => a.status === 'idle').length
  const completedCount = subagents.filter((a) => a.status === 'completed').length
  const failedCount = subagents.filter((a) => a.status === 'failed' || a.status === 'killed').length

  const handleQuickSend = async (e) => {
    e?.preventDefault()
    if (!quickInput.trim() || !selectedAgent || isSending) return
    setIsSending(true)
    try {
      await onSendMessage(selectedAgent.id, quickInput.trim())
      setQuickInput('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden font-['Poppins',sans-serif]">
      {/* Visual Canvas Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-white/[0.08]">
        {/* Subtle Ambient Radial Highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.06)_0%,transparent_70%)] pointer-events-none" />

        {/* Top Minimal Telemetry Bar */}
        <div className="absolute top-4 left-5 right-5 flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2.5 bg-black/40 backdrop-blur-xl px-3.5 py-1.5 rounded-2xl border border-white/[0.08] text-xs shadow-lg">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold text-xs tracking-wide text-zinc-200">
              Topology Network {activeCount > 0 ? '(Active Squad)' : '(Standby)'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            {activeCount > 0 && (
              <span className="px-3 py-1 bg-cyan-500/10 backdrop-blur-xl rounded-xl border border-cyan-500/25 flex items-center gap-1.5 text-cyan-300 shadow-sm font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                {activeCount} Aktif
              </span>
            )}
            {idleCount > 0 && (
              <span className="px-3 py-1 bg-black/40 backdrop-blur-xl rounded-xl border border-white/[0.08] flex items-center gap-1.5 text-zinc-400 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                {idleCount} Standby
              </span>
            )}
            {completedCount > 0 && (
              <span className="px-3 py-1 bg-black/40 backdrop-blur-xl rounded-xl border border-white/[0.08] flex items-center gap-1.5 text-zinc-400 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {completedCount} Selesai
              </span>
            )}
            {failedCount > 0 && (
              <span className="px-3 py-1 bg-rose-500/10 backdrop-blur-xl rounded-xl border border-rose-500/20 text-rose-400 flex items-center gap-1.5 shadow-sm">
                {failedCount} Gagal
              </span>
            )}
          </div>
        </div>

        {totalAgents === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 z-10 text-zinc-500 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-cyan-400 shadow-inner">
              <Layers className="w-7 h-7 stroke-[1.5]" />
            </div>
            <div>
              <p className="font-semibold text-sm text-zinc-200">
                Belum Ada Sub-Agent
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                Saat Abelink mendelegasikan tugas ke sub-agent, topologi tim akan muncul di sini.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* SVG Clean Topology Network */}
            <svg
              viewBox="0 0 900 560"
              className="w-full h-full max-w-5xl max-h-[580px] select-none"
              style={{ overflow: 'visible' }}
            >
              {/* Single Clean Orbital Track - Slow Gentle Spin */}
              <circle
                cx={center.x}
                cy={center.y}
                r={radius}
                fill="none"
                stroke={PRIMARY}
                strokeOpacity="0.18"
                strokeWidth="1"
                strokeDasharray="4 6"
                className="animate-[spin_90s_linear_infinite]"
              />

              {/* Minimal Clean Connector Lines */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedId
                const isHovered = node.id === hoveredId
                const isRunning = node.status === 'running'
                const isFailed = node.status === 'failed' || node.status === 'killed'
                const lineColor = isFailed ? '#ef4444' : PRIMARY

                return (
                  <g key={`beam-${node.id}`}>
                    <line
                      x1={center.x}
                      y1={center.y}
                      x2={node.x}
                      y2={node.y}
                      stroke={lineColor}
                      strokeWidth={isSelected || isHovered ? 2 : 1}
                      strokeOpacity={isSelected || isHovered ? 0.9 : isFailed ? 0.6 : isRunning ? 0.6 : 0.25}
                      strokeDasharray={isRunning || isFailed ? '4 3' : undefined}
                    />

                    {/* Active Minimal Pulse */}
                    {isRunning && (
                      <circle
                        r="3"
                        fill={PRIMARY}
                        stroke={WHITE}
                        strokeWidth="0.8"
                      >
                        <animateMotion
                          path={`M ${center.x} ${center.y} L ${node.x} ${node.y}`}
                          dur="1.8s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}
                  </g>
                )
              })}

              {/* Center Node: Abelink (Lead Agent) */}
              <g transform={`translate(${center.x}, ${center.y})`} className="cursor-pointer">
                {/* Subtle Ambient Breath Ring */}
                <circle
                  r="34"
                  fill={PRIMARY}
                  fillOpacity="0.12"
                  className="animate-pulse"
                />

                {/* Node Core */}
                <circle
                  r="26"
                  fill={PRIMARY}
                  stroke={WHITE}
                  strokeWidth="2"
                />
                <foreignObject x="-16" y="-16" width="32" height="32">
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <Brain className="w-5 h-5" />
                  </div>
                </foreignObject>

                {/* Minimal Text Label */}
                <text
                  y="42"
                  textAnchor="middle"
                  fill={WHITE}
                  className="text-[10px] font-semibold tracking-wider font-mono"
                >
                  ABELINK (LEAD)
                </text>
              </g>

              {/* Satellite Nodes: Sub-Agents */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedId
                const isHovered = node.id === hoveredId
                const isRunning = node.status === 'running'
                const isFailed = node.status === 'failed' || node.status === 'killed'
                const nodeColor = isFailed ? '#ef4444' : PRIMARY

                return (
                  <g
                    key={`node-${node.id}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => onSelectAgent(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Invisible Hitbox */}
                    <circle r="30" fill="transparent" />

                    {/* Active/Hover Clean Ring with Gentle Spin */}
                    {(isSelected || isHovered) && (
                      <circle
                        r="25"
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="animate-[spin_10s_linear_infinite]"
                      />
                    )}

                    {/* Node Core Body */}
                    <circle
                      r={isSelected || isHovered ? 20 : 18}
                      fill={nodeColor}
                      stroke={WHITE}
                      strokeWidth={isSelected || isHovered ? 2 : 1.2}
                      className="transition-all duration-150"
                    />

                    {/* Icon Inside Node */}
                    <foreignObject x="-11" y="-11" width="22" height="22">
                      <div className="w-full h-full flex items-center justify-center text-white">
                        {isFailed ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-white" />
                        ) : isRunning ? (
                          <Activity className="w-3.5 h-3.5 animate-spin" />
                        ) : node.status === 'idle' ? (
                          <Bot className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        )}
                      </div>
                    </foreignObject>

                    {/* Clean Sub-agent Name Label */}
                    <text
                      y="34"
                      textAnchor="middle"
                      fill={isFailed ? '#fca5a5' : WHITE}
                      className="text-[9px] font-medium tracking-tight"
                    >
                      {node.name.length > 14 ? node.name.slice(0, 12) + '..' : node.name}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Right Telemetry / Inspector Drawer */}
      <div className="w-full md:w-96 lg:w-[420px] flex flex-col bg-white/[0.015] overflow-hidden flex-none">
        <div className="p-3.5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-xs text-zinc-200 tracking-wide">Inspeksi Agen</span>
          </div>
          {selectedAgent && (
            <button
              type="button"
              onClick={() => onOpenIntercom(selectedAgent.id)}
              className="btn btn-ghost btn-xs gap-1.5 text-[11px] text-cyan-400 hover:bg-cyan-500/10 rounded-lg"
              title="Buka Chat Intercom Penuh"
            >
              Intercom <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        {selectedAgent ? (
          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
            {/* Agent Header Card */}
            <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-xs flex-none">
                    {selectedAgent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-xs text-zinc-100 truncate">{selectedAgent.name}</h4>
                    <p className="text-[10px] text-zinc-400 truncate font-mono">{selectedAgent.role}</p>
                  </div>
                </div>
                <div className="flex-none">
                  {selectedAgent.status === 'running' ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                      RUNNING
                    </span>
                  ) : selectedAgent.status === 'idle' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-400 border border-white/[0.1] font-mono text-[10px]">
                      IDLE / STANDBY
                    </span>
                  ) : selectedAgent.status === 'failed' || selectedAgent.status === 'killed' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[10px]">
                      FAILED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
                      COMPLETED
                    </span>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-zinc-300 font-mono bg-black/40 p-3 rounded-xl border border-white/[0.05]">
                <span className="text-cyan-400 font-bold block text-[9px] mb-1 uppercase tracking-wider">Misi / Goal:</span>
                <p className="line-clamp-3 leading-relaxed">{selectedAgent.goal}</p>
              </div>
            </div>

            {/* Live Progress / Output Preview */}
            <div className="flex-1 bg-white/[0.02] rounded-2xl border border-white/[0.06] p-3.5 space-y-2.5 flex flex-col">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Laporan Terkini:
                </span>
                <span className="font-mono text-[10px] text-zinc-500">Turn #{selectedAgent.turnCount || 0}</span>
              </div>

              <div className="flex-1 bg-black/40 rounded-xl p-3 text-[11px] font-mono leading-relaxed overflow-y-auto max-h-56 text-zinc-300 border border-white/[0.05]">
                {selectedAgent.finalAnswer ? (
                  <p className="whitespace-pre-wrap">{selectedAgent.finalAnswer}</p>
                ) : selectedAgent.status === 'running' ? (
                  <div className="flex items-center gap-2 text-cyan-400 opacity-80 py-2">
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    <span>Sedang memproses langkah...</span>
                  </div>
                ) : (
                  <span className="text-zinc-500 italic">Belum ada output yang tercatat.</span>
                )}
              </div>
            </div>

            {/* Quick Mentoring / Correction Dispatch */}
            <form onSubmit={handleQuickSend} className="space-y-2 pt-1">
              <label className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
                <Send className="w-2.5 h-2.5 text-cyan-400" /> Kirim Arahan Cepat (Lead Agent):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ketik instruksi koreksi..."
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  className="input input-xs flex-1 rounded-xl text-xs bg-white/[0.04] border border-white/[0.08] focus:border-cyan-400 focus:outline-none text-zinc-200 placeholder-zinc-500 px-3 py-2 h-8"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!quickInput.trim() || isSending}
                  className="btn btn-xs rounded-xl px-3 bg-cyan-500 text-black hover:bg-cyan-400 border-none font-medium h-8"
                  title="Kirim Pesan ke Sub-Agent"
                >
                  {isSending ? <span className="loading loading-spinner loading-xs" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-3">
            <Bot className="w-10 h-10 stroke-[1.2] opacity-40 text-cyan-400" />
            <p className="text-xs max-w-xs text-zinc-400">
              Klik salah satu node sub-agent pada diagram di samping untuk memeriksa status dan memberikan arahan langsung.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
