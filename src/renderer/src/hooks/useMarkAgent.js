import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import {
  useMarkState,
  useMarkSearch,
  useMarkYoutube,
  useMarkMusic,
  useMarkChat,
  useMarkPlan
} from './agent'

export const useMarkAgent = () => {
  const youtubeMusicTools = useYoutubeMusic()

  const state = useMarkState()
  const {
    chatData, setChatData, sessionId, setSessionId, changeSession,
    isAction, setIsAction, config, setConfig, message, setMessage,
    isLoading, setIsLoading, isSpeak, setIsSpeak, abortControllerRef,
    searchProp, handleStop
  } = state

  const { receiveSearchResult, handleSearchCommand } = useMarkSearch(setChatData, chatData, searchProp)
  const { handleYoutubeSearch, handleYoutubeSummary, getYoutubeData } = useMarkYoutube(setChatData)
  const { handleMusic } = useMarkMusic(setChatData, abortControllerRef, youtubeMusicTools)

  const tools = {
    handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic, getYoutubeData
  }

  const { handleAIResponse } = useMarkChat({ ...state, ...tools })
  const { handlePlanningCommand } = useMarkPlan({ ...state, ...tools })

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (isLoading) {
      handleStop()
    } else {
      if (isAction.plan) {
        handlePlanningCommand(message.trim())
      } else {
        handleAIResponse(message.trim())
      }
    }
  }

  return {
    chatData, setChatData,
    sessionId, setSessionId, changeSession,
    isAction, setIsAction,
    isSpeak, setIsSpeak,
    config,
    isLoading,
    message, setMessage,
    handleAIResponse,
    handleStop,
    handleSubmit
  }
}
