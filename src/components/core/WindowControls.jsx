import React, { useState, useEffect } from 'react'

/**
 * WindowControls
 * Minimalist, elegant window control buttons (Fullscreen, Minimize, Maximize/Restore, Close).
 * Communicates directly with Tauri window commands via window.api.
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
    <div className={`flex items-center gap-1.5 [-webkit-app-region:no-drag] select-none pointer-events-auto ${className}`}>
      <button
        onClick={() => window.api?.windowFullscreen()}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        title="Fullscreen" aria-label="Fullscreen"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21 3-9 9" />
          <path d="M21 3h-6" />
          <path d="M21 3v6" />
          <path d="m3 21 9-9" />
          <path d="M3 21h6" />
          <path d="M3 21v-6" />
        </svg>
      </button>
      <button
        onClick={() => window.api?.windowMinimize()}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        title="Minimize" aria-label="Minimize"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2 7h12v2H2z" />
        </svg>
      </button>
      <button
        onClick={() => window.api?.windowMaximize()}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        title={isMax ? 'Restore' : 'Maximize'} aria-label={isMax ? 'Restore' : 'Maximize'}
      >
        {isMax ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M4 4h7v7H4V4zm2 2v3h3V6H6z" />
            <path d="M7 2h7v7h-2V4H7V2z" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M2 2h12v12H2V2zm2 2v8h8V4H4z" />
          </svg>
        )}
      </button>
      <button
        onClick={() => window.api?.windowClose()}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/20 transition-colors"
        title="Close" aria-label="Close"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3.707 3.293a1 1 0 0 1 1.414 0L8 6.586l2.879-2.879a1 1 0 1 1 1.414 1.414L9.414 8l2.879 2.879a1 1 0 0 1-1.414 1.414L8 9.414l-2.879 2.879a1 1 0 1 1-1.414-1.414L6.586 8 3.707 5.121a1 1 0 0 1 0-1.414z"
          />
        </svg>
      </button>
    </div>
  )
}
