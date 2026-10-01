import { isClassHydrating,getClassUserId } from '@/classolo/lib/db'
import {createBoundedScheduler} from '@/classolo/lib/session/bounded-scheduler'
import {
  getNotesPublic,
  getTranscriptPublic,
  subscribeTranscriptPublic,
} from '@/classolo/lib/session'

import { deliverSilentRender } from './silent-deliver'

export const SILENT_AGENT_DEBOUNCE_MS = 6000
export const SILENT_AGENT_MIN_SEGMENTS = 3
export const SILENT_AGENT_MAX_WAIT_MS=12000

export type SilentAgentStatus = 'idle' | 'armed' | 'thinking'

export interface SilentAgentPrivateState {
  status: SilentAgentStatus
  lastFiredCommittedVersion: number
  lastFiredCount: number
  ticks: number
  lastOutlineVersion: number
}

export interface SilentAgentOptions {
  debounceMs?: number
  maxWaitMs?:number
  minNewSegments?: number
  subscribeCommitted?: (onCommitted: () => void) => () => void
  readCommittedCount?: () => number
  readCommittedVersion?: () => number
  readOutlineVersion?: () => number
  onTick?: (state: SilentAgentPrivateState) => void|Promise<void>
}

let resetScheduler:(()=>void)|null=null
let stopCurrent: (() => void) | null = null
let privateState: SilentAgentPrivateState = {
  status: 'idle',
  lastFiredCommittedVersion: 0,
  lastFiredCount: 0,
  ticks: 0,
  lastOutlineVersion: 0,
}

function defaultSubscribe(onCommitted: () => void): () => void {
  return subscribeTranscriptPublic(
    (state) => `${state.sessionId}:${state.committedVersion}`,
    onCommitted,
  )
}

export function getSilentAgentPrivateState(): SilentAgentPrivateState {
  return { ...privateState }
}

export function resetSilentAgentPrivateState(): void {
  resetScheduler?.()
  privateState = {
    status: 'idle',
    lastFiredCommittedVersion: 0,
    lastFiredCount: 0,
    ticks: 0,
    lastOutlineVersion: 0,
  }
}

export function startSilentAgent(
  options: SilentAgentOptions = {},
): () => void {
  stopCurrent?.()
  resetSilentAgentPrivateState()
  const debounceMs = options.debounceMs ?? SILENT_AGENT_DEBOUNCE_MS
  const minNewSegments = options.minNewSegments ?? SILENT_AGENT_MIN_SEGMENTS
  const readCommittedCount =
    options.readCommittedCount ?? (() => getTranscriptPublic().committed.length)
  const readCommittedVersion =
    options.readCommittedVersion ??
    (() => getTranscriptPublic().committedVersion)
  const readOutlineVersion =
    options.readOutlineVersion ?? (() => getNotesPublic().outlineVersion)
  const subscribeCommitted =
    options.subscribeCommitted ?? defaultSubscribe

  let scope=`${getClassUserId()}:${getTranscriptPublic().sessionId}`
  const scheduler=createBoundedScheduler({delayMs:debounceMs,maxWaitMs:options.maxWaitMs??SILENT_AGENT_MAX_WAIT_MS,run:async signal=>{
    if(isClassHydrating()||(!options.onTick&&!getTranscriptPublic().autoOrganize))return
    const count=readCommittedCount(),current=scope
    if(count-privateState.lastFiredCount<minNewSegments){privateState={...privateState,status:'idle'};return}
    privateState={status:'thinking',lastFiredCommittedVersion:readCommittedVersion(),lastFiredCount:count,ticks:privateState.ticks+1,lastOutlineVersion:readOutlineVersion()}
    if(options.onTick)await options.onTick(getSilentAgentPrivateState());else await deliverSilentRender(signal)
    if(!signal.aborted&&scope===current)privateState={...privateState,status:'idle'}
  }})
  resetScheduler=scheduler.reset
  const arm=()=>{
    const next=`${getClassUserId()}:${getTranscriptPublic().sessionId}`
    if(scope!==next||readCommittedCount()<privateState.lastFiredCount){scope=next;resetSilentAgentPrivateState()}
    if(isClassHydrating()||(!options.onTick&&!getTranscriptPublic().autoOrganize))return
    privateState={...privateState,status:'armed'};scheduler.schedule()
  }

  const unsubscribe = subscribeCommitted(arm)
  const stop = () => {
    unsubscribe()
    scheduler.stop();if(resetScheduler===scheduler.reset)resetScheduler=null
    if (stopCurrent === stop) stopCurrent = null
  }
  stopCurrent = stop
  return stop
}
