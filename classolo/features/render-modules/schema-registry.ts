/**
 * 纯 schema 注册表：只含各渲染模块的 name/version/toolName/propsSchema，
 * 不 import 任何 React 组件，供静默 Agent 的“工具即渲染”映射在服务端/单测中校验。
 * UI 渲染仍走 registry.ts（含 Component）。二者的 schema 必须一致。
 */
import type { z } from 'zod'

import { agentStatusPropsSchema } from './agent-status/schema'
import { aiAskPropsSchema } from './ai-ask/schema'
import { genUiPropsSchema } from './gen-ui/schema'
import { imagePropsSchema } from './image/schema'
import { richTextPropsSchema } from './rich-text/schema'

export interface RenderSchemaEntry {
  name: string
  version: string
  toolName: string
  propsSchema: z.ZodType<unknown>
}

export const renderSchemaRegistry: Readonly<Record<string, RenderSchemaEntry>> = {
  image: {
    name: 'image',
    version: '1.0',
    toolName: 'render_image',
    propsSchema: imagePropsSchema as z.ZodType<unknown>,
  },
  'rich-text': {
    name: 'rich-text',
    version: '1.0',
    toolName: 'render_rich_text',
    propsSchema: richTextPropsSchema as z.ZodType<unknown>,
  },
  'ai-ask': {
    name: 'ai-ask',
    version: '1.0',
    toolName: 'render_ai_ask',
    propsSchema: aiAskPropsSchema as z.ZodType<unknown>,
  },
  'gen-ui': {
    name: 'gen-ui',
    version: '1.0',
    toolName: 'render_gen_ui',
    propsSchema: genUiPropsSchema as z.ZodType<unknown>,
  },
  'agent-status': {
    name: 'agent-status',
    version: '1.0',
    toolName: 'render_agent_status',
    propsSchema: agentStatusPropsSchema as z.ZodType<unknown>,
  },
}
