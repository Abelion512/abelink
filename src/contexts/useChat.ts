import { createContext, useContext } from 'react'

export const ChatContext = createContext<Record<string, unknown> | null>(null)

export const useChat = () => useContext(ChatContext)
