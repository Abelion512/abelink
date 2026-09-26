import { tx } from '../../api/locale'

export default function DeveloperSection({
  activeSection,
  devHarness: _devHarness,
  setDevHarness: _setDevHarness,
  onDumpPrompt,
  language = 'en'
}) {
  const t = (k) => tx(language, k)
  return (
    <section
      id="cfg-developer"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-developer' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {t('dev.title')}
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{t('dev.debugLogging')}</p>
        <p className="text-xs opacity-60">
          {t('dev.debugDesc')}
        </p>
        <label className="flex items-center gap-3 cursor-pointer w-fit opacity-50" title={t('dev.alwaysOnTitle')}>
          <input
            type="checkbox"
            className="toggle toggle-warning toggle-sm"
            checked
            readOnly
          />
          <span className="text-sm font-mono">{t('dev.alwaysOn')}</span>
        </label>
      </div>

      <div className="pt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm rounded-xl font-mono text-xs"
          onClick={onDumpPrompt}
        >
          {t('dev.dumpPrompt')}
        </button>
        <a href="#/trajectory" className="btn btn-outline btn-sm rounded-xl font-mono text-xs">
          {t('dev.openTrajectory')}
        </a>
      </div>
    </section>
  )
}
