import { t } from '../../api/locale'

export default function DeveloperSection({
  activeSection,
  devHarness: _devHarness,
  setDevHarness: _setDevHarness,
  onDumpPrompt,
  language = 'en'
}: {
  activeSection: string
  devHarness?: boolean
  setDevHarness?: (v: boolean) => void
  onDumpPrompt: () => Promise<void>
  language?: string
}) {
  return (
    <section
      id="cfg-developer"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-developer' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {t(language, 'dev.title')}
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{t(language, 'dev.debugLogging')}</p>
        <p className="text-xs opacity-60">
          {t(language, 'dev.debugDesc')}
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit opacity-50" title={t(language, 'dev.alwaysOnTitle')}>
          <input
            type="checkbox"
            className="toggle toggle-warning toggle-sm"
            checked
            readOnly
          />
          <span className="text-sm font-mono">{t(language, 'dev.alwaysOn')}</span>
        </label>
      </div>

      <div className="pt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm rounded-xl font-mono text-xs"
          onClick={onDumpPrompt}
        >
          {t(language, 'dev.dumpPrompt')}
        </button>
        <a href="#/trajectory" className="btn btn-outline btn-sm rounded-xl font-mono text-xs">
          {t(language, 'dev.openTrajectory')}
        </a>
      </div>
    </section>
  )
}
