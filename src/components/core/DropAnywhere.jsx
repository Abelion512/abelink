// DropAnywhere: overlay global drop di level aplikasi. File bisa dilepas di
// area mana pun (bukan cuma di InputBar). Multi-file, semua ekstensi.
// Saat overlay aktif, pointer-events memblok interaksi di bawahnya agar drop
// tidak jatuh ke elemen lain. Semua resolusi path via resolveDroppedFile
// (native path via Tauri, fallback saveTempFile untuk drop web).
import { useEffect, useState } from 'react'
import { FaPaperclip, FaRegImage } from 'react-icons/fa'
import { extractDroppedItems, extractClipboardFiles } from '../../utils/attachments'

export default function DropAnywhere({ onFilesDropped, enabled = true }) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!enabled) return

    let depth = 0
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

    // Global Paste (Ctrl+V) listener: tangkap gambar dari clipboard / screenshot
    const onPaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || [])
      const hasFile = items.some((it) => it.kind === 'file')
      if (!hasFile) return

      e.preventDefault()
      try {
        const droppedItems = await extractClipboardFiles(e.clipboardData)
        if (droppedItems.length > 0) {
          onFilesDropped?.(droppedItems)
        }
      } catch (err) {
        console.error('[DropAnywhere] paste error:', err)
      }
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [enabled, onFilesDropped])

  if (!isDragging) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-2xl flex items-center justify-center pointer-events-auto transition-all duration-300 animate-fade-in p-6"
      data-drop-anywhere
    >
      <div className="flex flex-col items-center gap-4 p-8 sm:p-10 rounded-3xl bg-base-200/80 border-2 border-dashed border-cyan-400/80 shadow-[0_16px_48px_rgba(0,0,0,0.8),0_0_30px_rgba(6,182,212,0.3)] pointer-events-none max-w-md text-center transform scale-100">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.4)] animate-bounce">
          <FaRegImage size={32} />
        </div>
        <div className="space-y-1.5">
          <div className="text-xl font-bold tracking-tight text-white">Lepaskan file di mana saja</div>
          <div className="text-xs text-white/70 font-medium">
            Multi-file didukung: gambar, screenshot, dokumen, arsip, dan kode
          </div>
        </div>
        <div className="px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[11px] font-mono text-cyan-300">
          Paste (Ctrl+V) langsung dari clipboard juga didukung
        </div>
      </div>
    </div>
  )
}
