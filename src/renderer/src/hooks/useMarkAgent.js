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
import { formatForWhatsApp } from '../api/ai/utils'

export const useMarkAgent = () => {
  const youtubeMusicTools = useYoutubeMusic()

  const state = useMarkState()
  const {
    chatData, setChatData, clearChat,
    config, setConfig, message, setMessage,
    isLoading, setIsLoading, isSpeak, setIsSpeak, abortControllerRef,
    searchProp, handleStop,
    orbStatus, setOrbStatus, currentResponse, setCurrentResponse,
    notifications, pushNotification,
    activeProcesses, setActiveProcesses, pushProcess, dismissProcess,
    inputSource, setInputSource
  } = state

  const { receiveSearchResult, handleSearchCommand } = useMarkSearch(setChatData, chatData, searchProp, pushProcess, dismissProcess)
  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useMarkYoutube(setChatData)
  const { handleMusic } = useMarkMusic(setChatData, abortControllerRef, youtubeMusicTools)

  const tools = {
    handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData
  }

  const { handlePlanningCommand } = useMarkPlan({ ...state, ...tools })

  useAwareness({
    isLoading,
    setChatData,
    setOrbStatus,
    config,
    chatData
  })

  const activeWaRequestRef = useRef(null)

  useEffect(() => {
    const handleWaAdminMessage = (e) => {
      const data = e.detail;
      activeWaRequestRef.current = data;
      setInputSource('wa');
      handlePlanningCommand(data.text);
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
