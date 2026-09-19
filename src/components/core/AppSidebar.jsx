import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import {
  FaHome,
  FaCog,
  FaHistory,
  FaTelegram,
  FaDatabase,
  FaNetworkWired,
  FaHeartbeat,
  FaBook,
  FaRobot,
  FaGift,
  FaChevronLeft,
  FaTimes,
} from 'react-icons/fa'
import whatsNewData from '../../data/whats-new.json'

const COLLAPSE_KEY = 'abelink:sidebar-collapsed'

const SidebarSimpleBoldIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M216 36H40a20 20 0 0 0-20 20v144a20 20 0 0 0 20 20h176a20 20 0 0 0 20-20V56a20 20 0 0 0-20-20M44 60h32v136H44Zm168 136H100V60h112Z" />
  </svg>
)

const AppSidebar = ({ onOpenHistory }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY)
      // Default terbuka: flag lama '1' dari era hamburger diabaikan sekali
      // agar sidebar baru langsung terlihat, bukan tombol kecil.
      if (v === null) return false
      return v === '1' && localStorage.getItem(`${COLLAPSE_KEY}:seen-v2`) === '1'
    } catch (_) {
      return false
    }
  })
  const [tgLive, setTgLive] = useState('disconnected')
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    try {
      setHasNew((whatsNewData.version || '') !== (localStorage.getItem('abelink:last-seen-whats-new') || ''))
    } catch (_) {}
  }, [collapsed, location.pathname])

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
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
        localStorage.setItem(`${COLLAPSE_KEY}:seen-v2`, '1')
      } catch (_) {}
      return !c
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const closeOnMobileNav = () => {
    try {
      if (window.matchMedia('(max-width: 759px)').matches) {
        setCollapsed(true)
        try { localStorage.setItem(COLLAPSE_KEY, '1') } catch (_) {}
      }
    } catch (_) {}
  }

  const handleNav = (path) => {
    navigate(path)
    closeOnMobileNav()
  }

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        aria-expanded={false}
        aria-controls="stage-slideover-sidebar"
        aria-label="Buka sidebar"
        title="Buka sidebar (Ctrl+B)"
        data-testid="open-sidebar-button"
        style={{ WebkitAppRegion: 'no-drag' }}
        className="fixed top-4 left-4 z-40 w-9 h-9 rounded-full bg-black/60 backdrop-blur-2xl border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none motion-reduce:animate-none"
      >
        <SidebarSimpleBoldIcon size={16} />
      </button>
    )
  }

  const rowBase =
    'flex items-center gap-3 w-full min-h-[48px] px-3 rounded-[20px] transition-colors text-sm font-medium text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none'
  const idle = 'text-white/80 hover:text-white hover:bg-white/10'
  const active = 'text-white bg-primary/20 hover:bg-primary/30'

  const isActive = (path) => location.pathname === path

  const iconWrap = (el) => (
    <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">{el}</span>
  )

  return (
    <>
      <div
        onClick={toggle}
        aria-hidden="true"
        className="hidden max-[760px]:block fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
      />
      <aside
        id="stage-slideover-sidebar"
        aria-label="Navigasi utama"
        style={{ WebkitAppRegion: 'no-drag' }}
        className="relative z-40 w-60 shrink-0 h-full flex flex-col gap-1 p-2 bg-base-300/95 backdrop-blur-xl border-r border-[var(--glass-border)] overflow-y-auto motion-reduce:transition-none max-[760px]:fixed max-[760px]:inset-y-0 max-[760px]:left-0 max-[760px]:w-72 max-[760px]:border max-[760px]:rounded-r-xl max-[760px]:shadow-2xl"
      >
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-white/60 uppercase">Menu</span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              aria-expanded={true}
              aria-controls="stage-slideover-sidebar"
              aria-label="Tutup sidebar"
              title="Tutup sidebar (Ctrl+B)"
              data-testid="close-sidebar-button"
              className="w-8 h-8 rounded-full hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-[760px]:hidden motion-reduce:transition-none"
            >
              <FaChevronLeft size={13} />
            </button>
            <button
              onClick={toggle}
              aria-expanded={true}
              aria-controls="stage-slideover-sidebar"
              aria-label="Tutup sidebar"
              className="hidden max-[760px]:flex w-8 h-8 rounded-full hover:bg-white/10 text-white/60 hover:text-white items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
            >
              <FaTimes size={14} />
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('abelink:open-whats-new'))
            closeOnMobileNav()
          }}
          className={`${rowBase} bg-info/10 hover:bg-info/20 text-white border border-info/20`}
        >
          {iconWrap(<FaGift className="text-info" size={14} />)}
          <span className="flex-1 font-semibold">What&apos;s New</span>
          {hasNew && <span className="w-2 h-2 rounded-full bg-error animate-pulse motion-reduce:animate-none" />}
        </button>

        <div className="h-px w-full bg-white/10 my-1" />

        <button onClick={() => handleNav('/')} className={`${rowBase} ${isActive('/') ? active : idle}`}>
          {iconWrap(<FaHome className="text-primary" size={14} />)} Beranda
        </button>
        <button onClick={() => handleNav('/config')} className={`${rowBase} ${isActive('/config') ? active : idle}`}>
          {iconWrap(<FaCog className="text-primary" size={14} />)} Configuration
        </button>
        <button onClick={() => handleNav('/subagents')} className={`${rowBase} ${isActive('/subagents') ? active : idle}`}>
          {iconWrap(<FaRobot className="text-primary" size={14} />)} Sub-Agents
        </button>
        <button onClick={() => handleNav('/knowledge')} className={`${rowBase} ${isActive('/knowledge') ? active : idle}`}>
          {iconWrap(<FaDatabase className="text-primary" size={14} />)} Knowledge (RAG)
        </button>
        <button onClick={() => handleNav('/guidebook')} className={`${rowBase} ${isActive('/guidebook') ? active : idle}`}>
          {iconWrap(<FaBook className="text-primary" size={14} />)} Guidebook
        </button>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-memory-map'))
            closeOnMobileNav()
          }}
          className={`${rowBase} ${idle}`}
        >
          {iconWrap(<FaNetworkWired className="text-primary" size={14} />)} Memory Map
        </button>
        <button onClick={() => handleNav('/relational')} className={`${rowBase} ${isActive('/relational') ? active : idle}`}>
          {iconWrap(<FaHeartbeat className="text-primary" size={14} />)} Relational Growth
        </button>
        <button
          onClick={() => {
            if (onOpenHistory) {
              onOpenHistory()
            } else {
              // MainLayout-level sidebar has no access to AbelinkHome state;
              // AbelinkHome (always mounted) listens for this event.
              window.dispatchEvent(new CustomEvent('abelink:open-history'))
            }
            closeOnMobileNav()
          }}
          className={`${rowBase} ${idle}`}
        >
          {iconWrap(<FaHistory className="text-primary" size={14} />)} History
        </button>

        <div className="h-px w-full bg-white/10 my-1" />

        <button onClick={() => handleNav('/telegram-bot')} className={`${rowBase} ${isActive('/telegram-bot') ? active : idle}`}>
          {iconWrap(<FaTelegram className={tgLive === 'connected' ? 'text-info' : 'text-white/30'} size={14} />)}
          <span className="flex-1">Telegram Bot</span>
          <span
            className={`w-2 h-2 rounded-full ${tgLive === 'connected' ? 'bg-info shadow-[0_0_8px_oklch(var(--in))]' : tgLive === 'connecting' ? 'bg-warning animate-pulse motion-reduce:animate-none' : 'bg-error'}`}
          />
        </button>

        <div className="mt-auto px-1 pt-2">
          <Link to="/" onClick={closeOnMobileNav} className="text-[11px] text-white/60 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
            Kembali ke Beranda
          </Link>
        </div>
      </aside>
    </>
  )
}

export default AppSidebar
