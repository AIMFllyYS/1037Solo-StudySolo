import { set, update } from 'idb-keyval'
import { getClassUserId } from '@/classolo/lib/db'
import { getTranscriptPublic } from '@/classolo/lib/session'
import { resolveSecret } from '@/classolo/lib/providers/secrets'

import { hotwordsForStart } from '../hotwords'
import { MissingAsrSecretError } from '../missing-secret'
import type { ASRCapabilities, ASRConfig, ASRProvider, ASRSegment } from '../types'

export const REST_SLICE_MS = 8000

export interface TranscriptionsRequest {
  ownerId?:string
  sessionId?:string
  url: string
  apiKey: string
  model: string
  wav: ArrayBuffer
  /** 热词上下文（学科热词包 + 自定义热词），由服务端转给识别模型作偏置提示。 */
  prompt?: string
}

export type TranscriptionsFetch = (
  request: TranscriptionsRequest,
) => Promise<string>

function transcriptionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/audio/transcriptions')) return trimmed
  return `${trimmed}/audio/transcriptions`
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

export function pcm16ToWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const dataBytes = pcm.byteLength
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))
  return buffer
}

/** 与服务端 /api/class/asr 的 prompt 上限保持一致。 */
export const HOTWORD_PROMPT_MAX = 600

/** 热词 → 识别上下文：去重、按总长上限截断；无热词返回 undefined（不发该字段）。 */
export function buildHotwordPrompt(words: readonly string[] | undefined): string | undefined {
  if (!words || words.length === 0) return undefined
  const out: string[] = []
  let length = 0
  for (const raw of new Set(words.map((w) => w.trim()).filter(Boolean))) {
    if (length + raw.length + 1 > HOTWORD_PROMPT_MAX - 20) break
    out.push(raw)
    length += raw.length + 1
  }
  return out.length ? `本节课可能出现的专有名词：${out.join('、')}` : undefined
}

async function defaultFetch(request: TranscriptionsRequest): Promise<string> {
  const owner=request.ownerId||getClassUserId(); const sessionId=request.sessionId||getTranscriptPublic().sessionId;
  if(!owner||!sessionId)throw new Error('课堂账号或会话已失效');
  const requestId=crypto.randomUUID();
  const audioKey=`ss-class-audio:${owner}:${sessionId}:${requestId}`;
  await set(audioKey,request.wav);
  await update<{key:string;sessionId:string;bytes:number;createdAt:number}[]>(`ss-class-audio-index:${owner}`,rows=>[...(rows||[]),{key:audioKey,sessionId,bytes:request.wav.byteLength,createdAt:Date.now()}]);
  if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)throw new Error('课堂账号已切换');
  const form = new FormData()
  form.append(
    'file',
    new Blob([request.wav], { type: 'audio/wav' }),
    'slice.wav',
  )
  form.append('model', request.model)
  form.append('response_format', 'json')
  if (request.prompt) form.append('prompt', request.prompt)
  const response = await fetch(request.url, {
    method: 'POST',
    credentials: 'include',
    headers: {'X-Request-Id':requestId},
    body: form,
  })
  if (!response.ok) {
    throw new Error(`ASR REST ${response.status}`)
  }
  const body: unknown = await response.json()
  if (typeof body === 'object' && body !== null && 'text' in body) {
    const text = (body as { text: unknown }).text
    if (typeof text === 'string') return text
  }
  throw new Error('ASR REST 响应缺少 text')
}

export class OpenAiCompatibleTranscriptionsProvider implements ASRProvider {
  readonly capabilities: ASRCapabilities = {
    streaming: 'pseudo',
    // Qwen3-ASR 支持上下文偏置：热词经 BFF 以 prompt 字段转发（长度有上限）。
    supportsHotwords: true,
    maxSessionSeconds: null,
  }

  private readonly chunks: Int16Array[] = []
  private samples = 0
  private sliceStartMs = 0
  private inflight: Promise<void> | null = null
  private running = false
  private ownerId:string|undefined
  private sessionId:string|undefined
  private prompt:string|undefined
  private readonly partialListeners = new Set<(segment: ASRSegment) => void>()
  private readonly finalListeners = new Set<(segment: ASRSegment) => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()

  constructor(
    private readonly config: ASRConfig,
    private readonly transcribe: TranscriptionsFetch = defaultFetch,
  ) {}

  async start(): Promise<void> {
    if (!this.config.baseUrl.trim()) {
      throw new Error('缺 ASR baseURL：必须显式配置，禁止从地址推断协议族')
    }
    const secret = resolveSecret('asr')
    if (secret.value === null) {
      throw new MissingAsrSecretError()
    }
    if (!this.config.model.trim()) {
      throw new Error('缺 ASR 模型：必须显式配置')
    }
    if (!this.config.sampleRate) {
      throw new Error('缺 ASR 采样率：必须显式配置')
    }
    this.prompt = buildHotwordPrompt(hotwordsForStart(this.capabilities, this.config.hotwords))
    this.ownerId=getClassUserId()||undefined
    this.sessionId=getTranscriptPublic().sessionId||undefined
    if(!this.ownerId||!this.sessionId)throw new Error("请先登录并创建课堂")
    this.running = true
    this.sliceStartMs = 0
    this.chunks.length = 0
    this.samples = 0
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.running) return
    const pcm = new Int16Array(chunk.slice(0))
    this.chunks.push(pcm)
    this.samples += pcm.length
    const threshold = Math.floor((this.config.sampleRate * REST_SLICE_MS) / 1000)
    if (this.samples >= threshold) {
      void this.enqueueFlush()
    }
  }

  async stop(): Promise<void> {
    this.running = false
    await this.enqueueFlush()
    if(this.samples>0)await this.enqueueFlush()
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

  private concatPcm(): Int16Array {
    const out = new Int16Array(this.samples)
    let offset = 0
    for (const part of this.chunks) {
      out.set(part, offset)
      offset += part.length
    }
    this.chunks.length = 0
    this.samples = 0
    return out
  }

  private enqueueFlush(): Promise<void> {
    if (this.inflight) return this.inflight
    this.inflight = this.flushSlice().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async flushSlice(): Promise<void> {
    if (this.samples === 0) return
    const pcm = this.concatPcm()
    const startMs = this.sliceStartMs
    const durationMs = Math.round((pcm.length / this.config.sampleRate) * 1000)
    this.sliceStartMs = startMs + durationMs
    const wav = pcm16ToWav(pcm, this.config.sampleRate)
    const secret = resolveSecret('asr')
    if (secret.value === null) {
      this.emitError(new MissingAsrSecretError())
      return
    }
    this.emitPartial({
      text: '准实时转写中…',
      isFinal: false,
      startMs,
      endMs: startMs + durationMs,
    })
    try {
      const text = await this.transcribe({
        url: transcriptionsUrl(this.config.baseUrl),
        apiKey: secret.value,
        model: this.config.model,
        wav,ownerId:this.ownerId,sessionId:this.sessionId,prompt:this.prompt,
      })
      const segment: ASRSegment = {
        text,
        isFinal: true,
        startMs,
        endMs: startMs + durationMs,
      }
      for (const listener of this.finalListeners) listener(segment)
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error('ASR REST 失败'))
    }
  }

  private emitPartial(segment: ASRSegment): void {
    for (const listener of this.partialListeners) listener(segment)
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error)
  }
}
