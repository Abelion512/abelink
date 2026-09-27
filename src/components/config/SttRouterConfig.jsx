import { useState } from 'react'
import { DEFAULT_STT_MODEL } from '../../api/sttGuard'
import { tx } from '../../api/locale'
import {
  Zap,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { MobiusLoader } from '../core/MobiusLoader'

export default function SttRouterConfig({
  config,
  setConfig,
  hardwareSupport,
  whisperLoading,
  whisperLoaded,
  whisperProgress,
  onDownloadWhisper,
  testingConnId,
  connTestResults,
  onTestConnection
}) {
  const [expandedIds, setExpandedIds] = useState(() => {
    // Expand item pertama secara default jika ada
    const firstId = config.sttConnections?.[0]?.id
    return new Set(firstId ? [firstId] : [])
  })

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleAdd = () => {
    const newId = `conn-${Date.now()}`
    const newConn = {
      id: newId,
      name: tx(config, 'stt.newProvider')((config.sttConnections || []).length + 1),
      endpoint: 'http://127.0.0.1:20128/v1/audio/transcriptions',
      apiKey: '',
      model: DEFAULT_STT_MODEL,
      enabled: true
    }
    setConfig((prev) => ({
      ...prev,
      sttConnections: [...(prev.sttConnections || []), newConn]
    }))
    // Otomatis expand koneksi baru agar langsung bisa diedit
    setExpandedIds((prev) => new Set([...prev, newId]))
  }

  const handleUpdate = (id, field, value) => {
    setConfig((prev) => ({
      ...prev,
      sttConnections: (prev.sttConnections || []).map((c) =>
        c.id === id ? { ...c, [field]: value } : c
      )
    }))
  }

  const handleRemove = (id) => {
    setConfig((prev) => ({
      ...prev,
      sttConnections: (prev.sttConnections || []).filter((c) => c.id !== id)
    }))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleMove = (idx, delta) => {
    setConfig((prev) => {
      const list = [...(prev.sttConnections || [])]
      const targetIdx = idx + delta
      if (targetIdx < 0 || targetIdx >= list.length) return prev
      const temp = list[idx]
      list[idx] = list[targetIdx]
      list[targetIdx] = temp
      return { ...prev, sttConnections: list }
    })
  }

  const isWhisperMode = config.sttProvider === 'whisper'
  const connections = config.sttConnections || []
  const t = (k) => tx(config, k)

  return (
    <section
      id="tour-stt-provider"
      className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-4"
    >
      {/* Header & Mode Switcher */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white/90">{t('stt.title')}</h3>
        </div>

        <nav className="inline-flex p-1 bg-base-300/60 rounded-xl border border-white/5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, sttProvider: 'custom' }))}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              !isWhisperMode
                ? 'bg-primary text-primary-content shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>Custom</span>
          </button>
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, sttProvider: 'whisper' }))}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              isWhisperMode
                ? 'bg-primary text-primary-content shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>Local</span>
          </button>
        </nav>
      </header>

      {/* Compact Hardware Notice */}
      {hardwareSupport && (
        <aside
          className={`text-xs px-3.5 py-2.5 rounded-xl border flex items-center gap-2.5 ${
            hardwareSupport.isLowEnd
              ? 'bg-warning/10 border-warning/20 text-warning'
              : 'bg-info/10 border-info/20 text-info'
          }`}
        >
          {hardwareSupport.isLowEnd ? (
            <AlertTriangle className="text-xs shrink-0" />
          ) : (
            <CheckCircle2 className="text-xs shrink-0" />
          )}
          <span className="font-medium">
            {t('stt.hwHint')(hardwareSupport.cores)}
          </span>
        </aside>
      )}

      {/* PANEL 1: LOCAL WHISPER */}
      {isWhisperMode ? (
        <fieldset className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/70">{t('stt.model')}</label>
              <select
                className="select select-bordered select-sm w-full font-mono text-xs rounded-xl bg-base-100/60 border-white/10"
                value={config.localWhisperModel || 'whisper-small'}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, localWhisperModel: e.target.value }))
                }
              >
                <option value="whisper-tiny">{t('stt.modelTiny')}</option>
                <option value="whisper-small">{t('stt.modelSmall')}</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <button
                type="button"
                disabled={whisperLoading}
                onClick={onDownloadWhisper}
                className="btn btn-sm btn-primary rounded-xl gap-2 font-medium"
              >
                {whisperLoading ? (
                  <>
                    <MobiusLoader size={14} />
                    <span>{t('stt.loadingModel')}</span>
                  </>
                ) : whisperLoaded ? (
                  <>
                    <CheckCircle2 />
                    <span>{t('stt.modelReady')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('stt.install')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {whisperProgress && (
            <p className="p-2.5 rounded-xl bg-base-100/60 border border-white/10 text-xs font-mono text-info">
              {whisperProgress}
            </p>
          )}
        </fieldset>
      ) : (
        /* PANEL 2: STT ROUTER (MULTI-PROVIDER) */
        <fieldset className="space-y-4 pt-1">
          {/* Top Controls: Routing, Bahasa, & Tambah Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/60">{t('stt.router')}</span>
                <select
                  className="select select-bordered select-sm text-xs font-medium rounded-xl bg-base-100/60 border-white/10"
                  value={config.sttStrategy || 'fallback'}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, sttStrategy: e.target.value }))
                  }
                >
                  <option value="fallback">Fallback</option>
                  <option value="round-robin">Round Robin</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/60">{t('stt.language')}</span>
                <select
                  className="select select-bordered select-sm text-xs font-medium rounded-xl bg-base-100/60 border-white/10"
                  value={config.sttLanguage || 'id'}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, sttLanguage: e.target.value }))
                  }
                >
                  <option value="id">Indonesia (id)</option>
                  <option value="en">English (en)</option>
                  <option value="zh">Mandarin (zh)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              className="btn btn-sm btn-outline btn-primary rounded-xl gap-1.5 text-xs font-medium"
            >
              <Plus size={11} />
              <span>{t('stt.addProvider')}</span>
            </button>
          </div>

          {/* Scalable Provider List (Scrollable container to prevent endless page scroll) */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {connections.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-xs text-white/60">
                {t('stt.emptyHint')}
              </div>
            ) : (
              connections.map((conn, idx) => {
                const isExpanded = expandedIds.has(conn.id)
                const isTesting = testingConnId === conn.id
                const testResult = connTestResults[conn.id]

                return (
                  <article
                    key={conn.id}
                    className={`rounded-xl border transition-all duration-150 ${
                      conn.enabled
                        ? 'bg-base-100/40 border-white/10 shadow-sm'
                        : 'bg-base-100/15 border-white/5 opacity-60'
                    }`}
                  >
                    {/* Compact Header Row (Click anywhere on row to expand/collapse) */}
                    <div
                      onClick={() => toggleExpand(conn.id)}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Priority Badge */}
                        <span className="font-mono text-[11px] font-bold text-white/60 shrink-0">
                          #{idx + 1}
                        </span>

                        {/* Enable Toggle */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="toggle toggle-xs toggle-primary shrink-0 cursor-pointer"
                            checked={conn.enabled}
                            onChange={(e) =>
                              handleUpdate(conn.id, 'enabled', e.target.checked)
                            }
                            title={conn.enabled ? t('stt.active') : t('stt.inactive')}
                          />
                        </div>

                        {/* Provider Name */}
                        <input
                          type="text"
                          value={conn.name || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleUpdate(conn.id, 'name', e.target.value)}
                          placeholder={t('stt.providerNamePh')}
                          className="input input-xs input-ghost text-xs font-semibold text-white/90 p-0 focus:px-1.5 focus:bg-base-300/80 rounded max-w-[150px] shrink-0"
                        />

                        {/* Endpoint & Model Snippet */}
                        <span
                          className="hidden md:inline font-mono text-[11px] text-white/60 truncate max-w-[220px]"
                          title={conn.endpoint}
                        >
                          {conn.endpoint?.replace(/^https?:\/\//, '') || t('stt.noEndpoint')}
                        </span>

                        {/* Latency / Test Status Pill */}
                        {testResult && (
                          <span
                            className={`badge badge-xs font-mono text-[11px] shrink-0 px-2 py-0.5 ${
                              testResult.ok
                                ? 'badge-info badge-outline'
                                : 'badge-error badge-outline'
                            }`}
                            title={testResult.msg}
                          >
                            {testResult.ok ? `${testResult.latency}ms` : t('stt.failed')}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 shrink-0">
                        {/* Quick Test */}
                        <button
                          type="button"
                          disabled={isTesting}
                          onClick={() => onTestConnection(conn)}
                          className="btn btn-ghost btn-xs btn-circle text-info hover:bg-info/10"
                          title={t('stt.testConn')}
                        >
                          {isTesting ? (
                            <MobiusLoader size={12} />
                          ) : (
                            <Zap size={11} />
                          )}
                        </button>

                        {/* Reorder Up */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, -1)}
                          className="btn btn-ghost btn-xs btn-square text-white/60 hover:text-white disabled:opacity-20"
                          title={t('stt.priUp')}
                        >
                          <ArrowUp size={11} />
                        </button>

                        {/* Reorder Down */}
                        <button
                          type="button"
                          disabled={idx === connections.length - 1}
                          onClick={() => handleMove(idx, 1)}
                          className="btn btn-ghost btn-xs btn-square text-white/60 hover:text-white disabled:opacity-20"
                          title={t('stt.priDown')}
                        >
                          <ArrowDown size={11} />
                        </button>

                        {/* Delete */}
                        {connections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemove(conn.id)}
                            className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error hover:bg-error/10"
                            title={t('stt.delProv')}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}

                        {/* Expand / Collapse Chevron */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(conn.id)}
                          className="btn btn-ghost btn-xs btn-square text-white/60 hover:text-white ml-0.5"
                          title={isExpanded ? t('stt.collapse') : t('stt.expand')}
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Form Details (Spacious, Clear, Standard Font) */}
                    {isExpanded && (
                      <div className="p-4 pt-2 border-t border-white/5 bg-base-200/30 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-xs font-semibold text-white/70">{t('stt.endpointUrl')}</label>
                            <input
                              type="text"
                              value={conn.endpoint || ''}
                              onChange={(e) => handleUpdate(conn.id, 'endpoint', e.target.value)}
                              placeholder="http://127.0.0.1:20128/v1/audio/transcriptions"
                              className="input input-sm input-bordered w-full font-mono text-xs rounded-xl bg-base-100/60 border-white/10"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-white/70">{t('stt.modelLabel')}</label>
                            <input
                              type="text"
                              value={conn.model || ''}
                              onChange={(e) => handleUpdate(conn.id, 'model', e.target.value)}
                              placeholder="whisper-1"
                              className="input input-sm input-bordered w-full font-mono text-xs rounded-xl bg-base-100/60 border-white/10"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-white/70">{t('stt.apiKey')}</label>
                          <input
                            type="password"
                            value={conn.apiKey || ''}
                            onChange={(e) => handleUpdate(conn.id, 'apiKey', e.target.value)}
                            placeholder={t('stt.apiKeyPh')}
                            className="input input-sm input-bordered w-full font-mono text-xs rounded-xl bg-base-100/60 border-white/10"
                          />
                        </div>

                        {testResult && (
                          <div
                            className={`text-xs font-mono p-2 rounded-lg border ${
                              testResult.ok
                                ? 'bg-info/10 border-info/20 text-info'
                                : 'bg-error/10 border-error/20 text-error'
                            }`}
                          >
                            {testResult.msg}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </fieldset>
      )}
    </section>
  )
}
