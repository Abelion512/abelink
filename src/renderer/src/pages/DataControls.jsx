import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FaArrowLeft, FaDownload, FaUpload, FaTrash, FaLock } from 'react-icons/fa'
import { useConfirm } from '../hooks/useConfirm'
import {
  exportChat, importChat,
  exportFullMark, importFullMark,
  db
} from '../api/db'

const DataControls = () => {
  const { confirm, ModalComponent } = useConfirm()
  const [busy, setBusy] = useState(null)
  const [passwords, setPasswords] = useState({ exportPw: '', importPw: '' })
  const [showPw, setShowPw] = useState({ exportPw: false, importPw: false })

  const Section = ({ title, desc, children }) => (
    <div className="bg-base-300/60 backdrop-blur-sm border border-[var(--glass-border)] rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {desc && <p className="text-sm text-white/50 mt-1">{desc}</p>}
      </div>
      {children}
    </div>
  )

  const ActionBtn = ({ icon: Icon, label, color = 'info', onClick, loading }) => (
    <button
      className={`btn btn-soft btn-${color} btn-sm gap-2`}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? <span className="loading loading-spinner loading-xs" /> : <Icon size={14} />}
      {label}
    </button>
  )

  // ─── Chat Export (plain JSON) ───
  const handleExportChat = async () => {
    setBusy('exportChat')
    try {
      const json = await exportChat()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mark-chat-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      await confirm({ title: 'Gagal Export', message: e.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBusy(null)
  }

  // ─── Chat Import ───
  const handleImportChat = () => document.getElementById('import-chat-input').click()
  const onChatFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('importChat')
    try {
      const text = await file.text()
      const result = await confirm({
        title: 'Import Chat?',
        message: `Akan mengimpor ${resultCount(text)} pesan. Chat saat ini akan ditimpa.`,
        confirmText: 'Ya, Import'
      })
      if (result.isConfirmed) {
        await importChat(text)
        e.target.value = ''
        await confirm({ title: 'Berhasil', message: `${resultCount(text)} pesan diimport. Reload halaman untuk melihat.`, hideCancel: true, confirmText: 'OK' })
      }
    } catch (e) {
      await confirm({ title: 'Gagal Import', message: e.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBusy(null)
  }
  const resultCount = (t) => { try { return JSON.parse(t).data?.length || 0 } catch { return 0 } }

  // ─── Full MARK Export ───
  const handleExportFull = async () => {
    const pw = passwords.exportPw.trim()
    if (!pw) {
      await confirm({ title: 'Password Dibutuhkan', message: 'Beri password untuk enkripsi backup.', isError: true, hideCancel: true, confirmText: 'OK' })
      return
    }
    const result = await confirm({
      title: 'Export Semua Data MARK?',
      message: 'Semua data (chat, memori, config tanpa API key, dokumen, relasi) akan di-backup dan dienkripsi dengan password. Simpan password baik-baik — tanpa password, backup tidak bisa dibuka.',
      confirmText: 'Export & Enkripsi'
    })
    if (!result.isConfirmed) return

    setBusy('exportFull')
    try {
      const json = await exportFullMark(pw)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mark-full-backup-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      await confirm({ title: 'Berhasil', message: 'Backup terenkripsi berhasil diunduh.', hideCancel: true, confirmText: 'OK' })
    } catch (e) {
      await confirm({ title: 'Gagal Export', message: e.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBusy(null)
  }

  // ─── Full MARK Import ───
  const handleImportFull = () => document.getElementById('import-full-input').click()
  const onFullFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('importFull')
    try {
      const text = await file.text()
      const pw = passwords.importPw.trim()
      const isEncrypted = text.includes('mark-full-encrypted')

      if (isEncrypted && !pw) {
        await confirm({ title: 'Password Dibutuhkan', message: 'File backup terenkripsi. Masukkan password.', isError: true, hideCancel: true, confirmText: 'OK' })
        setBusy(null)
        return
      }

      const result = await confirm({
        title: '⚠️ Restore Semua Data?',
        message: isEncrypted
          ? 'Semua data MARK saat ini akan DIHAPUS dan diganti dengan data backup. Proses tidak bisa dibatalkan.'
          : 'File backup tanpa enkripsi. Data saat ini akan ditimpa. Lanjutkan?',
        isError: true,
        confirmText: 'Ya, Restore'
      })
      if (!result.isConfirmed) { setBusy(null); return }

      const summary = await importFullMark(text, isEncrypted ? pw : null)
      e.target.value = ''
      await confirm({ title: 'Restore Berhasil', message: `${summary.totalStores} kategori data direstore. Reload halaman sekarang.`, hideCancel: true, confirmText: 'Reload' })
      window.location.reload()
    } catch (e) {
      await confirm({ title: 'Gagal Restore', message: e.message, isError: true, hideCancel: true, confirmText: 'Tutup' })
    }
    setBusy(null)
  }

  // ─── Delete Chat ───
  const handleDeleteChat = async () => {
    const result = await confirm({
      title: 'Hapus Semua Chat?',
      message: 'Riwayat chat akan dihapus permanen. Tidak bisa dikembalikan.',
      isError: true,
      confirmText: 'Ya, Hapus'
    })
    if (!result.isConfirmed) return
    setBusy('deleteChat')
    await db.sessions.clear()
    await db.chatArchive.clear()
    setBusy(null)
    await confirm({ title: 'Berhasil', message: 'Semua chat dihapus.', hideCancel: true, confirmText: 'OK' })
  }

  // ─── Delete All MARK Data ───
  const handleDeleteAll = async () => {
    const r1 = await confirm({
      title: '⚠️⚠️⚠️ HAPUS SEMUA DATA MARK',
      message: 'Ini akan menghapus chat, memori, dokumen, relasi, riwayat tugas — semua data MARK. TIDAK BISA DIKEMBALIKAN.\n\nExport backup dulu kalau masih butuh data.',
      isError: true,
      confirmText: 'Lanjutkan Hapus'
    })
    if (!r1.isConfirmed) return
    const r2 = await confirm({
      title: 'Konfirmasi Final',
      message: 'Ketik "HAPUS" untuk konfirmasi.',
      isError: true,
      confirmText: 'HAPUS'
    })
    if (!r2.isConfirmed) return
    setBusy('deleteAll')
    await Promise.all([
      db.sessions.clear(),
      db.memory.clear(),
      db.config.clear(),
      db.chatArchive.clear(),
      db.documents.clear(),
      db.relationships.clear(),
      db.autonomousTasks.clear(),
      db.taskHistory.clear(),
      db.auditLog.clear(),
      db.primingLog.clear()
    ])
    setBusy(null)
    await confirm({ title: 'Data Dihapus', message: 'Semua data MARK telah dihapus. Reload halaman.', hideCancel: true, confirmText: 'Reload' })
    window.location.reload()
  }

  const PwInput = ({ id, label, value, onChange, show, onToggle }) => (
    <div className="flex items-center gap-2">
      <label className="text-xs text-white/70 whitespace-nowrap">{label}</label>
      <div className="relative flex-1 max-w-xs">
        <input
          type={show ? 'text' : 'password'}
          className="input input-bordered input-sm w-full pr-8 bg-base-200/50 text-sm"
          value={value}
          onChange={onChange}
          placeholder="password backup..."
        />
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-xs"
          onClick={onToggle}
        >
          {show ? 'sembunyi' : 'lihat'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto">
      {ModalComponent}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/config" className="btn btn-ghost btn-sm btn-circle text-white/60 hover:text-white">
          <FaArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Data Controls</h1>
          <p className="text-sm text-white/40">Kelola data MARK — backup, restore, hapus</p>
        </div>
      </div>

      {/* ─── CHAT ─── */}
      <Section title="Chat History" desc="Export/import percakapan tanpa enkripsi. Cocok buat pindah device.">
        <div className="flex flex-wrap gap-2">
          <ActionBtn icon={FaDownload} label="Export Chat" onClick={handleExportChat} loading={busy === 'exportChat'} />
          <ActionBtn icon={FaUpload} label="Import Chat" onClick={handleImportChat} loading={busy === 'importChat'} />
          <ActionBtn icon={FaTrash} color="error" label="Hapus Semua Chat" onClick={handleDeleteChat} loading={busy === 'deleteChat'} />
        </div>
        <input type="file" id="import-chat-input" accept=".json" className="hidden" onChange={onChatFile} />
      </Section>

      {/* ─── FULL BACKUP ─── */}
      <Section title="Full MARK Backup" desc="Backup semua data (chat, memori, dokumen, relasi, riwayat tugas). Dienkripsi AES-256-GCM dengan password.">
        <PwInput
          id="exportPw"
          label="Password"
          value={passwords.exportPw}
          onChange={e => setPasswords(p => ({ ...p, exportPw: e.target.value }))}
          show={showPw.exportPw}
          onToggle={() => setShowPw(s => ({ ...s, exportPw: !s.exportPw }))}
        />
        <ActionBtn icon={FaLock} color="primary" label="Export & Enkripsi Semua Data" onClick={handleExportFull} loading={busy === 'exportFull'} />
      </Section>

      <Section title="Restore Full Backup" desc="Pilih file backup (.json) dan masukkan password yang sama waktu export.">
        <PwInput
          id="importPw"
          label="Password"
          value={passwords.importPw}
          onChange={e => setPasswords(p => ({ ...p, importPw: e.target.value }))}
          show={showPw.importPw}
          onToggle={() => setShowPw(s => ({ ...s, importPw: !s.importPw }))}
        />
        <div className="text-xs text-warning/70 flex items-center gap-1">
          ⚠️ Semua data saat ini akan DITIMPA.
        </div>
        <ActionBtn icon={FaUpload} color="warning" label="Restore dari File Backup" onClick={handleImportFull} loading={busy === 'importFull'} />
        <input type="file" id="import-full-input" accept=".json" className="hidden" onChange={onFullFile} />
      </Section>

      {/* ─── DANGER ZONE ─── */}
      <Section title="Danger Zone" desc="Operasi permanen. Hati-hati.">
        <ActionBtn icon={FaTrash} color="error" label="⚠️ Hapus Semua Data MARK" onClick={handleDeleteAll} loading={busy === 'deleteAll'} />
      </Section>

      {/* Export existing handler dari Configuration - hidden input fix */}
      <div id="legacy-export-zone" className="hidden" />
    </div>
  )
}

export default DataControls
