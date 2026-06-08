import { useState, useEffect } from 'react'
import { getAllMemory, getAllConfig, saveConfiguration, deleteMemory, db } from '../api/db'
import { getExtractor } from '../api/vectorMemory'

const Configuration = () => {
  const [config, setConfig] = useState({
    personality: 'Santai layaknya seorang teman dan suka bercanda.',
    model: 'google/gemma-3-4b',
    temperature: 0,
    context: 10,
    ttsRate: 0,
    ttsPitch: 0,
    groqApiKey: '',
    aiProvider: 'lm-studio',
    groqModel: 'llama-3.1-8b-instant',
    embedProvider: 'lm-studio',
    lmStudioEmbedModel: 'embeddinggemma-300m-qat'
  })
  const [memories, setMemories] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(true)
  const [playingTest, setPlayingTest] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const handleTestVoice = async () => {
    setPlayingTest(true)
    const testText =
      'Halo bro! Gue Mark, asisten pribadi lo. Gimana suara gue sekarang? Udah mantap belum?'
    try {
      const audioBase64 = await window.api.textToSpeech(testText, config.ttsRate, config.ttsPitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audio.onended = () => setPlayingTest(false)
        await audio.play()
      } else {
        setPlayingTest(false)
      }
    } catch (error) {
      console.error('Gagal test suara:', error)
      setPlayingTest(false)
    }
  }

  useEffect(() => {
    loadConfig()
    loadMemories()
  }, [])

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) {
      setConfig((prev) => ({ 
        ...prev, 
        ...data[0],
        aiProvider: data[0].aiProvider || 'lm-studio',
        embedProvider: data[0].embedProvider || 'lm-studio',
        lmStudioEmbedModel: data[0].lmStudioEmbedModel || 'embeddinggemma-300m-qat'
      }))
    }
  }

  const loadMemories = async () => {
    setLoadingMemory(true)
    const data = await getAllMemory()
    setMemories(data)
    setLoadingMemory(false)
  }

  const handleDeleteMemory = async (mem) => {
    await deleteMemory({ id: mem.id })
    setMemories((prev) => prev.filter((m) => m.id !== mem.id))
  }

  const handleClearAllChat = () => {
    document.getElementById('confirm_clear_chat').showModal()
  }

  const confirmClearChat = async () => {
    await db.sessions.clear()
    document.getElementById('confirm_clear_chat').close()
  }

  const handleExportChat = async () => {
    const sessions = await db.sessions.toArray()
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-chat-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveConfiguration = async () => {
    if (config.embedProvider === 'transformers') {
      setIsDownloadingModel(true)
      setDownloadProgress(0)
      
      try {
        await getExtractor((info) => {
          if (info.status === 'progress' && info.total > 0) {
            setDownloadProgress(Math.round((info.loaded / info.total) * 100))
          } else if (info.status === 'done' || info.status === 'ready') {
            setDownloadProgress(100)
          }
        })
      } catch (e) {
        console.error(e)
      }
      setIsDownloadingModel(false)
    }
    await saveConfiguration(config)
  }

  const groupedMemories = memories.reduce((acc, mem) => {
    const type = mem.type || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(mem)
    return acc
  }, {})

  const typeBadgeColor = {
    profile: 'badge-primary',
    preference: 'badge-secondary',
    skill: 'badge-accent',
    project: 'badge-info',
    transaction: 'badge-warning',
    goal: 'badge-success',
    relationship: 'badge-error',
    fact: 'badge-neutral',
    other: 'badge-ghost'
  }

  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-8">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">Setup Mark!</h1>
          <p className="opacity-50 text-sm mt-1">Atur perilaku Mark sesuai kebutuhanmu.</p>
        </div>

        {/* ── AI Engine & Tools ── */}
        <section className="space-y-5">
          <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
            AI Engine & Tools
          </h2>

          {/* AI Provider Selector */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">AI Provider</p>
            <div className="flex gap-4">
              <label className="label cursor-pointer justify-start gap-2">
                <input type="radio" name="aiProvider" className="radio radio-primary radio-sm" value="lm-studio" checked={config.aiProvider === 'lm-studio'} onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'lm-studio' }))} />
                <span className="label-text">LM Studio (Local)</span>
              </label>
              <label className="label cursor-pointer justify-start gap-2">
                <input type="radio" name="aiProvider" className="radio radio-primary radio-sm" value="groq" checked={config.aiProvider === 'groq'} onChange={() => setConfig((prev) => ({ ...prev, aiProvider: 'groq' }))} />
                <span className="label-text">Groq API</span>
              </label>
            </div>
          </div>

          {config.aiProvider === 'lm-studio' || !config.aiProvider ? (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Model Selector (LM Studio)</p>
              <input
                type="text"
                placeholder="Contoh: google/gemma-3-4b"
                className="input input-bordered w-full"
                value={config.model}
                onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
              />
              <p className="text-xs opacity-40">
                Nama model yang aktif di LM Studio. Pastikan sudah ter-load.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Groq Model</p>
              <input
                type="text"
                placeholder="Contoh: llama-3.1-8b-instant"
                className="input input-bordered w-full"
                value={config.groqModel || 'llama-3.1-8b-instant'}
                onChange={(e) => setConfig((prev) => ({ ...prev, groqModel: e.target.value }))}
              />
              <p className="text-xs opacity-40">
                Model Groq yang ingin digunakan. (Pastikan API Key Groq di bawah diisi).
              </p>
            </div>
          )}

          {/* Secondary Model Toggle */}
          <div className="space-y-1.5 pt-2">
            <label className="label cursor-pointer justify-start gap-2 max-w-fit">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={config.useSecondaryModel || false}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, useSecondaryModel: e.target.checked }))
                }
              />
              <span className="label-text text-sm">
                Gunakan Model Ringan untuk Tugas Latar Belakang (Lebih Cepat)
              </span>
            </label>
            
            {config.useSecondaryModel && (
              <div className="pl-6 pt-1 mb-4 border-l-2 border-white/10 ml-2">
                <p className="text-xs opacity-40 leading-relaxed">
                  Semua tugas belakang layar (action, parsing, merangkum) akan otomatis dialihkan ke model <b>llama-3.1-8b-instant</b> via Groq API.
                </p>
              </div>
            )}
          </div>

          {/* Embed Provider Selector */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Memori Embeddings Provider</p>
            <div className="flex gap-4">
              <label className="label cursor-pointer justify-start gap-2">
                <input type="radio" name="embedProvider" className="radio radio-primary radio-sm" value="lm-studio" checked={config.embedProvider === 'lm-studio'} onChange={() => setConfig((prev) => ({ ...prev, embedProvider: 'lm-studio' }))} />
                <span className="label-text">LM Studio (Local Server)</span>
              </label>
              <label className="label cursor-pointer justify-start gap-2">
                <input type="radio" name="embedProvider" className="radio radio-primary radio-sm" value="transformers" checked={config.embedProvider === 'transformers'} onChange={() => setConfig((prev) => ({ ...prev, embedProvider: 'transformers' }))} />
                <span className="label-text">Transformers.js (Fully Local - Tanpa Server)</span>
              </label>
            </div>
            {config.embedProvider === 'transformers' && (
               <p className="text-xs text-warning">
                 Jika baru pertama kali memilih opsi ini, model sebesar ~22MB akan di-download saat menyimpan pengaturan.
               </p>
            )}
            
            {config.embedProvider === 'lm-studio' && (
              <div className="mt-2 space-y-1.5">
                <p className="text-sm font-semibold">Model Embeddings (LM Studio)</p>
                <input
                  type="text"
                  placeholder="Contoh: embeddinggemma-300m-qat"
                  className="input input-bordered w-full"
                  value={config.lmStudioEmbedModel || 'embeddinggemma-300m-qat'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, lmStudioEmbedModel: e.target.value }))}
                />
                <p className="text-xs opacity-40">
                  Pastikan model text-embedding ini dalam status "Loaded" di LM Studio.
                </p>
              </div>
            )}
          </div>

          {/* Groq API Key */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Groq API Key (Untuk AI Chat & Voice STT)</p>
            <input
              type="password"
              placeholder="Contoh: gsk_xxxxxxxxxxxxxxxxx"
              className="input input-bordered w-full"
              value={config.groqApiKey || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, groqApiKey: e.target.value }))}
            />
            <p className="text-xs opacity-40">
              API Key gratis dari <a href="https://console.groq.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">console.groq.com</a> untuk Chat & STT.
            </p>
          </div>

          {/* System Persona */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Gaya Bicara dan Kepribadian</p>
            <textarea
              className="textarea w-full h-72 leading-relaxed no-scrollbar resize-none"
              placeholder="Deskripsikan kepribadian Mark..."
              value={config.personality}
              onChange={(e) => setConfig((prev) => ({ ...prev, personality: e.target.value }))}
            />
            <p className="text-xs opacity-40">
              Tentukan gaya bicara dan karakter Mark di system prompt.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Temperature</p>
              <span className="font-mono text-sm text-primary font-bold">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              className="range range-primary range-xs w-full"
              onChange={(e) => setConfig((prev) => ({ ...prev, temperature: e.target.value }))}
            />
            <div className="flex justify-between px-2.5 mt-2 text-xs">
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.8</span>
              <span>1.0</span>
            </div>
            <p className="text-xs opacity-40">
              Semakin tinggi temperature, semakin kreatif dan variatif jawaban Mark, tapi bisa jadi
              kurang
            </p>
          </div>

          {/* Context Window */}
          <div className="space-y-2">
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
              onChange={(e) => setConfig((prev) => ({ ...prev, context: e.target.value }))}
            />
            <div className="flex justify-between mt-2 text-xs">
              <span>2</span>
              <span>6</span>
              <span>10</span>
              <span>14</span>
              <span>18</span>
              <span>22</span>
            </div>
            <p className="text-xs opacity-40">
              Jumlah pesan yang dikirim ke AI sebagai konteks. Makin banyak = makin pintar tapi
              makin berat.
            </p>
          </div>

          <div className="divider"></div>

          {/* TTS Settings */}
          <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
            Audio & Voice Engine
          </h2>

          {/* TTS Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">TTS Rate (Kecepatan Suara)</p>
              <span className="font-mono text-sm text-primary font-bold">{config.ttsRate}%</span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={config.ttsRate}
              className="range range-primary range-xs w-full"
              onChange={(e) => setConfig((prev) => ({ ...prev, ttsRate: e.target.value }))}
            />
            <div className="flex justify-between mt-2 text-xs">
              <span>-50%</span>
              <span>-25%</span>
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
            </div>
            <p className="text-xs opacity-40">Seberapa cepat Mark berbicara (Standard 0-100%).</p>
          </div>

          {/* TTS Pitch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">TTS Pitch (Nada Suara)</p>
              <span className="font-mono text-sm text-primary font-bold">{config.ttsPitch}hz</span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={config.ttsPitch}
              className="range range-primary range-xs w-full"
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, ttsPitch: parseInt(e.target.value) }))
              }
            />
            <div className="flex justify-between mt-2 text-xs">
              <span>-50hz</span>
              <span>-25hz</span>
              <span>0hz</span>
              <span>25hz</span>
              <span>50hz</span>
            </div>
            <p className="text-xs opacity-40">
              Seberapa rendah atau tinggi nada suara Mark (Standard 0-100%).
            </p>
          </div>

          {/* Test TTS Button */}
          <div className="pt-2">
            <button
              className={`btn btn-soft btn-sm gap-2 ${playingTest ? 'btn-disabled' : ''}`}
              onClick={handleTestVoice}
              disabled={playingTest}
            >
              {playingTest ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.2em"
                  height="1.2em"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                </svg>
              )}
              Test Suara Mark
            </button>
            <p className="text-[10px] opacity-30 mt-1.5 px-1">
              *Klik untuk mendengar suara Mark dengan settingan di atas tanpa perlu simpan dulu.
            </p>
          </div>
        </section>

        <div className="divider"></div>

        {/* ── Memory & Data ── */}
        <section className="space-y-5">
          <h2 className="text-base font-bold uppercase tracking-wider opacity-70">Memory & Data</h2>

          {/* Chat History */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Chat History</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-soft btn-error btn-sm" onClick={handleClearAllChat}>
                Hapus Semua Chat
              </button>
              <button className="btn btn-soft btn-info btn-sm" onClick={handleExportChat}>
                Export Chat ke JSON
              </button>
            </div>
          </div>

          {/* Memory & Knowledge Base */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Memory & Knowledge Base</p>
              <span className="badge badge-sm badge-outline badge-primary">
                {memories.length} item
              </span>
            </div>

            {loadingMemory ? (
              <div className="flex justify-center py-10">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-10 opacity-30">
                <p className="text-sm">Belum ada memori tersimpan.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-100 overflow-y-auto no-scrollbar">
                {Object.entries(groupedMemories)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, mems]) => (
                    <div key={type} className="collapse collapse-arrow bg-base-200 rounded-xl">
                      <input type="checkbox" />
                      <div className="collapse-title text-sm font-semibold min-h-0 py-3">
                        <span
                          className={`badge badge-xs mr-2 ${typeBadgeColor[type] || 'badge-ghost'}`}
                        >
                          {type}
                        </span>
                        <span className="opacity-40 text-xs">({mems.length})</span>
                      </div>
                      <div className="collapse-content space-y-1.5 px-4 pb-3">
                        {mems.map((mem) => (
                          <div
                            key={mem.id}
                            className="flex items-start justify-between gap-3 bg-base-300 rounded-lg p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-primary truncate">{mem.key}</p>
                              <p className="text-xs opacity-60 mt-0.5 line-clamp-2">{mem.memory}</p>
                            </div>
                            <button
                              className="btn btn-ghost btn-xs text-error shrink-0"
                              onClick={() => handleDeleteMemory(mem)}
                              title="Hapus memori ini"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col items-end pt-2">
          {isDownloadingModel && (
            <div className="w-full max-w-xs mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span>Mengunduh Model Embeddings...</span>
                <span>{downloadProgress}%</span>
              </div>
              <progress className="progress progress-primary w-full" value={downloadProgress} max="100"></progress>
            </div>
          )}
          <button
            onClick={handleSaveConfiguration}
            disabled={isDownloadingModel}
            className="btn btn-primary px-8"
          >
            {isDownloadingModel ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Chat */}
      <dialog id="confirm_clear_chat" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg text-error">Hapus Semua Chat?</h3>
          <p className="py-4 text-sm opacity-60">
            Semua riwayat sesi chat akan dihapus permanen dan tidak bisa dikembalikan.
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost btn-sm">Batal</button>
            </form>
            <button className="btn btn-error btn-sm" onClick={confirmClearChat}>
              Ya, Hapus Semua
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  )
}

export default Configuration
