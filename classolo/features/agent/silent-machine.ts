import { isClassHydrating } from '@/classolo/lib/db'
import {
  getNotesPublic,
  getTranscriptPublic,
  subscribeTranscriptPublic,
} from '@/classolo/lib/session'

import { deliverSilentRender } from './silent-deliver'

export const SILENT_AGENT_DEBOUNCE_MS = 6000
export const SILENT_AGENT_MIN_SEGMENTS = 3

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
  minNewSegments?: number
  subscribeCommitted?: (onCommitted: () => void) => () => void
  readCommittedCount?: () => number
  readCommittedVersion?: () => number
  readOutlineVersion?: () => number
  onTick?: (state: SilentAgentPrivateState) => void
}

let timer: ReturnType<typeof setTimeout> | null = null
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
    (state) => state.committedVersion,
    () => {
      if(!isClassHydrating())onCommitted()
    },
  )
}

export function getSilentAgentPrivateState(): SilentAgentPrivateState {
  return { ...privateState }
}

export function resetSilentAgentPrivateState(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
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

  const arm = () => {
    privateState = { ...privateState, status: 'armed' }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const version = readCommittedVersion()
      const count = readCommittedCount()
      const grown = count - privateState.lastFiredCount
      if (grown < minNewSegments) {
        privateState = { ...privateState, status: 'idle' }
        return
      }
      privateState = {
        status: 'thinking',
        lastFiredCommittedVersion: version,
        lastFiredCount: count,
        ticks: privateState.ticks + 1,
        lastOutlineVersion: readOutlineVersion(),
      }
      options.onTick?.(getSilentAgentPrivateState())
      if (!options.onTick) {
        deliverSilentRender()
      }
      privateState = { ...privateState, status: 'idle' }
    }, debounceMs)
  }

  const unsubscribe = subscribeCommitted(arm)
  const stop = () => {
    unsubscribe()
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (stopCurrent === stop) stopCurrent = null
  }
  stopCurrent = stop
  return stop
}
