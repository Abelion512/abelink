// DropAnywhere — overlay global drop di level aplikasi: file bisa dilepas di
// area mana pun (bukan cuma di InputBar). Multi-file, semua ekstensi.
// Saat overlay aktif, pointer-events memblok interaksi di bawahnya agar drop
// tidak jatuh ke elemen lain. Semua resolusi path via resolveDroppedFile
// (native path via Tauri, fallback saveTempFile untuk drop web).
import { useEffect, useState } from 'react'
import { FaPaperclip } from 'react-icons/fa'
import { extractDroppedItems } from '../../utils/attachments'

export default function DropAnywhere({ onFilesDropped, enabled = true }) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // dragenter/dragleave di window berpasangan; hitung depth agar overlay
    // tidak berkedip saat kursor melewati elemen anak.
    let depth = 0
    // 'Files' = drop file OS; 'text/uri-list' = drag gambar/link dari web.
    // Tanpa uri-list, drag dari browser lain tidak memunculkan overlay.
    const hasDropData = (e) => {
      if (!e.dataTransfer) return false
      const types = Array.from(e.dataTransfer.types || [])
      return types.includes('Files') || types.includes('text/uri-list')
    }

    const onEnter = (e) => {
      if (!hasDropData(e)) return
      depth += 1
      setIsDragging(true)
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setIsDragging(false)
    }
    const onOver = (e) => {
      // WAJIB preventDefault agar browser tidak membuka file / menavigasi.
      if (hasDropData(e)) e.preventDefault()
    }
    const onDrop = async (e) => {
      if (!hasDropData(e)) return
      e.preventDefault()
      depth = 0
      setIsDragging(false)
      try {
        const items = await extractDroppedItems(e.dataTransfer)
        if (items.length > 0) onFilesDropped?.(items)
      } catch (err) {
        console.error('[DropAnywhere] drop error:', err)
      }
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
