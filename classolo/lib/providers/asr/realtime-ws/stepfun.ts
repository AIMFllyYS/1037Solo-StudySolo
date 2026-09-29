import { resolveSecret } from '@/classolo/lib/providers/secrets'

import { hotwordsForStart } from '../hotwords'
import { MissingAsrSecretError } from '../missing-secret'
import type { ASRCapabilities, ASRConfig, ASRProvider, ASRSegment } from '../types'

export interface SocketLike {
  readyState: number
  send: (data: string) => void
  close: () => void
  addEventListener: (
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: { data?: string }) => void,
  ) => void
}

export type SocketFactory = (url: string) => SocketLike

const OPEN = 1

function encodePcmBase64(chunk: ArrayBuffer): string {
  const bytes = new Uint8Array(chunk)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

function defaultSocketFactory(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike
}

export class StepfunRealtimeWsProvider implements ASRProvider {
  readonly capabilities: ASRCapabilities = {
    streaming: 'realtime',
    supportsHotwords: true,
    maxSessionSeconds: null,
  }

  private apiKey: string | null = null
  private socket: SocketLike | null = null
  private readonly partialListeners = new Set<(segment: ASRSegment) => void>()
  private readonly finalListeners = new Set<(segment: ASRSegment) => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()
  private lastPartial = ''
  private audioQueue: ArrayBuffer[] = []
  private readonly maxQueue = 50
  private intentionalStop = false

  constructor(
    private readonly config: ASRConfig,
    private readonly socketFactory: SocketFactory = defaultSocketFactory,
  ) {}

  async start(): Promise<void> {
    if (!this.config.baseUrl.trim()) {
      throw new Error('缺 ASR baseURL：必须显式配置，禁止从地址推断协议族')
    }
    const secret = resolveSecret('asr')
    if (secret.value === null) {
      throw new MissingAsrSecretError()
    }
    this.apiKey = secret.value
    if (!this.config.model.trim()) {
      throw new Error('缺 ASR 模型：必须显式配置')
    }
    if (!this.config.sampleRate) {
      throw new Error('缺 ASR 采样率：必须显式配置')
    }

    this.intentionalStop = false
    const socket = this.socketFactory(this.config.baseUrl)
    this.socket = socket
    this.lastPartial = ''

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve())
      socket.addEventListener('error', () =>
        reject(new Error('ASR WebSocket 连接失败')),
      )
    })

    socket.addEventListener('message', (event) => {
      this.handleMessage(typeof event.data === 'string' ? event.data : '')
    })
    socket.addEventListener('close', () => {
      if (!this.intentionalStop) {
        this.emitError(new Error('ASR_DISCONNECTED'))
      }
    })

    const hotwords = hotwordsForStart(
      this.capabilities,
      this.config.hotwords,
    )
    const session: Record<string, unknown> = {
      model: this.config.model,
      api_key: this.apiKey,
      input_audio_format: 'pcm16',
      sample_rate: this.config.sampleRate,
    }
    if (hotwords !== undefined) {
      session.hotwords = hotwords
    }
    socket.send(
      JSON.stringify({
        type: 'session.update',
        session,
      }),
    )
    this.flushAudioQueue()
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.socket || this.socket.readyState !== OPEN) {
      this.audioQueue.push(chunk)
      if (this.audioQueue.length > this.maxQueue) {
        this.audioQueue.shift()
      }
      return
    }
    this.socket.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: encodePcmBase64(chunk),
      }),
    )
  }

  async stop(): Promise<void> {
    this.intentionalStop = true
    this.socket?.close()
    this.socket = null
    this.audioQueue = []
  }

  private flushAudioQueue(): void {
    const pending = this.audioQueue
    this.audioQueue = []
    for (const chunk of pending) {
      this.sendAudio(chunk)
    }
  }

  onPartial(cb: (segment: ASRSegment) => void): void {
    this.partialListeners.add(cb)
  }

  onFinal(cb: (segment: ASRSegment) => void): void {
    this.finalListeners.add(cb)
  }

  onError(cb: (error: Error) => void): void {
    this.errorListeners.add(cb)
  }

  private handleMessage(raw: string): void {
    if (!raw) return
    let payload: { type?: string; text?: string; transcript?: string }
    try {
      payload = JSON.parse(raw) as {
        type?: string
        text?: string
        transcript?: string
      }
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error('ASR 消息不是 JSON'))
      return
    }
    const type = payload.type ?? ''
    const text = payload.text ?? payload.transcript ?? ''
    if (type.includes('delta')) {
      this.lastPartial = text
      this.emit(this.partialListeners, { text, isFinal: false })
      return
    }
    if (type.includes('completed') || type.includes('committed')) {
      this.emit(this.finalListeners, {
        text: text || this.lastPartial,
        isFinal: true,
      })
      this.lastPartial = ''
    }
  }

  private emit(
    listeners: Set<(segment: ASRSegment) => void>,
    segment: ASRSegment,
  ): void {
    for (const listener of listeners) listener(segment)
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error)
  }
}
