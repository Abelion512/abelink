import { useEffect, useRef } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import {
  useMarkState,
  useMarkSearch,
  useMarkYoutube,
  useMarkMusic,
  useMarkPlan
} from './agent'
import { useAwareness } from './useAwareness'
import { useChatArchiver } from './useChatArchiver'
import { formatForWhatsApp } from '../api/ai/utils'
import { useApproval } from '../contexts/ApprovalContext'
import { fetchAI } from '../api/ai/core'

export const useMarkAgent = () => {
  const { requestApproval } = useApproval()
  const youtubeMusicTools = useYoutubeMusic()

  const state = useMarkState()
  const {
    chatData, setChatData, clearChat,
    config, setConfig, message, setMessage,
    isLoading, setIsLoading, isAgentBusy, setIsAgentBusy, isSpeak, setIsSpeak, abortControllerRef,
    searchProp, handleStop,
    orbStatus, setOrbStatus, currentResponse, setCurrentResponse,
    notifications, pushNotification,
    activeProcesses, setActiveProcesses, pushProcess, dismissProcess,
    inputSource, setInputSource, activeTopic, setActiveTopic, isChatLoaded
  } = state

  const { receiveSearchResult, handleSearchCommand } = useMarkSearch(setChatData, chatData, searchProp, pushProcess, dismissProcess)
  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useMarkYoutube(setChatData)
  const { handleMusic } = useMarkMusic(setChatData, abortControllerRef, youtubeMusicTools)

  const tools = {
    handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData,
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
      hasGreetedRef.current = true;
      console.log('[useMarkAgent] Memicu pesan sambutan (Boot sequence)...');
      
      const greetingPrompt = `[SYSTEM BOOT SEQUENCE INITIATED]
Mark, sistem baru saja dinyalakan. Sapa penggunamu dengan gaya khasmu!
Kamu bebas bercanda, proaktif nanya kabar, atau siap nerima perintah.
(Tapi INGAT: Jangan gunakan markdown JSON dan JANGAN mengeksekusi tool apapun saat ini, cukup balas dengan pesan sapaan yang asik dan hidup!).`;

      // Gunakan fetchAI secara langsung tanpa masuk ke sistem planning agentic (handlePlanningCommand)
      // agar tidak stuck atau melakukan aksi aneh.
      setIsLoading(true);
      
      const contextMessages = chatData.length > 0 ? chatData.slice(-10).map(msg => ({
        role: msg.role === 'user' || msg.role === 'system' ? msg.role : 'assistant',
        content: typeof msg.content === 'object' ? JSON.stringify(msg.content) : String(msg.content || '')
      })) : [];

      fetchAI([
        { role: 'system', content: 'Kamu adalah asisten AI bernama Mark. Kamu punya kepribadian yang cerdas, agak sarkas tapi sangat membantu, dan sangat proaktif layaknya asisten pribadi elit. JANGAN gunakan format JSON, cukup ngobrol biasa.' },
        ...contextMessages,
        { role: 'user', content: greetingPrompt }
      ], abortControllerRef.current?.signal, false)
        .then(res => {
          const textContent = typeof res === 'object' && res.content ? res.content : String(res);
          setChatData(prev => [...prev, { role: 'ai', content: textContent, isProactive: true }]);
          setIsSpeak(true);
          setIsLoading(false);
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[useMarkAgent] Gagal fetch greeting:', err);
            setIsLoading(false);
          }
        });
    }
  }, [isChatLoaded, handlePlanningCommand]);

  useEffect(() => {
    const handleWaAdminMessage = (e) => {
      const data = e.detail;
      activeWaRequestRef.current = data;
      setInputSource('wa');
      handlePlanningCommand(data.text, data);
    };

    window.addEventListener('wa-admin-message', handleWaAdminMessage);
    return () => window.removeEventListener('wa-admin-message', handleWaAdminMessage);
  }, [handlePlanningCommand, setInputSource]);

  useEffect(() => {
    if (!isLoading && activeWaRequestRef.current && chatData.length > 0) {
      const lastAiMsg = [...chatData].reverse().find(m => m.role === 'ai' && !m.isThinking && !m.isSearching && !m.isSummarizing);
      if (lastAiMsg) {
        window.api?.sendWaAgentExecutionDone({ 
          jid: activeWaRequestRef.current.jid, 
          result: { answer: formatForWhatsApp(lastAiMsg.content) }, 
          msgId: activeWaRequestRef.current.msgId 
        });
        activeWaRequestRef.current = null;
        setInputSource('pc');
      }
    }
  }, [isLoading, chatData, setInputSource]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (isLoading) {
      handleStop()
    } else {
      handlePlanningCommand(message.trim())
    }
  }

  return {
    chatData, setChatData,
    clearChat,
    isSpeak, setIsSpeak,
    config,
    isLoading,
    message, setMessage,
    orbStatus, setOrbStatus,
    currentResponse, setCurrentResponse,
    notifications, pushNotification,
    activeProcesses, setActiveProcesses, pushProcess, dismissProcess,
    inputSource, setInputSource,
    handlePlanningCommand,
    handleStop,
    handleSubmit
  }
}
