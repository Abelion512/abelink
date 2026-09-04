// DropAnywhere — overlay global drop di level aplikasi: file bisa dilepas di
// area mana pun (bukan cuma di InputBar). Multi-file, semua ekstensi.
// Saat overlay aktif, pointer-events memblok interaksi di bawahnya agar drop
// tidak jatuh ke elemen lain. Semua resolusi path via resolveDroppedFile
// (native path via Tauri, fallback saveTempFile untuk drop web).
import { useEffect, useState } from 'react'
import { FaPaperclip } from 'react-icons/fa'
import { resolveDroppedFile } from '../../utils/attachments'

export default function DropAnywhere({ onFilesDropped, enabled = true }) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // dragenter/dragleave di window berpasangan; hitung depth agar overlay
    // tidak berkedip saat kursor melewati elemen anak.
    let depth = 0
    const hasFiles = (e) =>
      e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')

    const onEnter = (e) => {
      if (!hasFiles(e)) return
      depth += 1
      setIsDragging(true)
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setIsDragging(false)
    }
    const onOver = (e) => {
      // WAJIB preventDefault agar browser tidak membuka file saat drop.
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length === 0) return
      Promise.all(files.map(resolveDroppedFile))
        .then((items) => onFilesDropped?.(items))
        .catch((err) => console.error('[DropAnywhere] drop error:', err))
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled, onFilesDropped])

  if (!isDragging) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-primary/10 backdrop-blur-sm border-4 border-dashed border-primary/60 flex items-center justify-center pointer-events-auto animate-fade-in"
      data-drop-anywhere
    >
      <div className="flex flex-col items-center gap-3 text-white pointer-events-none">
        <FaPaperclip className="animate-bounce" size={42} />
        <div className="text-lg font-semibold">Lepaskan file di mana saja</div>
        <div className="text-sm opacity-70">
          Multi-file didukung - dokumen, gambar, video, arsip, kode
        </div>
      </div>
    </div>
  )
}
