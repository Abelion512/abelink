import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaChartLine,
  FaTrash,
  FaDownload,
  FaArrowLeft,
  FaSearch,
  FaSyncAlt,
  FaCopy,
  FaCheck,
  FaBrain,
  FaTerminal,
  FaEye,
  FaCheckCircle,
  FaTimesCircle,
  FaCubes,
  FaClock
} from 'react-icons/fa'
import {
  onTrajectoryUpdate,
  getTrajectoryBuffer,
  clearTrajectoryBuffer,
  loadTrajectoryBuffer
} from '../api/trajectory'

const formatTime = (iso) => {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

const formatDuration = (ms) => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const getKindBadgeClass = (kind, success) => {
  if (success === false) return 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
  switch (kind) {
    case 'reasoning':
      return 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
    case 'tool-call':
      return 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
    case 'observation':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
    case 'answer':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
    case 'sub-agent':
      return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
    case 'turn-start':
    case 'turn-end':
      return 'bg-white/[0.08] text-neutral-300 border border-white/10'
    case 'step':
      return 'bg-teal-500/15 text-teal-400 border border-teal-500/25'
    default:
      return 'bg-neutral-800 text-neutral-300 border border-white/10'
  }
}

const getKindLabel = (kind) => {
  switch (kind) {
    case 'reasoning': return 'Reasoning'
    case 'tool-call': return 'Tool Call'
    case 'observation': return 'Observation'
    case 'answer': return 'Answer'
    case 'sub-agent': return 'Sub-Agent'
    case 'turn-start': return 'Turn Start'
    case 'turn-end': return 'Turn End'
    case 'step': return 'Step'
    default: return kind
  }
}

const getKindIcon = (kind) => {
  switch (kind) {
    case 'reasoning': return FaBrain
    case 'tool-call': return FaTerminal
    case 'observation': return FaEye
    case 'answer': return FaCheckCircle
    case 'sub-agent': return FaCubes
    default: return FaChartLine
  }
}

export default function Trajectory() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState(() => {
    loadTrajectoryBuffer()
    return getTrajectoryBuffer()
  })
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState(null)

  const reload = useCallback(() => {
    loadTrajectoryBuffer()
    const latest = getTrajectoryBuffer().slice()
    setEntries(latest)
  }, [])

  useEffect(() => {
    const unsubscribe = onTrajectoryUpdate((newEntries) => {
      setEntries(newEntries)
    })
    return () => unsubscribe()
  }, [])

  // Auto-select latest entry on initial mount if none selected
  useEffect(() => {
    if (!selectedEntry && entries.length > 0) {
      setSelectedEntry(entries[entries.length - 1])
    }
  }, [entries, selectedEntry])

  const handleCopy = (text, key) => {
    if (!text) return
    const str = typeof text === 'string' ? text : JSON.stringify(text, null, 2)
    navigator.clipboard?.writeText(str)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  const handleClear = () => {
    if (window.confirm('Hapus seluruh buffer trajectory lokal?')) {
      clearTrajectoryBuffer()
      setEntries([])
      setSelectedEntry(null)
    }
  }

  const handleExport = () => {
    const data = JSON.stringify(filteredEntries, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abelink-trajectory-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (activeFilter === 'reasoning' && e.kind !== 'reasoning') return false
      if (activeFilter === 'tool-call' && e.kind !== 'tool-call') return false
      if (activeFilter === 'observation' && e.kind !== 'observation') return false
      if (activeFilter === 'answer' && e.kind !== 'answer') return false
      if (activeFilter === 'sub-agent' && e.kind !== 'sub-agent') return false
      if (activeFilter === 'failed' && e.success !== false) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const searchTarget = [
        e.tool,
        e.thought,
        e.prompt,
        e.observation,
        e.answer,
        e.name,
        typeof e.args === 'string' ? e.args : JSON.stringify(e.args),
        typeof e.result === 'string' ? e.result : JSON.stringify(e.result),
        e.sessionId != null ? `session:${e.sessionId}` : ''
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchTarget.includes(q)
    })
  }, [entries, activeFilter, searchQuery])

  return (
    <div className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-neutral-950 flex flex-col">
      {/* ── Top Header Navigation (Apple macOS Glass) ── */}
      <header className="px-5 py-3 border-b border-white/[0.08] bg-neutral-900/60 backdrop-blur-2xl flex items-center justify-between gap-4 z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Kembali"
          >
            <FaArrowLeft size={12} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90 shrink-0">
              <FaChartLine size={13} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-white/95">Trajectory Logger</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-neutral-400">
                  {filteredEntries.length}/{entries.length}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate hidden sm:block">
                Inspeksi nalar, tool execution trace, dan observasi agen secara real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={reload}
            className="p-2 rounded-full border border-white/10 bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Segarkan Buffer"
          >
            <FaSyncAlt size={11} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredEntries.length === 0}
            className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-1.5 disabled:opacity-40"
          >
            <FaDownload size={11} />
            <span className="hidden sm:inline">Export JSON</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={entries.length === 0}
            className="rounded-full px-3.5 py-1.5 text-xs font-medium border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-1.5 disabled:opacity-40"
          >
            <FaTrash size={11} />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        </div>
      </header>

      {/* ── Sub-Header: Segmented Filter & Spotlight Search ── */}
      <div className="px-5 py-2.5 border-b border-white/[0.06] bg-neutral-900/40 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        {/* Segmented Filter Pills */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-neutral-900/80 border border-white/[0.08] overflow-x-auto custom-scrollbar">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'reasoning', label: 'Reasoning' },
            { id: 'tool-call', label: 'Tool Calls' },
            { id: 'observation', label: 'Observations' },
            { id: 'answer', label: 'Answers' },
            { id: 'failed', label: 'Failed Only' }
          ].map((tab) => {
            const isActive = activeFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium tracking-tight whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Spotlight Search Input */}
        <div className="relative flex items-center">
          <FaSearch className="absolute left-3.5 text-neutral-500 pointer-events-none" size={11} />
          <input
            type="text"
            placeholder="Cari tool, thought, query..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 rounded-full pl-9 pr-3.5 py-1 bg-white/[0.05] border border-white/[0.08] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
          />
        </div>
      </div>

      {/* ── Main 2-Pane Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Entry List */}
        <div className="w-full md:w-5/12 lg:w-4/12 border-r border-white/[0.08] overflow-y-auto custom-scrollbar p-3 space-y-2">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-600">
                <FaChartLine size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-400">Tidak ada entri trajectory</p>
                <p className="text-[11px] text-neutral-500 max-w-xs leading-relaxed">
                  Interaksi di Chat Studio atau eksekusi sub-agent akan otomatis mencatat nalar dan aksi di sini.
                </p>
              </div>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id
              const IconComponent = getKindIcon(entry.kind)
              const previewText =
                entry.tool ||
                entry.thought ||
                entry.prompt ||
                entry.observation ||
                entry.answer ||
                entry.name ||
                entry.kind

              return (
                <button
                  key={entry.id || entry.seq}
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all duration-200 flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-neutral-800/80 border-white/20 shadow-md'
                      : 'bg-neutral-900/40 border-white/[0.05] hover:bg-neutral-900/80 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${getKindBadgeClass(entry.kind, entry.success)}`}>
                        {getKindLabel(entry.kind)}
                      </span>
                      {entry.turn != null && (
                        <span className="font-mono text-[9px] text-neutral-400">
                          T{entry.turn}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {formatTime(entry.ts)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <IconComponent size={11} className="text-neutral-400 shrink-0" />
                    <p className="text-xs text-white/90 font-medium truncate flex-1">
                      {previewText}
                    </p>
                  </div>

                  {(entry.args || entry.duration != null || entry.tokensEst != null) && (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 truncate pt-0.5 border-t border-white/[0.03]">
                      {entry.duration != null && <span>{formatDuration(entry.duration)}</span>}
                      {entry.tokensEst != null && <span>~{entry.tokensEst} tok</span>}
                      {entry.args && <span className="truncate text-neutral-500">args: {typeof entry.args === 'string' ? entry.args : JSON.stringify(entry.args)}</span>}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Right Pane: Detailed Inspection Panel */}
        <div className="hidden md:flex flex-1 overflow-y-auto custom-scrollbar p-6 flex-col space-y-5">
          {selectedEntry ? (
            <div className="space-y-5 max-w-4xl">
              {/* Header Card */}
              <div className="rounded-3xl bg-neutral-900/50 backdrop-blur-2xl border border-white/[0.08] p-5 shadow-xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-neutral-800 border border-white/10 flex items-center justify-center text-white/90 shadow-sm shrink-0">
                    {(() => {
                      const Icon = getKindIcon(selectedEntry.kind)
                      return <Icon size={16} />
                    })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold tracking-tight text-white/95">
                        {getKindLabel(selectedEntry.kind)}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getKindBadgeClass(selectedEntry.kind, selectedEntry.success)}`}>
                        {selectedEntry.success === false ? 'Failed' : 'Success / Valid'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-neutral-400 mt-0.5">
                      {selectedEntry.id || `seq-${selectedEntry.seq}`}
                    </p>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <div className="text-xs font-mono text-neutral-300 flex items-center justify-end gap-1.5">
                    <FaClock size={10} className="text-neutral-500" />
                    <span>{formatTime(selectedEntry.ts)}</span>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-400">
                    {selectedEntry.sessionId != null ? `Session #${selectedEntry.sessionId}` : 'Global Context'}
                    {selectedEntry.turn != null ? ` | Turn ${selectedEntry.turn}` : ''}
                  </div>
                </div>
              </div>

              {/* Metadata Pill Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-neutral-900/40 border border-white/[0.06] space-y-0.5">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">Kind</span>
                  <span className="text-xs font-mono text-white/90">{selectedEntry.kind}</span>
                </div>
                <div className="p-3 rounded-2xl bg-neutral-900/40 border border-white/[0.06] space-y-0.5">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">Duration</span>
                  <span className="text-xs font-mono text-white/90">{formatDuration(selectedEntry.duration) || 'N/A'}</span>
                </div>
                <div className="p-3 rounded-2xl bg-neutral-900/40 border border-white/[0.06] space-y-0.5">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">Model</span>
                  <span className="text-xs font-mono text-white/90 truncate block">{selectedEntry.model || 'Default'}</span>
                </div>
                <div className="p-3 rounded-2xl bg-neutral-900/40 border border-white/[0.06] space-y-0.5">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider block">Tokens Est</span>
                  <span className="text-xs font-mono text-white/90">
                    {selectedEntry.tokensEst != null ? `~${selectedEntry.tokensEst}` : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Thought Section (Reasoning) */}
              {selectedEntry.thought && (
                <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-5 shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-sky-400 flex items-center gap-2">
                      <FaBrain size={12} />
                      <span>Thought (Internal Reasoning)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEntry.thought, 'thought')}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      {copiedKey === 'thought' ? <FaCheck size={9} className="text-emerald-400" /> : <FaCopy size={9} />}
                      <span>{copiedKey === 'thought' ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-neutral-800/40 border border-white/[0.04] text-xs text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap">
                    {selectedEntry.thought}
                  </div>
                </div>
              )}

              {/* Tool Execution Card */}
              {selectedEntry.tool && (
                <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-5 shadow-lg space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-purple-400 flex items-center gap-2">
                      <FaTerminal size={12} />
                      <span>Tool Invocation</span>
                    </span>
                    <span className="font-mono text-xs text-white bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
                      {selectedEntry.tool}
                    </span>
                  </div>

                  {selectedEntry.args !== undefined && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">Arguments</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedEntry.args, 'args')}
                          className="text-[10px] text-neutral-400 hover:text-white transition-colors"
                        >
                          {copiedKey === 'args' ? 'Disalin' : 'Salin'}
                        </button>
                      </div>
                      <pre className="p-3 rounded-2xl bg-neutral-800/40 border border-white/[0.04] font-mono text-xs text-neutral-300 max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap select-all">
                        {typeof selectedEntry.args === 'string'
                          ? selectedEntry.args
                          : JSON.stringify(selectedEntry.args, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedEntry.result !== undefined && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">Execution Result</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedEntry.result, 'result')}
                          className="text-[10px] text-neutral-400 hover:text-white transition-colors"
                        >
                          {copiedKey === 'result' ? 'Disalin' : 'Salin'}
                        </button>
                      </div>
                      <pre className="p-3 rounded-2xl bg-neutral-800/40 border border-white/[0.04] font-mono text-xs text-neutral-300 max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap select-all">
                        {typeof selectedEntry.result === 'string'
                          ? selectedEntry.result
                          : JSON.stringify(selectedEntry.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Observation Section */}
              {selectedEntry.observation && (
                <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-5 shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-amber-400 flex items-center gap-2">
                      <FaEye size={12} />
                      <span>Observation (Konteks Masukan Loop)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEntry.observation, 'obs')}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      {copiedKey === 'obs' ? <FaCheck size={9} className="text-emerald-400" /> : <FaCopy size={9} />}
                      <span>{copiedKey === 'obs' ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 rounded-2xl bg-neutral-800/40 border border-white/[0.04] text-xs text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                    {typeof selectedEntry.observation === 'string'
                      ? selectedEntry.observation
                      : JSON.stringify(selectedEntry.observation, null, 2)}
                  </pre>
                </div>
              )}

              {/* Answer Section */}
              {selectedEntry.answer && (
                <div className="rounded-3xl bg-neutral-900/40 backdrop-blur-2xl border border-white/[0.08] p-5 shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-emerald-400 flex items-center gap-2">
                      <FaCheckCircle size={12} />
                      <span>Final Answer</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEntry.answer, 'ans')}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      {copiedKey === 'ans' ? <FaCheck size={9} className="text-emerald-400" /> : <FaCopy size={9} />}
                      <span>{copiedKey === 'ans' ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-neutral-800/40 border border-white/[0.04] text-xs text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap">
                    {typeof selectedEntry.answer === 'string'
                      ? selectedEntry.answer
                      : JSON.stringify(selectedEntry.answer, null, 2)}
                  </div>
                </div>
              )}

              {/* Raw JSON Accordion */}
              <details className="group rounded-3xl bg-neutral-900/40 border border-white/[0.08] p-4">
                <summary className="cursor-pointer text-xs font-medium text-neutral-400 hover:text-white flex items-center justify-between select-none">
                  <span>Raw Event JSON Payload</span>
                  <span className="text-[10px] font-mono text-neutral-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEntry, 'raw')}
                      className="rounded-full px-3 py-1 text-[10px] font-medium border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      {copiedKey === 'raw' ? <FaCheck size={9} className="text-emerald-400" /> : <FaCopy size={9} />}
                      <span>{copiedKey === 'raw' ? 'Disalin' : 'Salin JSON'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-2xl bg-neutral-950 font-mono text-[11px] text-neutral-300 overflow-x-auto custom-scrollbar select-all">
                    {JSON.stringify(selectedEntry, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <p className="text-xs">Pilih entri di sebelah kiri untuk melihat rincian.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer Status Bar ── */}
      <footer className="px-5 py-2 border-t border-white/[0.08] bg-neutral-900/80 text-[11px] text-neutral-400 flex items-center justify-between shrink-0">
        <span>Menampilkan {filteredEntries.length} dari {entries.length} entri</span>
        <span>Maksimal buffer: 500 entri (rotasi lokal)</span>
      </footer>
    </div>
  )
}

