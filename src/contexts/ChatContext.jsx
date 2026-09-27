import { useAbelinkAgent } from '../hooks/useAbelinkAgent'
import { ChatContext, useChat } from './useChat'

export { ChatContext, useChat }

export const ChatProvider = ({ children }) => {
  const abelinkAgent = useAbelinkAgent()

  return (
    <ChatContext.Provider value={abelinkAgent ?? {}}>
      {children}
    </ChatContext.Provider>
  )
}
