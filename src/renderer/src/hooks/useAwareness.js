import { useEffect, useLayoutEffect, useRef } from 'react'
import { getAllMemory } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse } from '../api/ai/awareness'

const CHECKIN_INTERVAL = 10 * 60 * 1000
const INITIAL_DELAY = 60 * 1000
const AUTONOMOUS_COOLDOWN = 120 * 1000

export const useAwareness = ({
  isLoading,
  isAgentBusy,
  setChatData,
  setOrbStatus,
  config,
  chatData,
  handlePlanningCommand,
  currentMusicTrack
}) => {
  const isRequestingRef = useRef(false)
  const chatDataRef = useRef(chatData)
  const configRef = useRef(config)
  const handlePlanningCommandRef = useRef(handlePlanningCommand)
  const currentMusicTrackRef = useRef(currentMusicTrack)
  const isLoadingRef = useRef(isLoading)
  const isAgentBusyRef = useRef(isAgentBusy)
  const lastCheckInRef = useRef(0)
  const bufferEmptyRef = useRef(false)
  const mountedRef = useRef(false)
  const lastUserActivityRef = useRef(Date.now())
  const prevChatLengthRef = useRef(0)
  const lastAutonomousRef = useRef(0)

  useLayoutEffect(() => {
    chatDataRef.current = chatData
    configRef.current = config
    handlePlanningCommandRef.current = handlePlanningCommand
    currentMusicTrackRef.current = currentMusicTrack
    isLoadingRef.current = isLoading
    isAgentBusyRef.current = isAgentBusy

    // Track user activity: if chatData length increased, a new message was added.
    // Check if the latest message is from the user to update activity timestamp.
    if (chatData.length > prevChatLengthRef.current) {
      const latestMsg = chatData[chatData.length - 1]
      if (latestMsg?.role === 'user') {
        lastUserActivityRef.current = Date.now()
      }
    }
    prevChatLengthRef.current = chatData.length
  }, [chatData, config, handlePlanningCommand, currentMusicTrack, isLoading, isAgentBusy])

  const isAwarenessEnabled = config?.[0]?.awarenessEnabled !== false

  useEffect(() => {
    if (!isAwarenessEnabled) return

    const checkIn = async () => {
      if (isAgentBusyRef.current || isLoadingRef.current || isRequestingRef.current) return
      
      const now = Date.now()
      // Minimal harus nunggu 9 menit (540,000 ms) dari check-in terakhir buat nge-trigger lagi
      if (now - lastCheckInRef.current < 540000) {
        console.log('[useAwareness] Skip check-in: Belum waktunya (terlalu cepat).')
        return
      }

      try {
        isRequestingRef.current = true
        lastCheckInRef.current = Date.now()

        const buffer = await window.api.getActivityBuffer()
        const wasBufferEmpty = bufferEmptyRef.current
        if (!buffer || buffer.length < 1) {
          isRequestingRef.current = false
          // Only log once when transitioning from data→empty, silence repeat skips
          if (!wasBufferEmpty) {
            bufferEmptyRef.current = true
            console.log('[useAwareness] Buffer kosong — check-in dihentikan')
          }
          return
        }
        bufferEmptyRef.current = false
        console.log('[useAwareness] Memulai check-in, entries:', buffer.length, buffer)
        const allMemory = await getAllMemory()
        const memoryRef = await getRelevantMemory(allMemory)

        // Ambil 5 riwayat chat terakhir tanpa status isThinking dll
        const recentChat = (chatDataRef.current || [])
          .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map((m) => ({ role: m.role, content: m.content }))

        console.log('[useAwareness] chatDataRef.current length:', chatDataRef.current?.length);
        console.log('[useAwareness] recentChat extracted:', recentChat);

        // Clear buffer right away so we don't send the exact same bulk again later
        if (window.api.clearActivityBuffer) {
          window.api.clearActivityBuffer()
        }

        const result = await getAwarenessResponse(
          buffer,
          memoryRef,
          configRef.current,
          recentChat,
          currentMusicTrackRef.current
        )
        console.log('[useAwareness] AI Response:', result)

        if (result.should_act || result.autonomous_prompt) {
          if (isLoadingRef.current || isAgentBusyRef.current) {
            console.log(
              '[useAwareness] Skip triggering action karena Mark sedang sibuk'
            )
            return
          }
          // Cooldown: don't trigger autonomous actions if user sent message in last 30s.
          // Uses lastUserActivityRef (updated when chatData grows with a user message)
          // because chatData messages don't have timestamp fields.
          const timeSinceLastUserMsg = Date.now() - lastUserActivityRef.current
          if (timeSinceLastUserMsg < 30000) {
            console.log(`[useAwareness] Skip: user aktif ${Math.round(timeSinceLastUserMsg / 1000)}s yang lalu (< 30s cooldown)`)
            return
          }
          // Post-autonomous cooldown: block for 2 min after last autonomous action
          const sinceLastAuto = Date.now() - lastAutonomousRef.current
          if (sinceLastAuto < AUTONOMOUS_COOLDOWN) {
            console.log(`[useAwareness] Skip: autonomous cooldown ${Math.round((AUTONOMOUS_COOLDOWN - sinceLastAuto) / 1000)}s remaining`)
            return
          }
          console.log('[useAwareness] Triggering autonomous action!')
          lastAutonomousRef.current = Date.now()
          // Push notification
          if (window.api.showNotification && !document.hasFocus() && result.message) {
            window.api.showNotification('Mark', result.message)
          }

          // Jika ada perintah autonomus, bypass chat bubble biasa dan langsung eksekusi plan siluman
          if (result.autonomous_prompt && handlePlanningCommandRef.current) {
            handlePlanningCommandRef.current(
              result.autonomous_prompt,
              null,
              true,
              result.message || "Melakukan pengecekan background...",
              { disableTools: false },
              true
            )
          } else if (result.message) {
            // Kalau cuma mau ngomong biasa tanpa ngejalanin plan
            setChatData((prev) => [
              ...prev,
              {
                role: 'ai',
                content: result.message,
                isProactive: true,
                mood: result.mood
              }
            ])
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

    // Guard against React StrictMode double-fire: only schedule one initial timeout
    if (!mountedRef.current) {
      mountedRef.current = true
      const initialTimeout = setTimeout(checkIn, INITIAL_DELAY)
      return () => {
        clearInterval(id)
        clearTimeout(initialTimeout)
        mountedRef.current = false
      }
    }

    return () => {
      clearInterval(id)
    }
  }, [isAwarenessEnabled, setChatData, setOrbStatus]) // Hapus isLoading & isAgentBusy dari deps biar gak keriset mulu
}
