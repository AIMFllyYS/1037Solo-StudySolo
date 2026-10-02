'use client'

import {useEffect} from 'react'
import {useChatHistory} from '@/lib/stores/chatHistory'
import {syncMemoryInboxFromSessions} from '@/lib/stores/memoryInbox'

export default function MemoryInboxRuntime(){
  const messagesById=useChatHistory(state=>state.messagesById)
  const hydrated=useChatHistory(state=>state._hasHydrated)
  const ready=useChatHistory(state=>state._activeMessagesReady)
  useEffect(()=>{if(hydrated&&ready)syncMemoryInboxFromSessions(messagesById)},[messagesById,hydrated,ready])
  return null
}
