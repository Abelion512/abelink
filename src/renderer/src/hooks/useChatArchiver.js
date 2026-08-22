import { useEffect, useRef } from 'react'
import { summarizeAndArchive } from '../api/ai/chatSummarizer'

const MIN_MESSAGES_TO_ARCHIVE = 10 // 10 pesan (5 tektokan) per arsip

export const useChatArchiver = ({
  chatData,
  activeTopic,
  config,
  pushNotification,
  isLoading,
  sessionId = 1
}) => {
  const currentSessionId = sessionId || 1
  const sessionIndexesRef = useRef({}) // Map<sessionId, number>
  const isArchivingRef = useRef(false)
  const wasLoadingRef = useRef(false)

  // Track on mount / session change
  useEffect(() => {
    const currentIndex = sessionIndexesRef.current[currentSessionId] || 0
    if (chatData.length < currentIndex) {
      // Jika user melakukan 'Clear Chat', reset index
      sessionIndexesRef.current[currentSessionId] = 0
    } else if (currentIndex === 0 && chatData.length > 0) {
      sessionIndexesRef.current[currentSessionId] = chatData.length
    }
  }, [chatData.length, currentSessionId])

  useEffect(() => {
    // Kita cek transisi dari isLoading: true -> false (artinya Mark baru selesai bales pesan)
    const justFinishedLoading = wasLoadingRef.current && !isLoading
    wasLoadingRef.current = isLoading

    if (justFinishedLoading) {
      const lastIndex = sessionIndexesRef.current[currentSessionId] || 0
      const newMessageCount = chatData.length - lastIndex

      if (newMessageCount >= MIN_MESSAGES_TO_ARCHIVE) {
        const executeArchive = async () => {
          if (isArchivingRef.current) return

          const recentMessages = chatData
            .slice(lastIndex)
            .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
            .map((m) => ({ role: m.role, content: m.content }))

          if (recentMessages.length >= 10) {
            isArchivingRef.current = true
            sessionIndexesRef.current[currentSessionId] = chatData.length

            console.log('[useChatArchiver] Mark selesai membalas. Merangkum obrolan...')

            await summarizeAndArchive(recentMessages, activeTopic, config)

            isArchivingRef.current = false
          }
        }
        executeArchive()
      }
    }
  }, [chatData, activeTopic, config, isLoading, currentSessionId])
}
