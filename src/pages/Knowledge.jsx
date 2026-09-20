import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ingestDocument } from '../api/ragPipeline'
import { getAllDocuments, deleteDocumentByName } from '../api/db'
import { deleteDocumentFromOrama } from '../api/oramaStore'
import { useConfirm } from '../hooks/useConfirm'

const Knowledge = () => {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { confirm, ModalComponent } = useConfirm()

  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const loadData = useCallback(async () => {
    try {
      const allDocs = await getAllDocuments()
      const uniqueDocs = Array.from(new Set(allDocs.map((d) => d.docName))).map((name) => {
        const chunks = allDocs.filter((d) => d.docName === name)
        return {
          name,
          chunks: chunks.length,
          timestamp: chunks[0]?.timestamp || 0
        }
      })
      setDocuments(uniqueDocs.sort((a, b) => b.timestamp - a.timestamp))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      await ingestDocument(file, (progress) => {
        setUploadProgress(progress)
      })
      await loadData()
      showToast('Dokumen berhasil di-ingest!')
    } catch (error) {
      console.error(error)
      await confirm({
        title: 'Gagal Ingest',
        message: error.message,
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      if (e.target) e.target.value = ''
    }
  }

  const handleDeleteDocument = async (docName) => {
    const result = await confirm({
      title: 'Hapus Dokumen?',
      message: `Yakin ingin menghapus dokumen "${docName}"? Abelink tidak akan bisa mengingat informasi dari dokumen ini lagi.`,
      isError: true,
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    })

    if (!result.isConfirmed) return

    try {
      const allDocs = await getAllDocuments()
      const chunks = allDocs.filter((d) => d.docName === docName)

      for (const chunk of chunks) {
        await deleteDocumentByName(docName)
        if (chunk.oramaId) {
          await deleteDocumentFromOrama(chunk.oramaId)
        }
      }

      await loadData()
      showToast('Dokumen berhasil dihapus')
    } catch (error) {
      console.error(error)
      await confirm({
        title: 'Oops...',
        message: 'Gagal menghapus dokumen',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    }
  }

  return (
    <div className="h-screen bg-[#080B09] text-zinc-200 overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(6,182,212,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.04),transparent_40%)] pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-8 pb-32 space-y-8">
          {/* Page Header */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0"
                style={{ WebkitAppRegion: 'no-drag' }}
                title="Kembali ke Dashboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1.1em"
                  height="1.1em"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl font-semibold text-white tracking-tight">Document Knowledge</h1>
                  <span className="text-[11px] text-zinc-500 font-mono tracking-wide">/ Local Vector RAG</span>
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Inject dokumen lokal untuk diindeks ke dalam memori vektor Abelink.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                {documents.length} Dokumen Aktif
              </span>
            </div>
          </div>

          {/* 2-Column Responsive Widescreen Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Upload / Dropzone Card & Telemetry */}
            <div className="lg:col-span-1 space-y-6">
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xs font-semibold text-cyan-400 uppercase tracking-wide flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    Upload Dokumen Baru
                  </h2>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Mendukung format <span className="text-zinc-200 font-mono">PDF, TXT, MD, DOCX</span>. Teks akan di-chunk dan di-vektorisasi secara lokal.
                  </p>
                </div>

                <label className={`group relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
                  isUploading
                    ? 'border-cyan-500/40 bg-cyan-500/[0.03] pointer-events-none'
                    : 'border-white/10 hover:border-cyan-400/40 bg-white/[0.015] hover:bg-cyan-500/[0.02]'
                }`}>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.txt,.md,.docx"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] group-hover:border-cyan-500/30 flex items-center justify-center text-zinc-400 group-hover:text-cyan-400 transition-all mb-3 shadow-inner">
                    {isUploading ? (
                      <span className="loading loading-spinner loading-sm text-cyan-400" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                    )}
                  </div>
                  <p className="text-xs font-medium text-zinc-200 group-hover:text-cyan-300 text-center">
                    {isUploading ? 'Sedang Memproses Dokumen...' : 'Pilih file atau seret ke sini'}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">Max 50MB per file</p>
                </label>

                {isUploading && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                      <span>Memproses Chunking & Vektorisasi</span>
                      <span className="text-cyan-400 font-semibold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-white/[0.05] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* RAG Engine Info Card */}
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-3">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                  Arsitektur RAG Lokal
                </h3>
                <div className="text-[11px] text-zinc-400 space-y-2 leading-relaxed">
                  <p>
                    Semua dokumen diindeks secara lokal ke IndexedDB (Dexie) dan Orama Vector DB tanpa mengirim file mentah ke server eksternal.
                  </p>
                  <p className="text-zinc-500 font-mono text-[10px]">
                    Chunk size: 500 chars • Overlap: 50 chars • 384-dim vector
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Ingested Documents List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="p-6 rounded-3xl bg-black/30 backdrop-blur-2xl border border-white/[0.08] shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Pustaka Dokumen Tersimpan
                  </h2>
                  <span className="text-xs font-mono text-zinc-500">
                    {documents.reduce((acc, d) => acc + d.chunks, 0)} Total Chunks
                  </span>
                </div>

                <div className="space-y-2.5">
                  {documents.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-white/[0.015] rounded-2xl border border-white/[0.06] text-zinc-500 space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto text-zinc-600 mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <p className="text-xs text-zinc-400 font-medium">Belum ada dokumen yang di-inject.</p>
                      <p className="text-[11px] text-zinc-600 max-w-sm mx-auto">
                        Unggah file dokumen di panel sebelah kiri untuk menambahkan pengetahuan ke Abelink.
                      </p>
                    </div>
                  ) : (
                    documents.map((doc, i) => {
                      const ext = doc.name.split('.').pop()?.toUpperCase() || 'FILE'
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.1] transition-all gap-4 group"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs font-mono shrink-0">
                              {ext}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-xs text-zinc-200 truncate group-hover:text-white transition-colors" title={doc.name}>
                                {doc.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1 font-mono text-[10px]">
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-zinc-400 border border-white/[0.05]">
                                  {doc.chunks} chunks
                                </span>
                                <span className="text-zinc-500">
                                  Diunggah {new Date(doc.timestamp).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(doc.name)}
                            className="w-8 h-8 rounded-xl bg-white/[0.02] hover:bg-rose-500/15 border border-white/[0.06] hover:border-rose-500/30 text-zinc-500 hover:text-rose-300 flex items-center justify-center transition-all shrink-0"
                            title="Hapus Dokumen"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ModalComponent />
      
      {toastMessage && (
        <div className="toast toast-top toast-end z-[9999]">
          <div className="alert alert-success shadow-lg rounded-2xl flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 backdrop-blur-xl">
            <span className="text-xs font-medium">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Knowledge
