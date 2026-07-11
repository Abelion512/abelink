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
      
      const greetingPrompt = `[SYSTEM BOOT]: Aplikasi baru saja dinyalakan.
Tugasmu: Ucapkan sapaan singkat sesuai personality-mu.
Riwayat chat di atas hanya sebagai referensi konteks saja, tidak wajib disinggung.
LARANGAN KERAS:
- DILARANG mengeksekusi tool apapun (search, file, powershell, dll).
- DILARANG melanjutkan atau mengulang task/perintah apapun dari history chat.
Fokus hanya pada sapaan pembuka.`;

      // Trigger planning secara autonom tanpa bubble chat dari user
      handlePlanningCommand(greetingPrompt, null, true, null, {}, true);
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
