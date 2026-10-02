import { patchTranscriptPublic } from '@/classolo/lib/session/writes/transcript'

import {
  floatToPcm16,
  peakLevel,
  createStreamingResampler,
} from './resample'
import { patchTranscriptPrivate } from './private-store'

const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length > 0) {
      this.port.postMessage(channel)
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCaptureProcessor)
`

export interface CaptureDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  AudioContext: typeof AudioContext
}

export type PcmFrameHandler = (frame: Int16Array) => void

const defaultDeps = (): CaptureDeps => ({
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  AudioContext: window.AudioContext,
})

let stream: MediaStream | null = null
let audioContext: AudioContext | null = null
let node: AudioWorkletNode | null = null
let pcmHandler: PcmFrameHandler | null = null
let onDeviceEnded:(()=>void)|null=null
let captureGeneration=0
let cancelPendingOpen:(()=>void)|null=null
const MICROPHONE_OPEN_TIMEOUT_MS=15_000

export function onCaptureEnded(handler:(()=>void)|null){onDeviceEnded=handler}

function fail(message: string): void {
  patchTranscriptPrivate({ status: 'idle', error: message, level: 0 })
  patchTranscriptPublic({ recordingStatus: 'idle' })
}

export function onPcmFrame(handler: PcmFrameHandler): void {
  pcmHandler = handler
}

export async function startCapture(deps: CaptureDeps = defaultDeps()): Promise<boolean> {
  const generation=++captureGeneration
  patchTranscriptPrivate({ error: null })
  try {
    let timedOut=false
    let timeout:ReturnType<typeof setTimeout>|null=null
    const opening=deps.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    // A browser permission prompt can remain unresolved indefinitely. Keep the
    // late stream under our control so a later grant cannot start a recording.
    const guarded=opening.then(opened=>{
      if(timedOut||generation!==captureGeneration)opened.getTracks().forEach(track=>track.stop())
      return opened
    })
    const cancelled=new Promise<never>((_,reject)=>{
      cancelPendingOpen=()=>reject(new DOMException('Recording start cancelled','AbortError'))
    })
    const expired=new Promise<never>((_,reject)=>{
      timeout=setTimeout(()=>{timedOut=true;reject(new DOMException('Microphone prompt timed out','TimeoutError'))},MICROPHONE_OPEN_TIMEOUT_MS)
    })
    let opened:MediaStream
    try{opened=await Promise.race([guarded,cancelled,expired])}
    finally{if(timeout)clearTimeout(timeout);cancelPendingOpen=null}
    if(generation!==captureGeneration){opened.getTracks().forEach(track=>track.stop());return false}
    stream=opened
  } catch (error) {
    const name = error && typeof error==='object' && 'name' in error ? String(error.name) : ''
    if(name==='AbortError')return false
    if(name==='TimeoutError'){
      fail('麦克风授权等待超时。请检查浏览器权限提示和输入设备后重试')
      return false
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      fail('麦克风权限被拒绝')
      return false
    }
    if (name === 'NotFoundError') {
      fail('未找到麦克风设备')
      return false
    }
    fail('无法打开麦克风')
    return false
  }

  const [track] = stream.getAudioTracks()
  track?.addEventListener('ended', () => {
    if(generation!==captureGeneration)return
    patchTranscriptPrivate({error:'麦克风设备已断开，正在保存已采集内容'})
    if(onDeviceEnded)onDeviceEnded();else void stopCapture()
  })

  try{
  audioContext = new deps.AudioContext({ sampleRate: 48000 })
  const context=audioContext
  const resampler=createStreamingResampler(context.sampleRate)
  let lastLevelAt=0
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
  const workletUrl = URL.createObjectURL(blob)
  try {
    await audioContext.audioWorklet.addModule(workletUrl)
  } finally {
    URL.revokeObjectURL(workletUrl)
  }
  if(generation!==captureGeneration)return false

  const source = audioContext.createMediaStreamSource(stream)
  node = new AudioWorkletNode(audioContext, 'pcm-capture')
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const input = event.data
    if(generation!==captureGeneration)return
    const resampled = resampler.process(input)
    if(Date.now()-lastLevelAt>=50){lastLevelAt=Date.now();patchTranscriptPrivate({ level: peakLevel(resampled) })}
    pcmHandler?.(floatToPcm16(resampled))
  }
  source.connect(node)

  patchTranscriptPrivate({ status: 'recording', error: null })
  return true
  }catch{
    await stopCapture()
    fail('麦克风音频处理初始化失败，请重试或导入文稿')
    return false
  }
}

export async function pauseCapture(): Promise<void> {
  if (audioContext && audioContext.state === 'running') {
    await audioContext.suspend()
  }
  patchTranscriptPrivate({ status: 'paused' })
  patchTranscriptPublic({ recordingStatus: 'paused' })
}

export async function resumeCapture(): Promise<void> {
  if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume()
  }
  patchTranscriptPrivate({ status: 'recording', error: null })
  patchTranscriptPublic({ recordingStatus: 'recording' })
}

export async function stopCapture(publishStopped=true): Promise<void> {
  captureGeneration++
  cancelPendingOpen?.()
  cancelPendingOpen=null
  node?.port.close()
  node?.disconnect()
  node = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (audioContext) {
    const closing=audioContext;audioContext=null
    if(closing.state!=='closed')await closing.close()
  }
  patchTranscriptPrivate({ status: 'stopped', level: 0 })
  if(publishStopped)patchTranscriptPublic({ recordingStatus: 'stopped' })
}
