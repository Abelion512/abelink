import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBars,
  FaCog,
  FaPuzzlePiece,
  FaHistory,
  FaTelegram,
  FaDatabase,
  FaNetworkWired,
  FaHeartbeat,
  FaBook,
  FaGoogle,
  FaBrain,
  FaRobot,
  FaGift,
} from 'react-icons/fa'
import whatsNewData from '../../data/whats-new.json'

const FloatingMenu = ({ onOpenHistory, tgStatus = 'disconnected' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  // Status live sendiri: induk (MarkHome) tidak mengoper tgStatus sehingga
  // prop selalu default 'disconnected' (dot merah abadi). Berlangganan event
  // koneksi + ambil status awal langsung di sini.
  const [tgLive, setTgLive] = useState(tgStatus)
  useEffect(() => {
    let alive = true
    try {
      window.api?.tgGetStatus?.().then((res) => {
        if (alive && res?.status) setTgLive(res.status)
      }).catch(() => {})
    } catch (_) {}
    let unlisten = null
    try {
      unlisten = window.api?.onTgConnection?.((s) => {
        if (alive && s) setTgLive(s)
      })
    } catch (_) {}
    return () => {
      alive = false
      if (typeof unlisten === 'function') {
        try { unlisten() } catch (_) {}
      }
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNav = (path) => {
    navigate(path)
    setIsOpen(false)
  }

  return (
    <div className="fixed top-4 left-4 z-50" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-9 h-9 rounded-xl btn-ghost bg-black/60 backdrop-blur-2xl border border-white/10 flex items-center justify-center transition-all shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:bg-white/10 ${isOpen ? 'text-white border-primary/50' : 'text-white/70 hover:text-white'}`}
        title="Menu Navigasi"
      >
        <FaBars size={15} />
      </button>

      {isOpen && (
        <div className="absolute top-11 left-0 w-64 bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-sm p-2 flex flex-col gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-[holo-enter_0.2s_ease-out_forwards]">
          {/* HUD Brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/30 pointer-events-none z-10" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/30 pointer-events-none z-10" />

          {/* What's New: item teratas dengan badge saat ada versi baru */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('mark:open-whats-new'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl bg-info/10 hover:bg-info/20 transition-colors text-white text-sm font-semibold text-left border border-info/20"
          >
            <FaGift className="text-info" />
            <div className="flex-1">What&apos;s New</div>
            {(() => {
              try {
                return (
                  (whatsNewData.version || '') !==
                  (localStorage.getItem('mark:last-seen-whats-new') || '')
                )
              } catch (_) {
                return false
              }
            })() && <span className="w-2 h-2 rounded-full bg-error animate-pulse" />}
          </button>

          <div className="h-px w-full bg-white/10 my-1" />

          <button
            onClick={() => handleNav('/config')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaCog className="text-primary" /> Configuration
          </button>

          <button
            onClick={() => handleNav('/subagents')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaRobot className="text-primary" /> Sub-Agents
          </button>

          <button
            onClick={() => handleNav('/knowledge')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaDatabase className="text-primary" /> Knowledge (RAG)
          </button>

          <button
            onClick={() => handleNav('/guidebook')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaBook className="text-primary" /> Guidebook
          </button>

          <button
            onClick={() => {
              // Custom event to open memory map in MarkHome
              window.dispatchEvent(new CustomEvent('open-memory-map'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaNetworkWired className="text-primary" /> Memory Map
          </button>

          <button
            onClick={() => handleNav('/relational')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaHeartbeat className="text-primary" /> Relational Growth
          </button>

          <button
            onClick={() => {
              onOpenHistory()
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <FaHistory className="text-primary" /> History
          </button>

          <div className="h-px w-full bg-white/10 my-1" />

          <button
            onClick={() => handleNav('/telegram-bot')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 cursor-pointer text-white/80 text-sm font-medium"
          >
            <FaTelegram className={tgLive === 'connected' ? 'text-info' : 'text-white/30'} />
            <div className="flex-1 text-left">Telegram Bot</div>
            <div
              className={`w-2 h-2 rounded-full ${tgLive === 'connected' ? 'bg-info shadow-[0_0_8px_oklch(var(--in))]' : tgLive === 'connecting' ? 'bg-warning animate-pulse' : 'bg-error'}`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

export default FloatingMenu
