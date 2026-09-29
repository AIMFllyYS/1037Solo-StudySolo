import { createStore } from 'zustand/vanilla'

export interface ChatToolTrace {
  id: string
  toolName: string
  query?: string
  hits?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 折叠展示的推理过程（assistant）。 */
  reasoning?: string
  /** 工具调用轨迹（assistant）。 */
  trace?: ChatToolTrace[]
  /** 本条为错误占位，可重试。 */
  errored?: boolean
}

export interface ChatPrivateState {
  open: boolean
  input: string
  streaming: boolean
  /** 已完成的多轮历史。 */
  messages: ChatMessage[]
  /** 正在流式生成的 assistant 草稿（尚未落入 messages）。 */
  draftAnswer: string
  draftReasoning: string
  draftTrace: ChatToolTrace[]
  error: string | null
  /** 上一条用户问题，用于“重试”。 */
  lastPrompt: string | null
}

export const initialChatPrivate: ChatPrivateState = {
  open: true,
  input: '',
  streaming: false,
  messages: [],
  draftAnswer: '',
  draftReasoning: '',
  draftTrace: [],
  error: null,
  lastPrompt: null,
}

export const chatPrivateStore = createStore<ChatPrivateState>(
  () => initialChatPrivate,
)

export function getChatPrivate(): ChatPrivateState {
  return chatPrivateStore.getState()
}

export function patchChatPrivate(patch: Partial<ChatPrivateState>): void {
  chatPrivateStore.setState(patch)
}

export function appendChatMessage(message: ChatMessage): void {
  chatPrivateStore.setState((state) => ({
    messages: [...state.messages, message],
  }))
}

export function setChatMessages(messages: ChatMessage[]): void {
  chatPrivateStore.setState({ messages })
}

export function resetChatPrivate(): void {
  chatPrivateStore.setState(initialChatPrivate)
}

export function toggleChatOpen(): void {
  chatPrivateStore.setState((state) => ({ open: !state.open }))
}
