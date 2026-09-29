export const ASR_FAMILIES = [
  'realtime-ws',
  'transcriptions-rest',
  'local-engine',
] as const

export type SettingsAsrFamily = (typeof ASR_FAMILIES)[number]

export const ASR_DIALECTS: Record<SettingsAsrFamily, readonly string[]> = {
  'realtime-ws': ['stepfun', 'qwen'],
  'transcriptions-rest': ['openai-compatible'],
  'local-engine': ['sherpa-onnx'],
}

export interface AsrSettingsDraft {
  family: string
  dialect: string
  baseUrl: string
  apiKey: string
  model: string
  sampleRate: string
}

export function isSettingsAsrFamily(value: string): value is SettingsAsrFamily {
  return (ASR_FAMILIES as readonly string[]).includes(value)
}

/** Explicit fields only. Never infer family/dialect from baseUrl (ADR-0004). */
export function parseExplicitAsrDraft(draft: AsrSettingsDraft): {
  ok: true
  family: SettingsAsrFamily
  dialect: string
  baseUrl: string
  apiKey: string
  model: string
  sampleRate: number
} | { ok: false; message: string } {
  const family = draft.family.trim()
  const dialect = draft.dialect.trim()
  const baseUrl = draft.baseUrl.trim()
  const model = draft.model.trim()
  const apiKey = draft.apiKey.trim()
  const sampleRate = Number(draft.sampleRate)
  if (!isSettingsAsrFamily(family)) {
    return { ok: false, message: '必须显式选择 ASR 协议族，禁止从 URL 推断' }
  }
  const allowed = ASR_DIALECTS[family]
  if (!dialect || !allowed.includes(dialect)) {
    return { ok: false, message: '必须显式选择 dialect，禁止从 URL 推断' }
  }
  if (!baseUrl) {
    return { ok: false, message: '缺 ASR baseURL' }
  }
  if (!model) {
    return { ok: false, message: '缺 ASR 模型' }
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { ok: false, message: '缺 ASR 采样率' }
  }
  return {
    ok: true,
    family,
    dialect,
    baseUrl,
    apiKey,
    model,
    sampleRate,
  }
}
