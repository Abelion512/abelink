import {
  FaCog,
  FaPuzzlePiece,
  FaKeyboard,
  FaDatabase,
  FaCode,
  FaRobot,
  FaUserCog,
  FaVolumeUp
} from 'react-icons/fa'

// IA: General → Personalization → Model → Voice & Video →
// Capabilities → Shortcuts → Data Controls / Developer.
// Ekspor sections untuk kontrak test (tests/configCapabilities.test.js).
export const sections = [
  { id: 'cfg-general', label: 'General', icon: FaCog },
  { id: 'cfg-personalization', label: 'Personalization', icon: FaUserCog },
  { id: 'cfg-model', label: 'Model', icon: FaRobot },
  { id: 'cfg-voice-video', label: 'Voice & Video', icon: FaVolumeUp },
  { id: 'cfg-capabilities', label: 'Capabilities', icon: FaPuzzlePiece },
  { id: 'cfg-shortcut', label: 'Shortcuts', icon: FaKeyboard }
]

export const sectionsLogged = [
  { id: 'cfg-memory-data', label: 'Data Controls', icon: FaDatabase },
  { id: 'cfg-developer', label: 'Developer', icon: FaCode }
]

const IT_KEYWORDS = [
  'software',
  'developer',
  'devops',
  'data scientist',
  'programmer',
  'sysadmin',
  'engineer',
  'researcher',
  'it'
]

export const isItDomain = (occ) => {
  if (!occ || typeof occ !== 'string') return false
  const lower = occ.toLowerCase().trim()
  return IT_KEYWORDS.some((kw) => lower.includes(kw))
}

export default function ConfigSidebar({
  isFirstSetup = false,
  activeSection,
  onNavigate,
  occupation = '',
  isDevMode = false
}) {
  const showDev = isDevMode || isItDomain(occupation)
  const filteredLogged = showDev
    ? sectionsLogged
    : sectionsLogged.filter((s) => s.id !== 'cfg-developer')

  const allSections = isFirstSetup ? sections : [...sections, ...filteredLogged]
  const activeIdx = Math.max(
    0,
    allSections.findIndex((s) => s.id === activeSection)
  )

  const handleKeyDown = (e) => {
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
      className="flex flex-col w-[230px] min-w-[230px] h-full bg-base-300/60 backdrop-blur-2xl border-r border-white/5 overflow-y-auto custom-scrollbar focus:outline-none p-3"
      role="tablist"
      aria-label="Pengaturan"
    >
      <div className="px-3 py-3 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Pengaturan</p>
      </div>
      <div className="flex-1 space-y-1">
        {allSections.map((sec) => {
          const Icon = sec.icon
          const isActive = activeSection === sec.id
          return (
            <button
              key={sec.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onNavigate(sec.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-left transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-white/10 text-white shadow-sm font-semibold border border-white/10'
                  : 'text-white/50 hover:text-white/90 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-primary' : 'opacity-40'} />
              <span className="truncate">{sec.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
