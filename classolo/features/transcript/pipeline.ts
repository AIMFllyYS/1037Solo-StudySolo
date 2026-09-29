import { resetNotesPublic } from '@/classolo/lib/session/writes/notes'
import { resetRenderProjection } from '@/classolo/lib/session/writes/render'
import { getDb,updateSession,getClassUserId } from '@/classolo/lib/db'
import { getTranscriptPublic } from '@/classolo/lib/session'
import { createASRProvider, type ASRProvider } from '@/classolo/lib/providers/asr'
import { subscribeCommands } from '@/classolo/lib/session'
import {
  appendCommitted,
  patchTranscriptPublic,
  resetTranscriptPublic,
} from '@/classolo/lib/session/writes/transcript'

import { readAsrRuntimeConfig } from './asr-config'
import {
  onPcmFrame,
  pauseCapture,
  resumeCapture,
  startCapture,
  stopCapture,
} from './capture'
import {
  persistRecordingSession,
  transcriptFlusher,
} from './flush-runtime'
import { patchTranscriptPrivate, resetTranscriptPrivate } from './private-store'

let provider: ASRProvider | null = null
let seq = 0

function warnMissingAnchor(segmentId: string): void {
  console.warn(`[transcript] segment not found: ${segmentId}`)
}

function consumeCommands(): void {
  subscribeCommands((command) => {
    if (command.type === 'transcript.scrollTo') {
      if (typeof document === 'undefined') return
      const node = document.querySelector(
        `[data-segment-id="${command.segmentId}"]`,
      )
      if (!(node instanceof HTMLElement)) {
        warnMissingAnchor(command.segmentId)
        return
      }
      node.scrollIntoView({ block: 'center' })
      patchTranscriptPrivate({ highlightId: command.segmentId })
      return
    }
    if (command.type === 'transcript.highlight') {
      if (typeof document === 'undefined') return
      const node = document.querySelector(
        `[data-segment-id="${command.segmentId}"]`,
      )
      if (!(node instanceof HTMLElement)) {
        warnMissingAnchor(command.segmentId)
        return
      }
      patchTranscriptPrivate({ highlightId: command.segmentId })
      return
    }
    if (command.type === 'asr.configChanged') {
      patchTranscriptPrivate({
        error: 'ASR 配置已保存，将在下次录音生效',
      })
      return
    }
    if (command.type === 'session.reset') {
      void stopSession()
      resetTranscriptPrivate()
      resetTranscriptPublic()
      seq = 0
    }
  })
}

consumeCommands()

export async function startSession(): Promise<void> {
  resetTranscriptPublic()
  resetNotesPublic()
  resetRenderProjection()
  seq = 0
  const sessionId = crypto.randomUUID()
  const owner=getClassUserId()
  transcriptFlusher.attach(sessionId)
  patchTranscriptPublic({
    sessionId,
    recordingStatus: 'recording',
    latestCommittedId: null,
  })
  patchTranscriptPrivate({ error: null, partial: '', highlightId: null })
  try {
    await persistRecordingSession(sessionId)
  } catch (error) {
    patchTranscriptPrivate({error:error instanceof Error?error.message:"课堂无法保存",status:"idle"})
    patchTranscriptPublic({recordingStatus:"idle"})
    return
  }

  const asr = createASRProvider(readAsrRuntimeConfig())
  patchTranscriptPrivate({ streaming: asr.capabilities.streaming })
  asr.onPartial((segment) => {
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    patchTranscriptPrivate({ partial: segment.text })
  })
  asr.onFinal((segment) => {
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    seq += 1
    const id = crypto.randomUUID()
    appendCommitted({
      id,
      seq,
      text: segment.text,
      startMs: segment.startMs ?? 0,
      endMs: segment.endMs ?? 0,
    })
    transcriptFlusher.enqueue({
      id,
      seq,
      startMs: segment.startMs ?? 0,
      endMs: segment.endMs ?? 0,
      text: segment.text,
    })
    void transcriptFlusher.flush(false)
    patchTranscriptPrivate({ partial: '' })
  })
  asr.onError((error) => {
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    if (error.message === 'ASR_DISCONNECTED') {
      patchTranscriptPrivate({ connection: 'reconnecting' })
      void asr
        .start()
        .then(() => {
          patchTranscriptPrivate({ connection: 'live', error: null })
        })
        .catch((reconnectError: unknown) => {
          const message =
            reconnectError instanceof Error
              ? reconnectError.message
              : 'ASR 重连失败'
          patchTranscriptPrivate({ error: message })
        })
      return
    }
    patchTranscriptPrivate({ error: error.message })
  })
  try {
    await asr.start()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ASR 启动失败'
    patchTranscriptPrivate({ error: message, status: 'idle', connection: 'idle' })
    patchTranscriptPublic({ recordingStatus: 'idle' })
    return
  }
  patchTranscriptPrivate({ connection: 'live' })
  provider = asr
  onPcmFrame((frame) => {
    const bytes = new Uint8Array(
      frame.buffer,
      frame.byteOffset,
      frame.byteLength,
    )
    asr.sendAudio(bytes.slice().buffer)
  })
  await startCapture()
}

export async function pauseSession(): Promise<void> {
  await pauseCapture()
  await transcriptFlusher.flush(true)
}

export async function resumeSession(): Promise<void> {
  await resumeCapture()
}

export async function stopSession(): Promise<void> {
  const current=getTranscriptPublic();const db=await getDb().catch(()=>null);
  const active=provider;provider=null;
  await stopCapture()
  await active?.stop()
  await transcriptFlusher.flush(true)
  if(current.sessionId&&db){try{await updateSession(db,current.sessionId,{status:'ended'});}catch{}}
}
