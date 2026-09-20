import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  Settings,
  History,
  Send,
  Database,
  BookOpen,
  Heart,
  Bot,
  Gift,
  X,
  Menu,
  Activity,
  Network
} from 'lucide-react'
import whatsNewData from '../../data/whats-new.json'

const AppSidebar = ({ onOpenHistory }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [tgLive, setTgLive] = useState('disconnected')
  const [hasNew, setHasNew] = useState(false)
  const drawerRef = useRef(null)

  useEffect(() => {
    try {
      setHasNew(
        (whatsNewData.version || '') !== (localStorage.getItem('abelink:last-seen-whats-new') || '')
      )
    } catch (_) {}
  }, [location.pathname])

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

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, isOpen])

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleNav = (path) => {
    navigate(path)
    setIsOpen(false)
  }

  const isActive = (path) => location.pathname === path

  const navItemClass = (path) =>
    `flex items-center gap-3 w-full h-[36px] px-3 rounded-xl text-xs font-medium transition-all text-left select-none cursor-pointer ${
      isActive(path)
        ? 'bg-[#0a84ff] text-white shadow-sm font-semibold'
        : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
    }`

  return (
    <>
      {/* Ultra-Minimalist Floating Trigger Button (Pojok Kiri Atas) */}
      <div className="fixed top-3.5 left-4 z-40 [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label="Buka Menu Navigasi"
          title="Buka Menu (Ctrl+B)"
          className="w-10 h-10 rounded-full bg-[#161618]/80 hover:bg-[#161618] border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all shadow-md backdrop-blur-md active:scale-95 cursor-pointer"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop overlay saat drawer terbuka */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* Floating Popup Drawer Menu (macOS Native Style) */}
      {isOpen && (
        <div
          ref={drawerRef}
          id="stage-slideover-sidebar"
          role="dialog"
          aria-label="Navigasi Utama"
          className="fixed top-14 left-4 z-50 w-64 bg-[#161618]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-3 shadow-2xl flex flex-col gap-3 select-none animate-fade-in"
        >
          {/* Header Title & Close */}
          <div className="flex items-center justify-between px-2 pt-1 pb-1 border-b border-white/[0.06]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Abelink Menu</span>
            <span className="text-[10px] font-mono text-white/30">Ctrl+B</span>
          </div>

          {/* Navigation Links Group */}
          <div className="space-y-1">
            <button type="button" onClick={() => handleNav('/')} className={navItemClass('/')}>
              <Home className="w-4 h-4 text-[#0a84ff]" />
              <span>Beranda Voice</span>
            </button>

            <button type="button" onClick={() => handleNav('/chat')} className={navItemClass('/chat')}>
              <Bot className="w-4 h-4 text-[#0a84ff]" />
              <span>Chat Studio</span>
            </button>

            <button type="button" onClick={() => handleNav('/subagents')} className={navItemClass('/subagents')}>
              <Activity className="w-4 h-4 text-[#0a84ff]" />
              <span>Sub-Agents</span>
            </button>

            <button type="button" onClick={() => handleNav('/knowledge')} className={navItemClass('/knowledge')}>
              <Database className="w-4 h-4 text-[#0a84ff]" />
              <span>Knowledge (RAG)</span>
            </button>

            <button type="button" onClick={() => handleNav('/trajectory')} className={navItemClass('/trajectory')}>
              <Network className="w-4 h-4 text-[#0a84ff]" />
              <span>Trajectory</span>
            </button>

            <button type="button" onClick={() => handleNav('/relational')} className={navItemClass('/relational')}>
              <Heart className="w-4 h-4 text-[#0a84ff]" />
              <span>Relational Growth</span>
            </button>

            <button type="button" onClick={() => handleNav('/guidebook')} className={navItemClass('/guidebook')}>
              <BookOpen className="w-4 h-4 text-[#0a84ff]" />
              <span>Guidebook</span>
            </button>

            <button type="button" onClick={() => handleNav('/config')} className={navItemClass('/config')}>
              <Settings className="w-4 h-4 text-[#0a84ff]" />
              <span>Pengaturan</span>
            </button>
          </div>

          <div className="h-px w-full bg-white/[0.06]" />

          {/* Telegram & Extras */}
          <div className="space-y-1">
            <button type="button" onClick={() => handleNav('/telegram-bot')} className={navItemClass('/telegram-bot')}>
              <Send className="w-4 h-4 text-[#0a84ff]" />
              <span className="flex-1">Telegram Bot</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  tgLive === 'connected' ? 'bg-[#30d158]' : 'bg-[#ff453a]'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-memory-map'))
                setIsOpen(false)
              }}
              className="flex items-center gap-3 w-full h-[36px] px-3 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-left cursor-pointer"
            >
              <Network className="w-4 h-4 text-[#0a84ff]" />
              <span>Peta Memori (Visualizer)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenHistory) {
                  onOpenHistory()
                } else {
                  window.dispatchEvent(new CustomEvent('abelink:open-history'))
                }
                setIsOpen(false)
              }}
              className="flex items-center gap-3 w-full h-[36px] px-3 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-left cursor-pointer"
            >
              <History className="w-4 h-4 text-[#0a84ff]" />
              <span>Riwayat Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('abelink:open-whats-new'))
                setIsOpen(false)
              }}
              className="flex items-center gap-3 w-full h-[36px] px-3 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-left cursor-pointer"
            >
              <Gift className="w-4 h-4 text-[#0a84ff]" />
              <span className="flex-1">What's New</span>
              {hasNew && <span className="w-2 h-2 rounded-full bg-[#ff453a]" />}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default AppSidebar
