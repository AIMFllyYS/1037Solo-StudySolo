import type { SessionWindowMeta } from "@/lib/chat/sessionTypes";

import type { ChatMessage } from '@/lib/types/chat';
import { type SessionWindowLoad, dropSessionTailCache, hasSessionWriteLease } from '@/lib/storage/chatStorage';
import { turnCountsOf, TURNS_PER_CHUNK, type TurnSpineEntry } from '@/lib/chat/turnSpine';
import { getMessageText } from '@/lib/chat/messageParts';

import { useSessionRuns } from '@/lib/stores/chat/sessionRuns';

import {DEFAULT_RESOURCE_BUDGETS} from '@/lib/performance/budgets';

import type { ChatHistoryState } from "./stateTypes";
export type LeaseReason='visible'|'stream'|'write'|'explicit-pin'
export const sessionLeases=new Map<string,Map<LeaseReason,number>>()
export const legacyPins=new Map<string,number>()
export const residentEstimates=new Map<string,{messages:ChatMessage[];bytes:number}>()
let pinnedPressureBytes=0
export function getHotSessionPressureBytes(){return pinnedPressureBytes}

export function estimateHotValueBytes(value:unknown):number{
  if(typeof value==='string')return value.length*2
  if(typeof value==='number'||typeof value==='boolean')return 8
  if(!value||typeof value!=='object')return 0
  if(ArrayBuffer.isView(value))return value.byteLength+32
  if(value instanceof ArrayBuffer)return value.byteLength+32
  if(typeof Blob!=='undefined'&&value instanceof Blob)return value.size+32
  if(Array.isArray(value))return 24+value.reduce((sum:number,item:unknown)=>sum+estimateHotValueBytes(item),0)
  return 32+Object.entries(value).reduce((sum,[key,item])=>sum+key.length*2+estimateHotValueBytes(item),0)
}
function estimateResident(id:string,messages:ChatMessage[]){
  const found=residentEstimates.get(id)
  if(found?.messages===messages)return found.bytes
  const bytes=estimateHotValueBytes(messages)
  residentEstimates.set(id,{messages,bytes})
  return bytes
}
export function updateResidentEstimate(id:string,before:ChatMessage[],after:ChatMessage[],oldMessage?:ChatMessage,newMessage?:ChatMessage){
  const previous=estimateResident(id,before)
  const bytes=oldMessage&&newMessage?Math.max(0,previous+estimateHotValueBytes(newMessage)-estimateHotValueBytes(oldMessage)):estimateHotValueBytes(after)
  residentEstimates.set(id,{messages:after,bytes})
}

export function applySessionWindow(
  state:ChatHistoryState,
  messages:Record<string,ChatMessage[]>,
  windows:Record<string,SessionWindowMeta|undefined>,
  lru:string[],
  loadState:ChatHistoryState['sessionLoadState'],
  protectId?:string,
):Pick<ChatHistoryState,'messagesById'|'sessionWindowById'|'loadedSessionIds'|'sessionLoadState'>{
  const messagesById={...messages},sessionWindowById={...windows},sessionLoadState={...loadState}
  const keys=Object.keys(messagesById),keySet=new Set(keys)
  const order=[...lru.filter(id=>keySet.has(id)),...keys.filter(id=>!lru.includes(id))]
  const protectedIds=new Set([state.activeSessionId,protectId,...state.pinnedSessionIds].filter(Boolean) as string[])
  for(const id of keys)if(sessionLeases.has(id)||useSessionRuns.getState().byId[id]?.phase==='running'||hasSessionWriteLease(id))protectedIds.add(id)
  let totalBytes=keys.reduce((sum,id)=>sum+estimateResident(id,messagesById[id]),0)
  let inactive=keys.filter(id=>!protectedIds.has(id)).length
  for(const id of order){
    if(inactive<=DEFAULT_RESOURCE_BUDGETS.inactiveHotSessions&&totalBytes<=DEFAULT_RESOURCE_BUDGETS.hotMessageEstimatedBytes)break
    if(protectedIds.has(id))continue
    totalBytes-=residentEstimates.get(id)?.bytes??0;inactive--
    delete messagesById[id];delete sessionWindowById[id];residentEstimates.delete(id)
    sessionLoadState[id]='idle';dropSessionTailCache(id)
  }
  for(const id of Object.keys(sessionWindowById))if(!messagesById[id])delete sessionWindowById[id]
  for(const id of residentEstimates.keys())if(!messagesById[id])residentEstimates.delete(id)
  pinnedPressureBytes=Math.max(0,totalBytes-DEFAULT_RESOURCE_BUDGETS.hotMessageEstimatedBytes)
  return {messagesById,sessionWindowById,loadedSessionIds:order.filter(id=>messagesById[id]!==undefined),sessionLoadState}
}

export function windowMetaFromLoad(load: SessionWindowLoad): SessionWindowMeta {
  return {
    startTurn: load.startTurn,
    startIndex: load.startIndex,
    turnCount: load.turnCount,
    messageCount: load.messageCount,
    spine: load.spine,
  };
}

export const EMPTY_WINDOW: SessionWindowMeta = { startTurn: 0, startIndex: 0, turnCount: 0, messageCount: 0, spine: [] };

/**
 * 追加消息时同步维护内存 spine（与存储层 buildChunkSpine 同一套规则：
 * user 消息开新轮，其余并入上一轮）。定位点 / 「还有更早」 / 派生计数立刻可见新轮，
 * 不必等下一次窗口加载。
 */
export function runtimeSpineAppend(spine: TurnSpineEntry[], message: ChatMessage, globalIndex: number): TurnSpineEntry[] {
  const last = spine[spine.length - 1];
  if (message.role === 'user' || !last) {
    const turn = last ? last.turn + 1 : 0;
    const isUser = message.role === 'user';
    return [
      ...spine,
      {
        turn,
        chunk: Math.floor(turn / TURNS_PER_CHUNK),
        firstIndex: globalIndex,
        messageCount: 1,
        firstMessageId: message.id,
        userMessageId: isUser ? message.id : null,
        preview: isUser ? getMessageText(message).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
        timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
        counts: turnCountsOf([message]),
      },
    ];
  }
  const add = turnCountsOf([message]);
  const next = spine.slice();
  next[next.length - 1] = {
    ...last,
    messageCount: last.messageCount + 1,
    counts: {
      sources: last.counts.sources + add.sources,
      images: last.counts.images + add.images,
      products: last.counts.products + add.products,
    },
  };
  return next;
}

export function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}
export function resetWindowRuntime(): void { sessionLeases.clear(); residentEstimates.clear(); pinnedPressureBytes = 0; legacyPins.clear(); }
