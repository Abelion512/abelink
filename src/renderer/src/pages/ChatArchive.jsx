import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAllChatArchives, deleteChatArchive } from '../api/db'
import { deleteArchiveFromOrama } from '../api/oramaStore'
import Swal from 'sweetalert2'

const ChatArchive = () => {
  const navigate = useNavigate()
  const [archives, setArchives] = useState([])

  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: 'oklch(var(--b2))',
    color: 'oklch(var(--bc))',
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  })

  const loadData = useCallback(async () => {
    try {
      const allArchives = await getAllChatArchives()
      setArchives(allArchives.sort((a, b) => b.timestamp - a.timestamp))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeleteArchive = async (id) => {
    const result = await Swal.fire({
      title: 'Hapus Arsip?',
      text: 'Yakin ingin menghapus arsip obrolan ini? Ingatan Mark tentang topik ini akan hilang.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'oklch(var(--er))',
      cancelButtonColor: 'oklch(var(--b3))',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      background: 'oklch(var(--b2))',
      color: 'oklch(var(--bc))'
    })

    if (!result.isConfirmed) return

    try {
      await deleteChatArchive(id)
      await deleteArchiveFromOrama(id)
      await loadData()
      Toast.fire({
        icon: 'success',
        title: 'Arsip berhasil dihapus'
      })
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Gagal menghapus arsip',
        background: 'oklch(var(--b2))',
        color: 'oklch(var(--bc))',
        confirmButtonColor: 'oklch(var(--er))'
      })
    }
  }

  return (
    <div className="h-screen bg-[var(--base-300)] text-base-content overflow-hidden relative font-['Poppins',sans-serif]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(var(--n))_0%,transparent_70%)] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none" />

      {/* Main Content Area */}
      <div className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-32 space-y-8">
          {/* Page Header */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')} 
              className="btn btn-ghost btn-sm btn-circle"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold">Chat Archives</h1>
              <p className="opacity-50 text-sm mt-1">
                Memori jangka panjang dari seluruh obrolan masa lalu.
              </p>
            </div>
          </div>

          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
                Riwayat Memori
              </h2>
              <span className="badge badge-sm badge-outline badge-secondary">
                {archives.length} ingatan
              </span>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
              {archives.length === 0 ? (
                <div className="text-center py-10 opacity-30 bg-base-200/30 rounded-xl border border-base-content/5">
                  <p className="text-sm">Belum ada arsip obrolan tersimpan.</p>
                </div>
              ) : (
                archives.map((arc, i) => (
                  <div key={i} className="card bg-base-100/50 backdrop-blur-sm shadow-xl border border-base-content/10 group relative overflow-hidden flex flex-col transition-all hover:bg-base-200">
                    <div className="card-body p-5">
                      <div className="flex justify-between items-start mb-3">
                        <span className="badge badge-sm badge-secondary">{arc.topic}</span>
                        <span className="text-[10px] opacity-40">{new Date(arc.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm opacity-80 flex-1 leading-relaxed">{arc.summary}</p>
                      <button 
                        className="absolute bottom-2 right-2 btn btn-circle btn-ghost btn-sm text-error opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteArchive(arc.id)}
                        title="Hapus Arsip"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ChatArchive
