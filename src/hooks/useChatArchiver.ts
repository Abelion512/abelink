import { useEffect, useRef } from 'react'
import { indexSingleTurn } from '../api/turnPairMigrator'

interface ArchiveChatMsg {
  role?: string
  content?: unknown
  timestamp?: string | number
  isThinking?: boolean
  isSearching?: boolean
  isSummarizing?: boolean
}

export const useChatArchiver = ({
  chatData,
  activeTopic,
  config: _config,
  pushNotification: _pushNotification,
  isLoading,
  sessionId = 1
}: {
  chatData: ArchiveChatMsg[]
  activeTopic?: string
  config?: unknown
  pushNotification?: unknown
  isLoading: boolean
  sessionId?: number | string | null
}) => {
  const currentSessionId = sessionId || 1
  const wasLoadingRef = useRef(false)
  const lastIndexedPairIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Deteksi transisi ketika Abelink selesai merespons (isLoading: true -> false)
    const justFinishedLoading = wasLoadingRef.current && !isLoading
    wasLoadingRef.current = isLoading

    if (justFinishedLoading && Array.isArray(chatData) && chatData.length >= 2) {
      // Cari pesan balasan AI terakhir yang valid
      let lastAiMsg: ArchiveChatMsg | null = null
      let userMsg: ArchiveChatMsg | null = null

      for (let i = chatData.length - 1; i >= 0; i--) {
        const msg: ArchiveChatMsg | undefined = chatData[i]
        if (!msg) continue
        // Skip balasan kosong (content null/undefined/empty) — pesan tanpa isi
        // tidak boleh masuk turn-pair vektor maupun riwayat awareness.
        const hasContent =
          typeof msg.content === 'string' ? msg.content.trim() : Array.isArray(msg.content) ? msg.content.length > 0 : !!msg.content
        if (!lastAiMsg && msg.role === 'ai' && hasContent && !msg.isThinking && !msg.isSearching && !msg.isSummarizing) {
          lastAiMsg = msg
          // Cari pesan user sebelum pesan AI ini
          for (let j = i - 1; j >= 0; j--) {
            if (chatData[j]?.role === 'user') {
              userMsg = chatData[j]
              break
            }
          }
          break
        }
      }

      if (userMsg && lastAiMsg) {
        const turnKey = `${currentSessionId}-${userMsg.timestamp || ''}-${lastAiMsg.timestamp || ''}`
        if (lastIndexedPairIdRef.current !== turnKey) {
          lastIndexedPairIdRef.current = turnKey
          // Index secara instan di background
          indexSingleTurn(currentSessionId, activeTopic ?? null, userMsg, lastAiMsg).catch((err) => {
            console.warn('[useChatArchiver] Realtime indexSingleTurn error:', err)
          })
        }
      }
    }
  }, [chatData, activeTopic, isLoading, currentSessionId])
}
