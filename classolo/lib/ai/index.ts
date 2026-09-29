/**
 * 本目录是 Vercel AI SDK 的唯一入口（ADR-0006）。
 * 业务代码禁止直接 import 'ai' / '@ai-sdk/openai-compatible'，一律经由此处。
 * 修改第三方调用方式时优先改这里。
 *
 * 硬规则：模型必须经 createModel() 创建（内部 createOpenAICompatible 实例）。
 * 禁止使用字符串模型 ID（会被 AI SDK 路由到 AI Gateway）。
 * 密钥只走 resolveSecret（ADR-0013），本目录不直接读 process.env。
 */
export { generateText, streamText, tool, stepCountIs } from 'ai'
export {
  createModel,
  MissingAISecretError,
  MISSING_AI_SECRET_MESSAGE,
  type CreateModelConfig,
} from './create-model'
export {
  getAiRuntimeConfig,
  resetAiRuntimeConfig,
  setAiRuntimeConfig,
  type AiRuntimeConfig,
} from './runtime-config'
