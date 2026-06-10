import { useState, useEffect, useRef } from 'react'
import { getAllConfig, createSession, insertSession, getChatData } from '../../api/db'
import { getTitleSession } from '../../api/ai/chat'

export const useMarkState = () => {
  const [chatData, setChatData] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [isAction, setIsAction] = useState({ web: false, plan: true })
  const [config, setConfig] = useState([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeak, setIsSpeak] = useState(false)

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
      if (!sessionId) {
        ;(async () => {
          const title = await getTitleSession(chatData[0].content)
          const id = await createSession(title, chatData)
          setSessionId(id)
        })()
      } else {
        ;(async () => {
          await insertSession(sessionId, chatData)
        })()
      }
    }
  }, [chatData])

  const changeSession = async (id) => {
    setSessionId(id)
    const chat = await getChatData(id)
    setChatData([...chat])
  }

  const handleStop = () => {
    abortControllerRef.current?.abort()
  }

  return {
    chatData,
    setChatData,
    sessionId,
    setSessionId,
    changeSession,
    isAction,
    setIsAction,
    config,
    setConfig,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    isSpeak,
    setIsSpeak,
    abortControllerRef,
    searchProp,
    handleStop
  }
}
