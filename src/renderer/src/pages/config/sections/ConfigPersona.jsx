// Section: Persona & Agent Behavior (personality, temperature, context, max turns, approval mode)
export default function ConfigPersona({ config, setConfig }) {
  const modes = [
    { value: 'strict', label: '🔒 Strict', desc: 'Tanya semua' },
    { value: 'selective', label: '🟡 Selective', desc: 'Auto baca, tanya tulis' },
    { value: 'auto', label: '🟢 Auto', desc: 'AI decide' },
    { value: 'bypass', label: '⚡ Bypass', desc: 'Jalankan semua' },
    { value: 'plan', label: '📋 Plan', desc: 'Read-only' },
  ]

  return (
    <section className="space-y-5">
      {/* System Persona */}
      <div id="tour-persona" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
        <textarea
          className="textarea w-full h-72 leading-relaxed no-scrollbar resize-none"
          placeholder="Deskripsikan kepribadian Mark..."
          value={config.personality}
          onChange={(e) => setConfig((prev) => ({ ...prev, personality: e.target.value }))}
        />
      </div>

      {/* Temperature */}
      <div id="tour-temperature" className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Temperature</p>
          <span className="font-mono text-sm text-primary font-bold">{config.temperature}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.1"
          value={config.temperature}
          className="range range-primary range-xs w-full"
          onChange={(e) => setConfig((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
        />
        <div className="flex justify-between px-2.5 mt-2 text-xs">
          <span>0</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1.0</span>
        </div>
      </div>

      {/* Context Window */}
      <div id="tour-context" className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Context Window</p>
          <span className="font-mono text-sm text-primary font-bold">{config.context}</span>
        </div>
        <input
          type="range" min="2" max="22" step="2"
          value={config.context}
          className="range range-primary range-xs w-full"
          onChange={(e) => setConfig((prev) => ({ ...prev, context: Number(e.target.value) }))}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>2</span><span>6</span><span>10</span><span>14</span><span>18</span><span>22</span>
        </div>
      </div>

      {/* Max Agent Turns */}
      <div className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Max Turns per Task</p>
          <span className="font-mono text-sm text-primary font-bold">{config.maxTurns || 20}</span>
        </div>
        <input
          type="range" min="5" max="50" step="5"
          value={config.maxTurns || 20}
          className="range range-primary range-xs w-full"
          onChange={(e) => setConfig((prev) => ({ ...prev, maxTurns: Number(e.target.value) }))}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>5</span><span>15</span><span>25</span><span>35</span><span>50</span>
        </div>
      </div>

      <div className="divider"></div>

      {/* Approval Mode */}
      <div className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Mode Persetujuan (Approval)</p>
          <span className="font-mono text-xs text-primary font-bold uppercase">{config.approvalMode || 'selective'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => setConfig((prev) => ({ ...prev, approvalMode: m.value }))}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                (config.approvalMode || 'selective') === m.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-white/10 text-white/60 hover:border-white/30'
              }`}
              title={m.desc}
            >
              {m.label}
              <div className="text-[10px] opacity-60 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
