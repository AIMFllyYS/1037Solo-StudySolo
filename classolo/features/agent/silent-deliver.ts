import { CLASS_OUTPUT_TOKENS } from '@/classolo/lib/ai/budget'
/**
 * 静默 Agent 投递：调用 AI 生成“工具即渲染”消息（issues #5/#6/#29-#35）。
 *
 * 与旧实现（只写一段 rich-text blob）不同，这里让模型通过工具调用产出多类 CRP
 * 渲染卡片（image / rich-text / ai-ask / gen-ui / agent-status），映射经渲染注册表
 * 校验后 upsert 到对应面板，可锚定到文稿片段。每次投递做去重与节流。
 */
import { getNotesPublic, getTranscriptPublic } from '@/classolo/lib/session'
import { upsertRenderMessage } from '@/classolo/lib/session/writes/render'
import { createModel, generateText, stepCountIs } from '@/classolo/lib/ai'

import {
  buildSilentTools,
  silentToolToRender,
  type SilentToolCall,
  type SilentToolName,
} from './silent-tools'

export const SILENT_RENDER_PREFIX = 'silent-agent'
export const SILENT_STATUS_ID = 'silent-agent-status'

let running = false
let tick = 0

const SYSTEM_PROMPT = [
  '你是课堂静默助教。根据实时文稿，主动产出对学生有用的补充。',
  '你必须且只能通过工具调用来产出内容，不要直接输出正文。',
  '每次最多产出 2 个渲染卡片：优先补充关键概念（render_rich_text）或提出一道自测题（render_ai_ask）；',
  '当概念适合配图时用 render_image；需要结构化要点时用 render_gen_ui。',
  '区分“文稿事实”与“你的补充说明”，不要编造来源。如果引用了具体文稿，请在 transcriptAnchor 填入 [segmentId] 中的 id。',
].join('\n')

interface ToolCallLike {
  toolName?: string
  input?: unknown
  args?: unknown
}

/** 从 AI SDK 结果里稳健地取出工具调用（兼容 input/args 字段命名）。 */
export function collectToolCalls(result: {
  toolCalls?: readonly ToolCallLike[]
  steps?: readonly { toolCalls?: readonly ToolCallLike[] }[]
}): SilentToolCall[] {
  const raw: ToolCallLike[] = []
  if (Array.isArray(result.toolCalls)) raw.push(...result.toolCalls)
  if (Array.isArray(result.steps)) {
    for (const step of result.steps) {
      if (Array.isArray(step.toolCalls)) raw.push(...step.toolCalls)
    }
  }
  const seen = new Set<ToolCallLike>()
  const calls: SilentToolCall[] = []
  for (const call of raw) {
    if (seen.has(call)) continue
    seen.add(call)
    const name = call.toolName
    if (typeof name !== 'string') continue
    const input = (call.input ?? call.args ?? {}) as unknown
    if (typeof input !== 'object' || input === null) continue
    calls.push({
      toolName: name as SilentToolName,
      input: input as Record<string, unknown>,
    })
  }
  return calls
}

export function buildSilentPrompt(): string {
  const snapshot = getTranscriptPublic()
  const recent = snapshot.committed.slice(-8)
  const evidence = recent
    .map((s) => `[${s.id}] ${s.text}`)
    .join('\n')
  const outline = getNotesPublic()
    .outlineDigest.map((n) => n.title)
    .join('、')
  return `已有提纲：${outline || '（尚无）'}\n最近文稿（含片段 id）：\n${evidence}`
}

export async function deliverSilentRender(): Promise<void> {
  if (running) return
  running = true
  const snapshot = getTranscriptPublic()
  const session = snapshot.sessionId
  try {
    const recent = snapshot.committed.slice(-8)
    if (recent.length === 0) return
    tick += 1
    const batch = tick
    upsertRenderMessage({
      id: SILENT_STATUS_ID,
      module: 'agent-status',
      version: '1.0',
      target: 'notes',
      props: { status: '分析中', detail: '正在根据最新文稿补充讲解…' },
      meta: { createdAt: Date.now(), source: 'silent-agent' },
    })
    const run = () =>
      generateText({
        model: createModel({ baseUrl: '', model: 'classroom' }),
        system: SYSTEM_PROMPT,
        prompt: buildSilentPrompt(),
        tools: buildSilentTools(),
        stopWhen: stepCountIs(3),
        maxOutputTokens: CLASS_OUTPUT_TOKENS,
        maxRetries: 0,
      })
    // 服务端对「连接阶段失败」已释放预留并返回 503 + Retry-After：这类瞬时错误值得自动再试一次，
    // 否则导入文稿后不会再有新文稿触发，静默补充就永远停在「暂不可用」。
    const result = await run().catch(async (error: unknown) => {
      const status = (error as { statusCode?: unknown } | null)?.statusCode
      if (status !== 503 && status !== 502) throw error
      await new Promise((resolve) => setTimeout(resolve, 3000))
      if (getTranscriptPublic().sessionId !== session) throw error
      return run()
    })
    if (getTranscriptPublic().sessionId !== session) return
    const calls = collectToolCalls(result).slice(0, 3)
    let produced = 0
    calls.forEach((call, index) => {
      const mapped = silentToolToRender(call, {
        id: `${SILENT_RENDER_PREFIX}-${batch}-${index}`,
        source: 'silent-agent',
      })
      if (mapped.ok) {
        upsertRenderMessage(mapped.message)
        produced += 1
      }
    })
    upsertRenderMessage({
      id: SILENT_STATUS_ID,
      module: 'agent-status',
      version: '1.0',
      target: 'notes',
      props: {
        status: produced > 0 ? '已补充' : '待命',
        detail:
          produced > 0
            ? `本轮补充 ${produced} 张卡片`
            : '暂无需要补充的内容，继续聆听课堂。',
      },
      meta: { createdAt: Date.now(), source: 'silent-agent' },
    })
  } catch {
    if (getTranscriptPublic().sessionId === session) {
      upsertRenderMessage({
        id: SILENT_STATUS_ID,
        module: 'agent-status',
        version: '1.0',
        target: 'notes',
        props: {
          status: '暂不可用',
          detail: '课堂补充暂不可用。文稿与笔记仍已保留，可稍后在课堂提问中重试。',
        },
        meta: { createdAt: Date.now(), source: 'system' },
      })
    }
  } finally {
    running = false
  }
}
