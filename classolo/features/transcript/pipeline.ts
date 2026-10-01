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
import {getClassCourseDraft} from '@/classolo/lib/course/preference'
import {
  onPcmFrame,
  onCaptureEnded,
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
let startTask:Promise<void>|null=null
let stopTask:Promise<void>|null=null
let runtimeGeneration=0

function consumeCommands(): void {
  subscribeCommands((command) => {
    if (command.type === 'transcript.scrollTo') {
      patchTranscriptPrivate({ highlightId: command.segmentId })
      return
    }
    if (command.type === 'transcript.highlight') {
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
      void stopSession().then(()=>{resetTranscriptPrivate();resetTranscriptPublic();seq=0}).catch(()=>{})
    }
  })
}

consumeCommands()

export function startSession(): Promise<void> {
  if(startTask)return startTask
  if(stopTask)return stopTask
  if(provider)return Promise.resolve()
  patchTranscriptPrivate({lifecycle:'starting'})
  startTask=startSessionRuntime().finally(()=>{startTask=null;if(!stopTask)patchTranscriptPrivate({lifecycle:'idle'})})
  return startTask
}

async function startSessionRuntime():Promise<void>{
  const generation=++runtimeGeneration
  const previous=getTranscriptPublic()
  const sessionId = crypto.randomUUID()
  const owner=getClassUserId()
  const profile=getClassCourseDraft()
  if(!owner){patchTranscriptPrivate({error:'请先登录统一账号'});return}
  const earlyFrames:Int16Array[]=[]
  onPcmFrame(frame=>earlyFrames.push(frame))
  patchTranscriptPrivate({ error: null, partial: '', highlightId: null })
  try {
    await transcriptFlusher.flush(true)
    if(transcriptFlusher.pendingCount())throw new Error('上一节课尚有未保存文稿，请先重试保存')
    const captured=await startCapture()
    if(!captured){if(getClassUserId()===owner)patchTranscriptPublic({recordingStatus:previous.recordingStatus});return}
    if(generation!==runtimeGeneration||getClassUserId()!==owner){await stopCapture(false);return}
    await persistRecordingSession(sessionId,profile)
    if(generation!==runtimeGeneration||getClassUserId()!==owner){await stopCapture(false);return}
    transcriptFlusher.attach(sessionId)
  } catch (error) {
    await stopCapture(false)
    patchTranscriptPrivate({error:error instanceof Error?error.message:"课堂无法保存",status:"idle"})
    if(getClassUserId()===owner)patchTranscriptPublic({recordingStatus:previous.recordingStatus})
    return
  }

  resetTranscriptPublic();resetNotesPublic();resetRenderProjection();seq=0
  patchTranscriptPublic({sessionId,recordingStatus:'recording',latestCommittedId:null,autoOrganize:true})

  const asr = createASRProvider(readAsrRuntimeConfig(profile))
  patchTranscriptPrivate({ streaming: asr.capabilities.streaming })
  asr.onPartial((segment) => {
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    patchTranscriptPrivate({ partial: segment.text })
  })
  asr.onFinal((segment) => {
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    const segmentSeq=segment.seq??seq+1
    seq=Math.max(seq,segmentSeq)
    const id = segment.id||crypto.randomUUID()
    appendCommitted({
      id,
      seq:segmentSeq,
      text: segment.text,
      startMs: segment.startMs ?? 0,
      endMs: segment.endMs ?? 0,
    })
    transcriptFlusher.enqueue({
      id,
      seq:segmentSeq,
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
    await stopCapture(false)
    await asr.stop().catch(()=>{})
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
  onCaptureEnded(()=>{void stopSession().catch(()=>{})})
  for(const frame of earlyFrames)asr.sendAudio(frame.slice().buffer)
}

export async function pauseSession(): Promise<void> {
  await pauseCapture()
  await transcriptFlusher.flush(true)
}

export async function resumeSession(): Promise<void> {
  await resumeCapture()
}

export function stopSession(): Promise<void> {
  if(stopTask)return stopTask
  runtimeGeneration++
  patchTranscriptPrivate({lifecycle:'stopping'})
  stopTask=(async()=>{
    const starting=startTask
    await stopCapture(false)
    await starting
    onCaptureEnded(null)
    const current=getTranscriptPublic(),db=await getDb().catch(()=>null),active=provider
    await active?.stop()
    await transcriptFlusher.flush(true)
    if(transcriptFlusher.pendingCount())throw new Error('课堂尾段尚未保存，请重试保存，暂勿切换课堂')
    provider=null
    if(active&&current.sessionId&&db)await updateSession(db,current.sessionId,{status:'ended'})
    patchTranscriptPrivate({connection:'idle',partial:''})
    patchTranscriptPublic({recordingStatus:'stopped'})
  })().catch(error=>{
    patchTranscriptPrivate({error:error instanceof Error?error.message:'课堂结束保存失败'})
    throw error
  }).finally(()=>{stopTask=null;patchTranscriptPrivate({lifecycle:'idle'})})
  return stopTask
}
