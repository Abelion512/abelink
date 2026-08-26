import { FaCog, FaPuzzlePiece, FaKeyboard, FaDatabase, FaCode, FaRobot, FaUserCog } from 'react-icons/fa'

// IA baru (review 2026-08-26): General → Personalization → AI Engine →
// Capabilities → Shortcuts → Data Controls / Developer.
const sections = [
  { id: 'cfg-general', label: 'General', icon: FaCog },
  { id: 'cfg-personalization', label: 'Personalization', icon: FaUserCog },
  { id: 'cfg-ai-engine', label: 'AI Engine', icon: FaRobot },
  { id: 'cfg-capabilities', label: 'Capabilities', icon: FaPuzzlePiece },
  { id: 'cfg-shortcut', label: 'Shortcuts', icon: FaKeyboard },
]

const sectionsLogged = [
  { id: 'cfg-memory-data', label: 'Data Controls', icon: FaDatabase },
  { id: 'cfg-developer', label: 'Developer', icon: FaCode },
]

export default function ConfigSidebar({ isFirstSetup = false, activeSection, onNavigate }) {
  const allSections = isFirstSetup ? sections : [...sections, ...sectionsLogged]
  const activeIdx = Math.max(0, allSections.findIndex((s) => s.id === activeSection))

  const handleKeyDown = (e) => {
    // Enter/Space tidak perlu ditangani: tombol punya fokus DOM asli, aktivasi native.
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      onNavigate(allSections[Math.min(activeIdx + 1, allSections.length - 1)].id)
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      onNavigate(allSections[Math.max(activeIdx - 1, 0)].id)
    }
  }

  return (
    <nav
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
        {allSections.map((sec) => {
          const Icon = sec.icon
          const isActive = activeSection === sec.id
          return (
            <button
              key={sec.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onNavigate(sec.id)}
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
