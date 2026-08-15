// Section: Provider & Keys (provider, models, keys, save)
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { saveConfiguration } from '../../../api/db'
import { getExtractor } from '../../../api/vectorMemory'
import { useConfirm } from '../../../hooks/useConfirm'

export default function ConfigProviderKeys({ config, setConfig, isFirstSetup, onSetupComplete, chatContext, onDownloadStateChange }) {
  const { confirm } = useConfirm()
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showCustomKey, setShowCustomKey] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [scanningModels, setScanningModels] = useState(false)
  const [scannedModels, setScannedModels] = useState([])
  const [scanError, setScanError] = useState('')

  const handleScanModels = async () => {
    const endpoint = (config.customEndpoint || '').trim()
    if (!endpoint) {
      setScanError('Isi Custom Endpoint URL dulu')
      return
    }
    setScanningModels(true)
    setScanError('')
    try {
      const res = await window.api.scanModels({ endpoint, apiKey: config.customApiKey })
      if (res.error) { setScanError(res.error); setScannedModels([]) }
      else {
        setScannedModels(res.models || [])
        if ((res.models || []).length && config.aiProvider === 'custom' && !config.customModel) {
          setConfig(prev => ({ ...prev, customModel: res.models[0] }))
        }
      }
    } catch (e) { setScanError(e.message) }
    setScanningModels(false)
  }

  const handleSave = async () => {
    if (!config.groqApiKey?.trim()) {
      await confirm({ title: 'API Key Kosong', message: 'Isi Groq API Key dulu! Wajib untuk Voice STT.', isError: true, hideCancel: true, confirmText: 'Tutup' })
      return
    }
    if (config.aiProvider === 'custom') {
      // User inputs endpoint up to /v1 — system appends /chat/completions
      const endpoint = (config.customEndpoint || '').trim()
      if (!endpoint) {
        await confirm({ title: 'Endpoint Kosong', message: 'Isi Custom Endpoint URL dulu!', isError: true, hideCancel: true, confirmText: 'Tutup' })
        return
      }
      if (!endpoint.endsWith('/v1')) {
        alert('Gagal Menyimpan: Custom Endpoint URL tidak valid! Endpoint harus diakhiri dengan /v1. Contoh: https://api.openai.com/v1')
        return
      }
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
    { id: 'gemini-web', label: 'Gemini (Gratis)' },
    { id: 'lm-studio', label: 'LM Studio (Local Offline)' },
    { id: 'custom', label: 'Custom API (OpenAI-Compatible)' },
  ]

  const geminiWebModels = [
    { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash (Model Utama Terbaru)' },
    { value: 'gemini-3.5-flash', label: 'gemini-3.5-flash (Stabil & Seimbang)' },
    { value: 'gemini-3.5-flash-thinking', label: 'gemini-3.5-flash-thinking (Penalaran Mendalam)' },
    { value: 'gemini-3.5-flash-thinking-lite', label: 'gemini-3.5-flash-thinking-lite (Penalaran Cepat)' },
    { value: 'gemini-auto', label: 'gemini-auto (Otomatis Server)' },
    { value: 'gemini-flash-lite', label: 'gemini-flash-lite (Super Cepat)' },
  ]

  return (
    <section className="space-y-5">
      <div id="tour-ai-provider" className="space-y-1.5 p-2 -mx-2 rounded-lg">
        <p className="text-sm font-semibold">AI Provider</p>
        <select
          className="select select-bordered w-full"
          value={config.aiProvider || 'gemini-web'}
          onChange={e => setConfig(prev => ({ ...prev, aiProvider: e.target.value }))}
        >
          {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {config.aiProvider === 'gemini-web' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Model Gemini</p>
          <select
            className="select select-bordered w-full"
            value={config.geminiWebModel || 'gemini-3.6-flash'}
            onChange={e => setConfig(prev => ({ ...prev, geminiWebModel: e.target.value }))}
          >
            {geminiWebModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <p className="text-xs opacity-50">Provider bawaan tanpa API Key. Membutuhkan koneksi internet (tidak mendukung input gambar).</p>
        </div>
      )}

      {config.aiProvider === 'lmstudio' && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Model (LM Studio)</p>
          <input type="text" placeholder="google/gemma-3-4b" className="input input-bordered w-full" value={config.model || ''} onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))} />
          <p className="text-xs opacity-40">Nama model aktif di LM Studio.</p>
        </div>
      )}
      {config.aiProvider === 'custom' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Endpoint URL</p>
            <input type="text" placeholder="https://api.openai.com/v1" className={`input input-bordered w-full ${config.customEndpoint && !config.customEndpoint.trim().endsWith('/v1') ? 'input-error' : ''}`} value={config.customEndpoint || ''} onChange={e => setConfig(prev => ({ ...prev, customEndpoint: e.target.value }))} />
            {config.customEndpoint && !config.customEndpoint.trim().endsWith('/v1') && (<p className="text-xs text-error font-medium">URL harus diakhiri /v1. Sistem akan menambahkan /chat/completions otomatis.</p>)}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Custom Model ID</p>
            <div className="flex gap-2 items-start">
              <input type="text" placeholder="gpt-4o-mini" className="input input-bordered w-full" value={config.customModel || ''} onChange={e => setConfig(prev => ({ ...prev, customModel: e.target.value }))} />
              <button type="button" onClick={handleScanModels} disabled={scanningModels} className="btn btn-outline btn-sm whitespace-nowrap">
                {scanningModels ? 'Scanning...' : 'Scan Models'}
              </button>
            </div>
            {scanError && <p className="text-xs text-error font-medium">{scanError}</p>}
            {scannedModels.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs opacity-40">Hasil scan ({scannedModels.length} model) — klik untuk pilih:</p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {scannedModels.map(m => (
                    <button key={m} type="button" onClick={() => setConfig(prev => ({ ...prev, customModel: m }))}
                      className={`badge badge-outline cursor-pointer hover:badge-primary ${config.customModel === m ? 'badge-primary' : ''}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
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

      <div id="tour-embed-provider" className="flex flex-col items-end pt-2">
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
