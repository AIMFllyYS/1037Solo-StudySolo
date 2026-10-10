'use client'

import {useEffect} from 'react'
import {useChatHistory} from '@/lib/stores/chat/chatHistory'
import {useNoteChangeProposals} from '@/lib/stores/assets/noteChangeProposals'
import {collectNoteChangeProposals} from '@/lib/notes/proposals/noteChangeProposal'

/** Proposal ingestion lives outside the optional note editor window. */
export default function UserNoteProposalRuntime(){
  const messagesById=useChatHistory(state=>state.messagesById)
  const ingestAll=useNoteChangeProposals(state=>state.ingestAll)
  useEffect(()=>{for(const [sessionId,messages] of Object.entries(messagesById))if(messages.length)ingestAll(collectNoteChangeProposals(messages,sessionId))},[messagesById,ingestAll])
  return null
}
