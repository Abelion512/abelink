import { useState, useEffect } from 'react'
import { FaTimes, FaTag, FaCodeBranch, FaFileAlt } from 'react-icons/fa'
import whatsNewData from '../data/whats-new.json'

const WhatNew = ({ onClose }) => {
  const [changes, setChanges] = useState([])
  const [activeType, setActiveType] = useState('all')

  useEffect(() => {
    setChanges(whatsNewData.changes || [])
  }, [])

  const filtered =
    activeType === 'all'
      ? changes
      : changes.filter((c) => c.type === activeType)

  const typeColors = {
    ATM: 'text-red-300 bg-red-500/15 border-red-500/30',
    AUTO: 'text-green-300 bg-green-500/15 border-green-500/30',
    REVIEW: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30',
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-base-200 border border-[var(--glass-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-[holo-enter_0.2s_ease-out_forwards]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaTag className="text-primary text-xl" />
            <div>
              <h3 className="text-lg font-semibold text-white">What's New</h3>
              <p className="text-sm text-white/50">v{whatsNewData.version} · {whatsNewData.date}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm text-white/60 hover:text-white"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Filter */}
        <div className="p-3 border-b border-white/10 flex gap-2 overflow-x-auto">
          {['all', 'ATM', 'AUTO', 'REVIEW'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`btn btn-sm whitespace-nowrap ${
                activeType === t
                  ? 'btn-primary'
                  : 'btn-ghost btn-outline text-white/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center py-6 text-white/40">No changes in this category.</p>
          ) : (
            filtered.map((c, i) => (
              <div
                key={i}
                className={`border rounded-lg p-3 transition-colors ${typeColors[c.type] || typeColors.REVIEW}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`badge badge-sm mb-1 ${typeColors[c.type]?.replace('bg-', 'bg-').replace('/15', '/20') || 'badge-ghost'}`}>
                      {c.type}
                    </span>
                    <p className="text-sm font-medium text-white mt-1">{c.msg}</p>
                    {c.hash && (
                      <span className="text-xs text-white/50 flex items-center gap-1 mt-1">
                        <FaCodeBranch size={10} />
                        {c.hash}
                      </span>
                    )}
                  </div>
                </div>
                {c.files && c.files.length > 0 && (
                  <div className="mt-2 pl-4 border-l-2 border-white/10">
                    <div className="flex items-center gap-1 text-xs text-white/40 mb-1">
                      <FaFileAlt size={10} /> Files:
                    </div>
                    <ul className="list-none space-y-0.5 text-xs text-white/60">
                      {c.files.map((f, j) => (
                        <li key={j}>• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 text-center">
          <button
            onClick={onClose}
            className="btn btn-primary btn-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default WhatNew
