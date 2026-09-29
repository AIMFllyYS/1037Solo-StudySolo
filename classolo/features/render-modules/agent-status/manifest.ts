import type { RenderModuleManifest } from '../manifest'

import { AgentStatusModule } from './Component'
import { agentStatusPropsSchema } from './schema'

export const agentStatusModule = {
  name: 'agent-status',
  version: '1.0',
  toolName: 'render_agent_status',
  description: '在笔记渲染区展示静默 Agent 的实时思考状态',
  propsSchema: agentStatusPropsSchema,
  Component: AgentStatusModule,
} satisfies RenderModuleManifest<{ status: string; detail?: string }>
