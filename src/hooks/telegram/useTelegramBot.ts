import { useState, useEffect } from 'react'

interface TgMessage {
  type?: string
  sender?: string
  text?: string
  message?: string
  [key: string]: unknown
}

export const useTelegramBot = () => {
  const [status, setStatus] = useState('disconnected')
  const [messages, setMessages] = useState<TgMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [currentSender, setCurrentSender] = useState('')

  useEffect(() => {
    if (!window.api) return

    if (window.api.tgGetStatus) {
      window.api.tgGetStatus().then((res: unknown) => {
        const initialStatus = (res as { status?: string } | null)?.status
        if (initialStatus) setStatus(initialStatus)
      })
    }

    if (window.api.tgGetHistory) {
      window.api.tgGetHistory().then((history: unknown) => {
        const h = history as TgMessage[] | null | undefined
        if (h && h.length > 0) {
          setMessages(h)
        }
      })
    }

    if (window.api.onTgConnection) {
      window.api.onTgConnection((payload: unknown) => {
        setStatus(String(payload))
      })
    }

    if (window.api.onTgThinking) {
      window.api.onTgThinking((payload: unknown) => {
        const sender = (payload as { sender?: string } | null)?.sender
        setIsThinking(true)
        setCurrentSender(String(sender || ''))
      })
    }

    if (window.api.onTgMessage) {
      window.api.onTgMessage((payload: unknown) => {
        const data = (payload as TgMessage | null) || {}
        setMessages((prev) => [...prev, { type: 'incoming', ...data }])
      })
    }

    if (window.api.onTgReplySent) {
      window.api.onTgReplySent((payload: unknown) => {
        const data = (payload as TgMessage | null) || {}
        setMessages((prev) => [...prev, { type: 'outgoing', ...data }])
        setIsThinking(false)
      })
    }

    // Module-level Tauri listeners (onTg*) are shared across components
    // (ApprovalContext, GlobalListener, etc.). Individual component unmounts
    // must NOT call removeTgListeners() — it clears ALL shared listeners.
    // Listeners live for the app lifetime; cleanup is intentionally omitted.
  }, [])

  const startBot = async (token: string) => {
    if (window.api?.tgStart) {
      try {
        await window.api.tgStart(token)
      } catch (e) {
        console.warn('[TelegramBot] Start bot dibatalkan atau gagal:', (e as Error)?.message || e)
      }
    }
  }

  const stopBot = async () => {
    if (window.api?.tgStop) {
      try {
        await window.api.tgStop()
      } catch (e) {
        console.warn('[TelegramBot] Stop bot dibatalkan atau gagal:', (e as Error)?.message || e)
      }
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
