import { useState, useEffect, useRef } from 'react'
import { FaRobot, FaCamera, FaKeyboard, FaMicrophone, FaBrain } from 'react-icons/fa'

const sections = [
  { id: 'cfg-ai-engine', label: 'AI Engine', icon: FaRobot },
  { id: 'cfg-camera', label: 'Kamera', icon: FaCamera },
  { id: 'cfg-shortcut', label: 'Shortcut', icon: FaKeyboard },
  { id: 'cfg-audio-voice', label: 'Audio & Voice', icon: FaMicrophone },
]

const sectionsLogged = [
  { id: 'cfg-memory-data', label: 'Memory & Data', icon: FaBrain },
]

export default function ConfigSidebar({ isFirstSetup = false, activeSection, onNavigate }) {
  const [focusedIdx, setFocusedIdx] = useState(0)
  const allSections = isFirstSetup ? [...sections] : [...sections, ...sectionsLogged]
  const navRef = useRef(null)

  useEffect(() => {
    const idx = allSections.findIndex((s) => s.id === activeSection)
    if (idx >= 0) setFocusedIdx(idx)
  }, [activeSection])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      setFocusedIdx((i) => {
        const next = Math.min(i + 1, allSections.length - 1)
        onNavigate(allSections[next].id)
        return next
      })
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      setFocusedIdx((i) => {
        const prev = Math.max(i - 1, 0)
        onNavigate(allSections[prev].id)
        return prev
      })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onNavigate(allSections[focusedIdx].id)
    }
  }

  return (
    <nav
      ref={navRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="flex flex-col w-[220px] min-w-[220px] h-full bg-base-300/80 backdrop-blur-xl border-r border-white/5 overflow-y-auto custom-scrollbar focus:outline-none"
      role="tablist"
      aria-label="Pengaturan"
    >
      <div className="px-4 py-5 border-b border-white/5">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-40">Pengaturan</p>
      </div>
      <div className="flex-1 py-2">
        {allSections.map((sec, idx) => {
          const Icon = sec.icon
          const isActive = activeSection === sec.id
          return (
            <button
              key={sec.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onNavigate(sec.id)
                setFocusedIdx(idx)
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-all duration-200 cursor-pointer
                ${isActive
                  ? 'bg-primary/10 text-primary border-r-2 border-primary'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 border-r-2 border-transparent'
                }`}
            >
              <Icon size={15} className={isActive ? 'text-primary' : 'opacity-50'} />
              <span className="font-medium">{sec.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
