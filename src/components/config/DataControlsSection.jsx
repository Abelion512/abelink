export default function DataControlsSection({
  activeSection,
  onClearAllChat,
  onExportChat,
  onImportLegacy
}) {
  return (
    <section
      id="cfg-memory-data"
      className={`space-y-5 scroll-mt-4 ${activeSection !== 'cfg-memory-data' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Data Controls
        </h2>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Chat History &amp; Database</p>
        <p className="text-xs opacity-60">
          Kelola riwayat percakapan lokal, ekspor arsip, atau impor cadangan data JSON lama.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn btn-outline btn-sm btn-error rounded-xl"
            onClick={onClearAllChat}
          >
            Hapus Semua Chat
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm btn-info rounded-xl"
            onClick={onExportChat}
          >
            Export Chat ke JSON
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm rounded-xl"
            onClick={onImportLegacy}
          >
            Impor Export JSON Lama
          </button>
        </div>
      </div>
    </section>
  )
}
