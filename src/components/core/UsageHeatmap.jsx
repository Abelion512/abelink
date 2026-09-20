import { useEffect, useState } from 'react'
import { db } from '../../api/db'
import { MobiusLoader } from './MobiusLoader'

const DAYS = 365
const CACHE_KEY = 'abelink-usage-heatmap-v1'
const CACHE_TTL = 24 * 60 * 60 * 1000

// Winter-blue scale (bukan hijau GitHub): level 0 nyaris transparan -> solid #0a84ff
const FILLS = [
  'rgba(10,132,255,0.06)',
  'rgba(10,132,255,0.22)',
  'rgba(10,132,255,0.45)',
  'rgba(10,132,255,0.72)',
  '#0a84ff'
]

const CELL = 11
const GAP = 3
const PITCH = CELL + GAP
const LABEL_H = 18
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatId(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Agregasi lokal Dexie: chatTurns.timestamp (pesan) + agentTasks.createdAt (task)
async function aggregateUsage() {
  const counts = {}
  const bump = (ts) => {
    if (!ts) return
    const k = dayKey(new Date(ts))
    counts[k] = (counts[k] || 0) + 1
  }
  const [turns, tasks] = await Promise.all([
    db.chatTurns.toArray().catch(() => []),
    db.agentTasks.toArray().catch(() => [])
  ])
  turns.forEach((t) => bump(t.timestamp))
  tasks.forEach((t) => bump(t.createdAt))
  if (turns.length === 0 && tasks.length === 0 && db.sessions) {
    const sessions = await db.sessions.toArray().catch(() => [])
    sessions.forEach((s) => bump(s.timestamp))
  }
  return counts
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { savedAt, counts } = JSON.parse(raw)
    if (!savedAt || Date.now() - savedAt > CACHE_TTL) return null
    return counts
  } catch {
    return null
  }
}

function saveCache(counts) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), counts }))
  } catch {
    // storage penuh / privat — heatmap tetap jalan tanpa cache
  }
}

// Level 0-4 via kuartil dari hitungan harian non-nol
function quantileThresholds(counts) {
  const vals = Object.values(counts).filter(Boolean).sort((a, b) => a - b)
  if (vals.length === 0) return [0, 0, 0]
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]
  return [q(0.25), q(0.5), q(0.75)]
}

function levelFor(count, thresholds) {
  if (count <= 0) return 0
  let level = 1
  for (const t of thresholds) if (count > t) level += 1
  return Math.min(level, 4)
}

export function UsageHeatmap() {
  const [counts, setCounts] = useState(loadCache)

  const handleRefresh = () => {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      // abaikan — agregasi tetap jalan ulang
    }
    setCounts(null)
  }

  useEffect(() => {
    if (counts !== null) return
    let cancelled = false
    aggregateUsage()
      .then((c) => {
        if (cancelled) return
        saveCache(c)
        setCounts(c)
      })
      .catch(() => {
        if (!cancelled) setCounts({})
      })
    return () => { cancelled = true }
  }, [counts])

  if (counts === null) {
    return (
      <div className="flex items-center justify-center h-32">
        <MobiusLoader size={28} />
      </div>
    )
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  if (total === 0) {
    return (
      <div>
        <p className="text-sm text-base-content/50 text-center py-8">
          Belum ada aktivitas tercatat — mulai ngobrol dengan Abelink dan heatmap akan terisi di sini.
        </p>
        <div className="flex items-center justify-between mt-3">
          <p className="text-[11px] text-white/60">Data lokal perangkat ini · chatTurns + agentTasks + sessions</p>
          <button type="button" onClick={handleRefresh} className="btn btn-ghost btn-xs hover:text-info">Muat ulang</button>
        </div>
      </div>
    )
  }

  const thresholds = quantileThresholds(counts)

  // 365 hari terakhir, kolom = minggu (awal Senin), sel kosong = null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    days.push(d)
  }
  const pad = (days[0].getDay() + 6) % 7
  const cells = [...Array(pad).fill(null), ...days]
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  // Label bulan: tampil saat bulan kolom berubah dari kolom sebelumnya
  let prevMonth = -1
  const monthLabels = weeks.map((week) => {
    const first = week.find(Boolean)
    const m = first ? first.getMonth() : -1
    const label = m !== -1 && m !== prevMonth ? MONTHS_ID[m] : ''
    prevMonth = m
    return label
  })

  const width = weeks.length * PITCH + GAP
  const height = LABEL_H + 7 * PITCH + GAP

  return (
    <div>
      <p className="text-xs text-base-content/50 mb-3">
        <span className="font-bold font-mono text-info">{total}</span> aktivitas dalam setahun terakhir
      </p>
      <div className="overflow-x-auto custom-scrollbar">
        <svg width={width} height={height} role="img" aria-label="Heatmap aktivitas Abelink">
          {monthLabels.map((label, wi) =>
            label ? (
              <text key={wi} x={wi * PITCH + GAP} y={12} fontSize="10" className="fill-base-content/50">{label}</text>
            ) : null
          )}
          {weeks.map((week, wi) =>
            week.map((d, di) => {
              if (!d) return null
              const k = dayKey(d)
              const c = counts[k] || 0
              return (
                <rect
                  key={`${wi}-${di}`}
                  x={wi * PITCH + GAP}
                  y={LABEL_H + di * PITCH}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={FILLS[levelFor(c, thresholds)]}
                >
                  <title>{`${c} aktivitas pada ${formatId(k)}`}</title>
                </rect>
              )
            })
          )}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-white/60">Data lokal perangkat ini · chatTurns + agentTasks + sessions</p>
        <div className="flex items-center gap-1.5 text-[11px] text-base-content/50">
          <span>Less</span>
          {FILLS.map((f, i) => (
            <span key={i} className="inline-block w-3 h-3 rounded-[3px]" style={{ background: f }} />
          ))}
          <span>More</span>
          <button type="button" onClick={handleRefresh} className="btn btn-ghost btn-xs hover:text-info ml-2">Muat ulang</button>
        </div>
      </div>
    </div>
  )
}

export default UsageHeatmap
