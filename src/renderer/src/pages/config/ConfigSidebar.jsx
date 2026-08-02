import { FaRobot, FaCamera, FaMicrophone, FaBrain, FaShieldAlt, FaComments, FaChevronLeft } from 'react-icons/fa'

const NAV_ITEMS = [
  { id: 'ai', label: 'AI Engine', icon: FaRobot, desc: 'Provider, model, persona' },
  { id: 'camera', label: 'Kamera', icon: FaCamera, desc: 'Kamera & visual' },
  { id: 'voice', label: 'Suara', icon: FaMicrophone, desc: 'TTS & mic' },
  { id: 'memory', label: 'Memori', icon: FaBrain, desc: 'Relational growth' },
  { id: 'admin', label: 'Admin', icon: FaShieldAlt, desc: 'WhatsApp admin' },
  { id: 'chat', label: 'Chat', icon: FaComments, desc: 'Riwayat & data' },
]

export default function ConfigSidebar({ activeSection, onSectionChange, onBack, isFirstSetup, hasChat = true }) {
  const items = hasChat ? NAV_ITEMS : NAV_ITEMS.filter(i => i.id !== 'chat')

  return (
    <aside className="flex flex-col h-full">
      {!isFirstSetup && (
        <button onClick={onBack} className="btn btn-ghost btn-sm btn-circle self-start m-2">
          <FaChevronLeft size={14} />
        </button>
      )}

      <nav className="flex-1 px-2 py-2 space-y-1">
        {items.map(item => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${
                isActive
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'hover:bg-base-200 opacity-70 hover:opacity-100'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-primary' : 'opacity-60'} />
              <div className="min-w-0">
                <div className="text-sm truncate">{item.label}</div>
                <div className="text-xs opacity-50 truncate">{item.desc}</div>
              </div>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
