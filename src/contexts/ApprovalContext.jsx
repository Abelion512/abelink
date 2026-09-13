import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { getAlwaysAllowedPaths, addAlwaysAllowedPath } from '../api/db'

const ApprovalContext = createContext()

function getPathFromQuery(query) {
  if (!query || typeof query !== 'string') return ''
  const firstPart = query.split('||')[0].trim()
  return firstPart.replace(/^["']|["']$/g, '').replace(/[\\/]+/g, '/').toLowerCase()
}

function getFolderFromPath(filePath) {
  if (!filePath) return ''
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash !== -1) {
    return filePath.substring(0, lastSlash)
  }
  return filePath
}

// Tool native -> family izin (mirror semantik gerbang Rust ask/session/always).
// Gerbang Rust hanya mencakup channel (skills/plugin/tg/google/capabilities);
// prompt native-tool (run-shell, git, os-*, dst.) diingat DI SINI.
const TOOL_FAMILY_RULES = [
  [/^(run-shell|run-task|run-bash)$/, 'shell-exec'],
  [/^(write-file|replace-content|replace-lines|delete-file)$/, 'fs-write'],
  [/^git-(commit|revert)$/, 'git-write'],
  [/^os-/, 'os-control'],
  [/^browser-download$/, 'browser-download'],
  [/^(gdrive|gcalendar|gmail)-/, 'google-write']
]

export function familyOfTool(tool) {
  const t = String(tool || '')
  for (const [re, family] of TOOL_FAMILY_RULES) {
    if (re.test(t)) return family
  }
  return `tool:${t || 'unknown'}`
}

const ALWAYS_TOOLS_KEY = 'abelink:approval-always-tools'

function loadAlwaysTools() {
  try {
    const raw = localStorage.getItem(ALWAYS_TOOLS_KEY)
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch (_) {
    return []
  }
}

export const ApprovalProvider = ({ children }) => {
  const [approvalData, setApprovalData] = useState(null)
  const approvalRef = useRef(null)
  const [askUserData, setAskUserData] = useState(null)
  const askUserRef = useRef(null)
  const [userComment, setUserComment] = useState('')
  const [alwaysAllowedPaths, setAlwaysAllowedPaths] = useState([])
  // Grant per family: session (RAM, hilang saat reload) + always (localStorage).
  const sessionGrantedRef = useRef(new Set())
  const [alwaysTools, setAlwaysTools] = useState(loadAlwaysTools)

  const alwaysAllowedPathsRef = useRef(alwaysAllowedPaths)
  useEffect(() => {
    alwaysAllowedPathsRef.current = alwaysAllowedPaths
  }, [alwaysAllowedPaths])

  // Muat data alwaysAllowedPaths dari Dexie DB saat startup
  useEffect(() => {
    getAlwaysAllowedPaths().then((paths) => {
      if (Array.isArray(paths)) {
        setAlwaysAllowedPaths(paths)
      }
    })

    const handleConfigUpdated = (e) => {
      if (Array.isArray(e.detail?.alwaysAllowedPaths)) {
        setAlwaysAllowedPaths(e.detail.alwaysAllowedPaths)
      }
    }
    window.addEventListener('config-updated', handleConfigUpdated)
    return () => window.removeEventListener('config-updated', handleConfigUpdated)
  }, [])

  // Pastikan ref selalu sinkron dengan state saat ini
  useEffect(() => {
    approvalRef.current = approvalData
  }, [approvalData])

  const handleApproveAlwaysInternal = useCallback(async (targetQuery) => {
    const rawPath = getPathFromQuery(targetQuery)
    const folderPath = getFolderFromPath(rawPath)
    const pathToAdd = folderPath || rawPath

    if (pathToAdd) {
      const updated = await addAlwaysAllowedPath(pathToAdd)
      if (Array.isArray(updated)) {
        setAlwaysAllowedPaths(updated)
      }
    }
  }, [])

  const handleRemoteDecision = useCallback((decisionType, chatId) => {
    // decisionType: 'approve_once' | 'approve_always' | 'reject'
    const current = approvalRef.current
    if (current) {
      approvalRef.current = null
      setApprovalData(null)

      if (decisionType === 'approve_always') {
        handleApproveAlwaysInternal(current.query, current)
      }

      const isApproved = decisionType === 'approve_once' || decisionType === 'approve_always'
      if (typeof current.resolve === 'function') {
        current.resolve(isApproved)
      }

      if (chatId && window.api?.tgSendMessage) {
        let msg = '[INFO]: Permintaan persetujuan telah ditolak.'
        if (decisionType === 'approve_always') {
          msg = '[INFO]: Permintaan persetujuan diizinkan SELAMANYA untuk path folder ini.'
        } else if (decisionType === 'approve_once') {
          msg = '[INFO]: Permintaan persetujuan telah diizinkan sekali.'
        }
        window.api.tgSendMessage(chatId, msg)
      }
    } else {
      if (chatId && window.api?.tgSendMessage) {
        window.api.tgSendMessage(chatId, '[INFO]: Tidak ada permintaan persetujuan yang sedang menunggu.')
      }
    }
  }, [handleApproveAlwaysInternal])

  useEffect(() => {
    // 1. Jalur Dedicated Command Accept
    if (window.api?.onTgCommandAccept) {
      window.api.onTgCommandAccept((data) => {
        handleRemoteDecision('approve_once', data?.chatId)
      })
    }

    // 2. Jalur Dedicated Command Always
    if (window.api?.onTgCommandAlways) {
      window.api.onTgCommandAlways((data) => {
        handleRemoteDecision('approve_always', data?.chatId)
      })
    }

    // 3. Jalur Dedicated Command Reject
    if (window.api?.onTgCommandReject) {
      window.api.onTgCommandReject((data) => {
        handleRemoteDecision('reject', data?.chatId)
      })
    }

    // 4. Fallback Universal via onTgMessage
    if (window.api?.onTgMessage) {
      window.api.onTgMessage((msg) => {
        const text = (msg?.text || '').trim().toLowerCase()
        if (
          text === '/always' ||
          text === 'always' ||
          text === '/selamanya' ||
          text === 'selamanya' ||
          text.startsWith('/always@')
        ) {
          handleRemoteDecision('approve_always', msg?.chatId)
        } else if (
          text === '/accept' ||
          text === 'accept' ||
          text === '/izinkan' ||
          text === 'izinkan' ||
          text.startsWith('/accept@')
        ) {
          handleRemoteDecision('approve_once', msg?.chatId)
        } else if (
          text === '/reject' ||
          text === 'reject' ||
          text === '/tolak' ||
          text === 'tolak' ||
          text.startsWith('/reject@')
        ) {
          handleRemoteDecision('reject', msg?.chatId)
        }
      })
    }
  }, [handleRemoteDecision])

  const requestApproval = useCallback((message, tool, query) => {
    // Grant per family dulu (diingat dari pilihan sesi/selalu sebelumnya).
    const family = familyOfTool(tool)
    if (sessionGrantedRef.current.has(family)) {
      return Promise.resolve(true)
    }
    let storedAlways = []
    try {
      storedAlways = JSON.parse(localStorage.getItem(ALWAYS_TOOLS_KEY) || '[]')
    } catch (_) {}
    if (Array.isArray(storedAlways) && storedAlways.includes(family)) {
      return Promise.resolve(true)
    }

    // Cek apakah query/path sudah diizinkan selamanya
    const targetPath = getPathFromQuery(query)
    const targetFolder = getFolderFromPath(targetPath)
    const currentAllowed = alwaysAllowedPathsRef.current || []

    const isAlwaysAllowed = currentAllowed.some((allowed) => {
      const normAllowed = (allowed || '').toLowerCase().replace(/[\\/]+/g, '/')
      if (!normAllowed) return false
      return (
        targetPath === normAllowed ||
        targetFolder === normAllowed ||
        targetPath.startsWith(normAllowed.endsWith('/') ? normAllowed : normAllowed + '/')
      )
    })

    if (isAlwaysAllowed) {
      return Promise.resolve(true)
    }

    if (window.api?.tgBroadcastToAdmins) {
      window.api.tgBroadcastToAdmins(
        `[INFO]: Persetujuan Dibutuhkan\nTool: \`${tool}\`\n\n${message}\n\nKetik /accept untuk mengizinkan sekali, /always untuk mengizinkan selamanya, atau /reject untuk menolak.`
      )
    }

    return new Promise((resolve) => {
      const dataObj = { message, tool, query, resolve }
      approvalRef.current = dataObj
      setApprovalData(dataObj)
    })
  }, [])

  const handleApproveOnce = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve(true)
    }
  }

  const handleApproveSession = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current) {
      sessionGrantedRef.current.add(familyOfTool(current.tool))
      if (typeof current.resolve === 'function') {
        current.resolve(true)
      }
    }
  }

  const handleApproveAlways = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current) {
      const family = familyOfTool(current.tool)
      sessionGrantedRef.current.add(family)
      setAlwaysTools((prev) => {
        if (prev.includes(family)) return prev
        const next = [...prev, family]
        try {
          localStorage.setItem(ALWAYS_TOOLS_KEY, JSON.stringify(next))
        } catch (_) {}
        return next
      })
      handleApproveAlwaysInternal(current.query, current)
      if (typeof current.resolve === 'function') {
        current.resolve(true)
      }
    }
  }

  const handleReject = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve(false)
    }
  }

  const requestUserInput = useCallback(({ title, message, placeholder, defaultValue = '' }) => {
    return new Promise((resolve) => {
      setUserComment(defaultValue)
      const data = {
        title: title || 'Abelink Paused for Input',
        message: message || 'Silakan selesaikan aksi manual atau berikan respon yang diperlukan.',
        placeholder: placeholder || 'Tambahkan komentar atau instruksi untuk Abelink (opsional)...',
        resolve
      }
      askUserRef.current = data
      setAskUserData(data)
    })
  }, [])

  const handleResumeAutomation = () => {
    const current = askUserRef.current || askUserData
    askUserRef.current = null
    setAskUserData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve({ confirmed: true, comment: userComment.trim() })
    }
    setUserComment('')
  }

  const handleCancelAutomation = () => {
    const current = askUserRef.current || askUserData
    askUserRef.current = null
    setAskUserData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve({ confirmed: false, comment: '' })
    }
    setUserComment('')
  }

  return (
    <ApprovalContext.Provider
      value={{
        requestApproval,
        requestUserInput,
        alwaysAllowedPaths,
        setAlwaysAllowedPaths
      }}
    >
      {children}
      {/* Modal Izin Keamanan */}
      {approvalData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[response-fade-in_0.15s_ease-out_forwards]">
          <div className="bg-base-200 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-lg w-full">
            <h3 className="text-lg font-bold text-error mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-error" /> Abelink Meminta Izin
            </h3>
            <p className="mb-3 text-xs text-base-content/70">
              Abelink membutuhkan persetujuan Anda untuk mengeksekusi aksi berikut.
            </p>
            <div className="whitespace-pre-wrap font-mono text-xs bg-base-300 p-3.5 rounded-xl overflow-x-auto max-h-56 overflow-y-auto shadow-inner border border-white/5 mb-4 text-base-content/90">
              {approvalData.message ||
                `Tool: ${approvalData.tool || 'tak dikenal'}\nQuery: ${approvalData.query || '(kosong)'}`}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4">
              <button className="btn btn-ghost btn-sm" onClick={handleReject}>
                Tolak
              </button>
              <div className="flex items-center gap-2">
                <button className="btn btn-outline btn-sm" onClick={handleApproveOnce}>
                  Izinkan Sekali
                </button>
                <button className="btn btn-outline btn-sm" onClick={handleApproveSession}>
                  Sesi Ini
                </button>
                <button className="btn btn-error btn-sm shadow-md" onClick={handleApproveAlways}>
                  Selalu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Interaktif: Pause for User Input / Human Intervention */}
      {askUserData && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-md animate-[response-fade-in_0.2s_ease-out_forwards]">
          <div className="bg-base-200/95 border border-primary/40 p-6 rounded-3xl shadow-2xl max-w-md w-full flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-base-content tracking-tight">
                  {askUserData.title}
                </h3>
                <span className="text-[11px] text-primary/80 font-medium">
                  Automation paused — menunggu tindakan Anda
                </span>
              </div>
            </div>

            <div className="text-xs text-base-content/85 leading-relaxed bg-base-300/80 p-3.5 rounded-2xl border-l-4 border-primary shadow-inner">
              {askUserData.message}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-base-content/60">
                Komentar / Respon Balasan (Opsional):
              </label>
              <textarea
                value={userComment}
                onChange={(e) => setUserComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleResumeAutomation()
                  }
                }}
                placeholder={askUserData.placeholder}
                rows={3}
                className="textarea textarea-bordered w-full bg-base-300/90 text-xs rounded-xl focus:border-primary focus:outline-hidden"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm text-xs text-base-content/60 hover:text-base-content"
                onClick={handleCancelAutomation}
              >
                Batalkan
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm text-xs font-semibold px-4 shadow-lg shadow-primary/25"
                onClick={handleResumeAutomation}
              >
                Lanjutkan (Resume)
              </button>
            </div>
          </div>
        </div>
      )}
    </ApprovalContext.Provider>
  )
}

export const useApproval = () => useContext(ApprovalContext)
