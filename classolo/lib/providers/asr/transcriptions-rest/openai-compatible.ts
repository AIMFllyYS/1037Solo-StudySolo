import {persistAudioJob,patchAudioJob,readAudioJobBytes} from '@/classolo/features/transcript/audio-jobs'
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
  requestId?:string
  audioKey?:string
  startMs?:number
  endMs?:number
  seq?:number
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

export class ASRRequestError extends Error {
  constructor(message:string,readonly outcome:'retryable'|'uncertain'){super(message)}
}
export async function defaultTranscriptionsFetch(request: TranscriptionsRequest): Promise<string> {
  const owner=request.ownerId||getClassUserId(); const sessionId=request.sessionId||getTranscriptPublic().sessionId;
  if(!owner||!sessionId)throw new Error('课堂账号或会话已失效');
  const requestId=request.requestId||crypto.randomUUID();
  const audioKey=request.audioKey||await persistAudioJob({ownerId:owner,sessionId,requestId,wav:request.wav,startMs:request.startMs||0,endMs:request.endMs||0,seq:request.seq,prompt:request.prompt});
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
  await patchAudioJob(owner,audioKey,{status:'processing',requestId,error:undefined});
  try{
  const response = await fetch(request.url, {
    method: 'POST',
    credentials: 'include',
    headers: {'X-Request-Id':requestId},
    body: form,
  })
  if (!response.ok) {
    const body=await response.json().catch(()=>({}));
    const outcome=body.outcome==='retryable'||[400,401,402,403,404,413,422,429].includes(response.status)?'retryable':'uncertain';
    throw new ASRRequestError(typeof body.error==='string'?body.error:`ASR REST ${response.status}`,outcome)
  }
  const body: unknown = await response.json()
  if (typeof body === 'object' && body !== null && 'text' in body) {
    const text = (body as { text: unknown }).text
    if (typeof text === 'string') {await patchAudioJob(owner,audioKey,{status:'complete',text}).catch(()=>{});return text}
  }
  throw new Error('ASR REST 响应缺少 text')
  }catch(error){
    await patchAudioJob(owner,audioKey,{status:error instanceof ASRRequestError?error.outcome:'uncertain',error:error instanceof Error?error.message:'转写结果未知'}).catch(()=>{});
    throw error
  }
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
  private readonly jobs:{pcm:Int16Array|null;startMs:number;endMs:number;requestId:string;seq:number;persisted:Promise<string|undefined>}[]=[]
  private jobSequence=0
  private durableError=false
  private running = false
  private ownerId:string|undefined
  private sessionId:string|undefined
  private prompt:string|undefined
  private readonly partialListeners = new Set<(segment: ASRSegment) => void>()
  private readonly finalListeners = new Set<(segment: ASRSegment) => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()

  constructor(
    private readonly config: ASRConfig,
    private readonly transcribe: TranscriptionsFetch = defaultTranscriptionsFetch,
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
    if(this.config.hotwordPrompt&&this.config.hotwordPrompt.length>HOTWORD_PROMPT_MAX)throw new Error('课堂热词上下文超出服务端限制')
    this.prompt = this.config.hotwordPrompt??buildHotwordPrompt(hotwordsForStart(this.capabilities, this.config.hotwords))
    this.ownerId=getClassUserId()||undefined
    this.sessionId=getTranscriptPublic().sessionId||undefined
    if(!this.ownerId||!this.sessionId)throw new Error("请先登录并创建课堂")
    this.running = true
    this.sliceStartMs = 0
    this.chunks.length = 0
    this.samples = 0
    this.jobs.length=0
    this.durableError=false
    this.jobSequence=0
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.running) return
    const pcm = new Int16Array(chunk.slice(0))
    this.chunks.push(pcm)
    this.samples += pcm.length
    const threshold = Math.floor((this.config.sampleRate * REST_SLICE_MS) / 1000)
    while(this.samples>=threshold)this.queueSlice(threshold)
    if(!this.inflight&&this.jobs.length&&!this.durableError)void this.drain()
  }

  async stop(): Promise<void> {
    this.running = false
    if(this.samples>0)this.queueSlice(this.samples)
    if(this.durableError){
      this.durableError=false
      for(const job of this.jobs)if(job.pcm&&!(await job.persisted)){
        const pcm=job.pcm
        job.persisted=persistAudioJob({ownerId:this.ownerId!,sessionId:this.sessionId!,requestId:job.requestId,wav:pcm16ToWav(pcm,this.config.sampleRate),startMs:job.startMs,endMs:job.endMs,seq:job.seq,prompt:this.prompt}).then(key=>{job.pcm=null;return key}).catch(()=>{this.durableError=true;return undefined})
      }
    }
    await this.drain()
    if(this.durableError)throw new Error('音频未能保存到本机，请重试保存，暂勿关闭页面')
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

  private takePcm(length:number): Int16Array {
    const out = new Int16Array(length)
    let offset = 0
    while(offset<length){
      const part=this.chunks[0],count=Math.min(part.length,length-offset)
      out.set(part.subarray(0,count),offset);offset+=count
      if(count===part.length)this.chunks.shift();else this.chunks[0]=part.subarray(count)
    }
    this.samples -= length
    return out
  }

  private queueSlice(length:number){
    const pcm=this.takePcm(length)
    const startMs = this.sliceStartMs
    const durationMs = Math.round((pcm.length / this.config.sampleRate) * 1000)
    this.sliceStartMs = startMs + durationMs
    const requestId=crypto.randomUUID(),endMs=startMs+durationMs
    // Persist queued audio immediately, before a slow previous provider call can finish.
    const job={pcm:pcm as Int16Array|null,startMs,endMs,requestId,seq:++this.jobSequence,persisted:Promise.resolve<string|undefined>(undefined)}
    if(this.transcribe===defaultTranscriptionsFetch)job.persisted=persistAudioJob({ownerId:this.ownerId!,sessionId:this.sessionId!,requestId,wav:pcm16ToWav(pcm,this.config.sampleRate),startMs,endMs,seq:job.seq,prompt:this.prompt}).then(key=>{job.pcm=null;return key}).catch(()=>{this.durableError=true;this.emitError(new Error('本机音频空间不足，请暂停录音并导出'));return undefined})
    this.jobs.push(job)
  }

  private async drain():Promise<void>{
    if(this.inflight){await this.inflight;if(this.jobs.length&&!this.durableError)await this.drain();return}
    if(!this.jobs.length)return
    this.inflight=(async()=>{
      while(this.jobs.length){
        const job=this.jobs[0],audioKey=await job.persisted
        if(this.durableError)return
        await this.transcribeSlice(job,audioKey)
        if(this.durableError)return
        this.jobs.shift()
      }
    })().catch(error=>{this.durableError=true;this.emitError(error instanceof Error?error:new Error('本机音频队列读取失败'))}).finally(()=>{this.inflight=null})
    return this.inflight
  }

  private async transcribeSlice(job:{pcm:Int16Array|null;startMs:number;endMs:number;requestId:string;seq:number},audioKey?:string): Promise<void> {
    const {pcm,startMs,endMs,requestId}=job
    const wav = pcm?pcm16ToWav(pcm, this.config.sampleRate):audioKey?await readAudioJobBytes(audioKey):undefined
    if(!wav){this.durableError=true;this.emitError(new Error('本机音频分段不可读，请从录音备份恢复'));return}
    const secret = resolveSecret('asr')
    if (secret.value === null) {
      this.emitError(new MissingAsrSecretError())
      return
    }
    this.emitPartial({
      text: '准实时转写中…',
      isFinal: false,
      startMs,
      endMs,
    })
    try {
      const text = await this.transcribe({
        url: transcriptionsUrl(this.config.baseUrl),
        apiKey: secret.value,
        model: this.config.model,
        wav,ownerId:this.ownerId,sessionId:this.sessionId,prompt:this.prompt,requestId,audioKey,startMs,endMs,seq:job.seq,
      })
      const segment: ASRSegment = {
        id:requestId,seq:job.seq,
        text,
        isFinal: true,
        startMs,
        endMs,
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
