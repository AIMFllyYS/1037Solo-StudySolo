import {
  initialTranscriptPublic,
  transcriptPublicStore,
} from '../reads/transcript'
import type { TranscriptCommittedSegment, TranscriptPublic } from '../types'

export function patchTranscriptPublic(
  patch: Partial<
    Pick<TranscriptPublic, 'sessionId' | 'recordingStatus' | 'latestCommittedId'>
  >,
): void {
  transcriptPublicStore.setState(patch)
}

export function appendCommitted(segment: TranscriptCommittedSegment): void {
  transcriptPublicStore.setState((state) => ({
    committed: [...state.committed, segment],
    committedVersion: state.committedVersion + 1,
    latestCommittedId: segment.id,
  }))
}

export function resetTranscriptPublic(): void {
  transcriptPublicStore.setState(initialTranscriptPublic)
}
