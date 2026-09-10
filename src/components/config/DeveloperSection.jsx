export default function DeveloperSection({
  activeSection,
  devHarness,
  setDevHarness,
  onDumpPrompt
}) {
  return (
    <section
      id="cfg-developer"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-developer' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Developer
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Debug Logging (JSONL)</p>
        <p className="text-xs opacity-60">
          Rekam reasoning &amp; tool-call ke file JSONL di folder data aplikasi. Default OFF. Rotasi otomatis 50MB.
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <input
            type="checkbox"
            className="toggle toggle-warning toggle-sm"
            checked={devHarness}
            onChange={(e) => {
              const v = e.target.checked
              setDevHarness(v)
              try {
                localStorage.setItem('devHarnessLogging', v ? '1' : '0')
              } catch (_) {}
            }}
          />
          <span className="text-sm font-mono">{devHarness ? 'AKTIF' : 'OFF'}</span>
        </label>
      </div>

      <div className="pt-2">
        <button
          type="button"
          className="btn btn-outline btn-sm rounded-xl font-mono text-xs"
          onClick={onDumpPrompt}
        >
          Dump System Prompt (Audit)
        </button>
      </div>
    </section>
  )
}
