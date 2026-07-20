import React, { useState, useEffect } from 'react'
import DraggableHoloCard from './DraggableHoloCard'

const BrowserPreviewWidget = () => {
  const [browserPreview, setBrowserPreview] = useState(null)

  useEffect(() => {
    if (window.api?.onBrowserPreview) {
      window.api.onBrowserPreview((data) => {
        setBrowserPreview(data)
      })
    }
  }, [])

  if (!browserPreview) return null

  const handleCloseBrowser = () => {
    if (window.api?.browserClose) {
      window.api.browserClose()
    }
    setBrowserPreview(null)
  }

  return (
    <DraggableHoloCard
      title="MARK BROWSER"
      id="browser-preview"
      isVisible={!!browserPreview}
      onClose={() => setBrowserPreview(null)}
      defaultPosition={{ x: window.innerWidth - 340, y: window.innerHeight - 350 }}
    >
      <div className="flex flex-col gap-3 w-64">
        <div 
          className="text-xs font-medium text-info truncate px-1 bg-black/20 rounded py-1 text-center border border-white/5" 
          title={browserPreview.title}
        >
          {browserPreview.title || browserPreview.url}
        </div>
        <div className="w-full h-32 rounded-lg overflow-hidden border border-white/10 relative group">
          <img 
            src={browserPreview.thumbnail} 
            alt="Browser Preview" 
            className="w-full h-full object-cover blur-[2px] group-hover:blur-none transition-all duration-300"
          />
          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-300 pointer-events-none" />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              if (window.api?.showBrowserWindow) {
                window.api.showBrowserWindow()
              }
              setBrowserPreview(null)
            }}
            className="btn btn-outline btn-success btn-sm flex-1 gap-2 shadow-[0_0_15px_oklch(var(--su)/0.2)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Open
          </button>
          
          <button 
            onClick={handleCloseBrowser}
            className="btn btn-outline btn-error btn-sm flex-none px-2 shadow-[0_0_15px_oklch(var(--er)/0.2)]"
            title="Tutup Paksa Browser"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="9" x2="15" y2="15"></line>
              <line x1="15" y1="9" x2="9" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>
    </DraggableHoloCard>
  )
}

export default BrowserPreviewWidget
