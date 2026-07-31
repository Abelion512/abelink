// Section: AI Engine & Tools (provider, models, keys, persona, sliders, approval mode, awareness)
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { saveConfiguration } from '../../../api/db'
import { getExtractor } from '../../../api/vectorMemory'
import { useConfirm } from '../../../hooks/useConfirm'

export default function ConfigAI({ config, setConfig, isFirstSetup, onSetupComplete, chatContext, onDownloadStateChange }) {
  const { confirm } = useConfirm()
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCerebrasKey, setShowCerebrasKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [showLastfmKey, setShowLastfmKey] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const handleAiProviderChange = (provider) => setConfig((prev) => ({ ...prev, aiProvider: provider }))
  const handleModelChange = (e) => setConfig((prev) => ({ ...prev, model: e.target.value }))
  const handleGroqModelChange = (e) => setConfig((prev) => ({ ...prev, groqModel: e.target.value }))
  const handleCerebrasModelChange = (e) => setConfig((prev) => ({ ...prev, cerebrasModel: e.target.value }))
  const handleUseSecondaryModelChange = (e) => setConfig((prev) => ({ ...prev, useSecondaryModel: e.target.checked }))
  const handleGroqApiKeyChange = (e) => setConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))
  const handleCerebrasApiKeyChange = (e) => setConfig((prev) => ({ ...prev, cerebrasApiKey: e.target.value }))
  const handleCustomEndpointChange = (e) => setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))
  const handleCustomApiKeyChange = (e) => setConfig((prev) => ({ ...prev, customApiKey: e.target.value }))
  const handleCustomModelChange = (e) => setConfig((prev) => ({ ...prev, customModel: e.target.value }))
  const handleAwarenessEnabledChange = (e) => setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))
  const handlePersonalityChange = (e) => setConfig((prev) => ({ ...prev, personality: e.target.value }))
  const handleTemperatureChange = (e) => setConfig((prev) => ({ ...prev, temperature: Number(e.target.value) }))
  const handleContextChange = (e) => setConfig((prev) => ({ ...prev, context: Number(e.target.value) }))
  const handleToggleGroqKey = () => setShowGroqKey(!showGroqKey)
  const handleToggleCerebrasKey = () => setShowCerebrasKey(!showCerebrasKey)
  const handleToggleCustomKey = () => setShowCustomKey(!showCustomKey)
  const handleToggleLastfmKey = () => setShowLastfmKey(!showLastfmKey)

  const handleSaveConfiguration = async () => {
    // Validasi API Key
    if (!config.groqApiKey?.trim()) {
      await confirm({
        title: 'API Key Kosong',
        message:
          'Tolong isi Groq API Key terlebih dahulu! API Key ini wajib untuk fitur Voice STT.',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
      return
    }
    if (config.aiProvider === 'cerebras' && !config.cerebrasApiKey?.trim()) {
      await confirm({
        title: 'API Key Kosong',
        message: 'Tolong isi Cerebras API Key terlebih dahulu untuk menggunakan provider Cerebras!',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
      return
    }

    if (config.aiProvider === 'custom') {
      const endpoint = config.customEndpoint?.trim() || ''
      if (!endpoint.endsWith('/chat/completions')) {
        alert(
          'Gagal Menyimpan: Custom Endpoint URL tidak valid! URL wajib diakhiri dengan /chat/completions (Contoh: https://api.openai.com/v1/chat/completions).'
        )
        return
      }
    }

    setIsDownloadingModel(true)
    onDownloadStateChange?.({ downloading: true })
    setDownloadProgress(0)

    try {
      let extStats = {}
      await getExtractor((info) => {
        if (info.status === 'initiate') {
          extStats[info.file] = { loaded: 0, total: info.total || 0 }
        } else if (info.status === 'progress') {
          if (extStats[info.file]) {
            extStats[info.file].loaded = info.loaded
            extStats[info.file].total = info.total
          }
          const values = Object.values(extStats)
          const totalBytes = values.reduce((acc, curr) => acc + curr.total, 0)
          const loadedBytes = values.reduce((acc, curr) => acc + curr.loaded, 0)
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((loadedBytes / totalBytes) * 100))
          }
        } else if (info.status === 'done' || info.status === 'ready') {
          setDownloadProgress(100)
        }
      })
    } catch (e) {
      console.error(e)
    }
    setIsDownloadingModel(false)
    onDownloadStateChange?.({ downloading: false })
    await saveConfiguration(config)

    // Update global state without reloading the page
    if (chatContext && chatContext.setConfig) {
      chatContext.setConfig([config])
    }

    if (isFirstSetup && onSetupComplete) {
      onSetupComplete()
    } else {
      // Kembali ke halaman chat
      window.location.href = '#/'
    }
  }

  return (
    <section className="space-y-5">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
        AI Engine & Tools
      </h2>

      {/* AI Provider Selector */}
      <div id="tour-ai-provider" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <p className="text-sm font-semibold">AI Provider</p>
        <div className="flex gap-4">
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="radio"
              name="aiProvider"
              className="radio radio-primary radio-sm"
              value="lmstudio"
              checked={config.aiProvider === 'lmstudio' || !config.aiProvider}
              onChange={() => handleAiProviderChange('lmstudio')}
            />
            <span className="label-text">LM Studio (Local)</span>
          </label>
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="radio"
              name="aiProvider"
              className="radio radio-primary radio-sm"
              value="groq"
              checked={config.aiProvider === 'groq'}
              onChange={() => handleAiProviderChange('groq')}
            />
            <span className="label-text">Groq API</span>
          </label>
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="radio"
              name="aiProvider"
              className="radio radio-primary radio-sm"
              value="cerebras"
              checked={config.aiProvider === 'cerebras'}
              onChange={() => handleAiProviderChange('cerebras')}
            />
            <span className="label-text">Cerebras API</span>
          </label>
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="radio"
              name="aiProvider"
              className="radio radio-primary radio-sm"
              value="custom"
              checked={config.aiProvider === 'custom'}
              onChange={() => handleAiProviderChange('custom')}
            />
            <span className="label-text">Custom API</span>
          </label>
        </div>
      </div>

      {config.aiProvider === 'lmstudio' || !config.aiProvider ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Model Selector (LM Studio)</p>
          <input
            type="text"
            placeholder="Contoh: google/gemma-3-4b"
            className="input input-bordered w-full"
            value={config.model || ''}
            onChange={handleModelChange}
          />
          <p className="text-xs opacity-40">
            Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
          </p>
        </div>
      ) : config.aiProvider === 'groq' ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Groq Model</p>
          <input
            type="text"
            placeholder="Contoh: llama-3.1-8b-instant"
            className="input input-bordered w-full"
            value={config.groqModel || 'llama-3.1-8b-instant'}
            onChange={handleGroqModelChange}
          />
          <p className="text-xs opacity-40">
            Model Groq yang ingin digunakan. (Pastikan API Key Groq di bawah diisi).
          </p>
        </div>
      ) : config.aiProvider === 'custom' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Endpoint URL</p>
            <input
              type="text"
              placeholder="Contoh: https://api.openai.com/v1/chat/completions"
              className={`input input-bordered w-full ${config.customEndpoint && !config.customEndpoint.trim().endsWith('/chat/completions') ? 'input-error' : ''}`}
              value={config.customEndpoint || ''}
              onChange={handleCustomEndpointChange}
            />
            {config.customEndpoint &&
            !config.customEndpoint.trim().endsWith('/chat/completions') ? (
              <p className="text-xs text-error mt-1 font-medium">
                URL endpoint tidak memenuhi standar format OpenAI-Compatible.
              </p>
            ) : (
              <p className="text-xs opacity-50 mt-1">
                Pastikan Endpoint mendukung standar format <strong>OpenAI-Compatible</strong>.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Model ID</p>
            <input
              type="text"
              placeholder="Contoh: gpt-4o-mini"
              className="input input-bordered w-full"
              value={config.customModel || ''}
              onChange={handleCustomModelChange}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom API Key</p>
            <div className="relative w-full">
              <input
                type={showCustomKey ? 'text' : 'password'}
                placeholder="Masukkan API Key (jika diperlukan)"
                className="input input-bordered w-full pr-10"
                value={config.customApiKey || ''}
                onChange={handleCustomApiKeyChange}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                onClick={handleToggleCustomKey}
                title={showCustomKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
              >
                {showCustomKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Cerebras Model</p>
          <input
            type="text"
            placeholder="Contoh: llama3.1-8b"
            className="input input-bordered w-full"
            value={config.cerebrasModel || 'llama3.1-8b'}
            onChange={handleCerebrasModelChange}
          />
          <p className="text-xs opacity-40">
            Model Cerebras yang ingin digunakan. (Pastikan API Key Cerebras di bawah diisi).
          </p>
        </div>
      )}

      {/* Secondary Model Toggle */}
      {config.aiProvider === 'groq' && (
        <div className="space-y-1.5 pt-2">
          <label className="label cursor-pointer justify-start gap-2 max-w-fit">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={config.useSecondaryModel || false}
              onChange={handleUseSecondaryModelChange}
            />
            <span className="label-text text-sm">
              Gunakan Model Ringan untuk Tugas Latar Belakang (Lebih Cepat)
            </span>
          </label>

          {config.useSecondaryModel && (
            <div className="pl-6 pt-1 mb-4 border-l-2 border-white/10 ml-2">
              <p className="text-xs opacity-40 leading-relaxed">
                Semua tugas belakang layar (action, parsing, merangkum) akan otomatis
                dialihkan ke model <b>openai/gpt-oss-20b</b> via Groq API.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Groq API Key (Always visible for STT) */}
      <div id="tour-groq-key" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <div className="flex justify-between items-center">
          <p className="text-sm font-semibold">
            Groq API Key {config.aiProvider !== 'groq' && '(Khusus untuk fitur Voice/STT)'}
          </p>
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="btn btn-xs btn-outline btn-primary"
          >
            Ambil API Key
          </a>
        </div>
        <div className="relative w-full">
          <input
            type={showGroqKey ? 'text' : 'password'}
            placeholder="Contoh: gsk_xxxxxxxxxxxxxxxxx"
            className="input input-bordered w-full pr-10"
            value={config.groqApiKey || ''}
            onChange={handleGroqApiKeyChange}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
            onClick={handleToggleGroqKey}
            title={showGroqKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
          >
            {showGroqKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
          </button>
        </div>
        {config.aiProvider !== 'groq' && (
          <p className="text-xs opacity-40">
            Karena kamu memakai{' '}
            {config.aiProvider === 'lmstudio'
              ? 'LM Studio'
              : config.aiProvider === 'custom'
                ? 'Custom API'
                : 'Cerebras'}
            , API Key Groq ini hanya akan dipakai saat kamu ngobrol via suara
            (Speech-to-Text).
          </p>
        )}
      </div>

      {/* Cerebras API Key */}
      {config.aiProvider === 'cerebras' && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <p className="text-sm font-semibold">Cerebras API Key</p>
            <a
              href="https://cloud.cerebras.ai/platform/org_5y4rkhf62v2mvwyvd6kwm9yx/get-started?onboarding=true"
              target="_blank"
              rel="noreferrer"
              className="btn btn-xs btn-outline btn-primary"
            >
              Ambil API Key
            </a>
          </div>
          <div className="relative w-full">
            <input
              type={showCerebrasKey ? 'text' : 'password'}
              placeholder="Contoh: c-xxxxxxxxxxxxxxxxx"
              className="input input-bordered w-full pr-10"
              value={config.cerebrasApiKey || ''}
              onChange={handleCerebrasApiKeyChange}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              onClick={handleToggleCerebrasKey}
              title={showCerebrasKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
            >
              {showCerebrasKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Last.fm API Key */}
      <div className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <div className="flex justify-between items-center">
          <p className="text-sm font-semibold">Last.fm API Key</p>
          <a
            href="https://www.last.fm/api/account/create"
            target="_blank"
            rel="noreferrer"
            className="btn btn-xs btn-outline btn-primary"
          >
            Dapatkan API Key
          </a>
        </div>
        <p className="text-xs opacity-50 mb-1">
          Opsional. Untuk riwayat musik dan rekomendasi.
        </p>
        <div className="relative w-full">
          <input
            type={showLastfmKey ? 'text' : 'password'}
            placeholder="Last.fm API Key"
            className="input input-bordered w-full pr-10"
            value={config.lastfmApiKey || ''}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, lastfmApiKey: e.target.value }))
            }
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
            onClick={handleToggleLastfmKey}
            title={showLastfmKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
          >
            {showLastfmKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
          </button>
        </div>
      </div>

      {/* Awareness Engine Toggle */}
      <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Awareness Engine</p>
            <p className="text-xs opacity-50 mt-1">Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara proaktif di latar belakang.</p>
          </div>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.awarenessEnabled !== false}
            onChange={handleAwarenessEnabledChange}
          />
        </div>
      </div>

      {/* System Persona */}
      <div id="tour-persona" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
        <textarea
          className="textarea w-full h-72 leading-relaxed no-scrollbar resize-none"
          placeholder="Deskripsikan kepribadian Mark..."
          value={config.personality}
          onChange={handlePersonalityChange}
        />
      </div>

      <div id="tour-temperature" className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Temperature</p>
          <span className="font-mono text-sm text-primary font-bold">
            {config.temperature}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={config.temperature}
          className="range range-primary range-xs w-full"
          onChange={handleTemperatureChange}
        />
        <div className="flex justify-between px-2.5 mt-2 text-xs">
          <span>0</span>
          <span>0.2</span>
          <span>0.4</span>
          <span>0.6</span>
          <span>0.8</span>
          <span>1.0</span>
        </div>
      </div>

      {/* Context Window */}
      <div id="tour-context" className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Context Window</p>
          <span className="font-mono text-sm text-primary font-bold">{config.context}</span>
        </div>
        <input
          type="range"
          min="2"
          max="22"
          step="2"
          value={config.context}
          className="range range-primary range-xs w-full"
          onChange={handleContextChange}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>2</span>
          <span>6</span>
          <span>10</span>
          <span>14</span>
          <span>18</span>
          <span>22</span>
        </div>
      </div>

      {/* Max Agent Turns */}
      <div className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Max Turns per Task</p>
          <span className="font-mono text-sm text-primary font-bold">{config.maxTurns || 20}</span>
        </div>
        <input
          type="range"
          min="5"
          max="50"
          step="5"
          value={config.maxTurns || 20}
          className="range range-primary range-xs w-full"
          onChange={(e) => setConfig((prev) => ({ ...prev, maxTurns: Number(e.target.value) }))}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>5</span>
          <span>15</span>
          <span>25</span>
          <span>35</span>
          <span>50</span>
        </div>
      </div>

      <div className="divider"></div>

      {/* Approval Mode */}
      <div className="space-y-2 p-2 -mx-2 rounded-lg">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Mode Persetujuan (Approval)</p>
          <span className="font-mono text-xs text-primary font-bold uppercase">{config.approvalMode || 'selective'}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'strict', label: '🔒 Strict', desc: 'Tanya semua' },
            { value: 'selective', label: '🟡 Selective', desc: 'Auto baca, tanya tulis' },
            { value: 'auto', label: '🟢 Auto', desc: 'AI decide' },
            { value: 'bypass', label: '⚡ Bypass', desc: 'Jalankan semua' },
            { value: 'plan', label: '📋 Plan', desc: 'Read-only' },
          ].map((m) => (
            <button
              key={m.value}
              onClick={() => setConfig((prev) => ({ ...prev, approvalMode: m.value }))}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                (config.approvalMode || 'selective') === m.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-white/10 text-white/60 hover:border-white/30'
              }`}
              title={m.desc}
            >
              {m.label}
              <div className="text-[10px] opacity-60 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Save + download progress (kept at end of AI section) */}
      <div className="flex flex-col items-end pt-2">
        {isDownloadingModel && (
          <div className="w-full max-w-xs mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span>Mengunduh Model Embeddings...</span>
              <span>{downloadProgress}%</span>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={downloadProgress}
              max="100"
            ></progress>
          </div>
        )}
        <button
          id="tour-save-btn"
          onClick={handleSaveConfiguration}
          disabled={isDownloadingModel}
          className="btn btn-primary px-8"
        >
          {isDownloadingModel
            ? 'Menyimpan...'
            : isFirstSetup
              ? 'Simpan & Mulai Gunakan Mark'
              : 'Simpan Pengaturan'}
        </button>
      </div>
    </section>
  )
}
