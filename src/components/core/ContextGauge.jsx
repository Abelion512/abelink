import React, { useEffect, useRef, useState } from 'react'

const MAX_CHARS = 525000

// Gauge ring konteks sesi + popover (ATM upstream, adaptasi).
// Mendengar `context-tracker-updated`; tombol Compact dispatch
// `request-manual-compaction` yang ditangani useManualCompaction.
export const ContextGauge = React.memo(({ sessionId = 1, allowCompact = true }) => {
  const [tracker, setTracker] = useState({ currentChars: 0, percentage: 0, lastCompactedAt: null })
  const [open, setOpen] = useState(false)
  const popRef = useRef(null)
  const sid = String(sessionId ?? 1)

  useEffect(() => {
    const onUpdate = (e) => {
      if (!e?.detail || String(e.detail.sessionId ?? '') !== sid) return
      setTracker({
        currentChars: Number(e.detail.currentChars) || 0,
        percentage: Number(e.detail.percentage) || 0,
        lastCompactedAt: e.detail.lastCompactedAt || null
      })
    }
    window.addEventListener('context-tracker-updated', onUpdate)
    return () => window.removeEventListener('context-tracker-updated', onUpdate)
  }, [sid])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open ])

  const pct = Math.min(100, Math.max(0, tracker.percentage || 0))
  const zone = pct >= 100 ? 'full' : pct >= 90 ? 'suggest' : pct >= 75 ? 'warn' : 'ok'
  const discoverTip =
    zone === 'suggest' || zone === 'full'
      ? `Konteks ${Math.round(pct)}% — pertimbangkan Compact`
      : zone === 'warn'
        ? `Konteks ${Math.round(pct)}% — pertimbangkan Compact`
        : 'Context Window Info'
  const radius = 14
  const circ = 2 * Math.PI * radius
  const off = circ - (pct / 100) * circ
  const color = pct >= 90 ? 'stroke-rose-500' : pct >= 75 ? 'stroke-amber-400' : 'stroke-info'
  const label =
    tracker.currentChars >= 1000 ? `${(tracker.currentChars / 1000).toFixed(1)}K` : `${tracker.currentChars}`

  return (
    <div className="relative flex items-center justify-center px-1 select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v)
        }}
        className="relative w-[30px] h-[30px] flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110 outline-none"
        title={discoverTip}
      >
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r={radius} className="stroke-white/10" strokeWidth="2.5" fill="none" />
          <circle
            cx="18" cy="18" r={radius}
            className={`${color} transition-all duration-500 ease-out`}
            strokeWidth="2.5" strokeDasharray={circ} strokeDashoffset={off}
            strokeLinecap="round" fill="none"
          />
        </svg>
        <span className="absolute inset-0 items-center justify-center hidden hover:flex font-mono text-[8px] font-bold text-white pointer-events-none">
          {Math.round(pct)}%
        </span>
        {(zone === 'warn' || zone === 'suggest' || zone === 'full') && (
          <span className="absolute -bottom-2 font-mono text-[7px] font-bold text-white/70 pointer-events-none">
            {Math.round(pct)}%
          </span>
        )}
      </div>
      {open && (
        <div
          ref={popRef}
          className="absolute bottom-full right-0 mb-3.5 w-64 p-3.5 bg-base-200 border border-primary/30 rounded-xl shadow-2xl z-50 animate-fade-in text-left cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-medium text-white/60 mb-0.5">Session Info</div>
          <div className="text-xs font-bold text-white mb-2.5">Context Window</div>
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5 font-mono">
            <span className="text-white">{label} / 525K chars</span>
            <span className="text-white/60">{Math.round(pct)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full ${pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-info'} transition-all duration-300 rounded-full`}
              style={{ width: `${Math.min(100, Math.max(pct, 2))}%` }}
            />
          </div>
          <div className="text-[10px] text-white/60 mb-2">
            {tracker.lastCompactedAt
              ? `Kompaksi: ${new Date(tracker.lastCompactedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
              : 'Belum pernah dikompaksi'}
          </div>
          {allowCompact && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(
                  new CustomEvent('request-manual-compaction', { detail: { sessionId: sid } })
                )
              }}
              className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 border border-primary/30 text-xs font-medium text-white transition-all"
            >
              Compact Conversation{(zone === 'suggest' || zone === 'full') ? ' (disarankan)' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
})
