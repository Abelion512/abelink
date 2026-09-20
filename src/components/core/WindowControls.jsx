import React, { useState, useEffect } from 'react'

/**
 * WindowControls
 * Authentic macOS Traffic Lights (Close #FF5F56, Minimize #FFBD2E, Zoom/Maximize #28C840).
 * Features subtle group hover glyphs and communicates with Tauri window commands via window.api.
 */
export default function WindowControls({ className = '' }) {
  const [isMax, setIsMax] = useState(false)

  useEffect(() => {
    if (window.api?.onWindowState) {
      const unsub = window.api.onWindowState((s) => setIsMax(!!s?.isMaximized))
      window.api.getWindowState?.().then((s) => setIsMax(!!s?.isMaximized)).catch(() => {})
      return unsub
    }
  }, [])

  return (
    <div
      className={`group flex items-center gap-2 [-webkit-app-region:no-drag] select-none pointer-events-auto px-1 py-0.5 ${className}`}
    >
      {/* Close button (Red) */}
      <button
        type="button"
        onClick={() => window.api?.windowClose?.()}
        className="w-3 h-3 rounded-full bg-[#ff5f56] hover:brightness-110 active:brightness-90 border border-black/15 shadow-inner flex items-center justify-center cursor-pointer transition-transform active:scale-95"
        title="Tutup Jendela"
        aria-label="Tutup Jendela"
      >
        <svg
          className="w-1.5 h-1.5 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" />
        </svg>
      </button>

      {/* Minimize button (Yellow) */}
      <button
        type="button"
        onClick={() => window.api?.windowMinimize?.()}
        className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:brightness-110 active:brightness-90 border border-black/15 shadow-inner flex items-center justify-center cursor-pointer transition-transform active:scale-95"
        title="Kecilkan Jendela"
        aria-label="Kecilkan Jendela"
      >
        <svg
          className="w-1.5 h-1.5 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1.5 4H6.5" />
        </svg>
      </button>

      {/* Maximize / Zoom button (Green) */}
      <button
        type="button"
        onClick={() => window.api?.windowMaximize?.()}
        className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 active:brightness-90 border border-black/15 shadow-inner flex items-center justify-center cursor-pointer transition-transform active:scale-95"
        title={isMax ? 'Pulihkan Jendela' : 'Perbesar Jendela'}
        aria-label={isMax ? 'Pulihkan Jendela' : 'Perbesar Jendela'}
      >
        <svg
          className="w-1.5 h-1.5 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          {isMax ? (
            <path d="M1.5 6.5L6.5 1.5M4 1.5H6.5V4M4 6.5H1.5V4" />
          ) : (
            <path d="M1.5 4H6.5M4 1.5V6.5" />
          )}
        </svg>
      </button>
    </div>
  )
}

