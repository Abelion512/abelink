import { useState, useEffect } from 'react'
import { FaRobot, FaTerminal, FaPlug } from 'react-icons/fa'
import { detectProviderFromUrl } from '../../api/ai/providerDetect.js'

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

export const formatCacheAge = (at) => {
  const mins = Math.max(0, Math.round((Date.now() - (at || 0)) / 60000))
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} mnt lalu`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} jam lalu`
  return `${Math.round(hours / 24)} hari lalu`
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

  const detectLmStudio = async () => {
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
      setLmDetectError('LM Studio tidak mengembalikan daftar model. Pastikan ada model ter-load di LM Studio.')
      return false
    } catch (err) {
      setLmDetectError(`LM Studio tidak terjangkau di localhost:1234 (${err?.message || err}). Nyalakan server-nya lalu Deteksi Ulang.`)
      return false
    } finally {
      setLmDetecting(false)
    }
  }

  useEffect(() => {
    if (activeSection !== 'cfg-model' || config.aiProvider !== 'lm-studio' || lmDetectAttempted) {
      return
    }
    setLmDetectAttempted(true)
    // Gagal diam-diam di sini disengaja (hindari noise saat buka panel);
    // error tampil saat user tekan Deteksi Ulang.
    detectLmStudio().catch(() => {})
  }, [activeSection, config.aiProvider, lmDetectAttempted])

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
        setModelDetectError('Endpoint tidak mengembalikan daftar model.')
      }
    } catch (err) {
      setModelDetectError(`Deteksi gagal: ${err?.message || err}`)
    } finally {
      setDetectingModels(false)
    }
  }

  // Ganti endpoint -> tampilkan cache endpoint itu (kalau ada), bukan daftar basi.
  useEffect(() => {
    const cached = readModelsCache(config.customEndpoint)
    setCustomModels(cached?.models ?? [])
    setCustomModelsAt(cached?.at ?? null)
    setModelDetectError('')
  }, [config.customEndpoint])

  return (
    <section
      id="cfg-model"
      className={`space-y-6 scroll-mt-4 ${activeSection !== 'cfg-model' ? 'hidden' : ''}`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">Model</h2>
      </div>

      {/* Provider Selector */}
      <div id="tour-ai-provider" className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-white/60">Provider</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'gemini-web', name: 'Gemini Web', icon: FaRobot },
            { id: 'lm-studio', name: 'LM Studio', icon: FaTerminal },
            { id: 'custom', name: 'Custom API', icon: FaPlug }
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
                <ProvIcon size={13} className={isSelected ? 'text-primary' : 'text-white/30'} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Provider-specific details */}
      {config.aiProvider === 'gemini-web' || !config.aiProvider ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Model</label>
            <input
              type="text"
              list="gemini-web-model-options"
              placeholder="gemini-latest"
              title="Nama bebas — server RPC hanya membaca angka mode (Flash=1, Thinking=2, Pro=3, Auto=4). Nama baru (mis. gemini-3.9-flash) otomatis dipetakan ke mode Flash."
              className="input input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
              value={config.geminiWebModel || 'gemini-latest'}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, geminiWebModel: e.target.value }))
              }
            />
            <datalist id="gemini-web-model-options">
              <option value="gemini-latest" />
              <option value="gemini-auto" />
              <option value="gemini-3.5-flash-thinking" />
              <option value="gemini-3.5-flash-thinking-lite" />
              <option value="gemini-flash-lite" />
            </datalist>
          </div>
        </div>
      ) : config.aiProvider === 'custom' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Endpoint URL</label>
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
                  ? ` • coba protokol ${detected.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'}`
                  : ''
              return (
                <p className="text-xs text-white/40">
                  Terdeteksi: {detected.name}
                  {protoHint}
                </p>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Protokol API</label>
            <select
              className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
              value={config.customApiProtocol || 'auto'}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, customApiProtocol: e.target.value }))
              }
            >
              <option value="auto">Auto-Detect (disarankan)</option>
              <option value="openai">OpenAI-Compatible (/v1/chat/completions)</option>
              <option value="anthropic">Anthropic-Compatible (/v1/messages)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold">Model ID</label>
              <button
                type="button"
                className="btn btn-xs btn-outline rounded-lg"
                disabled={detectingModels || !config.customEndpoint}
                onClick={handleDetectModels}
                title="Ambil daftar model dari endpoint (GET /models)"
              >
                {detectingModels ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  'Deteksi Model'
                )}
              </button>
            </div>
            {modelDetectError && (
              <p className="text-xs text-error mt-1">{modelDetectError}</p>
            )}
            {customModels.length > 0 && (
              <>
                <p className="text-xs text-success">
                  {customModels.length} model terdeteksi dari endpoint
                  {customModelsAt ? ` • tersimpan ${formatCacheAge(customModelsAt)}` : ''}
                </p>
                <select
                  className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                  }}
                >
                  <option value="">-- Pilih model terdeteksi --</option>
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
                  ? `${customModels.length} model terdeteksi - klik untuk memilih`
                  : 'Contoh: gpt-4o-mini'
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
                      <p className="text-xs text-success">
                        {recent.length} model pernah sukses di endpoint ini — klik untuk pakai ulang
                      </p>
                      <select
                        className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setConfig((prev) => ({ ...prev, customModel: e.target.value }))
                        }}
                      >
                        <option value="">-- Pilih dari riwayat sukses --</option>
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
                    <option value="deepseek-v3.2" />
                    <option value="deepseek-r1-0528" />
                    <option value="qwen3.8-max" />
                    <option value="qwen3.5-plus" />
                    <option value="glm-5.3" />
                    <option value="glm-5.3-flash" />
                    <option value="kimi-k3" />
                    <option value="claude-opus-4.8" />
                    <option value="claude-sonnet-4.6" />
                    <option value="gpt-5.6-sol" />
                    <option value="gpt-6-astra" />
                    <option value="nemotron-3-ultra" />
                    <option value="nemotron-3.5-lightning" />
                    <option value="deepseek-r1-0528" />
                    <option value="glm-5.3" />
                    <option value="glm-5.3-flash" />
                    <option value="kimi-k3" />
                    <option value="claude-opus-4.8" />
                    <option value="claude-sonnet-4.6" />
                    <option value="gpt-5.6-sol" />
                    <option value="gpt-6-astra" />
                    <option value="nemotron-3-ultra" />
                    <option value="nemotron-3.5-lightning" />
                  </datalist>
                  {(customModels.length > 0 || recent.length > 0) && cur && !known && (
                    <p className="text-xs text-warning mt-1">
                      Model ini tidak ada di daftar terdeteksi maupun riwayat sukses —
                      server kemungkinan menolaknya (401 ModelError). Pilih dari daftar,
                      atau pastikan gateway meneruskan nama custom (mis. 9router
                      meneruskan ID oc/... walau tak muncul di /v1/models).
                    </p>
                  )}
                </>
              )
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">API Key</label>
            <div className="relative w-full">
              <input
                type={showCustomKey ? 'text' : 'password'}
                placeholder="Masukkan API Key (jika diperlukan)"
                className="input input-bordered w-full pr-10 rounded-xl bg-base-100/60 border-white/10 text-xs"
                value={config.customApiKey || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={() => setShowCustomKey(!showCustomKey)}
                title={showCustomKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
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
            <label className="text-sm font-semibold">Model</label>
            <button
              type="button"
              className="btn btn-xs btn-outline rounded-lg"
              disabled={lmDetecting}
              onClick={() => detectLmStudio().catch(() => {})}
              title="Deteksi ulang model dari LM Studio (GET localhost:1234/v1/models)"
            >
              {lmDetecting ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                'Deteksi Ulang'
              )}
            </button>
          </div>
          {lmModelsAt && lmStudioModels.length > 0 && (
            <p className="text-xs text-white/40">
              Tersimpan lokal • diperbarui {formatCacheAge(lmModelsAt)} • Deteksi Ulang untuk refresh
            </p>
          )}
          {lmDetectError && (
            <p className="text-xs text-error mt-1">{lmDetectError}</p>
          )}
          {lmStudioModels.length > 0 && (
            <>
              <p className="text-xs text-success">
                {lmStudioModels.length} model lokal terdeteksi di LM Studio (port 1234)
              </p>
              <select
                className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
                value=""
                onChange={(e) => {
                  if (e.target.value) setConfig((prev) => ({ ...prev, model: e.target.value }))
                }}
              >
                <option value="">-- Pilih model terdeteksi --</option>
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
            placeholder="Contoh: google/gemma-3-4b, glm-5.3, deepseek-v3.2, kimi-k3"
            className="input input-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
            value={config.model || ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
          />
          <datalist id="lmstudio-model-options">
            {lmStudioModels.map((m) => (
              <option key={m} value={m} />
            ))}
            <option value="deepseek-v3.2" />
            <option value="deepseek-r1-0528" />
            <option value="qwen3.8-max" />
            <option value="glm-5.3" />
            <option value="glm-5.3-flash" />
            <option value="kimi-k3" />
            <option value="claude-opus-4.8" />
            <option value="claude-sonnet-4.6" />
            <option value="gpt-5.6-sol" />
            <option value="gpt-6-astra" />
            <option value="nemotron-3-ultra" />
            <option value="nemotron-3.5-lightning" />
          </datalist>
        </div>
      )}

      {/* Effort Ladder: Default auto */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Reasoning Effort</label>
        <select
          className="select select-bordered w-full rounded-xl bg-base-100/60 border-white/10 text-xs font-medium"
          value={config.effortLevel || 'auto'}
          onChange={(e) => setConfig((prev) => ({ ...prev, effortLevel: e.target.value }))}
        >
          <option value="auto">Auto - Naik otomatis sesuai kompleksitas tugas (Disarankan)</option>
          <option value="low">Low - Hemat token (ReAct loop cepat)</option>
          <option value="medium">Medium - Seimbang untuk tugas sehari-hari</option>
          <option value="high">High - Penalaran mendalam</option>
          <option value="xhigh">xHigh - Penalaran ekstra mendalam</option>
          <option value="max">Max - Penalaran maksimal, refleksi &amp; verifikasi</option>
          <option value="ultra">Ultra - Max + Multi-Agent Orchestration</option>
        </select>
      </div>
    </section>
  )
}
