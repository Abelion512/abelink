// DropAnywhere: overlay global drop di level aplikasi. File bisa dilepas di
// area mana pun (bukan cuma di InputBar). Multi-file, semua ekstensi.
// Saat overlay aktif, pointer-events memblok interaksi di bawahnya agar drop
// tidak jatuh ke elemen lain. Semua resolusi path via resolveDroppedFile
// (native path via Tauri, fallback saveTempFile untuk drop web).
import { useEffect, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { extractDroppedItems, extractClipboardFiles } from '../../utils/attachments'

export default function DropAnywhere({ onFilesDropped, enabled = true }) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!enabled) return

    // Drop native Tauri (file manager OS → webview): HTML5 dataTransfer kosong
    // di kasus ini, Tauri mengirim event 'tauri://drag-drop' berisi filePaths.
    // Disatukan ke pintu yang sama (onFilesDropped) agar area mana pun tetap bisa.
    let unlistenNativeDrop = null
    let unlistenNativeEnter = null
    let unlistenNativeOver = null
    let unlistenNativeLeave = null
    ;(async () => {
      try {
        unlistenNativeDrop = await listen('tauri://drag-drop', async (event) => {
          setIsDragging(false)
          const paths = event?.payload?.paths ?? []
          if (!Array.isArray(paths) || paths.length === 0) return
          const items = await Promise.all(
            paths.map(async (p) => {
              const item = { name: String(p).split(/[/\\]/).pop(), path: p, size: 0, type: '' }
              try {
                const [size, isDir] = await window.api.statPath(p)
                item.size = Number(size) || 0
                item.isDir = !!isDir
              } catch {
                // stat gagal — lampirkan tanpa ukuran
              }
              return item
            })
          )
          if (items.length > 0) onFilesDropped?.(items)
        })

        unlistenNativeEnter = await listen('tauri://drag-enter', () => {
          setIsDragging(true)
        })
        unlistenNativeOver = await listen('tauri://drag-over', () => {
          setIsDragging(true)
        })
        unlistenNativeLeave = await listen('tauri://drag-leave', () => {
          setIsDragging(false)
        })
      } catch {
        // Bukan env Tauri / event tak tersedia — jalur HTML5 di bawah tetap jalan.
      }
    })()

    let depth = 0
    const hasDropData = (e) => {
      if (!e.dataTransfer) return false
      const types = Array.from(e.dataTransfer.types || [])
      return (
        types.includes('Files') ||
        types.includes('text/uri-list') ||
        types.includes('text/html') ||
        types.some((t) => t.startsWith('image/'))
      )
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

    // Global Paste (Ctrl+V) listener: tangkap gambar dari clipboard / screenshot / text/uri-list / text/html
    const onPaste = async (e) => {
      const items = Array.from(e.clipboardData?.items || [])
      const types = Array.from(e.clipboardData?.types || [])
      const hasFile = items.some((it) => it.kind === 'file')
      const hasUriList = types.includes('text/uri-list')
      const rawText = e.clipboardData?.getData('text/plain') || ''
      const hasFileUri = rawText.startsWith('file://')
      const hasHtml = types.includes('text/html') && /<img[^>]+src=/i.test(e.clipboardData?.getData('text/html') || '')

      if (!hasFile && !hasUriList && !hasFileUri && !hasHtml) return

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
      if (typeof unlistenNativeDrop === 'function') unlistenNativeDrop()
      if (typeof unlistenNativeEnter === 'function') unlistenNativeEnter()
      if (typeof unlistenNativeOver === 'function') unlistenNativeOver()
      if (typeof unlistenNativeLeave === 'function') unlistenNativeLeave()
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
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xl flex items-center justify-center pointer-events-auto transition-all duration-200 animate-fade-in p-6"
      data-drop-anywhere
    >
      <div className="flex flex-col items-center gap-4 p-8 sm:p-10 rounded-3xl bg-[#1c1c1e]/90 border-2 border-dashed border-[#0a84ff] shadow-2xl pointer-events-none max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#0a84ff]/20 border border-[#0a84ff]/40 flex items-center justify-center text-[#0a84ff] shadow-lg shadow-[#0a84ff]/20 animate-bounce">
          <UploadCloud size={32} />
        </div>
        <div className="space-y-1.5">
          <div className="text-lg font-semibold tracking-tight text-white">Lepaskan file di mana saja</div>
          <div className="text-xs text-white/70 font-medium">
            Mendukung gambar, dokumen, teks, arsip, dan kode
          </div>
        </div>
        <div className="px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-[#0a84ff]">
          Paste (Ctrl+V) langsung dari clipboard juga didukung
        </div>
      </div>
    </div>
  )
}
