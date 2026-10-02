import type {ChatContext} from '@/lib/types/chat'

type ClassChatHistory={
  _hasHydrated:boolean
  sessionsMeta:readonly {id:string}[]
  createSession:(context:ChatContext)=>string
  switchSession:(id:string)=>void
  updateSessionTitle:(id:string,title:string)=>void
}

/** A Class question opens the conversation for that lesson, never an unrelated Studio chat. */
export function ensureClassChatSession(history:ClassChatHistory,owner:string|null,lessonId:string|null,context:ChatContext,title:string,storage:Pick<Storage,'getItem'|'setItem'>):string|null{
  if(!history._hasHydrated||!owner||!lessonId)return null
  const key=`ss-class-agent-chat:${owner}:${lessonId}`
  let saved:string|null=null
  try{saved=storage.getItem(key)}catch{}
  if(saved&&history.sessionsMeta.some(row=>row.id===saved)){history.switchSession(saved);return saved}
  const id=history.createSession(context)
  history.updateSessionTitle(id,`课堂问答 · ${title}`.slice(0,60))
  try{storage.setItem(key,id)}catch{}
  return id
}
