import type { RenderModuleManifest } from '../manifest'

import { GenUiModule } from './Component'
import { GEN_UI_VERSION } from './dsl'
import { genUiPropsSchema } from './schema'

/**
 * version 策略：1.0 只允许加法（新白名单节点）。禁止改已发布节点字段含义。
 * 未知 version 仍按 1.0 解析；失败走错误卡片，不执行任意代码。
 */
export const genUiModule = {
  name: 'gen-ui',
  version: GEN_UI_VERSION,
  toolName: 'render_gen_ui',
  description: '用受控 DSL（text/kpi/stack）渲染理解辅助块，禁止执行模型代码',
  propsSchema: genUiPropsSchema,
  Component: GenUiModule,
} satisfies RenderModuleManifest<{ dsl: unknown }>
