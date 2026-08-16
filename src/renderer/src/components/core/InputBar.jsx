import { useRef, useEffect, useState } from 'react'
import {
  Mic,
  Square,
  ArrowUp,
  Smile,
  Paperclip,
  X,
  FileText,
  FileCode,
  FileImage,
  Lock,
  Link2
} from 'lucide-react'
import ConfirmModal from './ConfirmModal'

const EMOJIS = [
  '😂', '🤣', '😅', '🗿', '🙏', '🔥', '🚀', '💀',
  '😎', '🤔', '😭', '❤️', '👍', '✨', '👀', '💯'
]

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const getFileIcon = (fileName = '') => {
  const ext = fileName.split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return <FileImage className="text-accent" size={14} />
  if (['pdf'].includes(ext)) return <FileText className="text-error" size={14} />
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs'].includes(ext))
    return <FileCode className="text-info" size={14} />
  return <FileText className="text-primary" size={14} />
}

const InputBar = ({
  onSubmit,
  isLoading,
  isRecording,
  isProcessing,
  audioIntensity = 0,
  onStartRecord,
  onStopRecord,
  onStop
}) => {
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const urlInputRef = useRef(null)
  const [inputText, setInputText] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlText, setUrlText] = useState('')
  const lastPromptRef = useRef('')

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus()
      }, 50)
    }
  }, [isLoading])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePaperclipClick = async () => {
    if (window.api && window.api.showOpenDialog) {
      try {
        const filePaths = await window.api.showOpenDialog()
        if (filePaths && filePaths.length > 0) {
          const dialogFiles = filePaths.map((p) => ({
            name: p.split(/[/\\]/).pop(),
            path: p,
            size: 0,
            type: ''
          }))
          setAttachedFiles((prev) => {
            const existingPaths = new Set(prev.map((item) => item.path))
            const unique = dialogFiles.filter((item) => !existingPaths.has(item.path))
            return [...prev, ...unique]
          })
          return
        }
      } catch (err) {
        console.error('[InputBar] Open dialog error:', err)
      }
    }
    fileInputRef.current?.click()
  }

  const addFiles = async (newFiles) => {
    const parsedFiles = await Promise.all(
      newFiles.map(async (f) => {
        let resolvedPath = ''
        if (window.api && window.api.getPathForFile) {
          try {
            resolvedPath = window.api.getPathForFile(f)
          } catch (e) {
            console.error('[InputBar] getPathForFile error:', e)
          }
        }

        const isRealDiskPath =
          resolvedPath &&
          resolvedPath !== f.name &&
          (resolvedPath.includes('/') || resolvedPath.includes('\\'))

        if (!isRealDiskPath && f.path && f.path !== f.name && (f.path.includes('/') || f.path.includes('\\'))) {
          resolvedPath = f.path
        }

        // Web drag-drop: save to temp if no local path
        if (
          (!resolvedPath ||
            resolvedPath === f.name ||
            (!resolvedPath.includes('/') && !resolvedPath.includes('\\'))) &&
          window.api?.saveTempFile
        ) {
          try {
            const buffer = await f.arrayBuffer()
            if (buffer && buffer.byteLength > 0) {
              const tempPath = await window.api.saveTempFile(buffer, f.name)
              if (tempPath) {
                resolvedPath = tempPath
              }
            }
          } catch (err) {
            console.error('[InputBar] Failed to save dragged file to temp:', err)
          }
        }

        if (!resolvedPath) resolvedPath = f.name

        return {
          name: f.name,
          path: resolvedPath,
          size: f.size,
          type: f.type
        }
      })
    )

    setAttachedFiles((prev) => {
      const existingPaths = new Set(prev.map((p) => p.path))
      const unique = parsedFiles.filter((p) => !existingPaths.has(p.path))
      return [...prev, ...unique]
    })

    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
  }

  const removeFile = (indexToRemove) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      addFiles(files)
    }
  }

  const handleUrlSubmit = () => {
    const trimmed = urlText.trim()
    if (!trimmed) return
    // Add as a file-like attachment with the URL as path
    setAttachedFiles((prev) => {
      const exists = prev.some((f) => f.path === trimmed)
      if (exists) return prev
      return [
        ...prev,
        {
          name: trimmed.split('/').pop() || trimmed,
          path: trimmed,
          size: 0,
          type: 'text/uri-list',
          isUrl: true
        }
      ]
    })
    setUrlText('')
    setShowUrlInput(false)
  }

  const handleFormSubmit = () => {
    let finalPrompt = inputText
    if (attachedFiles.length > 0) {
      const filePathsText = attachedFiles.map((f) => `"${f.path}"`).join(', ')
      if (finalPrompt.trim()) {
        finalPrompt = `${finalPrompt.trim()}\n\n[FILE TERLAMPIR]: ${filePathsText}`
      } else {
        finalPrompt = `Tolong proses/rangkum file terlampir ini.\n\n[FILE TERLAMPIR]: ${filePathsText}`
      }
      setAttachedFiles([])
    }

    if (finalPrompt.trim()) {
      if (!isLoading) {
        lastPromptRef.current = inputText
      }
      setInputText('')
      if (typeof onSubmit === 'function') {
        onSubmit(finalPrompt)
      }
    }
  }

  const handleEmojiClick = (emoji) => {
    setInputText((prev) => prev + emoji)
    setShowEmojiPicker(false)
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
  }

  const isSendDisabled = !inputText.trim() && attachedFiles.length === 0

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      {/* File Attachment Pills Preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto py-1 px-2 no-scrollbar animate-[holo-project-in_0.2s_ease-out_forwards]">
          {attachedFiles.map((file, idx) => (
            <div
              key={file.path + idx}
              className="flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-full px-3 py-1.5 text-xs text-white shadow-lg animate-fade-in group hover:border-white/30 transition-all flex-shrink-0"
            >
              <span className="text-sm">{getFileIcon(file.name)}</span>
              <span className="max-w-[140px] truncate font-medium">{file.name}</span>
              {file.size > 0 && (
                <span className="text-[10px] text-white/40">{formatFileSize(file.size)}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="text-white/40 hover:text-error hover:bg-error/20 p-1 rounded-full transition-all"
                title="Hapus Lampiran"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden Native File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Web URL Input (expandable) */}
      {showUrlInput && (
        <div className="mb-2 flex items-center gap-2 animate-[holo-project-in_0.2s_ease-out_forwards]">
          <div className="flex-1 flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-xl px-3 py-2 shadow-lg">
            <Link2 size={14} className="text-white/40" />
            <input
              ref={urlInputRef}
              type="url"
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlSubmit()
                }
                if (e.key === 'Escape') {
                  setShowUrlInput(false)
                  setUrlText('')
                }
              }}
              placeholder="Tempel URL dari web..."
              className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!urlText.trim()}
              className="px-3 py-1 rounded-lg bg-white/10 text-white/80 text-xs hover:bg-white/20 disabled:opacity-30 transition-all"
            >
              Tambah
            </button>
            <button
              type="button"
              onClick={() => { setShowUrlInput(false); setUrlText('') }}
              className="p-1 text-white/40 hover:text-white/80 transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleFormSubmit()
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center bg-[var(--glass-bg)] backdrop-blur-xl border rounded-[2rem] p-2 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 focus-within:border-white/30 focus-within:shadow-[0_0_20px_rgba(255,255,255,0.08)] ${
          isDragging
            ? 'border-white/50 bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.15)] scale-[1.02]'
            : 'border-[var(--glass-border)]'
        }`}
      >
        {/* Drag & Drop Overlay Indicator */}
        {isDragging && (
          <div className="absolute inset-0 rounded-[2rem] bg-white/10 backdrop-blur-md border-2 border-dashed border-white/40 flex items-center justify-center z-50 pointer-events-none text-white font-medium gap-2 animate-pulse">
            <Paperclip className="animate-bounce" size={20} />
            <span>Lepaskan file di sini untuk melampirkan...</span>
          </div>
        )}

        {/* Paperclip File Upload Button */}
        <button
          type="button"
          onClick={handlePaperclipClick}
          className="p-3 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all flex-shrink-0"
          title="Lampirkan File (PDF, DOCX, TXT, MD, Gambar, dll)"
        >
          <Paperclip size={16} />
        </button>

        {/* URL Source Button */}
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className={`p-3 rounded-full transition-all flex-shrink-0 ${
            showUrlInput
              ? 'text-white bg-white/10'
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
          title="Lampirkan URL"
        >
          <Link2 size={16} />
        </button>

        {/* Mic / Record Toggle (Hold to talk) */}
        <button
          type="button"
          onClick={isRecording ? onStopRecord : onStartRecord}
          disabled={isProcessing || isLoading}
          className={`relative p-3 md:p-4 rounded-full flex-shrink-0 transition-all duration-300 transform outline-none z-10 ${
            isProcessing
              ? 'text-white/60 bg-white/10 cursor-wait'
              : isLoading
              ? 'text-white/20 bg-white/5 cursor-not-allowed'
              : isRecording
              ? 'text-error bg-error/20'
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
          style={{
            transform: isRecording && !isProcessing ? `scale(${1 + audioIntensity * 0.3})` : '',
            boxShadow: isRecording && !isProcessing
              ? `0 0 ${10 + audioIntensity * 40}px rgba(255,0,0, ${0.3 + audioIntensity * 0.5})`
              : ''
          }}
          title={
            isProcessing
              ? 'Sedang memproses suara...'
              : isLoading
              ? 'Agen sedang sibuk'
              : 'Mulai/Berhenti Rekam (Ctrl+Alt+M)'
          }
        >
          {isRecording && !isProcessing && (
            <div
              className="absolute inset-0 rounded-full bg-error/30 -z-10 transition-transform duration-75"
              style={{ transform: `scale(${1 + audioIntensity * 0.8})` }}
            />
          )}
          {isProcessing ? (
            <span className="loading loading-spinner w-[18px] h-[18px]"></span>
          ) : isLoading ? (
            <Lock size={18} />
          ) : (
            <Mic size={18} />
          )}
        </button>

        {/* Emoji Button */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-3 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all"
            title="Insert Emoji"
          >
            <Smile size={18} />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-4 bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-2xl p-2 shadow-2xl flex flex-wrap w-52 gap-1 z-[100] animate-[holo-project-in_0.2s_ease-out_forwards]">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl text-2xl transition-all hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input Textarea */}
        <textarea
          ref={inputRef}
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!isSendDisabled) {
                handleFormSubmit()
              }
            }
          }}
          placeholder={
            isLoading
              ? 'Beri intervensi ke Mark...'
              : attachedFiles.length > 0
              ? 'Tambah instruksi untuk file terlampir...'
              : 'Tanya apapun ke Mark...'
          }
          className="flex-1 resize-none bg-transparent border-none outline-none text-white px-3 py-2.5 text-sm md:text-base leading-normal placeholder:text-white/30 disabled:opacity-50 no-scrollbar"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLoading && (
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="p-3 rounded-full bg-error/20 text-error hover:bg-error hover:text-white transition-all"
              title="Stop Generation (Hard Abort)"
            >
              <Square size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={isSendDisabled}
            className="p-3 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 disabled:opacity-30 disabled:bg-white/5 disabled:text-white/30 transition-all backdrop-blur-sm border border-white/10"
            title="Send Message"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={showAbortConfirm}
        title="Hard Abort Proses?"
        message="Yakin mau memberhentikan proses Mark secara paksa? Tindakan ini akan menghentikan secara langsung semua alat yang sedang berjalan dan memutuskan koneksi ke otak AI-nya seketika."
        confirmText="Berhentikan"
        cancelText="Batal"
        isError={true}
        onConfirm={() => {
          setShowAbortConfirm(false)
          if (lastPromptRef.current) {
            setInputText(lastPromptRef.current)
          }
          if (onStop) onStop()
        }}
        onCancel={() => setShowAbortConfirm(false)}
      />
    </div>
  )
}

export default InputBar