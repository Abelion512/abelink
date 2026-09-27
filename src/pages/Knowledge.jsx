import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Trash2,
  Database,
  Search,
  CheckCircle2,
  FileCheck,
  Clock,
  Activity,
  Layers
} from 'lucide-react'
import { ingestDocument } from '../api/ragPipeline'
import { getAllDocuments, deleteDocumentByName, db } from '../api/db'
import { deleteDocumentFromOrama } from '../api/oramaStore'
import { generateVector, cosineSimilarity } from '../api/vectorMemory'
import { useConfirm } from '../hooks/useConfirm'

const Knowledge = () => {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [selectedDocChunks, setSelectedDocChunks] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const { confirm, ModalComponent } = useConfirm()

  // Semantic query simulator state
  const [simQuery, setSimQuery] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [simResults, setSimResults] = useState(null)

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
      const sorted = uniqueDocs.sort((a, b) => b.timestamp - a.timestamp)
      setDocuments(sorted)
      if (sorted.length > 0 && !selectedDoc) {
        setSelectedDoc(sorted[0])
      }
    } catch (e) {
      console.error(e)
    }
  }, [selectedDoc])

  useEffect(() => {
    void (async () => {
      await loadData()
    })()
  }, [loadData])

  // Load real chunks for selectedDoc from Dexie
  useEffect(() => {
    if (!selectedDoc) {
      queueMicrotask(() => {
        setSelectedDocChunks([])
        setSimResults(null)
      })
      return
    }

    let active = true
    const fetchChunks = async () => {
      try {
        const chunks = await db.documents
          .where('docName')
          .equals(selectedDoc.name)
          .sortBy('chunkIndex')
        if (active) {
          setSelectedDocChunks(chunks || [])
          setSimResults(null)
        }
      } catch (err) {
        console.error('Error fetching doc chunks:', err)
      }
    }
    fetchChunks()
    return () => {
      active = false
    }
  }, [selectedDoc])

  const processFile = async (file) => {
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const res = await ingestDocument(file, (progress) => {
        setUploadProgress(progress)
      })
      await loadData()
      showToast(
        res?.degraded
          ? 'Dokumen tersimpan (mode degradasi: pencarian vektor mati, fulltext aktif). Aktifkan Full Mode untuk embedding.'
          : 'Dokumen berhasil di-ingest ke memori!'
      )
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
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
      e.target.value = ''
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
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

      if (selectedDoc?.name === docName) {
        setSelectedDoc(null)
      }
      await loadData()
      showToast('Dokumen berhasil dihapus')
    } catch (error) {
      console.error(error)
      await confirm({
        title: 'Gagal Menghapus',
        message: 'Gagal menghapus dokumen dari database',
        isError: true,
        hideCancel: true,
        confirmText: 'Tutup'
      })
    }
  }

  const handleRunSimulation = async (e) => {
    e.preventDefault()
    if (!simQuery.trim() || !selectedDoc || selectedDocChunks.length === 0) return
    setIsSimulating(true)
    try {
      const queryVector = await generateVector(simQuery)
      if (!queryVector) {
        setSimResults([])
        return
      }
      const scored = selectedDocChunks
        .filter((c) => Array.isArray(c.vector))
        .map((c) => ({ ...c, similarity: cosineSimilarity(queryVector, c.vector) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
      setSimResults(scored)
    } catch (err) {
      console.error('Simulation failed:', err)
      setSimResults([])
    } finally {
      setIsSimulating(false)
    }
  }

  const filteredDocs = documents.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-screen w-screen bg-[#161618] text-white flex flex-col overflow-hidden select-none">
      {/* Top Bar with Safe Area Gutter */}
      <div
        className="h-14 pl-16 pr-28 border-b border-white/10 flex items-center justify-between bg-[#1c1c1e]/80 backdrop-blur-xl shrink-0 z-30 select-none"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div
          className="flex items-center gap-3 pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Kembali ke Beranda"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#0a84ff]" />
            <h1 className="text-sm font-semibold tracking-wide">Knowledge Base (Agentic RAG)</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            {documents.length} Dokumen Terdaftar
          </span>
        </div>
      </div>

      {/* 2-Column Master-Detail Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Document List */}
        <div className="w-80 border-r border-white/10 bg-[#1c1c1e]/40 backdrop-blur-xl flex flex-col h-full shrink-0">
          {/* Search bar */}
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Cari dokumen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 w-full rounded-xl text-xs text-white placeholder:text-white/30 focus:border-[#0a84ff]/60 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.name === doc.name
              return (
                <div
                  key={doc.name}
                  onClick={() => setSelectedDoc(doc)}
                  className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between group cursor-pointer ${
                    isSelected
                      ? 'bg-[#0a84ff] text-white shadow-md'
                      : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    <FileText
                      size={16}
                      className={isSelected ? 'text-white' : 'text-[#0a84ff]'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{doc.name}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          isSelected ? 'text-white/80' : 'text-white/40'
                        }`}
                      >
                        {doc.chunks} chunks •{' '}
                        {new Date(doc.timestamp).toLocaleDateString('id-ID', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteDocument(doc.name)
                    }}
                    className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${
                      isSelected
                        ? 'hover:bg-white/20 text-white'
                        : 'hover:bg-[#ff453a]/20 text-white/40 hover:text-[#ff453a]'
                    }`}
                    title="Hapus Dokumen"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}

            {filteredDocs.length === 0 && (
              <div className="text-center py-10 text-xs text-white/40 px-4">
                {searchQuery
                  ? 'Tidak ada dokumen yang sesuai dengan pencarian.'
                  : 'Belum ada dokumen tersimpan.'}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detail & Upload */}
        <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Bulk Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed p-6 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
              isDragging
                ? 'border-[#0a84ff] bg-[#0a84ff]/10 scale-[1.01]'
                : 'border-white/15 bg-[#1c1c1e]/40 hover:border-white/25 hover:bg-[#1c1c1e]/60'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,.docx"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-11 h-11 rounded-2xl bg-[#0a84ff]/20 border border-[#0a84ff]/30 flex items-center justify-center text-[#0a84ff] mb-2.5">
              <UploadCloud size={22} />
            </div>
            <div className="text-sm font-semibold text-white mb-1">
              Tarik file dokumen ke sini atau klik untuk bulk upload
            </div>
            <p className="text-xs text-white/40 max-w-sm mb-2.5">
              Mendukung multi-file PDF, TXT, Markdown (.md), dan DOCX. Abelink memproses antrean secara otomatis.
            </p>
            <div className="flex items-center gap-2 text-[10px] text-white/50">
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">PDF</span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">TXT</span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">MD</span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">DOCX</span>
            </div>

            {isUploading && (
              <div className="w-full max-w-xs mt-4">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0a84ff] transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="text-[11px] text-white/70 mt-1.5 font-mono truncate">
                  {uploadStatusText || `Memproses: ${uploadProgress}%`}
                </div>
              </div>
            )}
          </div>

          {/* Selected Document Details & Agentic RAG Chunks */}
          {selectedDoc ? (
            <div className="rounded-2xl border border-white/10 bg-[#1c1c1e]/40 p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <FileCheck className="w-5 h-5 text-[#30d158]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{selectedDoc.name}</h3>
                    <p className="text-xs text-white/40">Status: Terindeks dalam Memori Vektor</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(selectedDoc.name)}
                  className="px-3 py-1.5 rounded-xl bg-[#ff453a]/20 text-[#ff453a] hover:bg-[#ff453a] hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={14} />
                  Hapus Dokumen
                </button>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-[11px] text-white/40 uppercase font-bold tracking-wider">
                    Total Chunk Vektor
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {selectedDoc.chunks}{' '}
                    <span className="text-xs font-normal text-white/50">segmen memori</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <div className="text-[11px] text-white/40 uppercase font-bold tracking-wider">
                    Waktu Diunggah
                  </div>
                  <div className="text-sm font-medium text-white flex items-center gap-1.5">
                    <Clock size={14} className="text-white/40" />
                    {new Date(selectedDoc.timestamp).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </div>
                </div>
              </div>

              {/* Semantic Query Simulator */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#0a84ff]" />
                    Simulator Query Semantik (Agentic RAG Test)
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Cosine Similarity</span>
                </div>

                <form onSubmit={handleRunSimulation} className="flex gap-2">
                  <input
                    type="text"
                    value={simQuery}
                    onChange={(e) => setSimQuery(e.target.value)}
                    placeholder="Ketik pertanyaan untuk menguji chunk mana yang paling relevan..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a84ff]"
                  />
                  <button
                    type="submit"
                    disabled={isSimulating || !simQuery.trim()}
                    className="px-4 py-1.5 bg-[#0a84ff] text-white rounded-xl text-xs font-medium hover:bg-[#0a84ff]/90 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {isSimulating ? 'Menguji...' : 'Uji Relevansi'}
                  </button>
                </form>

                {simResults && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">
                      Top 3 Chunk Paling Relevan
                    </div>
                    {simResults.length === 0 ? (
                      <div className="text-xs text-white/40">Tidak ada chunk yang cocok.</div>
                    ) : (
                      simResults.map((r, i) => (
                        <div
                          key={r.chunkIndex}
                          className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-white/60">Rank #{i + 1} (Chunk #{r.chunkIndex + 1})</span>
                            <span
                              className={`font-semibold ${
                                r.similarity > 0.6
                                  ? 'text-[#30d158]'
                                  : r.similarity > 0.3
                                    ? 'text-[#0a84ff]'
                                    : 'text-white/40'
                              }`}
                            >
                              Skor: {(r.similarity * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-white/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                            {r.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Raw Chunk Content Reader */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#0a84ff]" />
                    Isi Cuplikan Chunk Asli ({selectedDocChunks.length} Chunks)
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Indexed Records</span>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                  {selectedDocChunks.map((c) => (
                    <div
                      key={c.id || c.chunkIndex}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
                        <span className="font-semibold text-[#0a84ff]">Chunk #{c.chunkIndex + 1}</span>
                        <span>{c.content?.length || 0} karakter</span>
                      </div>
                      <p className="text-white/80 text-[11px] font-mono leading-relaxed whitespace-pre-wrap select-text">
                        {c.content}
                      </p>
                    </div>
                  ))}

                  {selectedDocChunks.length === 0 && (
                    <div className="text-center py-6 text-xs text-white/40">
                      Memuat chunk dari database...
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-white/40 border border-white/5 rounded-2xl">
              <Database className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs">Pilih dokumen di sebelah kiri untuk melihat detail indeks dan cuplikan teks.</p>
            </div>
          )}
        </div>
      </div>

      <ModalComponent />

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className="px-4 py-2.5 rounded-2xl bg-[#0a84ff] text-white text-xs font-medium shadow-2xl flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Knowledge
