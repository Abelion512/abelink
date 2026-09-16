import { useEffect, useRef } from 'react'
import { getAllMemory } from '../api/db'
import { getRelevantMemory } from '../api/vectorMemory'
import { getAwarenessResponse } from '../api/ai/awareness'
import { stripDataUrls } from '../api/ai/contextCompactor'

const CHECKIN_INTERVAL = 10 * 60 * 1000
const INITIAL_DELAY = 180 * 1000 // Berikan jeda 3 menit setelah startup

// Module-level singleton: tidak ter-reset meskipun komponen me-remount karena HMR atau routing
let lastGlobalCheckIn = Date.now()

const formatAwarenessContent = (content) => {
  if (typeof content === 'string') return stripDataUrls(content)
  if (content == null) return ''

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text') return part.text || ''
        if (part?.type === 'image_url') return '[Gambar]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return JSON.stringify(content)
}

const tokenizeForSimilarity = (text) => {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
  )
}

const isSimilarAwarenessMessage = (message, recentMessages) => {
  const incomingTokens = tokenizeForSimilarity(message)
  if (incomingTokens.size < 4) return false

  return recentMessages.some((item) => {
    const previousTokens = tokenizeForSimilarity(formatAwarenessContent(item.content))
    if (previousTokens.size < 4) return false

    const shared = [...incomingTokens].filter((word) => previousTokens.has(word)).length
    return shared / Math.min(incomingTokens.size, previousTokens.size) >= 0.45
  })
}

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

  useEffect(() => {
    chatDataRef.current = chatData
    configRef.current = config
    handlePlanningCommandRef.current = handlePlanningCommand
    currentMusicTrackRef.current = currentMusicTrack
    isLoadingRef.current = isLoading
    isAgentBusyRef.current = isAgentBusy
  }, [chatData, config, handlePlanningCommand, currentMusicTrack, isLoading, isAgentBusy])

  const isAwarenessEnabled = config?.[0]?.awarenessEnabled !== false

  useEffect(() => {
    if (!isAwarenessEnabled) return

    const checkIn = async () => {
      if (isAgentBusyRef.current || isLoadingRef.current || isRequestingRef.current) return

      const now = Date.now()

      // Minimal harus menunggu 9 menit (540,000 ms) dari check-in terakhir (global singleton)
      if (now - lastGlobalCheckIn < 540000) {
        return
      }

      // Jangan ganggu user jika user baru saja berinteraksi dalam 3 menit terakhir
      const hasRecentUserChat = (chatDataRef.current || []).some((m) => {
        const time = m.created_at || (m.timestamp ? Date.parse(m.timestamp) : 0)
        return m.role === 'user' && time && now - time < 180000
      })
      if (hasRecentUserChat) {
        return
      }

      try {
        isRequestingRef.current = true
        lastGlobalCheckIn = Date.now()
        lastCheckInRef.current = lastGlobalCheckIn
        if (import.meta.env?.DEV) console.log('[useAwareness] Memulai check-in...')

        const rawBuffer = await window.api.getActivityBuffer()
        if (!rawBuffer || rawBuffer.length < 1) {
          isRequestingRef.current = false
          return
        }

        // Pangkas buffer ke maksimal 5 entri terakhir demi efisiensi token
        const buffer = rawBuffer.slice(-5)
        if (import.meta.env?.DEV) console.log('[useAwareness] Mengirim buffer ke AI:', buffer.length, 'entri')
        const allMemory = await getAllMemory()
        const memoryRef = await getRelevantMemory('aktivitas user bekerja dan rutinitas', allMemory)

        // Ambil 5 riwayat chat terakhir tanpa status isThinking dll.
        // Pesan dengan content kosong (null/undefined/'') dibuang — kolom kosong
        // di prompt awareness memicu jawaban ngawur dan pemborosan token.
        const hasRealContent = (m) =>
          typeof m.content === 'string'
            ? m.content.trim().length > 0
            : Array.isArray(m.content)
              ? m.content.length > 0
              : !!m.content
        const recentChat = (chatDataRef.current || [])
          .filter((m) => hasRealContent(m) && !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-5)
          .map((m) => ({ role: m.role, content: m.content }))

        // Clear buffer right away so we don't send the exact same bulk again later
        // catch: gagal clear = unhandled rejection + kirim ganda di loop 10 mnt.
        if (window.api.clearActivityBuffer) {
          try {
            await window.api.clearActivityBuffer()
          } catch (_) {}
        }

        const result = await getAwarenessResponse(
          buffer,
          memoryRef,
          configRef.current,
          recentChat,
          currentMusicTrackRef.current
        )
        // Filter terakhir di UI layer: awareness tidak boleh memparafrase pesan terbaru.
        const recentVisibleMessages = (chatDataRef.current || [])
          .filter((m) => !m.isThinking && !m.isSearching && !m.isSummarizing)
          .slice(-8)

        if (
          result.message &&
          isSimilarAwarenessMessage(result.message, recentVisibleMessages)
        ) {
          console.log('[useAwareness] Skip check-in: message terlalu mirip dengan chat terbaru.')
          return
        }

        if (result.should_act || result.autonomous_prompt) {
          if (isLoadingRef.current) {
            console.log(
              '[useAwareness] Skip triggering action karena Abelink sedang sibuk (isLoading true)'
            )
            return
          }
          console.log('[useAwareness] Triggering autonomous action!')
          // Push notification
          if (window.api.showNotification && !document.hasFocus() && result.message) {
            window.api.showNotification('Abelink', result.message)
          }

          if (result.message && window.api?.tgBroadcastToAdmins) {
            window.api.tgBroadcastToAdmins(`[AWARENESS] *Abelink (PC)*:\n${result.message}`)
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
    const initialTimeout = setTimeout(checkIn, INITIAL_DELAY)

    return () => {
      clearInterval(id)
      clearTimeout(initialTimeout)
    }
  }, [isAwarenessEnabled, setChatData, setOrbStatus])

  return {
    lastCheckInMs: () => lastCheckInRef.current
  } // Hapus isLoading & isAgentBusy dari deps biar gak keriset mulu
}
