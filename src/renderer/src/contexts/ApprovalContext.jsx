import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react'

const ApprovalContext = createContext()

export const ApprovalProvider = ({ children }) => {
  const [approvalData, setApprovalData] = useState(null)
  const approvalRef = useRef(null)

  // Pastikan ref selalu sinkron dengan state saat ini
  useEffect(() => {
    approvalRef.current = approvalData
  }, [approvalData])

  const handleRemoteDecision = useCallback((isApproved, chatId) => {
    const current = approvalRef.current
    if (current) {
      approvalRef.current = null
      setApprovalData(null)
      if (typeof current.resolve === 'function') {
        current.resolve(isApproved)
      }
      if (chatId && window.api?.tgSendMessage) {
        window.api.tgSendMessage(
          chatId,
          isApproved
            ? '[INFO]: Permintaan persetujuan telah diizinkan.'
            : '[INFO]: Permintaan persetujuan telah ditolak.'
        )
      }
    } else {
      if (chatId && window.api?.tgSendMessage) {
        window.api.tgSendMessage(chatId, '[INFO]: Tidak ada permintaan persetujuan yang sedang menunggu.')
      }
    }
  }, [])

  useEffect(() => {
    // 1. Jalur Dedicated Command Accept
    if (window.api?.onTgCommandAccept) {
      window.api.onTgCommandAccept((data) => {
        handleRemoteDecision(true, data?.chatId)
      })
    }

    // 2. Jalur Dedicated Command Reject
    if (window.api?.onTgCommandReject) {
      window.api.onTgCommandReject((data) => {
        handleRemoteDecision(false, data?.chatId)
      })
    }

    // 3. Fallback Universal via onTgMessage (Langsung aktif seketika tanpa perlu restart Electron preload)
    if (window.api?.onTgMessage) {
      window.api.onTgMessage((msg) => {
        const text = (msg?.text || '').trim().toLowerCase()
        if (
          text === '/accept' ||
          text === 'accept' ||
          text === '/izinkan' ||
          text === 'izinkan' ||
          text.startsWith('/accept@')
        ) {
          handleRemoteDecision(true, msg?.chatId)
        } else if (
          text === '/reject' ||
          text === 'reject' ||
          text === '/tolak' ||
          text === 'tolak' ||
          text.startsWith('/reject@')
        ) {
          handleRemoteDecision(false, msg?.chatId)
        }
      })
    }
  }, [handleRemoteDecision])

  const requestApproval = useCallback((message, tool, query) => {
    if (window.api?.tgBroadcastToAdmins) {
      window.api.tgBroadcastToAdmins(
        `[INFO]: Persetujuan Dibutuhkan\nTool: \`${tool}\`\n\n${message}\n\nKetik /accept untuk mengizinkan atau /reject untuk menolak.`
      )
    }
    return new Promise((resolve) => {
      const dataObj = { message, tool, query, resolve }
      approvalRef.current = dataObj
      setApprovalData(dataObj)
    })
  }, [])

  const handleApprove = () => {
    const current = approvalRef.current || approvalData
    approvalRef.current = null
    setApprovalData(null)
    if (current && typeof current.resolve === 'function') {
      current.resolve(true)
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

  return (
    <ApprovalContext.Provider value={{ requestApproval }}>
      {children}
      {approvalData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-base-200 border border-base-300 p-6 rounded-2xl shadow-2xl max-w-lg w-full">
            <h3 className="text-xl font-bold text-error mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Mark meminta izin
            </h3>
            <p className="mb-2 text-sm text-base-content/80">
              Mark membutuhkan persetujuan Anda untuk melanjutkan eksekusi tool ini.
            </p>
            <div className="whitespace-pre-wrap font-mono text-sm bg-base-300 p-4 rounded-xl overflow-x-auto max-h-60 overflow-y-auto shadow-inner border border-base-100 mb-6">
              {approvalData.message}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button className="btn btn-ghost" onClick={handleReject}>
                Tolak
              </button>
              <button className="btn btn-error" onClick={handleApprove}>
                Izinkan ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </ApprovalContext.Provider>
  )
}

export const useApproval = () => useContext(ApprovalContext)
