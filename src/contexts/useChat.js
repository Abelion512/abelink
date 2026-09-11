import { useContext } from 'react'
import { ChatContext } from './chatContextDef'

export const useChat = () => useContext(ChatContext)
