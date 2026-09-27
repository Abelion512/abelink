import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Check, Gift, Star, Wrench, Bug, Shield, Search } from 'lucide-react'
import whatsNewData from '../data/whats-new.json'

// ponytail: satu komponen, tanpa lib baru. Timeline vertikal + filter chip +
// search, menganut pola kategorisasi yang sudah ada (ATM/AUTO/FIX/SECURITY).
const CATS = [
  { key: 'AUTO', label: 'Fitur Baru', icon: Star, active: 'bg-info/20 text-info border-info/40', dot: 'bg-info' },
  { key: 'ATM', label: 'Perbaikan', icon: Wrench, active: 'bg-primary/20 text-primary border-primary/40', dot: 'bg-primary' },
  { key: 'FIX', label: 'Bug Fixes', icon: Bug, active: 'bg-warning/20 text-warning border-warning/40', dot: 'bg-warning' },
  { key: 'SECURITY', label: 'Keamanan', icon: Shield, active: 'bg-error/20 text-error border-error/40', dot: 'bg-error' },
]

const norm = (t) => String(t || '').toUpperCase()

const WhatNew = ({ onClose }) => {
  // Module-level static: identitas stabil agar useMemo di bawah tidak
  // re-hitung tiap render (aturan exhaustive-deps: jangan baca `X || []`
  // inline bila X statis).
  const changes = useMemo(() => whatsNewData.changes || [], [])
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counts = useMemo(() => {
    const c = { ALL: changes.length }
    for (const { key } of CATS) c[key] = changes.filter((x) => norm(x.type) === key || (key === 'FIX' && norm(x.type) === 'FIX')).length
    return c
  }, [changes])

  const visible = changes.filter((c) => {
    if (filter !== 'ALL' && norm(c.type) !== filter) return false
    return !query || c.msg.toLowerCase().includes(query.toLowerCase())
  })

  const catOf = (t) => CATS.find((c) => c.key === norm(t)) || CATS[1]

  const markSeen = () => {
    try { localStorage.setItem('abelink:last-seen-whats-new', whatsNewData.version) } catch (_) {}
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        className="relative bg-base-200 border border-white/10 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-[response-fade-in_0.2s_ease-out_forwards]"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Gift className="text-primary text-xl" />
            </span>
            <div>
              <h3 id="whatsnew-title" className="text-xl font-bold text-white tracking-tight">Apa yang Baru?</h3>
              <p className="text-xs text-white/60">Versi {whatsNewData.version} · {whatsNewData.date} · {changes.length} perubahan</p>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Tutup"
            className="w-9 h-9 rounded-full hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Laporan rilis + filter + search */}
        <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          {whatsNewData.founderReport && (
            <p className="text-sm text-white/90 leading-relaxed mb-3">
              {whatsNewData.founderReport}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
          {[{ key: 'ALL', label: 'Semua' }, ...CATS].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                filter === key ? 'bg-primary/20 text-primary border-primary/40' : 'text-white/60 border-white/10 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label} · {counts[key] || 0}
            </button>
          ))}
          <label className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari perubahan…"
              aria-label="Cari perubahan"
              className="h-9 pl-9 pr-3 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/40 outline-none focus:border-primary/50 w-44"
            />
          </label>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {visible.length === 0 ? (
            <p className="text-center text-white/60 py-8 text-sm">
              {changes.length === 0 ? 'Belum ada perubahan untuk versi ini.' : 'Tidak ada yang cocok dengan filter.'}
            </p>
          ) : (
            <ol className="relative border-l border-white/10 ml-2 space-y-1">
              {visible.map((c, i) => {
                const cat = catOf(c.type)
                const Icon = cat.icon
                return (
                  <li key={i} className="relative pl-8 pb-4">
                    <span className={`absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full ${cat.dot} ring-4 ring-base-200`} />
                    <div className="flex items-start gap-2.5 rounded-xl px-3 py-2 hover:bg-white/5 transition-colors">
                      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/40" />
                      <div className="min-w-0">
                        <p className="text-sm text-white/80 leading-relaxed">{c.msg}</p>
                        <p className="text-[11px] text-white/40 mt-0.5">{cat.label}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <button onClick={markSeen} className="btn btn-primary btn-sm w-full">
            <Check className="w-4 h-4 mr-1" /> Sudah Dilihat
          </button>
        </div>
      </div>
    </div>
  )
}

export default WhatNew
