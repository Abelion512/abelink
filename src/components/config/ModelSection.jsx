import { useState, useEffect } from 'react'
import { Bot, Terminal, Plug } from 'lucide-react'
import { detectProviderFromUrl } from '../../api/ai/providerDetect.js'
import { MobiusLoader } from '../core/MobiusLoader'
import { tx } from '../../api/locale'

export const isCustomEndpointPlausible = (raw, protocol) => {
  const ep = (raw || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(ep)) return false
  if (/\/(chat\/completions|v1)$/.test(ep)) return true
  return /anthropic/i.test(ep) || protocol === 'anthropic'
}

// Cache daftar model per endpoint (localStorage, ringan & sinkron).
// Daftar model berubah tiap ada rilis baru, tapi fetch ulang tiap buka panel
// itu mahal (server agregator bisa >1 menit untuk ~1900 model). Jadi: tampilkan
// cache instan, Deteksi Ulang hanya untuk refresh.
const LM_STUDIO_ENDPOINT = 'http://localhost:1234/v1'

const modelsCacheKey = (endpoint) =>
  `abelink_models_${(endpoint || '').trim().toLowerCase().replace(/\/+$/, '')}`

export const readModelsCache = (endpoint) => {
  try {
    const raw = localStorage.getItem(modelsCacheKey(endpoint))
    if (!raw) return null
    const rec = JSON.parse(raw)
    if (!rec || !Array.isArray(rec.models)) return null
    return rec
  } catch {
    return null
  }
}

export const writeModelsCache = (endpoint, models) => {
  try {
    localStorage.setItem(modelsCacheKey(endpoint), JSON.stringify({ at: Date.now(), models }))
  } catch {
    // storage penuh/diblokir: cache opsional, abaikan diam-diam
  }
}

// Riwayat model custom yang pernah SUKSES dipakai per endpoint (MRU, max 10).
// Ditulis inline oleh core.js setelah fetchAI sukses (tanpa import komponen).
// Model tak terlist /v1/models (mis. oc/...) tetap bisa dipakai ulang dari sini.
export const recentModelsKey = (endpoint) =>
  `abelink_recent_models_${(endpoint || '').trim().toLowerCase().replace(/\/+$/, '')}`

export const readRecentModels = (endpoint) => {
  try {
    const raw = localStorage.getItem(recentModelsKey(endpoint))
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((m) => typeof m === 'string' && m) : []
  } catch {
    return []
  }
}

export const formatCacheAge = (at, langOrConfig = 'en') => {
  const mins = Math.max(0, Math.round((Date.now() - (at || 0)) / 60000))
  if (mins < 1) return tx(langOrConfig, 'model.cacheNow')
  if (mins < 60) return tx(langOrConfig, 'model.cacheMinAgo')(mins)
  const hours = Math.round(mins / 60)
  if (hours < 48) return tx(langOrConfig, 'model.cacheHourAgo')(hours)
  return tx(langOrConfig, 'model.cacheDayAgo')(Math.round(hours / 24))
}

