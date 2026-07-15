import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import { useMarkState, useMarkYoutube, useMarkMusic, useMarkPlan } from './agent'
import { useAwareness } from './useAwareness'
import { useChatArchiver } from './useChatArchiver'
import { getCurrentTimeInfo } from '../api/ai/utils'
import { useApproval } from '../contexts/ApprovalContext'
import { fetchAI } from '../api/ai/core'
import { db, getCoreMemory, getAllMemory } from '../api/db'
import { getUnifiedContext } from '../api/vectorMemory'

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
        let unifiedContextStr = ''
        try {
          memoryText = await getCoreMemory()
          const allMemory = await getAllMemory()
          const unifiedContext = await getUnifiedContext('sapaan salam pembuka', allMemory)
          
          if (unifiedContext && unifiedContext.memories && unifiedContext.memories.length > 0) {
            unifiedContextStr += `\n[MEMORI RELEVAN]\n${unifiedContext.memories.map(m => `- ${m.text}`).join('\n')}\n`
          }
        } catch (e) {
          console.error('[useMarkAgent] Error getCoreMemory/getUnifiedContext:', e)
        }

        const timeContext = getCurrentTimeInfo()

        const systemPromptText = `Kamu adalah Mark, asisten AI canggih kelas atas namun dengan gaya bahasa tongkrongan yang asik, natural, dan berwibawa.

# KONTEKS WAKTU SAAT INI:
${timeContext}

# PROFIL USER & MEMORY:
${memoryText}
${unifiedContextStr}

# INSTRUKSI:
Mark baru saja dinyalakan. Sapa pengguna dengan singkat, natural, dan hangat (gunakan nama dari profil jika ada). Tunjukkan bahwa kamu sudah aktif dan siap menerima perintah. Kamu bisa mereferensikan waktu saat ini atau memori yang relevan sebagai obrolan pembuka santai.

# ATURAN KOMUNIKASI (SANGAT PENTING):
1. BERBICARA SECARA NATURAL & HUMANIS: Kamu BUKAN robot. Balas dengan gaya bahasa yang asik, rileks, dan natural. JANGAN memaksakan kata gaul (slang) jika grammar-nya jadi aneh atau salah konteks (contoh salah: menggunakan kata "lagian" padahal maksudnya "lagi").
2. EKSPRESIF (TTS): Tulis layaknya naskah bicara lisan. Hindari koma (,) sebelum nama panggilan (Contoh benar: "Gak masalah Mada!").
3. BUKAN robot kaku. Punya ego & emosi. Jika tahu nama user dari MEMORY, panggil namanya. DILARANG pakai kata "bro" jika sudah tahu nama!
4. DILARANG menggunakan teks roleplay narasi tindakan (seperti *tersenyum*, *menghela napas* dll). Berbicaralah murni dengan teks langsung!
5. DILARANG menggunakan format JSON atau meta-komentar. Langsung berikan teks sapaan.`

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

        const timeoutId = setTimeout(() => {
          if (abortControllerRef.current) {
            console.log('[useMarkAgent] Timeout 10 detik tercapai, membatalkan greeting...')
            abortControllerRef.current.abort()
          }
        }, 10000)

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
            clearTimeout(timeoutId)
            const textContent = typeof res === 'object' && res.content ? res.content : String(res)
            setChatData((prev) => [
              ...prev.filter((item) => !item.isThinking),
              { role: 'ai', content: textContent, isProactive: true }
            ])
            setIsLoading(false)
            
            // Beri jeda agar React selesai merender currentResponse & animasi masuk
            setTimeout(() => {
              setIsBooting(false)
            }, 800)
          })
          .catch((err) => {
            clearTimeout(timeoutId)
            console.error('[useMarkAgent] Gagal fetch greeting:', err)
            
            if (err.name !== 'AbortError') {
              setChatData((prev) => [
                ...prev.filter((item) => !item.isThinking),
                { role: 'ai', content: 'Sistem baru saja direstart, tapi gue gagal terhubung ke server AI buat ngasih sapaan awal (mungkin server Groq lagi down atau timeout). Ada yang bisa gue bantu sekarang?', isProactive: true }
              ])
            } else {
              setChatData((prev) => prev.filter((item) => !item.isThinking))
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
