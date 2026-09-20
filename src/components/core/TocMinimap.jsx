import { useEffect, useState } from 'react'
import { AlignRight } from 'lucide-react'

// Single anchor-id scheme shared by ChatStudio items and ChatList rows:
// `msg-<stable id with unsafe chars dashed>`.
export const toMinimapAnchorId = (raw) =>
  `msg-${String(raw).replace(/[^A-Za-z0-9_-]/g, '-')}`

// Slim chat minimap rail: bars mirror the message list (user = depth 2,
// assistant = depth 3). Hover/focus expands a title panel; click smooth-scrolls
// to the anchored message. Pure Tailwind, no external hover-card.
export const TocMinimap = ({ items = [], onJump, scrollRoot = null }) => {
  const [activeId, setActiveId] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!items.length) return undefined
    const root = scrollRoot?.current ?? null
    const targets = items.map((item) => document.getElementById(item.id)).filter(Boolean)
    if (!targets.length) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (!visible.length) return
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        setActiveId(visible[0].target.id)
      },
      { root, rootMargin: '-20% 0px -65% 0px' }
    )
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [items, scrollRoot])

  if (!items.length) return null

  const jump = (id) => {
    setActiveId(id)
    setOpen(false)
    if (onJump) {
      onJump(id)
      return
    }
    const el = document.getElementById(id)
    if (!el) return
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    if (window.history?.replaceState) window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <nav
      aria-label="Navigasi pesan"
      className="pointer-events-none absolute top-2 right-1 bottom-2 z-10 flex w-10 items-stretch justify-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <div className="pointer-events-auto flex flex-col items-center justify-center gap-1.5 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Tutup panel navigasi' : 'Buka panel navigasi'}
          title={open ? 'Tutup panel navigasi' : 'Buka panel navigasi'}
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-5 w-6 items-center justify-center rounded-md bg-white/[0.08] text-white/70 outline-none transition-colors hover:bg-white/[0.15] hover:text-white focus-visible:ring-1 focus-visible:ring-[#0a84ff]"
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        {items.map((item) => {
          const isActive = item.id === activeId
          const isUser = item.depth === 2
          return (
            <button
              key={item.id}
              type="button"
              title={item.title}
              aria-label={item.title}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => jump(item.id)}
              onFocus={() => setOpen(true)}
              className={`rounded-full transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-[#0a84ff] ${
                isUser ? 'w-6' : 'ml-3 w-3'
              } ${isActive ? 'h-1.5 bg-[#0a84ff]' : 'h-1 bg-white/20 hover:bg-white/60'}`}
            />
          )
        })}
      </div>
      {open && (
        <div className="pointer-events-auto absolute top-1/2 right-9 max-h-72 w-60 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#161618]/95 p-2 shadow-2xl backdrop-blur-2xl custom-scrollbar animate-fade-in">
          {items.map((item) => {
            const isActive = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                title={item.title}
                onClick={() => jump(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`block w-full truncate rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors ${
                  item.depth === 2 ? 'font-semibold text-white/90' : 'pl-4 font-normal text-white/60'
                } ${isActive ? 'bg-[#0a84ff]/20 text-[#0a84ff] font-medium' : 'hover:bg-white/[0.08]'}`}
              >
                {item.title}
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}
