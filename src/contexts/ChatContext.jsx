import { useMarkAgent } from '../hooks/useMarkAgent'
import { ChatContext } from './chatContextDef'

export const ChatProvider = ({ children }) => {
  const markAgent = useMarkAgent()

  return (
    <ChatContext.Provider value={markAgent ?? {}}>
      {children}
    </ChatContext.Provider>
  )
}
