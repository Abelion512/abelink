import { useState, useEffect, useRef } from 'react'
import { getAllConfig, saveMainThread, getMainThread } from '../../api/db'

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
  const [activeTopic, setActiveTopic] = useState(null)
  const [isChatLoaded, setIsChatLoaded] = useState(false)
  const sessionId = useRef('mark-main-thread')

  const abortControllerRef = useRef(null)
  const searchProp = useRef({ userInput: '', signal: null, chatSession: null })

  const loadConfig = async () => {
    const data = await getAllConfig()
    if (data.length > 0) setConfig(data)
  }

  useEffect(() => {
    loadConfig()
    loadMainThread()
  }, [])

  const loadMainThread = async () => {
    const data = await getMainThread()
    if (data && data.length > 0) {
      setChatData(data)
    }
    setIsChatLoaded(true)
  }

  useEffect(() => {
    // Save to DB on every change if not initial empty array
    if (chatData !== undefined && isChatLoaded) {
      saveMainThread(chatData)
    }
  }, [chatData, isChatLoaded])

  const clearChat = () => {
    setChatData([]) // saveMainThread will auto save the empty array
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
    activeTopic,
    setActiveTopic,
    isChatLoaded,
    abortControllerRef,
    searchProp,
    handleStop
  }
}
