import { Key, SlidersHorizontal, Plug, Camera, Mic, Brain, ShieldCheck, MessageSquare, ChevronLeft } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'provider', label: 'Provider & Keys', icon: Key, desc: 'AI provider, model, API key' },
  { id: 'persona', label: 'Persona', icon: SlidersHorizontal, desc: 'Kepribadian, temperatur, context' },
  { id: 'integrations', label: 'Integrasi', icon: Plug, desc: 'Last.fm, Awareness' },
  { id: 'camera', label: 'Kamera', icon: Camera, desc: 'Kamera & visual' },
  { id: 'voice', label: 'Suara', icon: Mic, desc: 'TTS & mic' },
  { id: 'memory', label: 'Memori', icon: Brain, desc: 'Relational growth' },
  { id: 'admin', label: 'Admin', icon: ShieldCheck, desc: 'WhatsApp admin' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, desc: 'Riwayat & data' },
]

export default function ConfigSidebar({ activeSection, onSectionChange, onBack, isFirstSetup, hasChat = true }) {
  const items = hasChat ? NAV_ITEMS : NAV_ITEMS.filter(i => i.id !== 'chat')

  return (
    <aside className="flex flex-col h-full">
      {!isFirstSetup && (
        <button onClick={onBack} className="btn btn-ghost btn-sm btn-circle self-start m-2">
          <ChevronLeft size={14} />
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
                  ? 'bg-white/10 text-white font-semibold border border-white/15 backdrop-blur-sm'
                  : 'hover:bg-white/5 opacity-70 hover:opacity-100'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-white' : 'opacity-60'} />
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
