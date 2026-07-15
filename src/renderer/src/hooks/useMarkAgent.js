import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useMarkState, useMarkYoutube, useMarkMusic, useMarkPlan } from './agent'
import { useAwareness } from './useAwareness'
import { useChatArchiver } from './useChatArchiver'
import { formatForWhatsApp } from '../api/ai/utils'
import { useApproval } from '../contexts/ApprovalContext'
import { fetchAI } from '../api/ai/core'
import { db, getCoreMemory } from '../api/db'

export const useMarkAgent = () => {
  const { requestApproval } = useApproval()
  const youtubeMusicTools = useYoutubeMusic()

  const state = useMarkState()
  const {
    chatData,
    setChatData,
    clearChat,
    config,
    setConfig,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    isAgentBusy,
    setIsAgentBusy,
    isSpeak,
    setIsSpeak,
    abortControllerRef,

    handleStop,
    orbStatus,
    setOrbStatus,
    currentResponse,
    setCurrentResponse,
    notifications,
    pushNotification,
    activeProcesses,
    setActiveProcesses,
    pushProcess,
    dismissProcess,
    inputSource,
    setInputSource,
    activeTopic,
    setActiveTopic,
    isChatLoaded,
    isBooting,
    setIsBooting
  } = state


  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useMarkYoutube(setChatData)
  const { handleMusic } = useMarkMusic(setChatData, abortControllerRef, youtubeMusicTools)

  const tools = {
    handleYoutubeSearch,
    handleYoutubeSummary,
    handleMusic,
    getYoutubeData,
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null
  }

  const { handlePlanningCommand } = useMarkPlan({ ...state, ...tools, requestApproval })

  useAwareness({
    isLoading,
    isAgentBusy,
    setChatData,
    setOrbStatus,
    config,
    chatData,
    handlePlanningCommand,
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null
  })

  useChatArchiver({ chatData, activeTopic, config, pushNotification, isLoading })

  const activeWaRequestRef = useRef(null)
  const hasGreetedRef = useRef(false)

  // Welcome Greeting on Startup
  useEffect(() => {
    if (isChatLoaded && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      console.log('[useMarkAgent] Memicu pesan sambutan (Boot sequence)...')

      const bootSequence = async () => {
        setIsLoading(true)
        abortControllerRef.current = new AbortController()

        let memoryText = ''
        try {
          memoryText = await getCoreMemory()
        } catch (e) {
          console.error('[useMarkAgent] Error getCoreMemory:', e)
        }

        const systemPromptText = `Kamu adalah asisten AI bernama Mark. Kamu punya kepribadian yang cerdas dan asik. JANGAN gunakan format JSON.

# INSTRUKSI SAAT INI:
Aplikasi baru saja dinyalakan. Tugasmu SEKARANG adalah LANGSUNG menyapa user. JANGAN memberikan meta-komentar (seperti "Berikut sapaan saya:"). Langsung saja bicara sebagai Mark.

# PROFIL USER:
${memoryText}
Jika ada nama pengguna di atas, sapa dia dengan namanya.

# ATURAN KERAS:
1. Balas dengan MAKSIMAL 2-3 kalimat saja!
2. DILARANG KERAS menggunakan teks roleplay tindakan (seperti *tersenyum*, *menghela napas*). Ngobrol natural seperti manusia biasa di chat WA!`

        const contextMessages =
          chatData.length > 0
            ? chatData.slice(-10).map((msg) => ({
                role: msg.role === 'user' || msg.role === 'system' ? msg.role : 'assistant',
                content:
                  typeof msg.content === 'object'
                    ? JSON.stringify(msg.content)
                    : String(msg.content || '')
              }))
            : []

        fetchAI(
          [
            { role: 'system', content: systemPromptText },
            ...contextMessages,
            { role: 'user', content: '(Aplikasi baru saja dibuka. Berikan sapaanmu sekarang!)' }
          ],
          abortControllerRef.current.signal,
          false
        )
          .then((res) => {
            const textContent = typeof res === 'object' && res.content ? res.content : String(res)
            setChatData((prev) => [
              ...prev,
              { role: 'ai', content: textContent, isProactive: true }
            ])
            setIsLoading(false)
            
            // Beri jeda agar React selesai merender currentResponse & animasi masuk
            setTimeout(() => {
              setIsBooting(false)
            }, 800)
          })
          .catch((err) => {
            console.error('[useMarkAgent] Gagal fetch greeting:', err)
            if (err.name !== 'AbortError') {
              setChatData((prev) => [
                ...prev,
                { role: 'ai', content: 'Sistem baru saja direstart, tapi gue gagal terhubung ke server AI buat ngasih sapaan awal (mungkin server Groq lagi down atau timeout). Ada yang bisa gue bantu sekarang?', isProactive: true }
              ])
            }
            setIsLoading(false)
            setTimeout(() => setIsBooting(false), 800)
          })
      }

      bootSequence()
    }
  }, [isChatLoaded])

  useEffect(() => {
    const handleWaAdminMessage = (e) => {
      const data = e.detail
      activeWaRequestRef.current = data
      setInputSource('wa')
      handlePlanningCommand(data.text, data)
    }

    window.addEventListener('wa-admin-message', handleWaAdminMessage)
    return () => window.removeEventListener('wa-admin-message', handleWaAdminMessage)
  }, [handlePlanningCommand, setInputSource])

  useEffect(() => {
    if (!isAgentBusy && activeWaRequestRef.current && chatData.length > 0) {
      const lastAiMsg = [...chatData]
        .reverse()
        .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
      if (lastAiMsg) {
        window.api?.sendWaAgentExecutionDone({
          jid: activeWaRequestRef.current.jid,
          result: { answer: formatForWhatsApp(lastAiMsg.content) },
          msgId: activeWaRequestRef.current.msgId
        })
        activeWaRequestRef.current = null
        setInputSource('pc')
      }
    }
  }, [isAgentBusy, chatData, setInputSource])

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (isLoading) {
      handleStop()
    } else {
      handlePlanningCommand(message.trim())
    }
  }

  return {
    chatData,
    setChatData,
    clearChat,
    isSpeak,
    setIsSpeak,
    config,
    isLoading,
    message,
    setMessage,
    orbStatus,
    setOrbStatus,
    currentResponse,
    setCurrentResponse,
    notifications,
    pushNotification,
    activeProcesses,
    setActiveProcesses,
    pushProcess,
    dismissProcess,
    inputSource,
    setInputSource,
    handlePlanningCommand,
    handleStop,
    handleSubmit,
    isBooting
  }
}
