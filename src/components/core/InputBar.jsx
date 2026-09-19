import React, { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Mic,
  Square,
  ArrowUp,
  X,
  Paperclip,
  FileText,
  FileCode,
  Image as FileImage,
  Lock,
  Folder,
  Plus
} from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import { MobiusLoader } from './MobiusLoader'
import { ContextGauge } from './ContextGauge'
import { NATIVE_SKILLS } from './native-skills'
import { getCachedSkills } from '../../api/skillsCache'
import {
  dedupeAttachments,
  extractDroppedItems,
  extractClipboardFiles,
  resolveDroppedFile
} from '../../utils/attachments'

// Command history recall (gaya TUI) + draft persistence anti-crash.
const PROMPT_HISTORY_KEY = 'abelink:prompt-history'
const DRAFT_KEY = 'abelink:draft'

const formatFileSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const getFileIcon = (fileName = '') => {
  const ext = fileName.split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return <FileImage className="text-[#0a84ff] w-4 h-4" />
  if (['pdf'].includes(ext)) return <FileText className="text-[#ff453a] w-4 h-4" />
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp', 'cs'].includes(ext))
    return <FileCode className="text-[#0a84ff] w-4 h-4" />
  return <FileText className="text-white/60 w-4 h-4" />
}

const InputBar = ({
  onSubmit,
  isLoading,
  isRecording,
  isProcessing,
  audioIntensity = 0,
  onStartRecord,
  onStopRecord,
  onStop,
  source = 'pc',
  inline = false,
  className = '',
  workspaceRoot = null,
  onSelectWorkspace = null,
  sessionId = 1
}) => {
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [inputText, setInputText] = useState(() => {
    // Draft persistence: teks yang sedang diketik selamat dari app mati/crash.
    try {
      return localStorage.getItem(DRAFT_KEY) || ''
    } catch {
      return ''
    }
  })
  const [promptHistory, setPromptHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROMPT_HISTORY_KEY) || '[]')
    } catch {
      return []
    }
  })
  const recallIndexRef = useRef(-1)
  const recallDraftRef = useRef('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  // Index attachment yang sedang dibuka di modal preview (klik/hover chip).
  // -1 = modal tertutup.
  const [previewIdx, setPreviewIdx] = useState(-1)
  const [hoverPreviewIdx, setHoverPreviewIdx] = useState(-1)
  const hoverTimerRef = useRef(null)
  const lastPromptRef = useRef('')

  const [skills, setSkills] = useState([])
  const [filteredSkills, setFilteredSkills] = useState([])
  const [showSkillList, setShowSkillList] = useState(false)
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0)

  const reloadSkills = async () => {
    if (window.api && window.api.getSkills) {
      try {
        // Lewat cache (TTL + invalidasi event skills-updated), bukan fs-scan ulang.
        const loadedSkills = await getCachedSkills()
        const nativeSkillList = NATIVE_SKILLS.map((s) => ({
          name: s.name,
          description: s.description
        }))
        const merged = [...nativeSkillList, ...(loadedSkills || [])]
        setSkills(merged)
        return merged
      } catch (err) {
        console.error('[InputBar] Failed to reload skills:', err)
      }
    }
    return []
  }

  useEffect(() => {
    reloadSkills()
    if (window.api && window.api.onSkillsUpdated) {
      const unsub = window.api.onSkillsUpdated(() => {
        reloadSkills()
      })
      return () => {
        if (typeof unsub === 'function') unsub()
      }
    }
  }, [])

  // Drop di area mana pun (layer global DropAnywhere di App.jsx) -> lampirkan.
  useEffect(() => {
    const onGlobalDrop = (e) => {
      const items = e.detail || []
      if (items.length > 0) {
        setAttachedFiles((prev) => dedupeAttachments(prev, items))
      }
    }
    window.addEventListener('abelink:files-dropped', onGlobalDrop)
    return () => window.removeEventListener('abelink:files-dropped', onGlobalDrop)
  }, [])

  // QuickLook ESC key listener
  useEffect(() => {
    if (previewIdx === -1) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPreviewIdx(-1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewIdx])

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus()
      }, 50)
    }
  }, [isLoading])

  // Bersihkan timer hover preview saat komponen dilepas (anti memory-leak/setState di unmounted).
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Multi-select native; UKURAN asli dilengkapi via misc_stat_path. Kunci fix
  // bug "batal lalu kebuka lagi": dialog CANCELED TIDAK jatuh ke <input type=file>.
  // Fallback input klik hanya untuk env tanpa jembatan native sama sekali.
  const handlePaperclipClick = async () => {
    if (window.api?.showOpenFilesDialog) {
      try {
        const { canceled, filePaths } = await window.api.showOpenFilesDialog()
        if (canceled || filePaths.length === 0) return // user batal: JANGAN buka picker kedua
        const items = await Promise.all(
          filePaths.map(async (p) => {
            const item = {
              name: p.split(/[/\\]/).pop(),
              path: p,
              size: 0,
              type: ''
            }
            try {
              const [size, isDir] = await window.api.statPath(p)
              item.size = Number(size) || 0
              item.isDir = !!isDir
            } catch {
              // stat gagal (file sudah terhapus, dsb.) — lampirkan tanpa ukuran
            }
            return item
          })
        )
        setAttachedFiles((prev) => dedupeAttachments(prev, items))
        return
      } catch (err) {
        console.error('[InputBar] Open dialog error:', err)
        return
      }
    }
    fileInputRef.current?.click()
  }

  // Jalur drop lokal + input web: resolusi path via helper bersama (sama dengan
  // layer global DropAnywhere) supaya perilaku & dedupe identik.
  const addFiles = async (newFiles) => {
    const parsedFiles = await Promise.all(newFiles.map(resolveDroppedFile))
    setAttachedFiles((prev) => dedupeAttachments(prev, parsedFiles))
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 50)
  }

  const removeFile = (indexToRemove) => {
    setAttachedFiles((prev) => {
      const removed = prev[indexToRemove]
      if (removed?.previewUrl) {
        try {
          URL.revokeObjectURL(removed.previewUrl)
        } catch (_) {}
      }
      return prev.filter((_, idx) => idx !== indexToRemove)
    })
    setPreviewIdx(-1)
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

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    // Extractor terpadu (sama dengan layer global DropAnywhere): files OS +
    // uri-list dari drag web — drop di InputBar dan di mana pun berperilaku identik.
    try {
      const items = await extractDroppedItems(e.dataTransfer)
      if (items.length > 0) {
        setAttachedFiles((prev) => dedupeAttachments(prev, items))
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus()
        }, 50)
      }
    } catch (err) {
      console.error('[InputBar] drop error:', err)
    }
  }

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const types = Array.from(e.clipboardData?.types || [])
    const hasFile = items.some((it) => it.kind === 'file')
    const hasUriList = types.includes('text/uri-list')
    const rawText = e.clipboardData?.getData('text/plain') || ''
    const hasFileUri = rawText.startsWith('file://')
    const hasHtml = types.includes('text/html') && /<img[^>]+src=/i.test(e.clipboardData?.getData('text/html') || '')

    if (hasFile || hasUriList || hasFileUri || hasHtml) {
      e.preventDefault()
      try {
        const droppedItems = await extractClipboardFiles(e.clipboardData)
        if (droppedItems.length > 0) {
          setAttachedFiles((prev) => dedupeAttachments(prev, droppedItems))
        }
      } catch (err) {
        console.error('[InputBar] paste error:', err)
      }
    }
  }

  const handleFormSubmit = async () => {
    let finalPrompt = inputText
    let userText = inputText
    const skillMatches = inputText.match(/(?:\s|^)\/([a-zA-Z0-9_-]+)/g)

    if (skillMatches && skillMatches.length > 0 && window.api && window.api.readSkill) {
      let combinedSkillsContent = ''
      const loadedSkills = []

      for (const match of skillMatches) {
        const skillName = match.trim().substring(1) // Hilangkan spasi dan '/'

        // INTERCEPT BUILT-IN SKILLS
        const nativeSkill = NATIVE_SKILLS.find(
          (s) => s.name.toLowerCase() === skillName.toLowerCase()
        )
        if (nativeSkill) {
          combinedSkillsContent += `\n\n--- SKILL BAWAAN: ${skillName.toUpperCase()} ---\n${nativeSkill.content}`
          loadedSkills.push(skillName)
          userText = userText.replace(match, '')
          continue
        }

        try {
          const skillData = await window.api.readSkill(skillName)
          if (skillData) {
            // Support both old string format and new object format
            const content = typeof skillData === 'string' ? skillData : skillData.content
            const basePath =
              typeof skillData === 'object' && skillData.basePath ? skillData.basePath : ''

            combinedSkillsContent += `\n\n--- SKILL EXTERNAL: ${skillName.toUpperCase()} ---\n`
            if (basePath) {
              combinedSkillsContent += `[LOKASI ABSOLUT SKILL INI (Base Path): ${basePath}]\n\n`
            }
            combinedSkillsContent += `${content}`

            loadedSkills.push(skillName)
            userText = userText.replace(match, '') // Hapus slash command dari teks yang dilihat AI
          }
        } catch (e) {
          console.error('[InputBar] Failed to read skill:', skillName, e)
        }
      }

      userText = userText.trim()

      if (loadedSkills.length > 0) {
        finalPrompt = `${userText}\n\n=== SYSTEM INSTRUCTION: SKILL DIAKTIFKAN ===\nBerikut adalah instruksi skill khusus yang WAJIB kamu kombinasikan dan ikuti secara ketat untuk mengeksekusi permintaan di atas. Jika skill memiliki referensi sub-file, kamu BISA membacanya menggunakan tool "read-file" dengan menggabungkan "LOKASI ABSOLUT" di bawah ini beserta path relatifnya:\n${combinedSkillsContent}\n=========================================`
      }
    }

    if (attachedFiles.length > 0) {
      const filePathsText = attachedFiles.map((f) => `"${f.path}"`).join(', ')
      if (finalPrompt.trim()) {
        finalPrompt = `${finalPrompt.trim()}\n\n[FILE TERLAMPIR]: ${filePathsText}`
      } else {
        finalPrompt = `Tolong proses/rangkum file terlampir ini.\n\n[FILE TERLAMPIR]: ${filePathsText}`
      }
      // Lepaskan object URL thumbnail sebelum daftar dibersihkan (anti memory leak).
      attachedFiles.forEach((f) => {
        if (f?.previewUrl) {
          try {
            URL.revokeObjectURL(f.previewUrl)
          } catch (_) {}
        }
      })
      setAttachedFiles([])
      setPreviewIdx(-1)
    }

    if (finalPrompt.trim()) {
      if (!isLoading) {
        lastPromptRef.current = inputText
      }
      // Rekam ke prompt history (dedupe berurutan, cap 100) + bersihkan draft.
      const trimmedPrompt = String(userText || finalPrompt || '').trim()
      if (trimmedPrompt) {
        setPromptHistory((prev) => {
          const next = [...prev.filter((p) => p !== trimmedPrompt), trimmedPrompt].slice(-100)
          try {
            localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(next))
          } catch (_) {}
          return next
        })
      }
      recallIndexRef.current = -1
      recallDraftRef.current = ''
      setInputText('')
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch (_) {}
      if (typeof onSubmit === 'function') {
        onSubmit(finalPrompt)
      }
    }
  }

  const handleTextChange = async (e) => {
    const val = e.target.value
    setInputText(val)
    try {
      localStorage.setItem(DRAFT_KEY, val)
    } catch (_) {}
    // Mengetik manual membatalkan mode recall.
    if (recallIndexRef.current !== -1) {
      recallIndexRef.current = -1
      recallDraftRef.current = ''
    }

    if (val.startsWith('/')) {
      const currentSkills = skills && skills.length > 0 ? skills : await reloadSkills()
      const query = val.slice(1).toLowerCase()
      const matches = currentSkills.filter((s) => s.name.toLowerCase().includes(query))
      setFilteredSkills(matches)
      setShowSkillList(true)
      setSelectedSkillIndex(0)
    } else {
      setShowSkillList(false)
    }
  }

  const selectSkill = (skillObj) => {
    setInputText(`/${skillObj.name} `)
    setShowSkillList(false)
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKeyDown = (e) => {
    if (showSkillList && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectSkill(filteredSkills[selectedSkillIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowSkillList(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isSendDisabled) {
        handleFormSubmit()
      }
    }

    // ── Command history recall (gaya TUI) ────────────────────────────────
    // ArrowUp saat kursor di posisi paling awal / kotak kosong -> mundur
    // ke prompt sebelumnya. ArrowDown maju; lewat terbaru -> kembalikan
    // draf yang sedang ditulis sebelum mulai recall.
    const el = e.target
    const caretAtStart = el.selectionStart === 0 && el.selectionEnd === 0
    if (
      e.key === 'ArrowUp' &&
      !e.shiftKey &&
      !e.altKey &&
      (caretAtStart || el.value === '') &&
      promptHistory.length > 0
    ) {
      e.preventDefault()
      if (recallIndexRef.current === -1) {
        recallDraftRef.current = el.value
        recallIndexRef.current = promptHistory.length - 1
      } else {
        recallIndexRef.current = Math.max(0, recallIndexRef.current - 1)
      }
      const recalled = promptHistory[recallIndexRef.current] ?? ''
      setInputText(recalled)
      try {
        localStorage.setItem(DRAFT_KEY, recalled)
      } catch (_) {}
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd =
            inputRef.current.value.length
        }
      }, 0)
      return
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey && recallIndexRef.current !== -1) {
      e.preventDefault()
      recallIndexRef.current -= 1
      let nextValue
      if (recallIndexRef.current < 0) {
        nextValue = recallDraftRef.current
        recallDraftRef.current = ''
      } else {
        nextValue = promptHistory[recallIndexRef.current] ?? ''
      }
      setInputText(nextValue)
      try {
        localStorage.setItem(DRAFT_KEY, nextValue)
      } catch (_) {}
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd =
            inputRef.current.value.length
        }
      }, 0)
      return
    }
  }

  const isSendDisabled = !inputText.trim() && attachedFiles.length === 0

  const previewFile = previewIdx >= 0 ? attachedFiles[previewIdx] : null

  return (
    <div
      className={
        className
          ? className
          : inline
            ? 'w-full max-w-4xl mx-auto relative z-10'
            : 'fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50'
      }
    >
      {/* File Attachment Pills Preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto py-1 px-2 no-scrollbar animate-[holo-project-in_0.2s_ease-out_forwards]">
          {attachedFiles.map((file, idx) => (
            <div
              key={file.path + idx}
              className="flex items-center gap-2 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-full px-2.5 py-1.5 text-xs text-white shadow-lg animate-fade-in group hover:border-primary/50 transition-all flex-shrink-0 cursor-pointer"
              onClick={() => setPreviewIdx(idx)}
              onMouseEnter={() => {
                clearTimeout(hoverTimerRef.current)
                if (file.previewUrl) {
                  hoverTimerRef.current = setTimeout(() => setHoverPreviewIdx(idx), 150)
                }
              }}
              onMouseLeave={() => {
                clearTimeout(hoverTimerRef.current)
                setHoverPreviewIdx(-1)
              }}
              title="Klik atau hover untuk pratinjau"
            >
              {file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                  draggable={false}
                />
              ) : (
                <span className="text-sm">{getFileIcon(file.name)}</span>
              )}
              <span className="max-w-[140px] truncate font-medium">{file.name}</span>
              {file.size > 0 && (
                <span className="text-[10px] text-white/60">{formatFileSize(file.size)}</span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(idx)
                }}
                className="text-white/60 hover:text-[#ff453a] hover:bg-[#ff453a]/20 p-1 rounded-full transition-all"
                title="Hapus Lampiran"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {hoverPreviewIdx >= 0 && attachedFiles[hoverPreviewIdx]?.previewUrl && (
            <div className="absolute bottom-full mb-2 left-0 z-50 pointer-events-none">
              <img src={attachedFiles[hoverPreviewIdx].previewUrl} className="w-48 h-48 object-cover rounded-xl shadow-2xl border border-white/10" />
            </div>
          )}
        </div>
      )}

      {/* Workspace Root Active Indicator Pill */}
      {workspaceRoot && (
        <div className="mb-2 flex items-center gap-2 px-3 py-1 bg-white/5 border border-[#0a84ff]/30 rounded-lg text-xs text-white/80 w-fit backdrop-blur-md animate-fade-in shadow-md">
          <Folder className="text-[#0a84ff] w-3.5 h-3.5" />
          <span className="text-[10px] text-[#0a84ff] uppercase font-bold tracking-wider">
            Workspace:
          </span>
          <span className="font-mono text-[11px] truncate max-w-xs">{workspaceRoot}</span>
          {onSelectWorkspace && (
            <button
              type="button"
              onClick={onSelectWorkspace}
              className="ml-1 text-[10px] text-white/50 hover:text-[#0a84ff] transition-colors cursor-pointer underline"
              title="Ganti folder proyek"
            >
              Ganti
            </button>
          )}
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleFormSubmit()
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl p-2 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 focus-within:border-[#0a84ff]/60 focus-within:ring-2 focus-within:ring-[#0a84ff]/20 ${
          isDragging
            ? 'border-[#0a84ff] bg-[#0a84ff]/10 shadow-[0_0_30px_rgba(10,132,255,0.3)] scale-[1.01]'
            : 'border border-[var(--glass-border)]'
        }`}
      >
        {/* Drag & Drop Overlay Indicator */}
        {isDragging && (
          <div className="absolute inset-0 rounded-2xl bg-[#0a84ff]/20 backdrop-blur-md border-2 border-dashed border-[#0a84ff] flex items-center justify-center z-50 pointer-events-none text-white font-medium gap-2 animate-pulse">
            <Paperclip className="animate-bounce text-[#0a84ff]" size={20} />
            <span>Lepaskan file di sini untuk melampirkan...</span>
          </div>
        )}

        {/* + expandable popup (workspace + paperclip) — left of textarea */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowAttachMenu((v) => !v)}
            className="p-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Lampirkan / Folder"
          >
            <Plus size={18} />
          </button>

          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col min-w-[190px] p-1 animate-fade-in">
              {onSelectWorkspace && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectWorkspace()
                    setShowAttachMenu(false)
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 text-white/90 rounded-xl transition-colors text-sm"
                >
                  <Folder size={16} className="text-[#0a84ff]" />
                  <span>Folder Proyek</span>
                  {workspaceRoot && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0a84ff]" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  handlePaperclipClick()
                  setShowAttachMenu(false)
                }}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 text-white/90 rounded-xl transition-colors text-sm"
              >
                <Paperclip size={16} className="text-[#0a84ff]" />
                <span>Lampirkan File</span>
              </button>
            </div>
          )}
        </div>

        {/* Input Textarea */}
        <textarea
          ref={inputRef}
          rows={1}
          value={inputText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            isLoading
              ? 'Beri intervensi ke Abelink...'
              : attachedFiles.length > 0
                ? 'Tambah instruksi untuk file terlampir...'
                : 'Tanya apapun ke Abelink...'
          }
          className="flex-1 resize-none bg-transparent border-none outline-none text-white px-3 py-2.5 text-sm md:text-base leading-normal placeholder:text-white/60 disabled:opacity-50 no-scrollbar"
        />

        {/* Action Buttons — right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Context gauge (session compaction) */}
          <ContextGauge sessionId={sessionId} />
          {/* Stop replaces Send when loading */}
          {isLoading ? (
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="p-2.5 rounded-full bg-[#ff453a] text-white hover:bg-[#ff453a]/80 active:scale-95 transition-all shadow-md"
              title="Stop Generation (Hard Abort)"
            >
              <Square size={16} className="fill-current" />
            </button>
          ) : (
            <>
              {/* Voice when no text; Send when there is text */}
              {!inputText.trim() ? (
                <button
                  type="button"
                  onClick={isRecording ? onStopRecord : onStartRecord}
                  disabled={isProcessing || isLoading}
                  className={`relative p-3 rounded-full flex-shrink-0 transition-all duration-300 transform outline-none z-10 ${
                    isProcessing
                      ? 'text-[#0a84ff] bg-[#0a84ff]/20 cursor-wait'
                      : isLoading
                        ? 'text-white/20 bg-white/5 cursor-not-allowed'
                        : isRecording
                          ? 'text-white bg-[#ff453a]'
                          : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                  style={{
                    transform:
                      isRecording && !isProcessing ? `scale(${1 + audioIntensity * 0.3})` : '',
                    boxShadow:
                      isRecording && !isProcessing
                        ? `0 0 ${10 + audioIntensity * 40}px rgba(255, 69, 58, ${0.4 + audioIntensity * 0.4})`
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
                      className="absolute inset-0 rounded-full bg-[#ff453a]/30 -z-10 transition-transform duration-75"
                      style={{ transform: `scale(${1 + audioIntensity * 0.8})` }}
                    />
                  )}
                  {isProcessing ? (
                    <MobiusLoader size={18} />
                  ) : isLoading ? (
                    <Lock size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSendDisabled}
                  className="p-3 rounded-full bg-[#0a84ff] text-white disabled:opacity-30 disabled:bg-white/10 disabled:text-white/60 hover:bg-[#0a84ff]/90 hover:scale-105 active:scale-95 transition-all shadow-md"
                  title="Send Message"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Skill Autocomplete Dropdown */}
        {showSkillList && filteredSkills.length > 0 && (
          <div className="absolute bottom-full left-12 mb-2 w-[400px] bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl z-50 animate-fade-in p-1">
            <div className="px-3 py-2 text-[10px] font-bold text-white/40 uppercase tracking-wider">
              Available Skills
            </div>
            <div className="max-h-64 overflow-y-auto no-scrollbar">
              {filteredSkills.map((skillObj, idx) => (
                <div
                  key={skillObj.name}
                  onClick={() => selectSkill(skillObj)}
                  className={`px-3 py-2.5 rounded-xl cursor-pointer transition-colors flex flex-col gap-0.5 ${
                    idx === selectedSkillIndex
                      ? 'bg-[#0a84ff] text-white'
                      : 'hover:bg-white/10 text-white/80'
                  }`}
                >
                  <div className="font-semibold text-sm">/{skillObj.name}</div>
                  <div
                    className={`text-xs ${idx === selectedSkillIndex ? 'text-white/80' : 'text-white/50'} line-clamp-2`}
                  >
                    {skillObj.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>

      <ConfirmModal
        isOpen={showAbortConfirm}
        title="Hard Abort Proses?"
        message="Yakin mau memberhentikan proses Abelink secara paksa? Tindakan ini akan menghentikan secara langsung semua alat yang sedang berjalan dan memutuskan koneksi ke otak AI-nya seketika."
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

      {/* Modal pratinjau lampiran Apple QuickLook: centered window popup with backdrop */}
      {previewFile && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-fade-in"
          onClick={() => setPreviewIdx(-1)}
        >
          <div
            className="max-w-4xl w-full max-h-[85vh] bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col animate-[holo-project-in_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* QuickLook Window Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="p-1.5 rounded-lg bg-white/10 flex-shrink-0">{getFileIcon(previewFile.name)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{previewFile.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    {previewFile.size > 0 && <span>{formatFileSize(previewFile.size)}</span>}
                    {previewFile.linkOnly && (
                      <span className="text-[#0a84ff] font-medium">(tautan web)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewIdx(-1)}
                  className="text-white/60 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
                  title="Tutup pratinjau (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* QuickLook Preview Body */}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center min-h-[250px] bg-black/40">
              {previewFile.previewUrl ? (
                <img
                  src={previewFile.previewUrl}
                  alt={previewFile.name}
                  className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                  draggable={false}
                />
              ) : (
                <div className="text-center text-white/60 py-12 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-4 text-white">
                    {getFileIcon(previewFile.name)}
                  </div>
                  <div className="text-base font-medium text-white mb-1">
                    Dokumen Tanpa Pratinjau Visual
                  </div>
                  <div className="text-xs text-white/50 max-w-md mx-auto mb-4">
                    File ini akan dikirimkan sebagai konteks dokumen saat pesan dikirim.
                  </div>
                  <div className="text-xs text-white/40 font-mono bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg break-all max-w-lg mx-auto">
                    {previewFile.path}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default InputBar
