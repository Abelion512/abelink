import { User, HeartPulse, SlidersHorizontal, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { tx } from '../../api/locale'

export default function PersonalizationSection({
  config,
  setConfig,
  handlePersonalityChange,
  activeSection
}) {
  const navigate = useNavigate()
  const t = (k) => tx(config, k)

  return (
    <section
      id="cfg-personalization"
      className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-personalization' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {t('pers.title')}
        </h2>
      </div>

      {/* Profile & Context */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <User className="text-primary" size={13} />
          <span>{t('pers.profile')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">{t('pers.username')}</label>
            <input
              className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              placeholder={t('pers.usernamePh')}
              value={config.ownerName || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, ownerName: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">{t('pers.workOn')}</label>
            <select
              className="select select-sm select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              value={config.occupation || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, occupation: e.target.value }))}
            >
              <option value="">{t('pers.pickField')}</option>
              {[
                t('pers.occSwe'),
                t('pers.occStudent'),
                t('pers.occData'),
                t('pers.occDevops'),
                t('pers.occCreator'),
                t('pers.occWriter'),
                t('pers.occDesigner'),
                t('pers.occMusic'),
                t('pers.occEntre'),
                t('pers.occOther')
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
            <HeartPulse className="text-primary" size={14} />
            <span>{t('pers.relTitle')}</span>
          </h3>
          <p className="text-xs text-white/60 leading-relaxed">
            {t('pers.relDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/relational')}
          className="btn btn-sm btn-primary rounded-xl shrink-0 gap-2 font-medium cursor-pointer"
        >
          <SlidersHorizontal size={12} />
          <span>{t('pers.openRel')}</span>
        </button>
      </article>

      {/* System Directives Prompt */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Terminal className="text-primary" size={12} />
            <span>{t('pers.sysPrompt')}</span>
          </h3>
        </header>
        <textarea
          className="textarea w-full h-44 leading-relaxed no-scrollbar resize-none font-mono text-xs bg-base-100/60 border-white/10 rounded-xl"
          placeholder={t('pers.sysPromptPh')}
          value={config.personality || ''}
          onChange={handlePersonalityChange}
        />
      </article>
    </section>
  )
}
