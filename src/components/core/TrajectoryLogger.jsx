import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FaChartLine, FaPlay, FaPause, FaTrash, FaDownload } from 'react-icons/fa'
import {
  onTrajectoryUpdate,
  getTrajectoryBuffer,
  clearTrajectoryBuffer,
  logReasoning,
  logToolCall,
  logSubAgentSpawn,
  logStep
} from '../../api/trajectory'

// Harus sinkron dengan MAX_ENTRIES di src/api/trajectory.js
const MAX_ENTRIES = 500

// Field yang sudah dirender eksplisit di bawah. Dulu daftar ini ditulis dua
// kali (sekali untuk cek panjang, sekali untuk render); begitu salah satu
// diedit, blok metadata ikut rusak tanpa terlihat. Sekarang satu sumber.
const KNOWN_FIELDS = [
  'id',
  'kind',
  'ts',
  'prompt',
  'tool',
  'args',
  'result',
  'success',
  'duration',
  'name',
  'parentAgentId',
  'step',
  'total',
  'description',
  'status'
]

// Tombol injeksi data test hanya untuk pengembangan — jangan sampai muncul di
// build produksi.
const IS_DEV = Boolean(import.meta.env?.DEV)

const truncate = (value, max = 50) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

const extraMetadata = (entry) =>
  Object.entries(entry).filter(([key]) => !KNOWN_FIELDS.includes(key))

// Format timestamp
const formatTime = (iso) => {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
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
    case 'reasoning':
      return <FaChartLine className="text-info" />
    case 'tool-call':
      return <FaPlay className="text-primary" />
    case 'sub-agent':
      return <FaChartLine className="text-accent" />
    case 'step':
      return <FaChartLine className="text-success" />
    default:
      return <FaPlay className="text-muted" />
  }
}

