import {
  createModel,
  generateText,
  MissingAISecretError,
} from '@/classolo/lib/ai'

export interface AiConnectionDraft {
  baseUrl: string
  model: string
  apiKey: string
}

export interface AiPingResult {
  ok: boolean
  message: string
}

export function sanitizeAiErrorMessage(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9-]+/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'api_key=[redacted]')
}

export async function pingAiProvider(
  draft: AiConnectionDraft,
): Promise<AiPingResult> {
  const baseUrl = draft.baseUrl.trim()
  const model = draft.model.trim()
  if (!baseUrl) {
    return { ok: false, message: '缺 AI baseURL' }
  }
  if (!model) {
    return { ok: false, message: '缺 AI 模型' }
  }
  try {
    const languageModel = createModel({
      baseUrl,
      model,
      userOverride: draft.apiKey.trim() || null,
    })
    await generateText({
      model: languageModel,
      prompt: 'ping',
      maxOutputTokens: 1,
    })
    return { ok: true, message: '连通成功' }
  } catch (error) {
    if (error instanceof MissingAISecretError) {
      return { ok: false, message: error.message }
    }
    const raw = error instanceof Error ? error.message : '连通失败'
    return { ok: false, message: sanitizeAiErrorMessage(raw) || '连通失败' }
  }
}
