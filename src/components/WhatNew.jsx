import { useState } from 'react'
import { FaTimes, FaInfoCircle, FaCodeBranch, FaTag } from 'react-icons/fa'
import whatsNewData from '../data/whats-new.json'

const WhatNew = ({ onClose }) => {
  // Show all changes without slicing
  const changes = whatsNewData.changes || []

  // Categorize changes by type
  const improvements = changes.filter(c => c.type === 'ATM')
  const newFeatures = changes.filter(c => c.type === 'AUTO')
  const fixes = changes.filter(c => c.type === 'FIX' || c.type === 'fix')
  const security = changes.filter(c => c.type === 'SECURITY' || c.type === 'security')

  // Human-friendly type labels
  const typeLabels = {
    'ATM': 'Perbaikan',
    'AUTO': 'Fitur Baru',
    'FIX': 'Bug Fixes',
    'fix': 'Bug Fixes',
    'SECURITY': 'Keamanan',
    'security': 'Keamanan'
  }

  const renderCategory = (title, items, colorClass) => {
    if (items.length === 0) return null
    return (
      <div className="mb-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">{title}</h4>
        <div className="space-y-2">
          {items.map((c, i) => (
            <div key={i} className={`px-3 py-2 rounded-lg text-sm text-white/80 border-l-3 ${colorClass}`}>
              {c.msg}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Larger size */}
      <div className="relative bg-base-200 border border-[var(--glass-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-[holo-enter_0.2s_ease-out_forwards]">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <FaInfoCircle className="text-primary text-2xl" />
            <div>
              <h3 className="text-2xl font-bold text-white">Apa yang Baru?</h3>
              <p className="text-sm text-white/50">Versi {whatsNewData.version} · {whatsNewData.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm text-white/60 hover:text-white">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <p className="text-sm text-white/70 leading-relaxed">
            {whatsNewData.summary || (changes.length > 0 ? `${changes.length} perubahan dalam rilis ini` : 'Tidak ada perubahan terbaru')}
          </p>
          <div className="flex gap-3 mt-3">
            {improvements.length > 0 && <span className="badge badge-primary badge-sm">{improvements.length} Perbaikan</span>}
            {newFeatures.length > 0 && <span className="badge badge-success badge-sm">{newFeatures.length} Fitur Baru</span>}
            {fixes.length > 0 && <span className="badge badge-warning badge-sm">{fixes.length} Bug Fixes</span>}
            {security.length > 0 && <span className="badge badge-error badge-sm">{security.length} Keamanan</span>}
          </div>
        </div>

        {/* Changes - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {changes.length === 0 ? (
            <p className="text-center text-white/40 py-8">Belum ada perubahan untuk versi ini.</p>
          ) : (
            <div>
              {renderCategory('✨ Fitur Baru', newFeatures, 'border-success/40 bg-success/5')}
              {renderCategory('🔧 Perbaikan', improvements, 'border-primary/40 bg-primary/5')}
              {renderCategory('🐛 Bug Fixes', fixes, 'border-warning/40 bg-warning/5')}
              {renderCategory('🔒 Keamanan', security, 'border-error/40 bg-error/5')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm flex-1">
            Tutup
          </button>
          <button
            onClick={() => window.open(whatsNewData.linearUrl || 'https://linear.app/abelion/project/mark-agent-for-linux-10ceec65c326', '_blank')}
            className="btn btn-primary btn-sm flex-1">
            📋 Lihat Detail di Linear
          </button>
        </div>
      </div>
    </div>
  )
}

export default WhatNew