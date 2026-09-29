/**
 * ASR 通用接入层 —— 协议族适配器体系（ADR-0004）。
 * 本目录是一切语音转文字能力的唯一入口。业务代码禁止直接连任何厂商 WS/REST 协议，
 * 一律经由 ASRProvider 接口。新增厂商 = 归入协议族 + 新增 dialect 或 adapter，不改业务代码。
 */

/** 协议族（六族，见 docs/designs/library-showcase/asr.html 第三轮） */
export type ASRFamily =
  | 'realtime-ws' // OpenAI Realtime 风格 WS 方言：stepfun / qwen（P0 默认）
  | 'transcriptions-rest' // OpenAI 兼容 /v1/audio/transcriptions（含切片伪流式降级）
  | 'local-engine' // sherpa-onnx 离线（P0 兜底）
  | 'cloud-private-ws' // 腾讯 HMAC / 讯飞 RTASR（P1 医学模式）
  | 'dashscope-task-ws' // 百炼 task 协议（P1 可选）
  | 'google-bidi' // gRPC（不做）

export interface ASRCapabilities {
  /** 真流式（WS partial）还是切片伪流式 */
  streaming: 'realtime' | 'pseudo' | 'none'
  supportsHotwords: boolean
  /** 单会话最长时长（秒），无限制为 null */
  maxSessionSeconds: number | null
}

export interface ASRConfig {
  family: ASRFamily
  dialect?: string // 如 'stepfun' | 'qwen'
  baseUrl: string
  apiKey: string
  model: string
  sampleRate: number // 默认 16000
  hotwords?: string[] // 预置学科热词 + 用户自定义（ADR-0004）
}

export interface ASRSegment {
  text: string
  isFinal: boolean
  startMs?: number
  endMs?: number
}

export interface ASRProvider {
  readonly capabilities: ASRCapabilities
  start(): Promise<void>
  /** PCM 音频帧（采样率见 config.sampleRate） */
  sendAudio(chunk: ArrayBuffer): void
  stop(): Promise<void>
  onPartial(cb: (segment: ASRSegment) => void): void
  onFinal(cb: (segment: ASRSegment) => void): void
  onError(cb: (error: Error) => void): void
}
