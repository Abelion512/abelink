import { User, HeartPulse, SlidersHorizontal, Terminal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { t } from '../../api/locale'
import type { ConfigRow } from '../../api/db'
import type { ChangeEvent } from 'react'

export default function PersonalizationSection({
  config,
  setConfig,
  handlePersonalityChange,
  activeSection
}: {
  config: ConfigRow
  setConfig: (updater: (prev: ConfigRow) => ConfigRow) => void
  handlePersonalityChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  activeSection: string
}) {
  const navigate = useNavigate()

  return (
    <section
      id="cfg-personalization"
      className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-personalization' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          {t(config, 'pers.title')}
        </h2>
      </div>

      {/* Profile & Context */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
          <User className="text-primary" size={13} />
          <span>{t(config, 'pers.profile')}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">{t(config, 'pers.username')}</label>
            <input
              className="input input-sm input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              placeholder={t(config, 'pers.usernamePh')}
              value={config.ownerName || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, ownerName: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/70">{t(config, 'pers.workOn')}</label>
            <select
              className="select select-sm select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              value={config.occupation || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, occupation: e.target.value }))}
            >
              <option value="">{t(config, 'pers.pickField')}</option>
              {[
                t(config, 'pers.occSwe'),
                t(config, 'pers.occStudent'),
                t(config, 'pers.occData'),
                t(config, 'pers.occDevops'),
                t(config, 'pers.occCreator'),
                t(config, 'pers.occWriter'),
                t(config, 'pers.occDesigner'),
                t(config, 'pers.occMusic'),
                t(config, 'pers.occEntre'),
                t(config, 'pers.occOther')
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
            <span>{t(config, 'pers.relTitle')}</span>
          </h3>
          <p className="text-xs text-white/60 leading-relaxed">
            {t(config, 'pers.relDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/relational')}
          className="btn btn-sm btn-primary rounded-xl shrink-0 gap-2 font-medium cursor-pointer"
        >
          <SlidersHorizontal size={12} />
          <span>{t(config, 'pers.openRel')}</span>
        </button>
      </article>

      {/* System Directives Prompt */}
      <article className="rounded-2xl border border-white/10 bg-base-200/40 backdrop-blur-md p-5 space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Terminal className="text-primary" size={12} />
            <span>{t(config, 'pers.sysPrompt')}</span>
          </h3>
        </header>
        <textarea
          className="textarea w-full h-44 leading-relaxed no-scrollbar resize-none font-mono text-xs bg-base-100/60 border-white/10 rounded-xl"
          placeholder={t(config, 'pers.sysPromptPh')}
          value={config.personality || ''}
          onChange={handlePersonalityChange}
        />
      </article>
    </section>
  )
}
