import { patchTranscriptPublic } from '@/classolo/lib/session/writes/transcript'

import {
  floatToPcm16,
  peakLevel,
  resampleTo16k,
  TARGET_SAMPLE_RATE,
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

function fail(message: string): void {
  patchTranscriptPrivate({ status: 'idle', error: message, level: 0 })
  patchTranscriptPublic({ recordingStatus: 'idle' })
}

export function onPcmFrame(handler: PcmFrameHandler): void {
  pcmHandler = handler
}

export async function startCapture(deps: CaptureDeps = defaultDeps()): Promise<void> {
  patchTranscriptPrivate({ error: null })
  try {
    stream = await deps.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      fail('麦克风权限被拒绝')
      return
    }
    if (name === 'NotFoundError') {
      fail('未找到麦克风设备')
      return
    }
    fail('无法打开麦克风')
    return
  }

  const [track] = stream.getAudioTracks()
  track?.addEventListener('ended', () => {
    fail('麦克风设备已断开')
    void stopCapture()
  })

  audioContext = new deps.AudioContext({ sampleRate: 48000 })
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
  const workletUrl = URL.createObjectURL(blob)
  try {
    await audioContext.audioWorklet.addModule(workletUrl)
  } finally {
    URL.revokeObjectURL(workletUrl)
  }

  const source = audioContext.createMediaStreamSource(stream)
  node = new AudioWorkletNode(audioContext, 'pcm-capture')
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const input = event.data
    const resampled = resampleTo16k(input, audioContext?.sampleRate ?? TARGET_SAMPLE_RATE)
    patchTranscriptPrivate({ level: peakLevel(resampled) })
    pcmHandler?.(floatToPcm16(resampled))
  }
  source.connect(node)

  patchTranscriptPrivate({ status: 'recording', error: null })
  patchTranscriptPublic({ recordingStatus: 'recording' })
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

export async function stopCapture(): Promise<void> {
  node?.port.close()
  node?.disconnect()
  node = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (audioContext) {
    await audioContext.close()
    audioContext = null
  }
  patchTranscriptPrivate({ status: 'stopped', level: 0 })
  patchTranscriptPublic({ recordingStatus: 'stopped' })
}
