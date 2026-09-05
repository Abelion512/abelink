import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaChartLine, FaPlay, FaPause, FaTrash, FaDownload, FaArrowLeft } from 'react-icons/fa'
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

const getKindColor = (kind) => {
  switch (kind) {
    case 'reasoning': return 'bg-info/20 text-info'
    case 'tool-call': return 'bg-primary/20 text-primary'
    case 'sub-agent': return 'bg-accent/20 text-accent'
    case 'step': return 'bg-success/20 text-success'
    default: return 'bg-base-300 text-base-content'
  }
}

const getKindLabel = (kind) => {
  switch (kind) {
    case 'reasoning': return '🔍 Reasoning'
    case 'tool-call': return '⚡ Tool Call'
    case 'sub-agent': return '🤖 Sub-Agent'
    case 'step': return '📊 Step'
    default: return kind
  }
}

export default function Trajectory() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState(null)

  useEffect(() => {
    loadTrajectoryBuffer()
    const loaded = getTrajectoryBuffer()
    setEntries(loaded)

    const unsubscribe = onTrajectoryUpdate((newEntries) => {
      setEntries(newEntries)
    })

    return () => unsubscribe()
  }, [])

  const handleClear = () => {
    clearTrajectoryBuffer()
    setEntries([])
    setSelectedEntry(null)
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

  return (
    <div className="h-screen text-white overflow-hidden relative font-['Poppins',sans-serif] bg-base-300 rounded-xl border border-white/5 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-ghost btn-sm btn-circle"
        >
          <FaArrowLeft />
        </button>
        <div className="flex items-center gap-2">
          <FaChartLine className="text-primary" size={20} />
          <h1 className="text-xl font-bold">Trajectory Logger</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleExport}
            className="btn btn-sm btn-outline gap-1"
            disabled={entries.length === 0}
          >
            <FaDownload size={14} />
            Export JSON
          </button>
          <button
            onClick={handleClear}
            className="btn btn-sm btn-error btn-outline gap-1"
            disabled={entries.length === 0}
          >
            <FaTrash size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entry List */}
        <div className="w-1/2 border-r border-white/5 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/50 p-8 text-center">
              <FaChartLine size={48} className="opacity-20 mb-4" />
              <p className="text-lg font-medium mb-2">Belum ada data trajectory</p>
              <p className="text-sm opacity-60 max-w-sm">
                Aktifkan logging dari Configuration → Developer, lalu lakukan interaksi dengan Mark
                untuk melihat trace di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${
                    selectedEntry?.id === entry.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getKindColor(entry.kind)}`}>
                      {getKindLabel(entry.kind)}
                    </span>
                    <span className="text-xs text-white/40">{formatTime(entry.ts)}</span>
                  </div>
                  <div className="text-sm text-white/80 truncate">
                    {entry.tool && <span className="font-mono">{entry.tool}</span>}
                    {entry.prompt && <span className="truncate">{entry.prompt.slice(0, 60)}...</span>}
                    {entry.name && <span>{entry.name}</span>}
                    {entry.step !== undefined && (
                      <span>Step {entry.step}/{entry.total}</span>
                    )}
                    {entry.duration && (
                      <span className="text-xs text-white/40 ml-2">{formatDuration(entry.duration)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selectedEntry ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`text-sm px-3 py-1 rounded-full ${getKindColor(selectedEntry.kind)}`}>
                  {getKindLabel(selectedEntry.kind)}
                </span>
                <span className="text-sm text-white/50">{formatTime(selectedEntry.ts)}</span>
              </div>

              <div className="bg-base-200 rounded-xl p-4 space-y-3">
                {selectedEntry.prompt && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Prompt</label>
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-base-300 p-2 rounded">
                      {selectedEntry.prompt}
                    </pre>
                  </div>
                )}
                {selectedEntry.tool && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Tool</label>
                    <div className="font-mono text-sm bg-base-300 p-2 rounded">
                      {selectedEntry.tool}
                    </div>
                  </div>
                )}
                {selectedEntry.args && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Args</label>
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-base-300 p-2 rounded max-h-32 overflow-y-auto">
                      {typeof selectedEntry.args === 'string'
                        ? selectedEntry.args
                        : JSON.stringify(selectedEntry.args, null, 2)}
                    </pre>
                  </div>
                )}
                {selectedEntry.result && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Result</label>
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-base-300 p-2 rounded max-h-48 overflow-y-auto">
                      {typeof selectedEntry.result === 'string'
                        ? selectedEntry.result.slice(0, 2000)
                        : JSON.stringify(selectedEntry.result, null, 2).slice(0, 2000)}
                    </pre>
                  </div>
                )}
                {selectedEntry.name && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Agent Name</label>
                    <div className="font-mono text-sm">{selectedEntry.name}</div>
                  </div>
                )}
                {selectedEntry.parentAgentId && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Parent Agent</label>
                    <div className="font-mono text-sm opacity-70">{selectedEntry.parentAgentId}</div>
                  </div>
                )}
                {selectedEntry.step !== undefined && (
                  <div className="flex gap-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Step</label>
                      <div className="font-mono text-sm">{selectedEntry.step} / {selectedEntry.total}</div>
                    </div>
                    {selectedEntry.description && (
                      <div className="flex-1">
                        <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Description</label>
                        <div className="text-sm">{selectedEntry.description}</div>
                      </div>
                    )}
                  </div>
                )}
                {selectedEntry.duration && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Duration</label>
                    <div className="font-mono text-sm">{formatDuration(selectedEntry.duration)}</div>
                  </div>
                )}
                {selectedEntry.success !== undefined && (
                  <div>
                    <label className="text-xs uppercase tracking-wider opacity-50 mb-1 block">Status</label>
                    <div className={`text-sm ${selectedEntry.success ? 'text-success' : 'text-error'}`}>
                      {selectedEntry.success ? '✓ Success' : '✗ Failed'}
                    </div>
                  </div>
                )}
              </div>

              {/* Raw JSON */}
              <details className="group">
                <summary className="text-xs uppercase tracking-wider opacity-50 cursor-pointer hover:opacity-80">
                  Raw JSON
                </summary>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-base-200 p-3 rounded mt-2 max-h-64 overflow-auto">
                  {JSON.stringify(selectedEntry, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-white/30">
              <p className="text-sm">Pilih entri untuk melihat detail</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Stats */}
      {entries.length > 0 && (
        <div className="px-4 py-2 border-t border-white/5 text-xs text-white/40 flex justify-between">
          <span>Total: {entries.length} entries</span>
          <span>{entries.length >= 500 ? '(mencapai batas 500 entri)' : ''}</span>
        </div>
      )}
    </div>
  )
}
