import { agentStatusModule } from './agent-status'
import { aiAskModule } from './ai-ask'
import { genUiModule } from './gen-ui'
import { imageModule } from './image'
import type { RenderModuleRegistry } from './manifest'
import { richTextModule } from './rich-text'

/**
 * P0 模块逐步注册（image / rich-text / ai-ask / gen-ui / agent-status）。
 * Host 对未注册模块与非法 props 一律走错误卡片，不白屏。
 */
export const renderModuleRegistry = {
  image: imageModule,
  'rich-text': richTextModule,
  'agent-status': agentStatusModule,
  'ai-ask': aiAskModule,
  'gen-ui': genUiModule,
} as RenderModuleRegistry
