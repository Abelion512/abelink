import { createContext, useContext } from 'react'
import { useMarkAgent } from '../hooks/useMarkAgent'

export const ChatContext = createContext(null)

export const useChat = () => useContext(ChatContext)

export const ChatProvider = ({ children }) => {
  const markAgent = useMarkAgent()

  return (
    <ChatContext.Provider value={markAgent ?? {}}>
      {children}
    </ChatContext.Provider>
  )
}
