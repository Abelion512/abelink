// Section: Memory & Data (chat export/import/clear, full encrypted backup)
import { useState } from 'react'
import { Download, Upload, Trash2, Lock } from 'lucide-react'
import { db, importChat, exportFullMark, importFullMark } from '../../../api/db'
import { useConfirm } from '../../../hooks/useConfirm'

export default function ConfigChat() {
  const { confirm } = useConfirm()
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupPw, setBackupPw] = useState('')
  const [restorePw, setRestorePw] = useState('')

  const handleClearAllChat = async () => {
    const result = await confirm({
      title: 'Hapus Semua Chat?',
      message: 'Semua riwayat sesi chat akan dihapus permanen dan tidak bisa dikembalikan.',
      isError: true,
      confirmText: 'Ya, Hapus Semua'
    })

    if (result.isConfirmed) {
      await db.sessions.clear()
      await db.chatArchive.clear()
    }
  }

  const handleExportChat = async () => {
    const session = await db.sessions.get(1)
    const exportData = session ? session.data : []
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-chat-history-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportChatFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const result = await confirm({
        title: 'Import Chat?',
        message: `File "${file.name}" — ${(JSON.parse(text).data || []).length} pesan. Chat saat ini akan ditimpa.`,
        confirmText: 'Ya, Import'
      })
      if (result.isConfirmed) {
        await importChat(text)
        e.target.value = ''
        await confirm({ title: 'Berhasil', message: 'Chat diimport. Reload halaman.', hideCancel: true, confirmText: 'Reload' })
        window.location.reload()
      }
    } catch (err) {
      await confirm({ title: 'Gagal', message: err.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
  }

  const handleExportFull = async () => {
    if (!backupPw.trim()) {
      await confirm({ title: 'Password Kosong', message: 'Beri password untuk enkripsi backup.', isError: true, hideCancel: true, confirmText: 'OK' })
      return
    }
    const ok = await confirm({
      title: 'Export Semua Data?',
      message: 'Semua data akan dienkripsi dengan password. API key tidak ikut backup. Simpan password baik-baik.',
      confirmText: 'Export'
    })
    if (!ok.isConfirmed) return
    setBackupBusy('export')
    try {
      const json = await exportFullMark(backupPw)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mark-full-backup-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      await confirm({ title: 'Gagal', message: err.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBackupBusy(false)
  }

  const handleRestoreFullFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBackupBusy('restore')
    try {
      const text = await file.text()
      const pw = text.includes('mark-full-encrypted') ? restorePw.trim() : null
      if (text.includes('mark-full-encrypted') && !pw) {
        await confirm({ title: 'Password Dibutuhkan', message: 'File backup terenkripsi. Masukkan password.', isError: true, hideCancel: true, confirmText: 'OK' })
        setBackupBusy(false)
        return
      }
      const ok = await confirm({
        title: '⚠️ Restore Semua Data?',
        message: 'Data MARK saat ini akan DIHAPUS dan diganti backup. Tidak bisa dibatalkan.',
        isError: true,
        confirmText: 'Ya, Restore'
      })
      if (!ok.isConfirmed) { setBackupBusy(false); return }
      await importFullMark(text, pw)
      e.target.value = ''
      await confirm({ title: 'Berhasil', message: 'Restore selesai. Reload halaman.', hideCancel: true, confirmText: 'Reload' })
      window.location.reload()
    } catch (err) {
      await confirm({ title: 'Gagal', message: err.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBackupBusy(false)
  }

  return (
    <section className="space-y-5">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
        Memory & Data
      </h2>

      {/* Chat History */}
      <div className="glass p-4 space-y-3">
        <p className="text-sm font-semibold">Chat History</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-soft btn-info btn-sm gap-2" onClick={handleExportChat}>
            <Download size={11} /> Export Chat
          </button>
          <button className="btn btn-soft btn-primary btn-sm gap-2" onClick={() => document.getElementById('import-chat-input').click()}>
            <Upload size={11} /> Import Chat
          </button>
          <button className="btn btn-soft btn-error btn-sm gap-2" onClick={handleClearAllChat}>
            <Trash2 size={11} /> Hapus Semua Chat
          </button>
        </div>
        <input type="file" id="import-chat-input" accept=".json" className="hidden" onChange={handleImportChatFile} />
      </div>

      {/* Full Backup Encrypted */}
      <div className="glass p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Full MARK Backup</p>
          <Lock className="text-warning" size={14} />
        </div>
        <p className="text-xs text-white/40">Semua data (chat, memori, dokumen, relasi, riwayat). Dienkripsi AES-256-GCM. API key tidak ikut backup.</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-white/50 mb-1 block">Password enkripsi</label>
            <input
              type="password"
              className="input input-bordered input-sm w-full bg-base-200/50"
              value={backupPw}
              onChange={e => setBackupPw(e.target.value)}
              placeholder="password backup..."
            />
          </div>
          <button className="btn btn-soft btn-warning btn-sm gap-2" onClick={handleExportFull} disabled={backupBusy}>
            {backupBusy === 'export' ? <span className="loading loading-spinner loading-xs" /> : <Lock size={11} />}
            Export & Enkripsi
          </button>
          <button className="btn btn-soft btn-accent btn-sm gap-2" onClick={() => document.getElementById('restore-full-input').click()} disabled={backupBusy}>
            <Upload size={11} /> Restore dari Backup
          </button>
        </div>

        <div className="flex-1 min-w-[180px] hidden" id="restore-pw-wrap">
          <label className="text-xs text-warning/70 mb-1 block">Password untuk restore</label>
          <input
            type="password"
            className="input input-bordered input-sm w-full bg-base-200/50"
            value={restorePw}
            onChange={e => setRestorePw(e.target.value)}
            placeholder="password backup..."
          />
        </div>
        <input type="file" id="restore-full-input" accept=".json" className="hidden" onChange={handleRestoreFullFile} />
      </div>
    </section>
  )
}
