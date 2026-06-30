import { useState, useEffect, useRef } from 'react'
import { getAllConfig, createSession, insertSession, getChatData } from '../../api/db'
import { getTitleSession } from '../../api/ai/chat'

export const useMarkState = () => {
  const [chatData, setChatData] = useState([])
  const [config, setConfig] = useState([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeak, setIsSpeak] = useState(false)
  const [orbStatus, setOrbStatus] = useState('idle')
  const [currentResponse, setCurrentResponse] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [activeProcesses, setActiveProcesses] = useState([])
  const [inputSource, setInputSource] = useState('pc')
  const sessionId = useRef('mark-main-thread')

  const abortControllerRef = useRef(null)
  const searchProp = useRef({ userInput: '', signal: null, chatSession: null })

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data)
  }

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (chatData && chatData.length) {
      ;(async () => {
        const title = 'Jarvis Main Thread'
        // Just insert/update the main thread session
        const allSessions = await getAllConfig() // wait, get session?
        try {
          await insertSession(sessionId.current, chatData)
        } catch (e) {
          await createSession(title, chatData, sessionId.current)
        }
      })()
    }
  }, [chatData])

  const changeSession = async (id) => {
    // In Jarvis mode, we don't change session often, but we might load from history
    // We keep this for compatibility if needed.
    const chat = await getChatData(id)
    setChatData([...chat])
  }

  const pushNotification = (type, message) => {
    setNotifications(prev => [...prev, { id: Date.now() + Math.random(), type, message, timestamp: Date.now() }])
  }

  const pushProcess = (process) => {
    // process: { id, type, status, data }
    setActiveProcesses(prev => {
      const existing = prev.findIndex(p => p.id === process.id);
      if (existing !== -1) {
        // Update
        const next = [...prev];
        next[existing] = { ...next[existing], ...process };
        return next;
      }
      // Add new
      return [...prev, process];
    });
  }

  const dismissProcess = (id) => {
    setActiveProcesses(prev => prev.filter(p => p.id !== id));
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
  }

  return {
    chatData,
    setChatData,
    sessionId: sessionId.current,
    changeSession,
    config,
    setConfig,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    isSpeak,
    setIsSpeak,
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
    abortControllerRef,
    searchProp,
    handleStop
  }
}
