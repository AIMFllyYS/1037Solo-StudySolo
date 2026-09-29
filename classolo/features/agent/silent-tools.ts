/**
 * 静默 Agent 的“工具即渲染”映射（ADR-0006/0010，issues #5/#6/#29-#35）。
 *
 * 设计要点：
 *  - 每个工具调用（render_image / render_rich_text / render_ai_ask /
 *    render_gen_ui / render_agent_status）都会被翻译为一条 CRP RenderMessage，
 *    投递到 transcript 或 notes 面板，可锚定到某个文稿片段。
 *  - 映射为纯函数，便于单测；不触碰任何 store，副作用（upsert）由调用方处理。
 *  - props 交给渲染注册表的 zod schema 兜底校验，非法 props 一律走错误卡片。
 */
import { z } from 'zod'

import { tool } from '@/classolo/lib/ai'
import { renderSchemaRegistry } from '@/classolo/features/render-modules/schema-registry'
import type { RenderMessage } from '@/classolo/features/render-modules/types'

export type SilentToolName =
  | 'render_image'
  | 'render_rich_text'
  | 'render_ai_ask'
  | 'render_gen_ui'
  | 'render_agent_status'

/** 工具名 -> 渲染模块名。 */
export const SILENT_TOOL_TO_MODULE: Readonly<Record<SilentToolName, string>> = {
  render_image: 'image',
  render_rich_text: 'rich-text',
  render_ai_ask: 'ai-ask',
  render_gen_ui: 'gen-ui',
  render_agent_status: 'agent-status',
}

/** 工具名 -> 默认投递目标（未显式指定 target 时生效）。 */
export const SILENT_TOOL_DEFAULT_TARGET: Readonly<
  Record<SilentToolName, RenderMessage['target']>
> = {
  render_image: 'notes',
  render_rich_text: 'notes',
  render_ai_ask: 'transcript',
  render_gen_ui: 'notes',
  render_agent_status: 'notes',
}

const targetSchema = z
  .enum(['transcript', 'notes'])
  .describe('投递目标：transcript=文稿区下方，notes=笔记区下方')

const anchorSchema = z
  .string()
  .optional()
  .describe('关联的文稿片段 id（点击回跳），来自检索命中的 [segmentId]')

/** 每个工具的入参：模块 props + target + 可选 transcriptAnchor。 */
export const silentToolInputSchemas = {
  render_image: z.object({
    query: z.string().min(1).describe('图片检索关键词，如“心脏解剖”'),
    alt: z.string().optional(),
    target: targetSchema.default('notes'),
    transcriptAnchor: anchorSchema,
  }),
  render_rich_text: z.object({
    markdown: z.string().min(1).describe('Markdown 补充讲解，可含 KaTeX'),
    target: targetSchema.default('notes'),
    transcriptAnchor: anchorSchema,
  }),
  render_ai_ask: z.object({
    question: z.string().min(1).describe('一道随堂自测题'),
    choices: z.array(z.string()).optional(),
    target: targetSchema.default('transcript'),
    transcriptAnchor: anchorSchema,
  }),
  render_gen_ui: z.object({
    dsl: z
      .unknown()
      .describe('受控 DSL（text/kpi/stack），JSON 对象或字符串'),
    target: targetSchema.default('notes'),
    transcriptAnchor: anchorSchema,
  }),
  render_agent_status: z.object({
    status: z.string().min(1),
    detail: z.string().optional(),
    target: targetSchema.default('notes'),
    transcriptAnchor: anchorSchema,
  }),
} as const

export type SilentToolCall = {
  toolName: SilentToolName
  input: Record<string, unknown>
}

export type SilentRenderResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; error: string }

const COMMON_KEYS = new Set(['target', 'transcriptAnchor'])

/** 拆出模块 props（去掉 target / transcriptAnchor 等协议外字段）。 */
export function extractModuleProps(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (COMMON_KEYS.has(key)) continue
    if (value === undefined) continue
    props[key] = value
  }
  return props
}

/**
 * 把一次工具调用翻译成一条经校验的 RenderMessage。
 * 校验失败返回 ok:false，调用方据此走错误卡片或跳过。
 */
export function silentToolToRender(
  call: SilentToolCall,
  ctx: {
    id: string
    createdAt?: number
    source?: RenderMessage['meta']['source']
  },
): SilentRenderResult {
  const moduleName = SILENT_TOOL_TO_MODULE[call.toolName]
  if (!moduleName) {
    return { ok: false, error: `未知工具：${call.toolName}` }
  }
  const input = call.input ?? {}
  const rawTarget = input.target
  const target: RenderMessage['target'] =
    rawTarget === 'transcript' || rawTarget === 'notes'
      ? rawTarget
      : SILENT_TOOL_DEFAULT_TARGET[call.toolName]
  const anchor =
    typeof input.transcriptAnchor === 'string' && input.transcriptAnchor
      ? input.transcriptAnchor
      : undefined
  const props = extractModuleProps(input)
  const mod = renderSchemaRegistry[moduleName]
  if (!mod) {
    return { ok: false, error: `模块未注册：${moduleName}` }
  }
  const parsed = mod.propsSchema.safeParse(props)
  if (!parsed.success) {
    return { ok: false, error: `非法 props：${parsed.error.message}` }
  }
  const message: RenderMessage = {
    id: ctx.id,
    module: moduleName,
    version: mod.version,
    target,
    props: parsed.data,
    meta: {
      createdAt: ctx.createdAt ?? Date.now(),
      source: ctx.source ?? 'silent-agent',
      ...(anchor ? { transcriptAnchor: anchor } : {}),
    },
  }
  return { ok: true, message }
}

/** 供 generateText 使用的工具集合（execute 只回显，实际渲染由映射完成）。 */
export function buildSilentTools() {
  return {
    render_image: tool({
      description:
        '当课堂需要真实图片（解剖图、示意图、实物照片）时检索并渲染。target 默认 notes。',
      inputSchema: silentToolInputSchemas.render_image,
      execute: async (input) => ({ ok: true, ...input }),
    }),
    render_rich_text: tool({
      description:
        '当老师讲解不清或需要补充关键概念时，用 Markdown 补充讲解。target 默认 notes。',
      inputSchema: silentToolInputSchemas.render_rich_text,
      execute: async (input) => ({ ok: true, ...input }),
    }),
    render_ai_ask: tool({
      description: '提出一道随堂自测题，帮助学生检验理解。target 默认 transcript。',
      inputSchema: silentToolInputSchemas.render_ai_ask,
      execute: async (input) => ({ ok: true, ...input }),
    }),
    render_gen_ui: tool({
      description:
        '用受控 DSL（text/kpi/stack）渲染小型结构化说明。target 默认 notes。',
      inputSchema: silentToolInputSchemas.render_gen_ui,
      execute: async (input) => ({ ok: true, ...input }),
    }),
    render_agent_status: tool({
      description: '汇报静默 Agent 当前的分析状态。target 默认 notes。',
      inputSchema: silentToolInputSchemas.render_agent_status,
      execute: async (input) => ({ ok: true, ...input }),
    }),
  }
}
