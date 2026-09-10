import { useState } from 'react'

export const normalizeShortcut = (val) => {
  if (!val) return 'CommandOrControl+Alt+M'
  return val
    .replace(/\bctrl\b/gi, 'CommandOrControl')
    .replace(/\bcontrol\b/gi, 'CommandOrControl')
    .replace(/\bcmd\b/gi, 'CommandOrControl')
    .replace(/\bmeta\b/gi, 'CommandOrControl')
}

export default function ShortcutsSection({
  config,
  setConfig,
  activeSection
}) {
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)

  const handleShortcutRecorderKeyDown = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

    const modifiers = []
    if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')

    let keyName = e.key.toUpperCase()
    if (e.code === 'Space' || keyName === ' ') keyName = 'Space'

    const fullShortcut = [...modifiers, keyName].join('+')

    setConfig((prev) => {
      const updated = { ...prev, shortcutKey: fullShortcut }
      if (window.api?.syncConfig) window.api.syncConfig(updated)
      return updated
    })
    setIsRecordingShortcut(false)
  }

  return (
    <section
      id="cfg-shortcut"
      className={`space-y-5 p-2 -mx-2 rounded-lg scroll-mt-4 ${activeSection !== 'cfg-shortcut' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Global Shortcut Key
        </h2>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-end">
          <label className="text-sm font-semibold">Tombol Panggilan Cepat</label>
          <span className="text-[10px] font-mono opacity-50">Aktif Lintas Aplikasi</span>
        </div>

        <div className="relative w-full">
          <input
            type="text"
            readOnly
            onFocus={() => setIsRecordingShortcut(true)}
            onBlur={() => setIsRecordingShortcut(false)}
            onKeyDown={handleShortcutRecorderKeyDown}
            value={
              isRecordingShortcut
                ? 'Tekan kombinasi tombol di keyboard...'
                : (config.shortcutKey || 'CommandOrControl+Alt+M').replace(
                    /CommandOrControl|Control/g,
                    'Ctrl'
                  )
            }
            className={`input input-bordered w-full font-mono text-sm cursor-pointer select-none rounded-xl bg-base-100/60 ${
              isRecordingShortcut
                ? 'input-primary border-2 animate-pulse bg-primary/10 text-primary font-bold'
                : 'hover:border-primary/60 border-white/10'
            }`}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-xs opacity-60 w-full mb-1">Preset Cepat:</span>
          {[
            'CommandOrControl+Alt+M',
            'CommandOrControl+Shift+Space',
            'Alt+Space',
            'CommandOrControl+Space',
            'F9'
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setConfig((prev) => {
                  const updated = { ...prev, shortcutKey: preset }
                  if (window.api?.syncConfig) window.api.syncConfig(updated)
                  return updated
                })
              }}
              className={`btn btn-xs rounded-lg ${
                config.shortcutKey === preset ? 'btn-primary' : 'btn-ghost border-base-content/20'
              } font-mono`}
            >
              {preset.replace('CommandOrControl', 'Ctrl')}
            </button>
          ))}
        </div>
        <span className="text-[11px] opacity-60 block mt-1">
          Klik kotak input di atas lalu tekan kombinasi tombol di keyboard (misal: <code>Ctrl+Alt+A</code>, <code>Alt+Space</code>, <code>F9</code>). Shortcut langsung aktif di OS.
        </span>
      </div>
    </section>
  )
}
