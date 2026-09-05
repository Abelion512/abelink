import React, { useEffect, useState } from 'react'
import { FaChartLine, FaPlay, FaPause, FaTrash, FaArrowLeft } from 'react-icons/fa'
import { onTrajectoryUpdate, getTrajectoryBuffer, clearTrajectoryBuffer } from '../../api/trajectory'
import { logReasoning, logToolCall, logSubAgentSpawn, logStep } from '../../api/trajectory'

// Format timestamp
const formatTime = (iso) => {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

// Format duration
const formatDuration = (ms) => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Get icon for entry kind
const getEntryIcon = (kind) => {
  switch (kind) {
    case 'reasoning': return <FaChartLine className="text-info" />
    case 'tool-call': return <FaPlay className="text-primary" />
    case 'sub-agent': return <FaChartLine className="text-accent" />
    case 'step': return <FaChartLine className="text-success" />
    default: return <FaPlay className="text-muted" />
  }
}

export default function TrajectoryLogger({ clearOnOpen = false }) {
  const [entries, setEntries] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [playInterval, setPlayInterval] = useState(null)
  const playSpeed = 1000 // ms per entry in replay mode

  // Load initial entries
  useEffect(() => {
    const loaded = getTrajectoryBuffer()
    setEntries(loaded)

    if (clearOnOpen) {
      clearTrajectoryBuffer()
      setEntries([])
    }

    const unsubscribe = onTrajectoryUpdate((newEntries) => {
      setEntries(newEntries)
    })

    return () => unsubscribe()
  }, [clearOnOpen])

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (entries.length > 0) {
      setTimeout(() => {
        const container = document.getElementById('trajectory-container')
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      }, 100)
    }
  }, [entries])

  // Play/pause controls
  const handlePlayPause = () => {
    if (isPlaying) {
      clearInterval(playInterval)
      setPlayInterval(null)
      setIsPlaying(false)
    } else if (entries.length > 0) {
      let index = 0
      const interval = setInterval(() => {
        if (index >= entries.length) {
          clearInterval(interval)
          setPlayInterval(null)
          setIsPlaying(false)
          return
        }
        // Highlight current entry (could add visual feedback)
        index++
      }, playSpeed)
      setPlayInterval(interval)
      setIsPlaying(true)
    }
  }

  const handleClear = async () => {
    clearTrajectoryBuffer()
    setEntries([])
    if (isPlaying) {
      clearInterval(playInterval)
      setPlayInterval(null)
      setIsPlaying(false)
    }
  }

  const handleExport = () => {
    const data = JSON.stringify(entries, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-trajectory-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Add test data button for demo
  const addTestData = () => {
    logReasoning({
      prompt: "Analisis kode untuk perbaikan bug",
      model: "gemini-3.6-flash",
      tokens: 150,
      duration: 850
    })
    logToolCall({
      tool: "read-file",
      args: "src/components/core/InputBar.jsx",
      result: "// File content...",
      success: true,
      duration: 120
    })
    logSubAgentSpawn({
      name: "code-reviewer",
      parentAgentId: "main-agent-123"
    })
    logStep({
      step: 1,
      total: 3,
      description: "Membaca file target",
      status: "completed"
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Trajectory Logger
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className={`btn btn-xs ${isPlaying ? 'btn-primary' : 'btn-ghost'} flex items-center gap-1`}
          >
            {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} />}
            <span className="text-xs">{isPlaying ? 'Jeda' : 'Putar'}</span>
          </button>
          <button
            onClick={handleExport}
            className="btn btn-xs btn-outline"
            title="Export sebagai JSON"
          >
            <FaArrowLeft size={14} />
          </button>
          <button
            onClick={handleClear}
            className="btn btn-xs btn-error"
            title="Clear trajectory"
          >
            <FaTrash size={12} />
          </button>
          <button
            onClick={addTestData}
            className="btn btn-xs btn-outline btn-ghost"
            title="Tambah data test"
          >
            <FaChartLine size={12} className="opacity-60" />
          </button>
        </div>
      </div>

      <div className="border border-white/5 rounded-xl overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-white/50">
              Belum ada data trajectory. Aktifkan logging dari Configuration → Developer,
              lalu lakukan beberapa interaksi dengan Mark untuk melihat trace di sini.
            </div>
          ) : (
            <div id="trajectory-container" className="divide-y divide-white/5">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="py-3 px-4 flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                      {getEntryIcon(entry.kind)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{entry.kind}</span>
                      <span className="text-xs text-white/40">{formatTime(entry.ts)}</span>
                    </div>
                    <div className="text-xs text-white/60 space-y-1">
                      {entry.prompt && (
                        <div className="truncate max-w-full">
                          <strong>Prompt:</strong> {entry.prompt}
                        </div>
                      )}
                      {entry.tool && (
                        <div className="truncate max-w-full">
                          <strong>Tool:</strong> {entry.tool}
                          {entry.args && (
                            <span className="text-xs opacity-50 ml-1">({typeof entry.args === 'string' ? entry.args.slice(0, 50) + '...' : JSON.stringify(entry.args).slice(0, 50) + '...'})</span>
                          )}
                          {entry.result && (
                            <span className="text-xs opacity-50 ml-1">→ {typeof entry.result === 'string' ? entry.result.slice(0, 50) + '...' : JSON.stringify(entry.result).slice(0, 50) + '...'}</span>
                          )}
                          {entry.success !== undefined && (
                            <span className={`ml-1 px-1.5 rounded text-[9px] ${entry.success ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
                              {entry.success ? '✓' : '✗'}
                            </span>
                          )}
                          {entry.duration && (
                            <span className="ml-1 text-xs opacity-50">({formatDuration(entry.duration)})</span>
                          )}
                        </div>
                      )}
                      {entry.name && (
                        <div className="truncate max-w-full">
                          <strong>Sub-agent:</strong> {entry.name}
                          {entry.parentAgentId && (
                            <span className="text-xs opacity-50 ml-1">(from {entry.parentAgentId.slice(0, 8)}...)</span>
                          )}
                        </div>
                      )}
                      {entry.step !== undefined && entry.total !== undefined && (
                        <div className="truncate max-w-full">
                          <strong>Step:</strong> {entry.step}/{entry.total}
                          {entry.description && (
                            <span className="text-xs opacity-50 ml-1">- {entry.description}</span>
                          )}
                          {entry.status && (
                            <span className={`ml-1 px-1.5 rounded text-[9px] ${entry.status === 'completed' ? 'bg-success/20 text-success' : entry.status === 'running' ? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning'}`}>
                              {entry.status}
                            </span>
                          )}
                        </div>
                      )}
                      {Object.keys(entry).filter(k =>
                        !['id', 'kind', 'ts', 'prompt', 'tool', 'args', 'result', 'success', 'duration', 'name', 'parentAgentId', 'step', 'total', 'description', 'status'].includes(k)
                      ).length > 0 && (
                        <div className="mt-1 text-xs opacity-40">
                          <strong>Metadata:</strong>
                          {Object.entries(entry)
                            .filter(([k]) =>
                              !['id', 'kind', 'ts', 'prompt', 'tool', 'args', 'result', 'success', 'duration', 'name', 'parentAgentId', 'step', 'total', 'description', 'status'].includes(k)
                            )
                            .map(([k, v]) => `${k}: ${typeof v === 'string' ? (v.length > 50 ? v.slice(0, 50) + '...' : v) : JSON.stringify(v).slice(0, 50) + '...'}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {entries.length > 0 && (
          <div className="px-4 py-2 text-xs flex justify-between text-white/50">
            <span>Total: {entries.length} entri</span>
            <span>
              {isPlaying ? 'Memutar...' :
                entries.length >= 500 ? '(mencapai batas 500 entri)' :
                ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}