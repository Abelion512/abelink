import { useState } from 'react'
import { FaTimes, FaInfoCircle, FaCodeBranch, FaTag } from 'react-icons/fa'
import whatsNewData from '../data/whats-new.json'

const WhatNew = ({ onClose }) => {
  // Filter: tampilkan hanya 5 perubahan terbaru per tipe
  const atmChanges = (whatsNewData.changes || [])
    .filter(c => c.type === 'ATM')
    .slice(0, 5)
  const autoChanges = (whatsNewData.changes || [])
    .filter(c => c.type === 'AUTO')
    .slice(0, 5)

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-base-200 border border-[var(--glass-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] w-full max-w-md max-h-[90vh] overflow-y-auto animate-[holo-enter_0.2s_ease-out_forwards]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaInfoCircle className="text-primary text-xl" />
            <div>
              <h3 className="text-xl font-bold text-white">Apa yang baru?</h3>
              <p className="text-sm text-white/50">Versi {whatsNewData.version} · {whatsNewData.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm text-white/60 hover:text-white">
            <FaTimes size={18} />
          </button>
        </div>

        {/* Summary & CTA */}
        <div className="p-3 border-b border-white/10">
          <p className="text-sm text-white/60">
            {whatsNewData.summary || (whatsNewData.changes ? `${whatsNewData.changes.length} perubahan rilis` : 'Tidak ada perubahan terbaru')}
          </p>
          {whatsNewData.changes && whatsNewData.changes.length > 0 && (
            <p className="text-xs text-white/40 mt-1">Total: {whatsNewData.changes.length} perubahan rilis</p>
          )}
        </div>

        {/* Top 5 ATM + Top 5 AUTO perubahan */}
        <div className="p-3 space-y-3">
          {/* ATM Changes */}
          {atmChanges.length > 0 && (
            <div>
              <p className="text-xs font-medium text-white/60 mb-1">Perbaikan & Adaptasi (ATM)</p>
              <div className="space-y-1">
                {atmChanges.map((c, i) => (
                  <div key={i} className="px-2 py-1 rounded text-xs text-white/70 border-l-2 border-primary/30">
                    <FaCodeBranch size={8} className="mr-1" />
                    {c.msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AUTO Changes */}
          {autoChanges.length > 0 && (
            <div>
              <p className="text-xs font-medium text-white/60 mb-1">Fitur otomatis (AUTO)</p>
              <div className="space-y-1">
                {autoChanges.map((c, i) => (
                  <div key={i} className="px-2 py-1 rounded text-xs text-white/70 border-l-2 border-success/30">
                    <FaTag size={8} className="mr-1" />
                    {c.msg}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="p-3 border-t border-white/10 text-center">
          <button
            onClick={() => window.open(whatsNewData.linearUrl || 'https://linear.app/abelion/project/mark-agent-for-linux-10ceec65c326', '_blank')}
            className="btn btn-primary btn-sm w-full">
            📋 Lihat semua di Linear
          </button>
        </div>
      </div>
    </div>
  )
}

export default WhatNew