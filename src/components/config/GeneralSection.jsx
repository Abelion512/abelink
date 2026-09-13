export default function GeneralSection({
  config,
  setConfig,
  fullMode,
  setFullMode,
  activeSection
}) {
  return (
    <section
      id="cfg-general"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-general' ? 'hidden' : ''}`}
    >
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">General</h2>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Bahasa</p>
        <select
          className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
          value={config.language || 'id'}
          onChange={(e) => setConfig((prev) => ({ ...prev, language: e.target.value }))}
        >
          <option value="id">Indonesia</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Mode performa */}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Mode Performa</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={fullMode}
            onChange={(e) => {
              const v = e.target.checked
              setFullMode(v)
              try {
                localStorage.setItem('abelink:fullmode', v ? '1' : '0')
                localStorage.setItem('abelink:fullmode-asked', '1')
              } catch (_) {}
            }}
          />
          <span className="text-xs text-white/70">Mode penuh (coba fitur berat dulu, degradasi bila gagal)</span>
        </label>
      </div>

      {/* Preferensi jendela: transparansi */}
      <div className="space-y-2 p-3 rounded-xl bg-base-200/50 border border-white/5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Transparansi Jendela</p>
          <span className="font-mono text-xs text-primary font-bold">
            {Math.round((config.windowOpacity ?? 0.85) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={config.windowOpacity ?? 0.85}
          className="range range-primary range-xs w-full"
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            document.documentElement.style.setProperty('--win-alpha', String(val))
            setConfig((prev) => {
              const newConfig = { ...prev, windowOpacity: val }
              if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
              return newConfig
            })
          }}
        />
        <div className="flex justify-between mt-1 text-[11px] opacity-40">
          <span>10%</span>
          <span>100%</span>
        </div>
      </div>
    </section>
  )
}
