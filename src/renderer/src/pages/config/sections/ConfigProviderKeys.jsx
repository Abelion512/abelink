// Section: Provider & Keys (provider, models, keys, save)
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { saveConfiguration } from '../../../api/db'
import { getExtractor } from '../../../api/vectorMemory'
import { useConfirm } from '../../../hooks/useConfirm'

export default function ConfigProviderKeys({ config, setConfig, isFirstSetup, onSetupComplete, chatContext, onDownloadStateChange }) {
  const { confirm } = useConfirm()
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCerebrasKey, setShowCerebrasKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const handleSave = async () => {
    if (!config.groqApiKey?.trim()) {
      await confirm({ title: 'API Key Kosong', message: 'Isi Groq API Key dulu! Wajib untuk Voice STT.', isError: true, hideCancel: true, confirmText: 'Tutup' })
      return
    }
    if (config.aiProvider === 'cerebras' && !config.cerebrasApiKey?.trim()) {
      await confirm({ title: 'API Key Kosong', message: 'Isi Cerebras API Key dulu!', isError: true, hideCancel: true, confirmText: 'Tutup' })
      return
    }
    if (config.aiProvider === 'custom' && !(config.customEndpoint?.trim() || '').endsWith('/chat/completions')) {
      alert('URL harus diakhiri /chat/completions')
      return
    }
    setIsDownloadingModel(true)
    onDownloadStateChange?.({ downloading: true })
    setDownloadProgress(0)
    try {
      let extStats = {}
      await getExtractor((info) => {
        if (info.status === 'initiate') extStats[info.file] = { loaded: 0, total: info.total || 0 }
        else if (info.status === 'progress') {
          if (extStats[info.file]) { extStats[info.file].loaded = info.loaded; extStats[info.file].total = info.total }
          const v = Object.values(extStats)
          const t = v.reduce((a, c) => a + c.total, 0)
          if (t > 0) setDownloadProgress(Math.round((v.reduce((a, c) => a + c.loaded, 0) / t) * 100))
        } else if (info.status === 'done' || info.status === 'ready') setDownloadProgress(100)
      })
    } catch (e) { console.error(e) }
    setIsDownloadingModel(false)
    onDownloadStateChange?.({ downloading: false })
    await saveConfiguration(config)
    if (chatContext?.setConfig) chatContext.setConfig([config])
    if (isFirstSetup && onSetupComplete) onSetupComplete()
    else window.location.href = '#/'
  }

  const providers = [
    { id: 'lmstudio', label: 'LM Studio' },
    { id: 'groq', label: 'Groq API' },
    { id: 'cerebras', label: 'Cerebras API' },
    { id: 'custom', label: 'Custom API' },
  ]

  return (
    <section className="space-y-5">
      <div id="tour-ai-provider" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <p className="text-sm font-semibold">AI Provider</p>
        <div className="flex gap-4 flex-wrap">
          {providers.map(p => (
            <label key={p.id} className="label cursor-pointer justify-start gap-2">
              <input type="radio" name="aiProvider" className="radio radio-primary radio-sm" value={p.id}
                checked={p.id === 'lmstudio' ? (config.aiProvider === 'lmstudio' || !config.aiProvider) : config.aiProvider === p.id}
                onChange={() => setConfig(prev => ({ ...prev, aiProvider: p.id }))} />
              <span className="label-text">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      {(!config.aiProvider || config.aiProvider === 'lmstudio') && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Model (LM Studio)</p>
          <input type="text" placeholder="google/gemma-3-4b" className="input input-bordered w-full" value={config.model || ''} onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))} />
          <p className="text-xs opacity-40">Nama model aktif di LM Studio.</p>
        </div>
      )}
      {config.aiProvider === 'groq' && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Groq Model</p>
          <input type="text" placeholder="llama-3.1-8b-instant" className="input input-bordered w-full" value={config.groqModel || 'llama-3.1-8b-instant'} onChange={e => setConfig(prev => ({ ...prev, groqModel: e.target.value }))} />
        </div>
      )}
      {config.aiProvider === 'cerebras' && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Cerebras Model</p>
          <input type="text" placeholder="llama3.1-8b" className="input input-bordered w-full" value={config.cerebrasModel || 'llama3.1-8b'} onChange={e => setConfig(prev => ({ ...prev, cerebrasModel: e.target.value }))} />
        </div>
      )}
      {config.aiProvider === 'custom' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Endpoint URL</p>
            <input type="text" placeholder="https://api.openai.com/v1/chat/completions" className={`input input-bordered w-full ${config.customEndpoint && !config.customEndpoint.trim().endsWith('/chat/completions') ? 'input-error' : ''}`} value={config.customEndpoint || ''} onChange={e => setConfig(prev => ({ ...prev, customEndpoint: e.target.value }))} />
            {config.customEndpoint && !config.customEndpoint.trim().endsWith('/chat/completions') && (<p className="text-xs text-error font-medium">URL harus diakhiri /chat/completions</p>)}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Model ID</p>
            <input type="text" placeholder="gpt-4o-mini" className="input input-bordered w-full" value={config.customModel || ''} onChange={e => setConfig(prev => ({ ...prev, customModel: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom API Key</p>
            <div className="relative w-full">
              <input type={showCustomKey ? 'text' : 'password'} placeholder="API Key (opsional)" className="input input-bordered w-full pr-10" value={config.customApiKey || ''} onChange={e => setConfig(prev => ({ ...prev, customApiKey: e.target.value }))} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100" onClick={() => setShowCustomKey(!showCustomKey)}>{showCustomKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}</button>
            </div>
          </div>
        </div>
      )}

      {config.aiProvider === 'groq' && (
        <div className="space-y-1.5 pt-2">
          <label className="label cursor-pointer justify-start gap-2 max-w-fit">
            <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={config.useSecondaryModel || false} onChange={e => setConfig(prev => ({ ...prev, useSecondaryModel: e.target.checked }))} />
            <span className="label-text text-sm">Model Ringan untuk Background Tasks</span>
          </label>
          {config.useSecondaryModel && (<p className="text-xs opacity-40 pl-6 border-l-2 border-white/10 ml-2">Dialihkan ke <b>openai/gpt-oss-20b</b> via Groq.</p>)}
        </div>
      )}

      <div id="tour-groq-key" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <div className="flex justify-between items-center">
          <p className="text-sm font-semibold">Groq API Key {config.aiProvider !== 'groq' && '(untuk Voice/STT)'}</p>
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="btn btn-xs btn-outline btn-primary">Ambil Key</a>
        </div>
        <div className="relative w-full">
          <input type={showGroqKey ? 'text' : 'password'} placeholder="gsk_..." className="input input-bordered w-full pr-10" value={config.groqApiKey || ''} onChange={e => setConfig(prev => ({ ...prev, groqApiKey: e.target.value }))} />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100" onClick={() => setShowGroqKey(!showGroqKey)}>{showGroqKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}</button>
        </div>
        {config.aiProvider !== 'groq' && <p className="text-xs opacity-40">Dipakai untuk Speech-to-Text.</p>}
      </div>

      {config.aiProvider === 'cerebras' && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <p className="text-sm font-semibold">Cerebras API Key</p>
            <a href="https://cloud.cerebras.ai" target="_blank" rel="noreferrer" className="btn btn-xs btn-outline btn-primary">Ambil Key</a>
          </div>
          <div className="relative w-full">
            <input type={showCerebrasKey ? 'text' : 'password'} placeholder="c-xxxxxxxx" className="input input-bordered w-full pr-10" value={config.cerebrasApiKey || ''} onChange={e => setConfig(prev => ({ ...prev, cerebrasApiKey: e.target.value }))} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100" onClick={() => setShowCerebrasKey(!showCerebrasKey)}>{showCerebrasKey ? <FaEyeSlash size={16} /> : <FaEye size={16} />}</button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-end pt-2">
        {isDownloadingModel && (
          <div className="w-full max-w-xs mb-4">
            <div className="flex justify-between text-xs mb-1"><span>Mengunduh Embeddings...</span><span>{downloadProgress}%</span></div>
            <progress className="progress progress-primary w-full" value={downloadProgress} max="100"></progress>
          </div>
        )}
        <button id="tour-save-btn" onClick={handleSave} disabled={isDownloadingModel} className="btn btn-primary px-8">
          {isDownloadingModel ? 'Menyimpan...' : isFirstSetup ? 'Simpan & Mulai' : 'Simpan Pengaturan'}
        </button>
      </div>
    </section>
  )
}
