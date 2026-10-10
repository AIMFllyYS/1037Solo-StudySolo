"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useChat } from "@/lib/hooks/useChat";
import { useChatHistory, ensureChatHistoryBootstrap } from "@/lib/hooks/useChatHistory";
import { useChatReady } from "@/lib/hooks/useChatReady";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { useStore } from "@/lib/stores/ui";
import { useChatUI } from "@/lib/stores/chatUI";
import { useUserNotes } from "@/lib/stores/userNotes";
import ChatThread from "@/components/chat/ChatThread";
import ChatInput from "@/components/chat/composer/ChatInput";
import type { ChatOptions } from "@/lib/types/chat";
import type { SendMessageOptions } from "@/lib/chat/sendMessage";

/**
 * 笔记编辑窗内的微型 Agent：复用右侧对话的输入框 / 消息列表 / AgentTrace，
 * 但绑定这篇笔记自己的 session，不读写主 thread。
 */
export default function NoteAgentPanel({
  noteId,
  sessionId,
  onSettled,
}: {
  noteId: string;
  sessionId: string;
  /** Agent 本轮输入结束后刷新 MD 渲染视图。 */
  onSettled?: () => void;
}) {
  const closePanel = useUserNotes((s) => s.setNoteAgentOpen);
  const noteQuote = useChatUI((s) => s.noteQuotes[noteId] ?? null);
  const clearNoteQuote = useChatUI((s) => s.clearNoteQuote);
  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const activeItemId = useStore((s) => s.activeItemId);
  const academicYear = useAcademicYear((s) => s.year);
  const chatContext = useMemo(
    () => ({
      subjectId: activeSubjectId,
      categoryId: activeCategoryId,
      itemId: activeItemId,
      currentTopic: `${activeSubjectId} ${activeCategoryId} ${activeItemId}`,
      academicYear,
    }),
    [activeSubjectId, activeCategoryId, activeItemId, academicYear],
  );
  const chatOptions = useMemo<ChatOptions>(() => ({ contextMode: "full" }), []);
  const { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo } = useChat(
    chatContext,
    chatOptions,
    { sessionId, editingUserNoteId: noteId },
  );
  const chatReady = useChatReady(sessionId);
  const [composerInset, setComposerInset] = useState(150);
  const wasLoading = useRef(false);

  useEffect(() => {
    void ensureChatHistoryBootstrap();
    const { pinSession, ensureSessionLoaded } = useChatHistory.getState();
    pinSession(sessionId);
    void ensureSessionLoaded(sessionId);
    return () => useChatHistory.getState().unpinSession(sessionId);
  }, [sessionId]);

  useEffect(() => () => stopGeneration(), [stopGeneration]);

  useEffect(() => {
    if (wasLoading.current && !isLoading) onSettled?.();
    wasLoading.current = isLoading;
  }, [isLoading, onSettled]);

  return (
    <section
      className="note-agent-panel"
      data-chat-surface="note"
      aria-label="笔记对话"
    >
      <header className="note-agent-panel-head" data-no-drag>
        <span>笔记对话</span>
        <button
          type="button"
          data-no-drag
          className="user-note-chrome-btn"
          title="收起笔记对话"
          aria-label="收起笔记对话"
          onClick={() => closePanel(noteId, false)}
        >
          <X size={13} />
        </button>
      </header>
      <div className="note-agent-panel-body">
        <ChatThread
          messages={messages}
          isLoading={isLoading}
          error={error}
          onClearError={clearError}
          info={info}
          onClearInfo={clearInfo}
          onFollowUpClick={(question) => sendMessage(question)}
          hydrated={chatReady}
          bottomInset={composerInset}
          sessionId={sessionId}
          topic={chatContext.currentTopic}
          showFollowUps={false}
          emptyState={
            <div className="note-agent-empty">
              就这篇笔记问小岸，或让它改稿。对话只属于这篇笔记，不会写进右侧主对话。
            </div>
          }
        />
        <ChatInput
          onSend={(content: string, opts?: SendMessageOptions) =>
            sendMessage(content, opts?.quotedText ? { ...opts, quoteIntro: "针对这篇笔记这段原文" } : opts)}
          onStop={stopGeneration}
          isLoading={isLoading || !chatReady}
          chatContext={chatContext}
          showTokenDashboard={false}
          floatingSessionId={sessionId}
          disableQuote
          quoteText={noteQuote}
          onClearQuote={() => clearNoteQuote(noteId)}
          onComposerInsetChange={setComposerInset}
        />
      </div>
    </section>
  );
}
