import { createContext, useContext } from 'react'
import { useAbelinkAgent } from '../hooks/useAbelinkAgent'

export const ChatContext = createContext(null)

export const useChat = () => useContext(ChatContext)

export const ChatProvider = ({ children }) => {
  const abelinkAgent = useAbelinkAgent()

  return (
    <ChatContext.Provider value={abelinkAgent ?? {}}>
      {children}
    </ChatContext.Provider>
  )
}
