import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu,
  Settings,
  Puzzle,
  History,
  MessageCircle,
  Database,
  Network,
  BookOpen,
  HeartPulse
} from 'lucide-react'

const FloatingMenu = ({ onOpenHistory, waStatus = 'disconnected' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()

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
    <div className="fixed top-8 left-8 z-50" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 rounded-2xl bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] flex items-center justify-center transition-all shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] ${isOpen ? 'text-white border-white/30' : 'text-white/70 hover:text-white hover:border-white/20'}`}
      >
        <Menu size={20} />
      </button>

      {isOpen && (
        <div className="absolute top-16 left-0 w-64 bg-base-300/95 backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl p-2 flex flex-col gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-[holo-enter_0.2s_ease-out_forwards]">
          <button
            onClick={() => handleNav('/config')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <Settings size={18} className="text-white/60" /> Configuration
          </button>

          <button
            onClick={() => handleNav('/plugins')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <Puzzle size={18} className="text-white/60" /> Plugins
          </button>

          <button
            onClick={() => handleNav('/knowledge')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <Database size={18} className="text-white/60" /> Knowledge (RAG)
          </button>

          <button
            onClick={() => handleNav('/guidebook')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <BookOpen size={18} className="text-white/60" /> Guidebook
          </button>

          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-memory-map'))
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <Network size={18} className="text-white/60" /> Memory Map
          </button>

          <button
            onClick={() => handleNav('/relational')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <HeartPulse size={18} className="text-white/60" /> Relational Growth
          </button>

          <button
            onClick={() => {
              onOpenHistory()
              setIsOpen(false)
            }}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm font-medium text-left"
          >
            <History size={18} className="text-white/60" /> History
          </button>

          <div className="h-px w-full bg-white/10 my-1" />

          <button
            onClick={() => handleNav('/whatsapp-bot')}
            className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 cursor-pointer text-white/80 text-sm font-medium"
          >
            <MessageCircle className={waStatus === 'connected' ? 'text-white' : 'text-white/30'} size={18} />
            <div className="flex-1 text-left">WhatsApp Bot</div>
            <div
              className={`w-2 h-2 rounded-full ${waStatus === 'connected' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]' : waStatus === 'qr' ? 'bg-yellow-400' : 'bg-red-500'}`}
            />
          </button>
        </div>
      )}
    </div>
  )
}

export default FloatingMenu