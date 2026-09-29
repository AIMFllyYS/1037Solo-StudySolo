import type { RenderModuleManifest } from '../manifest'

import { AiAskModule } from './Component'
import { aiAskPropsSchema } from './schema'

export const aiAskModule = {
  name: 'ai-ask',
  version: '1.0',
  toolName: 'render_ai_ask',
  description: '在文稿渲染区展示 AI 主动提出的随堂思考题',
  propsSchema: aiAskPropsSchema,
  Component: AiAskModule,
} satisfies RenderModuleManifest<{ question: string; choices?: string[] }>