export default function ModelSection({
  config,
  setConfig,
  activeSection
}) {
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [customModels, setCustomModels] = useState([])
  const [customModelsAt, setCustomModelsAt] = useState(null)
  const [detectingModels, setDetectingModels] = useState(false)
  const [modelDetectError, setModelDetectError] = useState('')
  const [lmStudioModels, setLmStudioModels] = useState(() => readModelsCache(LM_STUDIO_ENDPOINT)?.models ?? [])
  const [lmModelsAt, setLmModelsAt] = useState(() => readModelsCache(LM_STUDIO_ENDPOINT)?.at ?? null)
  const [lmDetectAttempted, setLmDetectAttempted] = useState(false)
  const [lmDetecting, setLmDetecting] = useState(false)
  const [lmDetectError, setLmDetectError] = useState('')

  // useCallback agar efek auto-detect di bawah stabil; guard
  // lmDetectAttempted membuatnya one-shot (tanpa re-fire).
  const detectLmStudio = useCallback(async () => {
    if (!window.api?.detectCustomModels) return false
    setLmDetecting(true)
    setLmDetectError('')
    try {
      const list = await window.api.detectCustomModels(LM_STUDIO_ENDPOINT, '', 'openai')
      if (Array.isArray(list) && list.length > 0) {
        setLmStudioModels(list)
        setLmModelsAt(Date.now())
        writeModelsCache(LM_STUDIO_ENDPOINT, list)
        return true
      }
      setLmDetectError(tx(config, 'model.lmNoModels'))
      return false
    } catch (err) {
      setLmDetectError(tx(config, 'model.lmUnreachable')(err?.message || err))
      return false
    } finally {
      setLmDetecting(false)
    }
  }, [config])

  useEffect(() => {
    if (activeSection !== 'cfg-model' || config.aiProvider !== 'lm-studio' || lmDetectAttempted) {
      return
    }
    // One-shot guard + async agar lolos set-state-in-effect.
    void (async () => {
      setLmDetectAttempted(true)
      // Gagal diam-diam di sini disengaja (hindari noise saat buka panel);
      // error tampil saat user tekan Deteksi Ulang.
      try {
        await detectLmStudio()
      } catch (_) {}
    })()
  }, [activeSection, config.aiProvider, lmDetectAttempted, detectLmStudio])

  const handleDetectModels = async () => {
    if (!window.api?.detectCustomModels) return
    setDetectingModels(true)
    setModelDetectError('')
    try {
      const list = await window.api.detectCustomModels(
        config.customEndpoint,
        config.customApiKey,
        config.customApiProtocol || 'auto'
      )
      if (Array.isArray(list) && list.length > 0) {
        setCustomModels(list)
        setCustomModelsAt(Date.now())
        writeModelsCache(config.customEndpoint, list)
        if (!config.customModel && list.length > 0) {
          setConfig((prev) => ({ ...prev, customModel: list[0] }))
        }
      } else {
        setModelDetectError(tx(config, 'model.endpointNoModels'))
      }
    } catch (err) {
      setModelDetectError(tx(config, 'model.detectFailed')(err?.message || err))
    } finally {
      setDetectingModels(false)
    }
  }

  // Ganti endpoint -> tampilkan cache endpoint itu (kalau ada), bukan daftar basi.
  // Bacaan sync dibungkus async agar lolos set-state-in-effect.
  useEffect(() => {
    void (async () => {
      const cached = readModelsCache(config.customEndpoint)
      setCustomModels(cached?.models ?? [])
      setCustomModelsAt(cached?.at ?? null)
      setModelDetectError('')
    })()
  }, [config.customEndpoint])

  return (
    <section
      id="cfg-model"
      className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-model' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">{tx(config, 'model.title')}</h2>
      </div>

      {/* Provider Selector */}
      <div id="tour-ai-provider" className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-white/60">{tx(config, 'model.provider')}</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'gemini-web', name: 'Gemini Web', icon: Bot },
            { id: 'lm-studio', name: 'LM Studio', icon: Terminal },
            { id: 'custom', name: 'Custom API', icon: Plug }
          ].map((prov) => {
            const isSelected = (config.aiProvider || 'gemini-web') === prov.id
            const ProvIcon = prov.icon
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, aiProvider: prov.id }))}
                className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-primary/15 border-primary/40 shadow-sm'
                    : 'bg-base-100/40 border-white/5 hover:border-white/15 hover:bg-base-100/70'
                }`}
              >
                <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-white/80'}`}>
                  {prov.name}
                </span>
                <ProvIcon size={13} className={isSelected ? 'text-primary' : 'text-white/60'} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Provider-specific details */}
      {config.aiProvider === 'gemini-web' || !config.aiProvider ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">{tx(config, 'model.model')}</label>
            <p className="text-xs text-white/60 rounded-xl bg-base-100/60 border border-white/10 px-3 py-2.5">
              {tx(config, 'model.geminiNote')}
            </p>
          </div>
        </div>
      ) : config.aiProvider === 'custom' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">{tx(config, 'model.endpoint')}</label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              className={`input input-bordered w-full rounded-xl bg-base-100/60 text-xs ${
                config.customEndpoint && !isCustomEndpointPlausible(config.customEndpoint, config.customApiProtocol)
                  ? 'input-warning'
                  : 'border-white/10'
              }`}
              value={config.customEndpoint || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))}
            />
            {(() => {
              const detected = detectProviderFromUrl(config.customEndpoint)
              if (detected.id === 'custom' || !config.customEndpoint?.trim()) return null
              const protoHint =
                detected.protocol !== 'auto' &&
                (config.customApiProtocol || 'auto') !== 'auto' &&
                (config.customApiProtocol || 'auto') !== detected.protocol
                  ? tx(config, 'model.protoHint')(detected.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI')
                  : ''
              return (
                <p className="text-xs text-white/60">
                  {tx(config, 'model.detectedPrefix')} {detected.name}
                  {protoHint}
                </p>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">{tx(config, 'model.protocol')}</label>
            <select
              className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
              value={config.customApiProtocol || 'auto'}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, customApiProtocol: e.target.value }))
              }
            >
              <option value="auto">{tx(config, 'model.protoAuto')}</option>
              <option value="openai">{tx(config, 'model.protoOpenai')}</option>
              <option value="anthropic">{tx(config, 'model.protoAnthropic')}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold">{tx(config, 'model.modelId')}</label>
              <button
                type="button"
                className="btn btn-xs btn-outline rounded-lg"
                disabled={detectingModels || !config.customEndpoint}
                onClick={handleDetectModels}
                title={tx(config, 'model.detectTitle')}
              >
                {detectingModels ? (
                  <MobiusLoader size={14} />
                ) : (
                  tx(config, 'model.detectModels')
                )}
              </button>
            </div>
            {modelDetectError && (
              <p className="text-xs text-error mt-1">{modelDetectError}</p>
            )}
            {customModels.length > 0 && (
              <>
                <p className="text-xs text-info">
                  {tx(config, 'model.detectedFromEndpoint')(customModels.length)}
                  {customModelsAt ? tx(config, 'model.savedAgo')(formatCacheAge(customModelsAt, config)) : ''}
                </p>
                <select
                  className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                  }}
                >
                  <option value="">{tx(config, 'model.pickDetected')}</option>
                  {customModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </>
            )}
            <input
              type="text"
              list="custom-model-options"
              placeholder={
                customModels.length > 0
                  ? tx(config, 'model.modelIdPhSome')(customModels.length)
                  : tx(config, 'model.modelIdPhNone')
              }
              className="input input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
              value={config.customModel || ''}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, customModel: e.target.value }))
              }
            />
            {(() => {
              const recent = readRecentModels(config.customEndpoint)
              const cur = (config.customModel || '').trim()
              const known = cur && (customModels.includes(cur) || recent.includes(cur))
              return (
                <>
                  {recent.length > 0 && (
                    <>
                      <p className="text-xs text-info">
                        {tx(config, 'model.reusedAtEndpoint')(recent.length)}
                      </p>
                      <select
                        className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                        }}
                      >
                        <option value="">{tx(config, 'model.pickHistory')}</option>
                        {recent.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <datalist id="custom-model-options">
                    {customModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                    {recent.filter((m) => !customModels.includes(m)).map((m) => (
                      <option key={`recent-${m}`} value={m} />
                    ))}
                  </datalist>
                  {(customModels.length > 0 || recent.length > 0) && cur && !known && (
                    <p className="text-xs text-warning mt-1">
                      {tx(config, 'model.unknownModelWarn')}
                    </p>
                  )}
                </>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">{tx(config, 'model.apiKey')}</label>
            <div className="relative w-full">
              <input
                type={showCustomKey ? 'text' : 'password'}
                placeholder={tx(config, 'model.apiKeyPh')}
                className="input input-bordered w-full pr-10 rounded-xl bg-base-100/60 border-white/10 text-xs"
                value={config.customApiKey || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={() => setShowCustomKey(!showCustomKey)}
                title={showCustomKey ? tx(config, 'model.hideKey') : tx(config, 'model.showKey')}
              >
                {showCustomKey ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold">{tx(config, 'model.model')}</label>
            <button
              type="button"
              className="btn btn-xs btn-outline rounded-lg"
              disabled={lmDetecting}
              onClick={() => detectLmStudio().catch(() => {})}
              title={tx(config, 'model.redetectTitle')}
            >
              {lmDetecting ? (
                <MobiusLoader size={14} />
              ) : (
                tx(config, 'model.redetect')
              )}
            </button>
          </div>
          {lmModelsAt && lmStudioModels.length > 0 && (
            <p className="text-xs text-white/60">
              {tx(config, 'model.storedLocal')(formatCacheAge(lmModelsAt, config))}
            </p>
          )}
          {lmDetectError && (
            <p className="text-xs text-error mt-1">{lmDetectError}</p>
          )}
          {lmStudioModels.length > 0 && (
            <>
              <p className="text-xs text-info">
                {tx(config, 'model.localDetected')(lmStudioModels.length)}
              </p>
              <select
                className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                value=""
                onChange={(e) => {
                  if (e.target.value) setConfig((prev) => ({ ...prev, model: e.target.value }))
                }}
              >
                <option value="">{tx(config, 'model.pickDetected')}</option>
                {lmStudioModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </>
          )}
          <input
            type="text"
            list="lmstudio-model-options"
            placeholder={tx(config, 'model.lmPlaceholder')}
            className="input input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
            value={config.model || ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
          />
          {(() => {
            const recent = readRecentModels(LM_STUDIO_ENDPOINT)
            if (recent.length === 0) return null
            return (
              <>
                <p className="text-xs text-info">
                  {tx(config, 'model.reusedAtEndpoint')(recent.length)}
                </p>
                <select
                  className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setConfig((prev) => ({ ...prev, model: e.target.value }))
                  }}
                >
                  <option value="">{tx(config, 'model.pickHistory')}</option>
                  {recent.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </>
            )
          })()}
          <datalist id="lmstudio-model-options">
            {lmStudioModels.map((m) => (
              <option key={m} value={m} />
            ))}
            {readRecentModels(LM_STUDIO_ENDPOINT)
              .filter((m) => !lmStudioModels.includes(m))
              .map((m) => (
                <option key={`recent-${m}`} value={m} />
              ))}
          </datalist>
        </div>
      )}

      {/* Effort Ladder: Default auto */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold">{tx(config, 'model.effort')}</label>
        <select
          className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
          value={config.effortLevel || 'auto'}
          onChange={(e) => setConfig((prev) => ({ ...prev, effortLevel: e.target.value }))}
        >
          <option value="auto">{tx(config, 'model.effortAuto')}</option>
          <option value="low">{tx(config, 'model.effortLow')}</option>
          <option value="medium">{tx(config, 'model.effortMedium')}</option>
          <option value="high">{tx(config, 'model.effortHigh')}</option>
          <option value="xhigh">{tx(config, 'model.effortXhigh')}</option>
          <option value="max">{tx(config, 'model.effortMax')}</option>
          <option value="ultra">{tx(config, 'model.effortUltra')}</option>
        </select>
      </div>
    </section>
  )
}
