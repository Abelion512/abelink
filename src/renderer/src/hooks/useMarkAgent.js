import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useApproval } from '../contexts/ApprovalContext'
import { fetchAI } from '../api/ai/core'
import { db, getCoreMemory } from '../api/db'
import { useMarkState, useMarkYoutube, useMarkMusic, useMarkPlan } from './agent'
import { useAwareness } from './useAwareness'
import { useRelationalGrowth } from './agent/useRelationalGrowth'
import { useChatArchiver } from './useChatArchiver'

import { formatForWhatsApp } from '../api/ai/utils'

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
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null,
    currentPlaybackError: youtubeMusicTools.playbackError || null
  }

  const requestCameraCaptureRef = useRef(null)

  const { handlePlanningCommand, handleIntervention } = useMarkPlan({
    ...state,
    ...tools,
    requestApproval,
    requestCameraCapture: async (args) => {
      console.log(
        '[useMarkAgent] requestCameraCapture called, ref.current:',
        !!requestCameraCaptureRef.current
      )
      if (requestCameraCaptureRef.current) {
        return await requestCameraCaptureRef.current(args)
      }
      console.warn(
        '[useMarkAgent] requestCameraCaptureRef.current is null! MarkHome belum set callback.'
      )
      return null
    }
  })

  useAwareness({
    isLoading,
    isAgentBusy,
    setChatData,
    setOrbStatus,
    config,
    chatData,
    handlePlanningCommand,
    currentMusicTrack: youtubeMusicTools.isPlaying ? youtubeMusicTools.currentTrack : null,
    currentPlaybackError: youtubeMusicTools.playbackError || null
  })

  useRelationalGrowth({ chatData })

  useChatArchiver({ chatData, activeTopic, config, pushNotification, isLoading })

  const activeWaRequestRef = useRef(null)
  const hasGreetedRef = useRef(false)
  const chatDataRef = useRef(chatData)
  const activeTopicRef = useRef(activeTopic)
  chatDataRef.current = chatData
  activeTopicRef.current = activeTopic

  // Welcome Greeting on Startup
  useEffect(() => {
    if (isChatLoaded && !hasGreetedRef.current) {
      hasGreetedRef.current = true
      console.log('[useMarkAgent] Memicu pesan sambutan (Boot sequence)...')

      const bootSequence = async () => {
        let timeContext = ''
        let topicContext = ''

        if (chatData && chatData.length > 0) {
          const lastMsg = chatData[chatData.length - 1]
          if (lastMsg && lastMsg.timestamp) {
            const lastTs = typeof lastMsg.timestamp === 'number'
              ? (lastMsg.timestamp < 1e12 ? lastMsg.timestamp * 1000 : lastMsg.timestamp) // detik → ms
              : new Date(lastMsg.timestamp).getTime()
            const diffMs = Date.now() - (isNaN(lastTs) ? Date.now() : lastTs)
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
            const diffDays = Math.floor(diffHours / 24)

            if (diffDays >= 3) {
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

          const lastUserMsg = [...chatData].reverse().find((m) => m.type === 'user' && typeof m.message === 'string')
          if (lastUserMsg && lastUserMsg.message) {
            const cleanMsg = lastUserMsg.message.replace(/\[.*?\]/g, '').trim()
            if (cleanMsg && cleanMsg.length > 3) {
              topicContext = `\n[TOPIK TERAKHIR KALIAN]: "${cleanMsg.slice(0, 100)}". Kamu boleh sedikit menyinggung atau mengaitkan obrolan terakhir ini jika cocok agar sapaanmu terasa hidup dan peka memori.`
            }
          }
        }

        try {
          await handlePlanningCommand(
            `Aplikasi baru saja dinyalakan. Sapa pengguna dengan singkat, natural, hangat, dan tidak kaku layaknya teman dekat/asisten pribadi yang hidup (gunakan nama pengguna dari profil jika ada).${timeContext}${topicContext}\nTunjukkan bahwa kamu siap dan aktif merespons tanpa bersikap seperti robot kaku atau customer service.`,
            null, // waContext
            false, // isAutonomous
            null, // autonomousInitialMessage
            { disableTools: true }, // options
            true // isSystem
          )
        } catch (err) {
          console.error('[useMarkAgent] Gagal greeting via handlePlanningCommand:', err)
        } finally {
          setTimeout(() => {
            setIsBooting(false)
          }, 800)
        }
      }

      bootSequence()
    }
  }, [isChatLoaded, chatData])

  useEffect(() => {
    const handleWaAdminMessage = (e) => {
      const data = e.detail
      
      if (data.text.trim().toLowerCase() === '/stop') {
        handleStop()
        return
      }

      activeWaRequestRef.current = data
      setInputSource('wa')
      handlePlanningCommand(data.text, data)
    }

    window.addEventListener('wa-admin-message', handleWaAdminMessage)
    return () => window.removeEventListener('wa-admin-message', handleWaAdminMessage)
  }, [handlePlanningCommand, setInputSource, handleStop])

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



  const handleSubmit = (e, inputText = '') => {
    if (e) e.preventDefault()
    const text = (inputText || '').trim()
    if (!text) return
    if (isLoading || isAgentBusy) {
      if (handleIntervention) {
        handleIntervention(text)
      }
    } else {
      handlePlanningCommand(text)
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
    isBooting,
    requestCameraCaptureRef
  }
}
