import { t } from '../../api/locale'

export default function DataControlsSection({
  activeSection,
  onClearAllChat,
  onExportChat,
  onImportLegacy,
  language = 'en'
}: {
  activeSection: string
  onClearAllChat: () => Promise<void>
  onExportChat: () => Promise<void>
  onImportLegacy: () => Promise<void>
  language?: string
}) {
  return (
    <section
      id="cfg-memory-data"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-memory-data' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {t(language, 'data.title')}
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{t(language, 'data.subtitle')}</p>
        <p className="text-xs opacity-60">
          {t(language, 'data.desc')}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn btn-outline btn-sm btn-error rounded-xl"
            onClick={onClearAllChat}
          >
            {t(language, 'data.clearAll')}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm btn-info rounded-xl"
            onClick={onExportChat}
          >
            {t(language, 'data.exportJson')}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm rounded-xl"
            onClick={onImportLegacy}
          >
            {t(language, 'data.importLegacy')}
          </button>
        </div>
      </div>
    </section>
  )
}
