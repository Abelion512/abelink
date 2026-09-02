import { useState, useEffect } from 'react'

export const useTelegramBot = () => {
  const [status, setStatus] = useState('disconnected')
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')

  useEffect(() => {
    if (!window.api) return

    if (window.api.tgGetStatus) {
      window.api.tgGetStatus().then(({ status: initialStatus }) => {
        if (initialStatus) setStatus(initialStatus)
      })
    }

    if (window.api.tgGetHistory) {
      window.api.tgGetHistory().then((history) => {
        if (history && history.length > 0) {
          setMessages(history)
        }
      })
    }

    if (window.api.onTgConnection) {
      window.api.onTgConnection((newStatus) => {
        setStatus(newStatus)
      })
    }

    if (window.api.onTgThinking) {
      window.api.onTgThinking(({ sender }) => {
        setIsThinking(true)
        setCurrentSender(sender)
      })
    }

    if (window.api.onTgMessage) {
      window.api.onTgMessage((data) => {
        setMessages((prev) => [...prev, { type: 'incoming', ...data }])
      })
    }

    if (window.api.onTgReplySent) {
      window.api.onTgReplySent((data) => {
        setMessages((prev) => [...prev, { type: 'outgoing', ...data }])
        setIsThinking(false)
      })
    }

    // Module-level Tauri listeners (onTg*) are shared across components
    // (ApprovalContext, GlobalListener, etc.). Individual component unmounts
    // must NOT call removeTgListeners() — it clears ALL shared listeners.
    // Listeners live for the app lifetime; cleanup is intentionally omitted.
  }, [])

  const startBot = (token) => {
    if (window.api?.tgStart) {
      window.api.tgStart(token)
    }
  }

  const stopBot = () => {
    if (window.api?.tgStop) {
      window.api.tgStop()
    }
  }

  return {
    status,
    messages,
    isThinking,
    currentSender,
    startBot,
    stopBot
  }
}
