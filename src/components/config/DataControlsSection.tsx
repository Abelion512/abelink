import { tx } from '../../api/locale'

export default function DataControlsSection({
  activeSection,
  onClearAllChat,
  onExportChat,
  onImportLegacy,
  language = 'en'
}) {
  return (
    <section
      id="cfg-memory-data"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-memory-data' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {tx(language, 'data.title')}
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{tx(language, 'data.subtitle')}</p>
        <p className="text-xs opacity-60">
          {tx(language, 'data.desc')}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn btn-outline btn-sm btn-error rounded-xl"
            onClick={onClearAllChat}
          >
            {tx(language, 'data.clearAll')}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm btn-info rounded-xl"
            onClick={onExportChat}
          >
            {tx(language, 'data.exportJson')}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm rounded-xl"
            onClick={onImportLegacy}
          >
            {tx(language, 'data.importLegacy')}
          </button>
        </div>
      </div>
    </section>
  )
}
