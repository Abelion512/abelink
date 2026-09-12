import { FaUser, FaHeartbeat, FaSlidersH, FaTerminal } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'

export default function PersonalizationSection({
  config,
  setConfig,
  handlePersonalityChange,
  activeSection
}) {
  const navigate = useNavigate()

  return (
    <section
      id="cfg-personalization"
      className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-personalization' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Personalization
        </h2>
      </div>

      {/* Profile & Context */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <FaUser className="text-primary" size={13} />
          <span>Profile</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">Username</label>
            <input
              className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              placeholder="Contoh: Abel"
              value={config.ownerName || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, ownerName: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">Work on:</label>
            <select
              className="select select-sm select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              value={config.occupation || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, occupation: e.target.value }))}
            >
              <option value="">- Pilih bidang -</option>
              {[
                'Software Engineer',
                'Pelajar / Mahasiswa',
                'Data Scientist / AI Researcher',
                'DevOps / SysAdmin',
                'Content Creator',
                'Penulis',
                'Desainer',
                'Musisi / Artis',
                'Entrepreneur',
                'Lainnya'
              ].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
      </article>

      {/* Relational Growth Bridge */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <FaHeartbeat className="text-primary" size={14} />
            <span>Dinamika Relasi &amp; Persona</span>
          </h3>
          <p className="text-xs text-white/50 leading-relaxed">
            Evolusi kepribadian, level empati, kepercayaan, dan gaya komunikasi dikelola secara dinamis di halaman Relational Growth.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/relational')}
          className="btn btn-sm btn-primary rounded-xl shrink-0 gap-2 font-medium cursor-pointer"
        >
          <FaSlidersH size={12} />
          <span>Buka Relational Growth</span>
        </button>
      </article>

      {/* System Directives Prompt */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <FaTerminal className="text-primary" size={12} />
            <span>System Prompt</span>
          </h3>
        </header>
        <textarea
          className="textarea w-full h-44 leading-relaxed no-scrollbar resize-none font-mono text-xs bg-base-100/60 border-white/10 rounded-xl"
          placeholder="Tambahkan instruksi kustom atau gaya penulisan spesifik untuk Abelink..."
          value={config.personality || ''}
          onChange={handlePersonalityChange}
        />
      </article>
    </section>
  )
}
