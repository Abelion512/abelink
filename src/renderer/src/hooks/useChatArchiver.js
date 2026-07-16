import { useEffect, useRef } from 'react'
import { summarizeAndArchive } from '../api/ai/chatSummarizer'

const MIN_MESSAGES_TO_ARCHIVE = 10 // 10 pesan (5 tektokan) per arsip

export const useChatArchiver = ({ chatData, activeTopic, config, pushNotification, isLoading }) => {
  const lastArchivedIndexRef = useRef(0)
  const isArchivingRef = useRef(false)
  const wasLoadingRef = useRef(false)
  
  // Track on initial mount if chatData already has items (from restored session)
  useEffect(() => {
    if (chatData.length < lastArchivedIndexRef.current) {
      // Jika user melakukan 'Clear Chat', reset index ke 0
      lastArchivedIndexRef.current = 0
    } else if (lastArchivedIndexRef.current === 0 && chatData.length > 0) {
      lastArchivedIndexRef.current = chatData.length
    }
  }, [chatData.length])

  useEffect(() => {
    // Kita cek transisi dari isLoading: true -> false (artinya Mark baru selesai bales pesan)
    const justFinishedLoading = wasLoadingRef.current && !isLoading
    wasLoadingRef.current = isLoading

    if (justFinishedLoading) {
      const newMessageCount = chatData.length - lastArchivedIndexRef.current

      if (newMessageCount >= MIN_MESSAGES_TO_ARCHIVE) {
        const executeArchive = async () => {
          if (isArchivingRef.current) return;
          
          const recentMessages = chatData
            .slice(lastArchivedIndexRef.current)
            .filter(m => !m.isThinking && !m.isSearching && !m.isSummarizing)
            .map((m) => ({ role: m.role, content: m.content }))

          if (recentMessages.length >= 10) {
            isArchivingRef.current = true
            lastArchivedIndexRef.current = chatData.length

            console.log('[useChatArchiver] Mark selesai membalas. Merangkum obrolan...')
            
            await summarizeAndArchive(recentMessages, activeTopic, config)
            
            isArchivingRef.current = false
          }
        }
        executeArchive()
      }
    }
  }, [chatData, activeTopic, config, isLoading])
}
