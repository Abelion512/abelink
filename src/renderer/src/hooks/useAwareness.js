import { useEffect, useRef } from 'react'
import { getAllMemory } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse } from '../api/ai/awareness'

const CHECKIN_INTERVAL = 10 * 60 * 1000 // 10 menit
const INITIAL_DELAY = 2 * 60 * 1000 // 2 menit

export const useAwareness = ({ isLoading, setChatData, setOrbStatus, config, chatData, handlePlanningCommand }) => {
  const isRequestingRef = useRef(false)
  const chatDataRef = useRef(chatData)

  useEffect(() => {
    chatDataRef.current = chatData
  }, [chatData])

  useEffect(() => {
    const checkIn = async () => {
      if (isLoading || isRequestingRef.current) return

      try {
        isRequestingRef.current = true
        console.log('[useAwareness] Memulai check-in...')
        
        const buffer = await window.api.getActivityBuffer()
        if (!buffer || buffer.length < 3) {
          console.log('[useAwareness] Skip check-in: Buffer kurang dari 3 (sekarang: ' + (buffer ? buffer.length : 0) + ')')
          isRequestingRef.current = false
          return
        }

        console.log('[useAwareness] Mengirim buffer ke AI:', buffer)
        const allMemory = await getAllMemory()
        const memoryRef = await getRelevantMemory('aktivitas user bekerja dan rutinitas', allMemory)

        // Ambil 5 riwayat chat terakhir tanpa status isThinking dll
        const recentChat = (chatDataRef.current || [])
          .filter(m => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map(m => ({ role: m.role, content: m.content }))

        // Clear buffer right away so we don't send the exact same bulk again later
        if (window.api.clearActivityBuffer) {
          window.api.clearActivityBuffer()
        }

        const result = await getAwarenessResponse(buffer, memoryRef, config, recentChat)
        console.log('[useAwareness] AI Response:', result)

        if (result.should_act && result.message) {
          console.log('[useAwareness] Triggering autonomous action!')
          // Push notification
          if (window.api.showNotification && !document.hasFocus()) {
            window.api.showNotification('Mark', result.message)
          }

          // Jika ada perintah autonomus, bypass chat bubble biasa dan langsung eksekusi plan siluman
          if (result.autonomous_prompt && handlePlanningCommand) {
             handlePlanningCommand(result.autonomous_prompt, null, true, result.message)
          } else {
             // Kalau cuma mau ngomong biasa tanpa ngejalanin plan
             setChatData(prev => [...prev, {
               role: 'ai',
               content: result.message,
               isProactive: true,
               mood: result.mood
             }])
          }

          // Orb nudge animation
          setOrbStatus('nudge')
          setTimeout(() => {
            setOrbStatus('idle')
          }, 3000)
        }
      } catch (err) {
        console.error('[Awareness Hook] Error during check-in:', err)
      } finally {
        isRequestingRef.current = false
      }
    }

    const id = setInterval(checkIn, CHECKIN_INTERVAL)
    const initialTimeout = setTimeout(checkIn, INITIAL_DELAY)

    return () => {
      clearInterval(id)
      clearTimeout(initialTimeout)
    }
  }, [isLoading, config, setChatData, setOrbStatus, handlePlanningCommand])
}
