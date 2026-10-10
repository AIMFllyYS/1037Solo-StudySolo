"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/stores/ui";
import { useChat } from "@/lib/hooks/chat/useChat";
import { ensureChatHistoryBootstrap } from "@/lib/stores/chat/chatHistory";
import { useChatReady } from "@/lib/hooks/chat/useChatReady";
import { useSettings } from "@/lib/stores/settings";
import ChatThread from "@/components/chat/ChatThread";
import ChatInput from "@/components/chat/composer/ChatInput";
import type { ChatContext } from "@/lib/types/chat";
import type { SendMessageOptions } from "@/lib/chat/sendMessage";

/**
 * 手机非 AI/设置页：右下角很小的对话按钮 + 自绘圆角小浮层。
 * 复用 ChatThread / ChatInput，不走 ManagedWindow。
 */
export default function MobileMiniChat({ chatContext }: { chatContext: ChatContext }) {
  const tab = useStore((s) => s.mobileTab);
  const open = useStore((s) => s.mobileMiniChatOpen);
  const setOpen = useStore((s) => s.setMobileMiniChatOpen);
  const openAgentSettings = useStore((s) => s.openAgentSettings);
  const hidden = tab === "ai" || tab === "settings";
  const [composerInset, setComposerInset] = useState(132);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatReady = useChatReady();
  const fontScale = useSettings((s) => s.fontScale);
  const selectedModelId = useSettings((s) => s.selectedModelId);
  const { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo, sessionId } = useChat(
    chatContext,
    { enableThinking: false, enableSearch: false, contextMode: "full" },
  );

  useEffect(() => {
    void ensureChatHistoryBootstrap();
  }, []);

  const handleSend = useCallback(
    (content: string, options?: SendMessageOptions) => {
      sendMessage(content, options);
    },
    [sendMessage],
  );

  // 稳定引用：内联箭头会让每条 ChatMessage 的 memo 在流式 tick 全失效。
  const handleFollowUpClick = useCallback((question: string) => {
    void sendMessage(question);
  }, [sendMessage]);

  const emptyState = useMemo(
    () => (
      <div className="mobile-mini-chat-empty">
        问问这节课，或引用笔记。
      </div>
    ),
    [],
  );

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="mobile-mini-chat-fab"
          aria-label="打开对话"
          data-testid="mobile-mini-chat-fab"
          onClick={() => setOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0Z" />
          </svg>
        </button>
      )}

      {open && (
        <div className="mobile-mini-chat-layer" data-testid="mobile-mini-chat-layer">
          <button
            type="button"
            className="mobile-mini-chat-scrim"
            aria-label="关闭对话"
            data-testid="mobile-mini-chat-scrim"
            onClick={() => setOpen(false)}
          />
          <div
            className="mobile-mini-chat"
            role="dialog"
            aria-label="对话"
            data-testid="mobile-mini-chat"
          >
            <header className="mobile-mini-chat-head">
              <span>对话</span>
              <button
                type="button"
                aria-label="关闭"
                className="mobile-mini-chat-close"
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </button>
            </header>
            <div className="chat-panel mobile-mini-chat-panel">
              <ChatThread
                messages={messages}
                isLoading={isLoading}
                error={error}
                onClearError={clearError}
                info={info}
                onClearInfo={clearInfo}
                onFollowUpClick={handleFollowUpClick}
                hydrated={chatReady}
                fontScale={fontScale}
                bottomInset={composerInset}
                scrollContainerRef={scrollRef}
                sessionId={sessionId ?? undefined}
                repairModelId={selectedModelId}
                topic={chatContext.currentTopic}
                emptyState={emptyState}
              />
              <ChatInput
                onSend={handleSend}
                onStop={stopGeneration}
                isLoading={isLoading || !chatReady}
                chatContext={chatContext}
                onOpenSettings={openAgentSettings}
                onComposerInsetChange={setComposerInset}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
