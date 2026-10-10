"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/lib/hooks/chat/useChat";
import { useChatHistory, ensureChatHistoryBootstrap } from "@/lib/stores/chat/chatHistory";
import { useChatReady } from "@/lib/hooks/chat/useChatReady";
import ChatThread from "@/components/chat/ChatThread";
import ChatInput from "@/components/chat/composer/ChatInput";
import type { ChatContext, ChatAttachment, ChatOptions } from "@/lib/types/chat";
import { QUIZ_EXPLAIN_SEED_PROMPT } from "@/lib/quiz/formatQuestionContext";
import { useQuizExplain, type QuizExplainWin } from "@/lib/stores/learning/quizExplain";
import { useT } from "@/lib/i18n";

type SendOpts = {
  quotedText?: string;
  enableThinking?: boolean;
  enableSearch?: boolean;
  attachments?: ChatAttachment[];
};

interface QuizExplainBodyProps {
  win: QuizExplainWin;
  chatContext: ChatContext;
  onModelChange: (modelId: string) => void;
}

/** 深度解析窗体：复用 ChatThread / ChatInput / useChat，绑定本题独立 session。 */
export default function QuizExplainBody({ win, chatContext, onModelChange }: QuizExplainBodyProps) {
  const t = useT();
  const chatOptions = useMemo<ChatOptions>(() => ({ contextMode: "full" }), []);
  const { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo } = useChat(
    chatContext,
    chatOptions,
    { sessionId: win.sessionId, modelId: win.modelId },
  );
  const chatReady = useChatReady(win.sessionId);
  const seededRef = useRef<string | null>(null);
  const [composerInset, setComposerInset] = useState(150);

  useEffect(() => {
    void ensureChatHistoryBootstrap();
    const { pinSession, ensureSessionLoaded } = useChatHistory.getState();
    pinSession(win.sessionId);
    void ensureSessionLoaded(win.sessionId);
    return () => useChatHistory.getState().unpinSession(win.sessionId);
  }, [win.sessionId]);

  useEffect(() => {
    if (win.seedNonce === 0) {
      seededRef.current = null;
      return;
    }
    const seedKey = `${win.sessionId}:${win.seedNonce}`;
    if (!chatReady || isLoading || seededRef.current === seedKey) return;
    let cancelled = false;
    // StrictMode 首次 setup 会马上 cleanup；延后到微任务，避免双发打进同一 session cache。
    queueMicrotask(() => {
      if (cancelled || seededRef.current === seedKey) return;
      const current = useQuizExplain.getState().windows.find((item) => item.id === win.id);
      if (!current || current.sessionId !== win.sessionId || current.seedNonce !== win.seedNonce
        || current.seedText !== win.seedText) return;
      if (!sendMessage(`${QUIZ_EXPLAIN_SEED_PROMPT}\n\n${win.seedText}`)) return;
      seededRef.current = seedKey;
      if (useQuizExplain.getState().windows.find((item) => item.id === win.id) === current) {
        useQuizExplain.getState().updateWindow(win.id, { seedNonce: 0 });
      }
    });
    return () => { cancelled = true; };
  }, [chatReady, isLoading, sendMessage, win.id, win.sessionId, win.seedNonce, win.seedText]);

  useEffect(() => () => stopGeneration(), [stopGeneration]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-chat-surface="quiz-explain">
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
        sessionId={win.sessionId}
        repairModelId={win.modelId}
        topic={chatContext.currentTopic}
        emptyState={
          <div style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>
            {t("window.quiz.explain.working")}
          </div>
        }
      />
      <ChatInput
        onSend={(content: string, opts?: SendOpts) => sendMessage(content, opts)}
        onStop={stopGeneration}
        isLoading={isLoading || !chatReady}
        chatContext={chatContext}
        modelId={win.modelId}
        onModelChange={onModelChange}
        floatingSessionId={win.sessionId}
        onComposerInsetChange={setComposerInset}
        disableQuote
      />
    </div>
  );
}