export default function TrajectoryLogger({ clearOnOpen = false }) {
  const [entries, setEntries] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const containerRef = useRef(null)
  // Interval replay disimpan di ref, bukan state: nilainya tidak pernah
  // dirender, dan menaruhnya di state membuat cleanup unmount membaca nilai
  // yang sudah basi.
  const playIntervalRef = useRef(null)
  const scrollTimerRef = useRef(null)
  const playSpeed = 1000 // ms per entry in replay mode

  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current)
      playIntervalRef.current = null
    }
    setIsPlaying(false)
  }, [])

  // Load initial entries
  useEffect(() => {
    if (clearOnOpen) {
      clearTrajectoryBuffer()
      setEntries([])
    } else {
      setEntries(getTrajectoryBuffer())
    }

    // trajectory.notify() mengirim snapshot array ke listener.
    const unsubscribe = onTrajectoryUpdate((newEntries) => {
      setEntries(Array.isArray(newEntries) ? newEntries : [])
    })

    return unsubscribe
  }, [clearOnOpen])

  // Bersihkan interval & timer saat unmount. Tanpa ini, membuka lalu menutup
  // panel dalam mode putar meninggalkan setInterval yang terus hidup dan
  // memanggil setState pada komponen yang sudah dilepas.
  useEffect(
    () => () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    },
    []
  )

  // Auto-scroll when new entries arrive
  useEffect(() => {
    if (entries.length === 0) return
    scrollTimerRef.current = setTimeout(() => {
      const container = containerRef.current
      if (container) container.scrollTop = container.scrollHeight
    }, 100)
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [entries])

  // Play/pause controls
  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback()
      return
    }
    if (entries.length === 0) return

    let index = 0
    const total = entries.length
    playIntervalRef.current = setInterval(() => {
      index += 1
      if (index >= total) stopPlayback()
    }, playSpeed)
    setIsPlaying(true)
  }

  const handleClear = () => {
    clearTrajectoryBuffer()
    setEntries([])
    stopPlayback()
  }

  const handleExport = () => {
    const data = JSON.stringify(entries, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-trajectory-${new Date().toISOString().slice(0, 10)}.json`
    // Sebagian browser mengabaikan klik pada anchor yang belum ter-attach, dan
    // mencabut object URL langsung setelah klik bisa membatalkan unduhan.
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // Data contoh untuk menguji tampilan; hanya tersedia di mode dev.
  const addTestData = () => {
    logReasoning({
      prompt: 'Analisis kode untuk perbaikan bug',
      model: 'gemini-3.6-flash',
      tokens: 150,
      duration: 850
    })
    logToolCall({
      tool: 'read-file',
      args: 'src/components/core/InputBar.jsx',
      result: '// File content...',
      success: true,
      duration: 120
    })
    logSubAgentSpawn({ name: 'code-reviewer', parentAgentId: 'main-agent-123' })
    logStep({ step: 1, total: 3, description: 'Membaca file target', status: 'completed' })
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
            disabled={entries.length === 0}
            className={`btn btn-xs ${isPlaying ? 'btn-primary' : 'btn-ghost'} flex items-center gap-1`}
          >
            {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} />}
            <span className="text-xs">{isPlaying ? 'Jeda' : 'Putar'}</span>
          </button>
          <button
            onClick={handleExport}
            disabled={entries.length === 0}
            className="btn btn-xs btn-outline"
            title="Export sebagai JSON"
          >
            <FaDownload size={14} />
          </button>
          <button
            onClick={handleClear}
            disabled={entries.length === 0}
            className="btn btn-xs btn-error"
            title="Clear trajectory"
          >
            <FaTrash size={12} />
          </button>
          {IS_DEV && (
            <button
              onClick={addTestData}
              className="btn btn-xs btn-outline btn-ghost"
              title="Tambah data test (dev)"
            >
              <FaChartLine size={12} className="opacity-60" />
            </button>
          )}
        </div>
      </div>

      <div className="border border-white/5 rounded-xl overflow-hidden">
        <div ref={containerRef} className="max-h-96 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-white/50">
              Belum ada data trajectory. Aktifkan logging dari Configuration → Developer, lalu
              lakukan beberapa interaksi dengan Mark untuk melihat trace di sini.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map((entry) => {
                const metadata = extraMetadata(entry)
                return (
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
                              <span className="text-xs opacity-50 ml-1">({truncate(entry.args)})</span>
                            )}
                            {entry.result && (
                              <span className="text-xs opacity-50 ml-1">
                                → {truncate(entry.result)}
                              </span>
                            )}
                            {entry.success !== undefined && (
                              <span
                                className={`ml-1 px-1.5 rounded text-[9px] ${entry.success ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}
                              >
                                {entry.success ? 'OK' : 'GAGAL'}
                              </span>
                            )}
                            {entry.duration && (
                              <span className="ml-1 text-xs opacity-50">
                                ({formatDuration(entry.duration)})
                              </span>
                            )}
                          </div>
                        )}
                        {entry.name && (
                          <div className="truncate max-w-full">
                            <strong>Sub-agent:</strong> {entry.name}
                            {entry.parentAgentId && (
                              <span className="text-xs opacity-50 ml-1">
                                (from {String(entry.parentAgentId).slice(0, 8)}...)
                              </span>
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
                              <span
                                className={`ml-1 px-1.5 rounded text-[9px] ${entry.status === 'completed' ? 'bg-success/20 text-success' : entry.status === 'running' ? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning'}`}
                              >
                                {entry.status}
                              </span>
                            )}
                          </div>
                        )}
                        {metadata.length > 0 && (
                          <div className="mt-1 text-xs opacity-40">
                            <strong>Metadata:</strong>{' '}
                            {metadata.map(([key, value]) => `${key}: ${truncate(value)}`).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {entries.length > 0 && (
          <div className="px-4 py-2 text-xs flex justify-between text-white/50">
            <span>Total: {entries.length} entri</span>
            <span>
              {isPlaying
                ? 'Memutar...'
                : entries.length >= MAX_ENTRIES
                  ? `(mencapai batas ${MAX_ENTRIES} entri)`
                  : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
