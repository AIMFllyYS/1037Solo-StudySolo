export interface AiRuntimeConfig {
  baseUrl: string
  model: string
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'z-ai/glm-5.3-flash'

let overlay: AiRuntimeConfig | null = null

function readEnvRuntime(): AiRuntimeConfig {
  const env =
    typeof process === 'undefined' || !process.env ? undefined : process.env
  return {
    baseUrl:
      env?.NEXT_PUBLIC_AI_BASE_URL?.trim() ||
      env?.AI_BASE_URL?.trim() ||
      DEFAULT_BASE_URL,
    model:
      env?.NEXT_PUBLIC_AI_MODEL?.trim() ||
      env?.AI_MODEL?.trim() ||
      DEFAULT_MODEL,
  }
}

export function setAiRuntimeConfig(next: AiRuntimeConfig): void {
  overlay = {
    baseUrl: next.baseUrl.trim(),
    model: next.model.trim(),
  }
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  const env = readEnvRuntime()
  return {
    baseUrl: overlay?.baseUrl || env.baseUrl,
    model: overlay?.model || env.model,
  }
}

export function resetAiRuntimeConfig(): void {
  overlay = null
}
