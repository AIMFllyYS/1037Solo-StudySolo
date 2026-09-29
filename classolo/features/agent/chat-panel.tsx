'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import {
  ChevronDown,
  CornerDownLeft,
  MessageSquare,
  RotateCw,
  Search,
  Square,
} from 'lucide-react'

import { MarkdownStream } from '@/classolo/components/markdown'
import { publishCommand } from '@/classolo/lib/session'

import { chatPrivateStore, patchChatPrivate, type ChatMessage } from './chat-store'
import { retryLastChatTurn, runChatTurn, stopChatTurn } from './chat-turn'

function jumpToSegment(segmentId: string): void {
  publishCommand({ type: 'transcript.scrollTo', segmentId, source: 'agent' })
}

/** 从文本里提取 [segmentId] 引用，作为可点击回跳的芯片。 */
function extractCitations(text: string): string[] {
  const ids = new Set<string>()
  const re = /\[([0-9a-f-]{6,36})\]/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) ids.add(m[1])
  return [...ids]
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ink-faint)] hover:text-[color:var(--ink-soft)]"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={`size-3 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        推理过程
      </button>
      {open ? (
        <p className="mt-1 whitespace-pre-wrap border-l-2 border-[color:var(--line-soft)] pl-2 text-[11px] text-[color:var(--ink-faint)]">
          {reasoning}
        </p>
      ) : null}
    </div>
  )
}

function TraceRow({ toolName, query }: { toolName: string; query?: string }) {
  return (
    <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--bg-muted)] px-2 py-0.5 text-[11px] text-[color:var(--ink-soft)]">
      <Search className="size-3" />
      {toolName === 'search_transcript' ? '检索文稿' : toolName}
      {query ? <span className="text-[color:var(--ink-faint)]">· {query}</span> : null}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const citations = isUser ? [] : extractCitations(message.content)
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] rounded-lg px-3 py-2 text-[13px]',
          isUser
            ? 'bg-[color:var(--accent-weak)] text-[color:var(--accent-ink)]'
            : message.errored
              ? 'border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] text-[color:var(--md-sys-color-error,#b42318)]'
              : 'border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] text-[color:var(--ink)]',
        ].join(' ')}
      >
        {message.trace?.map((t) => (
          <TraceRow key={t.id} toolName={t.toolName} query={t.query} />
        ))}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownStream markdown={message.content} />
        )}
        {message.reasoning ? <ReasoningBlock reasoning={message.reasoning} /> : null}
        {citations.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {citations.map((id) => (
              <button
                key={id}
                type="button"
                className="rounded-md border border-[color:var(--line-soft)] px-1.5 py-0.5 text-[11px] text-[color:var(--accent)] hover:bg-[color:var(--bg-muted)]"
                onClick={() => jumpToSegment(id)}
              >
                回跳文稿
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ChatPanel() {
  const input = useStore(chatPrivateStore, (s) => s.input)
  const streaming = useStore(chatPrivateStore, (s) => s.streaming)
  const messages = useStore(chatPrivateStore, (s) => s.messages)
  const draftAnswer = useStore(chatPrivateStore, (s) => s.draftAnswer)
  const draftReasoning = useStore(chatPrivateStore, (s) => s.draftReasoning)
  const draftTrace = useStore(chatPrivateStore, (s) => s.draftTrace)
  const error = useStore(chatPrivateStore, (s) => s.error)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, draftAnswer, draftReasoning])

  const empty = messages.length === 0 && !streaming

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-panel)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--line-soft)] px-3 py-2.5">
        <MessageSquare className="size-4 text-[color:var(--accent)]" />
        <span className="text-[13px] font-medium text-[color:var(--ink)]">
          课堂助手
        </span>
        <span className="ml-auto text-[11px] text-[color:var(--ink-faint)]">
          由 1037Solo 统一账号计费
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-auto px-3 py-3">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[13px] text-[color:var(--ink-faint)]">
            <MessageSquare className="size-6 opacity-50" />
            <p>向课堂助手提问</p>
            <p className="text-xs">可问“刚才讲的导数定义是什么”，助手会检索文稿作答</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {streaming ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] px-3 py-2 text-[13px] text-[color:var(--ink)]">
              {draftTrace.map((t) => (
                <TraceRow key={t.id} toolName={t.toolName} query={t.query} />
              ))}
              {draftAnswer ? (
                <MarkdownStream markdown={draftAnswer} />
              ) : (
                <span className="text-[color:var(--ink-faint)]">正在思考…</span>
              )}
              {draftReasoning ? <ReasoningBlock reasoning={draftReasoning} /> : null}
            </div>
          </div>
        ) : null}
        {error && !streaming ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--line-soft)] px-2 py-1 text-[12px] text-[color:var(--accent)] hover:bg-[color:var(--bg-muted)]"
            onClick={() => void retryLastChatTurn()}
          >
            <RotateCw className="size-3.5" />
            重试
          </button>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-[color:var(--line-soft)] p-2.5"
        onSubmit={(event) => {
          event.preventDefault()
          const prompt = input.trim()
          if (!prompt || streaming) return
          void runChatTurn(prompt)
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-[color:var(--line-soft)] bg-[color:var(--bg-app)] px-2.5 py-1.5">
          <textarea
            value={input}
            onChange={(e) => patchChatPrivate({ input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const prompt = input.trim()
                if (prompt && !streaming) void runChatTurn(prompt)
              }
            }}
            rows={1}
            placeholder="问一个课堂问题"
            aria-label="课堂提问"
            className="max-h-28 min-h-6 w-full resize-none bg-transparent text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-faint)]"
          />
          {streaming ? (
            <button
              type="button"
              aria-label="停止生成"
              className="rounded-md bg-[color:var(--bg-muted)] p-1.5 text-[color:var(--ink-soft)] hover:bg-[color:var(--line-soft)]"
              onClick={() => stopChatTurn()}
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="发送"
              disabled={!input.trim()}
              className="rounded-md bg-[color:var(--accent)] p-1.5 text-[color:var(--accent-ink)] disabled:opacity-40"
            >
              <CornerDownLeft className="size-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
