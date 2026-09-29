import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useApproval } from '../contexts/ApprovalContext'
import { useAbelinkState, useAbelinkYoutube, useAbelinkMusic, useAbelinkPlan } from './agent'
import { useAwareness } from './useAwareness'
import { useRelationalGrowth } from './agent/useRelationalGrowth'
import { useChatArchiver } from './useChatArchiver'

/** Pesan Telegram admin (bentuk longgar CustomEvent). */
interface TgAdminMessage {
  msgId?: string | number
  chatId?: string | number
  text?: string
  [key: string]: unknown
}

export const useAbelinkAgent = () => {
  const approval = useApproval()
  const requestApproval = approval?.requestApproval ?? (async () => true)
  const requestUserInput = approval?.requestUserInput ?? (async () => ({ confirmed: false, comment: '' }))
  const youtubeMusicTools = useYoutubeMusic() as unknown as
    {
      isPlaying: boolean
      currentTrack?: { title?: string; artist?: string } | null
      [key: string]: unknown
    }

  const state = useAbelinkState()
  const {
    chatData,
    setChatData,
    clearChat,
    config,
    message,
    setMessage,
    isLoading,
    isAgentBusy,
    runningSessionId,
    setRunningSessionId,
    runningSessionIds,
    setRunningSessionIds,
    addRunningSessionId,
    removeRunningSessionId,
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
    isChatLoaded,
    isBooting,
    setIsBooting
  } = state

  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useAbelinkYoutube(setChatData)
  const { handleMusic } = useAbelinkMusic(
    setChatData,
    abortControllerRef,
    youtubeMusicTools as unknown as Parameters<typeof useAbelinkMusic>[2]
  )

  const tools = {
    handleYoutubeSearch,
    handleYoutubeSummary,
    handleMusic,
    getYoutubeData,
    youtubeMusicTools,
    currentMusicTrack: youtubeMusicTools?.isPlaying ? youtubeMusicTools.currentTrack : null
  }

  const requestCameraCaptureRef = useRef<((args: { isAutonomous?: boolean; deviceId?: string | null }) => Promise<string | null>) | null>(null)

  const { handlePlanningCommand, handleIntervention, handleStop: planHandleStop } = useAbelinkPlan({
    ...(state as unknown as Parameters<typeof useAbelinkPlan>[0]),
    ...(tools as unknown as Partial<Parameters<typeof useAbelinkPlan>[0]>),
    requestApproval: requestApproval as unknown as (
      message?: string, tool?: string, query?: string
    ) => Promise<boolean>,
    requestUserInput,
    requestCameraCapture: async (args: { isAutonomous?: boolean; deviceId?: string | null }) => {
      console.log(
        '[useAbelinkAgent] requestCameraCapture called, ref.current:',
        !!requestCameraCaptureRef.current
      )
      if (requestCameraCaptureRef.current) {
        return await requestCameraCaptureRef.current(args)
      }
      console.warn(
        '[useAbelinkAgent] requestCameraCaptureRef.current is null! AbelinkHome belum set callback.'
      )
      return null
    }
  })

  const awarenessReturn = useAwareness({
    isLoading,
    isAgentBusy,
    setChatData,
    setOrbStatus,
    config,
    chatData,
    handlePlanningCommand: handlePlanningCommand as unknown as (
      ...args: unknown[]
    ) => void,
    currentMusicTrack: youtubeMusicTools?.isPlaying
      ? (youtubeMusicTools.currentTrack ?? null)
      : null
  })

  useRelationalGrowth({ chatData })

  useChatArchiver({ chatData, activeTopic: activeTopic ?? undefined, config, pushNotification, isLoading })

  const activeTgRequestRef = useRef<TgAdminMessage | null>(null)
  const hasGreetedRef = useRef(false)

  // Welcome Greeting on Startup
  // Fallback di luar guard: overlay boot HARUS turun walau greeting gagal
  // atau effect di-remount StrictMode (flag ref sudah true di pass kedua).
  // setIsBooting stabil (useState setter dari useAbelinkState).
  useEffect(() => {
    if (!isBooting) return undefined
    const t = setTimeout(() => setIsBooting(false), 6000)
    return () => clearTimeout(t)
  }, [isBooting, setIsBooting])

  // Greeting one-shot dijaga hasGreetedRef, jadi penambahan dep tak-stabil
  // di bawah aman (pass ulang keluar via guard, tanpa re-fire).
  useEffect(() => {
    if (isChatLoaded && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      console.log('[useAbelinkAgent] Memicu pesan sambutan (Boot sequence)...')

      const bootFallback = setTimeout(() => setIsBooting(false), 6000)

      const bootSequence = async () => {
        let timeContext = ''
        let topicContext = ''

        if (chatData && chatData.length > 0) {
          const lastMsg = chatData[chatData.length - 1]
          let lastTimeMs = null

          if (lastMsg) {
            if (typeof lastMsg.created_at === 'number' && !isNaN(lastMsg.created_at) && lastMsg.created_at > 0) {
              lastTimeMs = lastMsg.created_at
            } else if (typeof lastMsg.timestamp === 'number' && !isNaN(lastMsg.timestamp) && lastMsg.timestamp > 0) {
              lastTimeMs = lastMsg.timestamp
            }
          }

          if (lastTimeMs && lastTimeMs > 0) {
            const diffMs = Date.now() - lastTimeMs
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
            const diffDays = Math.floor(diffHours / 24)

            if (diffDays >= 365 || diffDays < 0) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna baru saja membuka kembali aplikasi.`
            } else if (diffDays >= 3) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna sudah tidak membuka aplikasi/ngobrol selama ${diffDays} hari! Sapa dengan nada kaget, akrab, atau kangen bergaya santai (contoh: "Waduh kemana aja nih lama gak kelihatan", "Akhirnya nongkrong lagi kita", "Sibuk banget kayaknya baru kelihatan lagi", dll). JANGAN formal atau kaku!`
            } else if (diffDays >= 1) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna kembali setelah ${diffDays} hari tidak ngobrol. Beri sapaan santai dan ramah bahwa lu senang dia balik lagi.`
            } else if (diffHours >= 5) {
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Pengguna kembali setelah sekitar ${diffHours} jam dari obrolan terakhir hari ini.`
            } else {
              const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
              timeContext = `\n[KONTEKS WAKTU & RIWAYAT]: Kalian baru saja ngobrol belum lama ini (${diffMinutes} menit yang lalu). JANGAN sapa berlebihan seolah sudah lama tidak ketemu, cukup sambut santai melanjutkan obrolan.`
            }
          }

          const lastUserMsg = [...chatData].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')
          if (lastUserMsg && typeof lastUserMsg.content === 'string') {
            const cleanMsg = lastUserMsg.content.replace(/\[.*?\]/g, '').trim()
            if (cleanMsg && cleanMsg.length > 3) {
              topicContext = `\n[TOPIK TERAKHIR KALIAN DI RIWAYAT]: "${cleanMsg.slice(0, 100)}". PENTING: Topik obrolan terakhir ini adalah MASA LALU. JANGAN mengira pengguna MASIH atau SEDANG melakukan aktivitas/game tersebut sekarang! Jika ingin menyinggungnya, tanyakan secara lampau (contoh: "gimana main game/kerjaan kemarin?", bukan "masih main/kerja ya?").`
            }
          }
        }

        try {
          await handlePlanningCommand(
            `Aplikasi baru saja dinyalakan. Sapa pengguna dengan singkat, natural, hangat, dan tidak kaku layaknya teman dekat/asisten pribadi yang hidup (gunakan nama pengguna dari profil jika ada).${timeContext}${topicContext}\nTunjukkan bahwa kamu siap dan aktif merespons tanpa bersikap seperti robot kaku atau customer service.`,
            null, // tgContext
            false, // isAutonomous
            null, // autonomousInitialMessage
            { disableTools: true }, // options
            true // isSystem
          )
        } catch (err) {
          console.error('[useAbelinkAgent] Gagal greeting via handlePlanningCommand:', err)
        } finally {
          clearTimeout(bootFallback)
          setTimeout(() => {
            setIsBooting(false)
          }, 800)
        }
      }

      bootSequence()
      return () => clearTimeout(bootFallback)
    }
  }, [isChatLoaded, chatData, handlePlanningCommand, setIsBooting])

  const processedTgMsgIdsRef = useRef<Set<string | number>>(new Set())

  useEffect(() => {
    const handleTgAdminMessage = (e: Event) => {
      const data = (e as CustomEvent<TgAdminMessage>).detail
      if (!data) return

      if (data.msgId) {
        if (processedTgMsgIdsRef.current.has(data.msgId)) {
          console.warn('[useAbelinkAgent] Mengabaikan duplikasi pesan Telegram:', data.msgId)
          return
        }
        processedTgMsgIdsRef.current.add(data.msgId)
        if (processedTgMsgIdsRef.current.size > 100) {
          const firstKey = processedTgMsgIdsRef.current.keys().next().value as string | number
          processedTgMsgIdsRef.current.delete(firstKey)
        }
      }
      
      if (data.text?.trim().toLowerCase() === '/stop') {
        handleStop()
        return
      }

      if (isAgentBusy || isLoading) {
        handleIntervention(data.text || '')
        window.api?.sendTgAgentExecutionDone?.({
          chatId: data.chatId,
          result: {
            answer:
              'Instruksi diterima sebagai arahan (intervensi) untuk proses yang sedang berjalan.'
          },
          msgId: data.msgId
        })
        return
      }

      activeTgRequestRef.current = data
      setInputSource('tg')
      handlePlanningCommand(data.text || '', data)
    }

    window.addEventListener('tg-admin-message', handleTgAdminMessage)
    return () => window.removeEventListener('tg-admin-message', handleTgAdminMessage)
  }, [handlePlanningCommand, handleIntervention, isAgentBusy, isLoading, setInputSource, handleStop, setIsSpeak])

  const isInitialSyncDoneRef = useRef(false)
  const lastSyncedMsgIdRef = useRef<string | number | null>(null)

  useEffect(() => {
    if (!isChatLoaded) return

    // Pada render pertama setelah chat DB dimuat, tandai pesan AI terakhir sebagai "sudah tersinkron" agar pesan histori tidak terkirim ulang
    if (!isInitialSyncDoneRef.current) {
      isInitialSyncDoneRef.current = true
      if (chatData && chatData.length > 0) {
        const lastAiMsg = [...chatData]
          .reverse()
          .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
        if (lastAiMsg) {
          lastSyncedMsgIdRef.current = (lastAiMsg.timestamp || lastAiMsg.content) as string | number | null
        }
      }
      return
    }

    if (!isAgentBusy && activeTgRequestRef.current && chatData.length > 0) {
      const lastAiMsg = [...chatData]
        .reverse()
        .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
      if (lastAiMsg) {
        const msgKey = (lastAiMsg.timestamp || lastAiMsg.content) as string | number | null
        lastSyncedMsgIdRef.current = msgKey
        window.api?.sendTgAgentExecutionDone({
          chatId: activeTgRequestRef.current?.chatId as string | number,
          result: { answer: String(lastAiMsg.content || '').trim() },
          msgId: activeTgRequestRef.current?.msgId as string | number
        })
        activeTgRequestRef.current = null
        setInputSource('pc')
      }
    } else if (!isAgentBusy && chatData.length > 0) {
      const lastAiMsg = [...chatData]
        .reverse()
        .find((m) => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing)
      const msgKey = lastAiMsg ? ((lastAiMsg.timestamp || lastAiMsg.content) as string | number | null) : null
      if (lastAiMsg && typeof lastAiMsg.content === 'string' && lastSyncedMsgIdRef.current !== msgKey) {
        lastSyncedMsgIdRef.current = msgKey
        if (window.api?.tgBroadcastToAdmins && !lastAiMsg.isProactive) {
          window.api.tgBroadcastToAdmins(`*Abelink (PC)*:\n${lastAiMsg.content}`)
        }
      }
    }
  }, [isAgentBusy, chatData, isChatLoaded, setInputSource])

  const handleSubmit = (e: Event | string | null, textPrompt?: string) => {
    if (e && typeof (e as Event).preventDefault === 'function') (e as Event).preventDefault()
    const textToSend = typeof textPrompt === 'string' ? textPrompt.trim() : (typeof e === 'string' ? e.trim() : '')
    if (!textToSend) return

    if (isLoading || isAgentBusy) {
      if (handleIntervention) {
        handleIntervention(textToSend)
      }
    } else {
      handlePlanningCommand(textToSend)
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
    isAgentBusy,
    runningSessionId,
    setRunningSessionId,
    runningSessionIds,
    setRunningSessionIds,
    addRunningSessionId,
    removeRunningSessionId,
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
    handleStop: planHandleStop || handleStop,
    handleSubmit,
    isBooting,
    requestCameraCaptureRef,
    ...(awarenessReturn || {})
  }
}
