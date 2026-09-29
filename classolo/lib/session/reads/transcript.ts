import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import type { TranscriptPublic } from '../types'

export const initialTranscriptPublic: TranscriptPublic = {
  sessionId: null,
  recordingStatus: 'idle',
  committed: [],
  committedVersion: 0,
  latestCommittedId: null,
}

export const transcriptPublicStore = createStore(
  subscribeWithSelector<TranscriptPublic>(() => initialTranscriptPublic),
)

export function getTranscriptPublic(): TranscriptPublic {
  return transcriptPublicStore.getState()
}

export function subscribeTranscriptPublic<T>(
  selector: (state: TranscriptPublic) => T,
  listener: (selected: T, previous: T) => void,
): () => void {
  return transcriptPublicStore.subscribe(selector, listener)
}

export function useTranscriptPublic<T>(
  selector: (state: TranscriptPublic) => T,
): T {
  return useStore(transcriptPublicStore, selector)
}
