import { getClassUserId } from '@/classolo/lib/db'
import { MissingAISecretError, streamText, stepCountIs } from '@/classolo/lib/ai'
import { resolveSecret } from '@/classolo/lib/providers/secrets'
import { getNotesPublic, getTranscriptPublic } from '@/classolo/lib/session'

import { formatChatError } from './chat-errors'
import { getChatModel } from './chat-model'
import { persistChatTerminal, type PersistChatTerminal } from './chat-persist'
import {
  appendChatMessage,
  getChatPrivate,
  patchChatPrivate,
  type ChatToolTrace,
} from './chat-store'
import {
  searchTranscriptSnapshot,
  searchTranscriptTool,
} from './search-transcript'

export interface ChatStreamPart {
  text?: string
  reasoning?: string
  tool?: ChatToolTrace
}

export type ChatDeltaStream = (
  prompt: string,
  signal: AbortSignal,
) => AsyncIterable<ChatStreamPart>

const SYSTEM_PROMPT = [
  '你是课堂问答助手。基于本节课文稿回答学生问题，语言简洁准确。',
  '涉及“刚才老师讲了什么”等问题时必须调用 search_transcript 工具，不要凭记忆作答。',
  '引用具体文稿时用 [segmentId] 标注来源，方便学生回跳。',
].join('\n')

async function* defaultModelStream(
  prompt: string,
  signal: AbortSignal,
): AsyncIterable<ChatStreamPart> {
  const secret = resolveSecret('ai')
  if (secret.value === null) {
    throw new MissingAISecretError()
  }
  const result = streamText({
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    prompt,
    tools: { search_transcript: searchTranscriptTool },
    stopWhen: stepCountIs(4),
    maxOutputTokens: 2048,
    maxRetries: 0,
    abortSignal: signal,
  })
  for await (const part of result.fullStream) {
    if (signal.aborted) return
    switch (part.type) {
      case 'text-delta':
        yield { text: (part as { text?: string }).text ?? '' }
        break
      case 'reasoning-delta':
        yield { reasoning: (part as { text?: string }).text ?? '' }
        break
      case 'tool-call': {
        const call = part as { toolName?: string; input?: unknown }
        const input = call.input as { query?: string } | undefined
        yield {
          tool: {
            id: crypto.randomUUID(),
            toolName: call.toolName ?? 'tool',
            query: typeof input?.query === 'string' ? input.query : undefined,
          },
        }
        break
      }
      default:
        break
    }
  }
}

function packPrompt(prompt: string): string {
  const outline = getNotesPublic()
    .outlineDigest.map((node) => node.title)
    .join('、')
  const recent = getTranscriptPublic()
    .committed.slice(-6)
    .map((segment) => segment.text)
    .join('\n')
  const hits = searchTranscriptSnapshot(prompt)
  const evidence =
    hits.length > 0
      ? hits.map((hit) => `[${hit.segmentId}] ${hit.text}`).join('\n')
      : '（无命中，请调用 search_transcript 工具）'
  return `课堂提纲：${outline || '（尚无）'}\n最近文稿：\n${recent}\n检索命中：\n${evidence}\n\n学生提问：${prompt}`
}

let activeController: AbortController | null = null

export function stopChatTurn(): void {
  activeController?.abort()
}

export async function runChatTurn(
  prompt: string,
  stream: ChatDeltaStream = defaultModelStream,
  options: { persist?: PersistChatTerminal } = {},
): Promise<void> {
  const sessionId = getTranscriptPublic().sessionId
  const owner = getClassUserId()
  const current = () =>
    getTranscriptPublic().sessionId === sessionId && getClassUserId() === owner
  const save = options.persist ?? persistChatTerminal
  const persist: PersistChatTerminal = async (record) => {
    if (current()) await save(record)
  }

  const controller = new AbortController()
  activeController = controller
  const packed = packPrompt(prompt)

  appendChatMessage({ id: crypto.randomUUID(), role: 'user', content: prompt })
  patchChatPrivate({
    streaming: true,
    input: '',
    draftAnswer: '',
    draftReasoning: '',
    draftTrace: [],
    error: null,
    lastPrompt: prompt,
  })
  await persist({ role: 'user', content: prompt })

  let answer = ''
  let reasoning = ''
  const trace: ChatToolTrace[] = []
  try {
    for await (const delta of stream(packed, controller.signal)) {
      if (!current() || controller.signal.aborted) break
      if (delta.reasoning) {
        reasoning += delta.reasoning
        patchChatPrivate({ draftReasoning: reasoning })
      }
      if (delta.tool) {
        trace.push(delta.tool)
        patchChatPrivate({ draftTrace: [...trace] })
      }
      if (delta.text) {
        answer += delta.text
        patchChatPrivate({ draftAnswer: answer })
      }
    }
    if (!current()) return
    const aborted = controller.signal.aborted
    const finalAnswer = answer || (aborted ? '（已停止生成）' : '')
    appendChatMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: finalAnswer,
      reasoning: reasoning || undefined,
      trace: trace.length ? trace : undefined,
    })
    patchChatPrivate({ draftAnswer: '', draftReasoning: '', draftTrace: [] })
    if (answer && !aborted) await persist({ role: 'assistant', content: answer })
  } catch (error) {
    if (!current()) return
    const message = formatChatError(error)
    appendChatMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: message,
      errored: true,
    })
    patchChatPrivate({
      draftAnswer: '',
      draftReasoning: '',
      draftTrace: [],
      error: message,
    })
  } finally {
    if (activeController === controller) activeController = null
    if (current()) patchChatPrivate({ streaming: false })
  }
}

/** 重试上一条问题（删除最后一条错误 assistant 占位）。 */
export async function retryLastChatTurn(): Promise<void> {
  const state = getChatPrivate()
  if (!state.lastPrompt || state.streaming) return
  const messages = [...state.messages]
  // 去掉尾部的错误占位与对应用户消息，重新发送。
  while (messages.length && messages[messages.length - 1].role === 'assistant') {
    messages.pop()
  }
  if (messages.length && messages[messages.length - 1].role === 'user') {
    messages.pop()
  }
  patchChatPrivate({ messages, error: null })
  await runChatTurn(state.lastPrompt)
}
