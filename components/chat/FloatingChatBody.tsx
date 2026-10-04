"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/lib/hooks/useChat";
import { useChatHistory, ensureChatHistoryBootstrap } from "@/lib/hooks/useChatHistory";
import { useChatReady } from "@/lib/hooks/useChatReady";
import ChatThread from "@/components/chat/ChatThread";
import ChatInput from "@/components/chat/ChatInput";
import ChatAccessNotice from "@/components/chat/ChatAccessNotice";
import type { ChatContext, ChatOptions } from "@/lib/types/chat";
import type { SendMessageOptions } from "@/lib/chat/sendMessage";
import { useFloatingChats, type FloatingWin } from "@/lib/hooks/useFloatingChats";
import { useSessionRuns } from "@/lib/stores/sessionRuns";
import { useStore } from "@/lib/stores/ui";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { useT } from "@/lib/i18n";

interface FloatingChatBodyProps {
  win: FloatingWin;
  chatContext: ChatContext;
  onModelChange: (modelId: string) => void;
}

/** 划词浮窗可见时挂载；内含 useChat，最小化时卸载以切断 store 订阅。 */
export default function FloatingChatBody({ win, chatContext, onModelChange }: FloatingChatBodyProps) {
  const t = useT();
  const chatOptions = useMemo<ChatOptions>(() => ({ contextMode: "full" }), []);
  const { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo } = useChat(
    chatContext,
    chatOptions,
    { sessionId: win.sessionId, modelId: win.modelId },
  );
  const chatReady = useChatReady(win.sessionId);
  const auth = useAuthSession();
  const ownerId = getStorageOwner();
  const ownerEpoch = getOwnerEpoch();
  const ownerMatches = win.ownerId === ownerId && win.ownerEpoch === ownerEpoch;
  const isCapturedWindowOwnerCurrent = useCallback(() => ownerId !== null
    && ownerMatches
    && getStorageOwner() === ownerId
    && getOwnerEpoch() === ownerEpoch
    && win.ownerId === ownerId
    && win.ownerEpoch === ownerEpoch, [ownerId, ownerEpoch, ownerMatches, win.ownerId, win.ownerEpoch]);
  const canUseChat = auth.status === "signedIn" && ownerId !== null && auth.userId === ownerId && chatReady && ownerMatches;
  const openLoginOverlay = useStore((state) => state.openLoginOverlay);
  const closeFloatingWindow = useFloatingChats((state) => state.closeWindow);
  const accessGateContent = !ownerMatches
    ? <ChatAccessNotice status="ownerChanged" onClose={() => closeFloatingWindow(win.id)} />
    : auth.status === "signedOut"
      ? <ChatAccessNotice status="signedOut" onOpenLogin={openLoginOverlay} />
      : auth.status === "loading" || ownerId === null || auth.userId !== ownerId
        ? <ChatAccessNotice status="checking" onOpenLogin={openLoginOverlay} />
        : undefined;
  const disabledReason = !ownerMatches
    ? t("menu.chatInput.access.ownerChangedTitle")
    : auth.status === "signedOut"
      ? t("menu.chatInput.placeholder.signInRequired")
      : auth.status === "loading" || ownerId === null || auth.userId !== ownerId
        ? t("menu.chatInput.placeholder.checkingAccount")
        : !chatReady
          ? t("menu.chatInput.placeholder.historyLoading")
          : undefined;
  const seededRef = useRef<string | null>(null);
  const [composerInset, setComposerInset] = useState(150);

  useEffect(() => {
    if (!ownerMatches || auth.status !== "signedIn" || ownerId === null || auth.userId !== ownerId) return;
    const sessionOwnerId = ownerId;
    const ownerEpoch = win.ownerEpoch;
    void ensureChatHistoryBootstrap();
    const { pinSession, ensureSessionLoaded } = useChatHistory.getState();
    pinSession(win.sessionId);
    void ensureSessionLoaded(win.sessionId);
    // 浮窗打开 = 用户在看这条会话：熄灭它的未读徽标（蓝点/红点）。
    useSessionRuns.getState().markViewed(win.sessionId);
    return () => {
      if (getStorageOwner() === sessionOwnerId && getOwnerEpoch() === ownerEpoch) {
        useChatHistory.getState().unpinSession(win.sessionId);
      }
    };
  }, [auth.status, auth.userId, ownerId, ownerMatches, win.ownerEpoch, win.sessionId]);

  useEffect(() => {
    if (win.seedNonce === 0) { seededRef.current = null; return; }
    const seedKey = `${win.sessionId}:${win.seedNonce}`;
    if (!canUseChat || isLoading || win.seedMode === "ask" || seededRef.current === seedKey) return;
    let cancelled = false;
    // StrictMode 的首次 setup 会马上 cleanup；延后到微任务后才真正创建消息和网络请求。
    queueMicrotask(() => {
      if (cancelled || seededRef.current === seedKey || !isCapturedWindowOwnerCurrent()) return;
      const current = useFloatingChats.getState().windows.find((item) => item.id === win.id);
      if (!current || current.sessionId !== win.sessionId || current.seedNonce !== win.seedNonce
        || current.seedMode !== win.seedMode || current.seedText !== win.seedText
        || current.ownerId !== ownerId || current.ownerEpoch !== ownerEpoch) return;
      const prompt = win.seedMode === "explain"
        ? "请用最通俗易懂的语言解释这段内容（无需铺垫，即答即可）。"
        : "请用一个具体、贴近的例子来说明这段内容。";
      if (!sendMessage(prompt, { quotedText: win.seedText })) return;
      seededRef.current = seedKey;
      // 只确认真正被 hook 接收的 seed；存进窗口状态，最小化后重挂载也不会重复发送。
      if (useFloatingChats.getState().windows.find((item) => item.id === win.id) === current) {
        useFloatingChats.getState().updateWindow(win.id, { seedNonce: 0 });
      }
    });
    return () => { cancelled = true; };
  }, [canUseChat, isCapturedWindowOwnerCurrent, isLoading, ownerEpoch, ownerId, sendMessage, win.id, win.sessionId, win.seedMode, win.seedNonce, win.seedText]);

  // 最小化/关闭浮窗不 abort：会话运行态在 sessionRuns store，与组件挂载解耦。

  function handleSend(content: string, opts?: SendMessageOptions) {
    if (!canUseChat || !isCapturedWindowOwnerCurrent()) return;
    const isFirst = messages.length === 0;
    const quoted = isFirst && win.seedMode === "ask" && win.seedText.trim() ? win.seedText : opts?.quotedText;
    sendMessage(content, { ...opts, quotedText: quoted });
  }

  // 稳定引用：内联箭头会让每条 ChatMessage 的 memo 在流式 tick 全失效。
  const handleFollowUpClick = useCallback((question: string) => {
    if (!canUseChat || !isCapturedWindowOwnerCurrent()) return;
    void sendMessage(question);
  }, [canUseChat, isCapturedWindowOwnerCurrent, sendMessage]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-chat-surface="floating">
      <ChatThread
        messages={messages}
        isLoading={isLoading}
        error={error}
        onClearError={clearError}
        info={info}
        onClearInfo={clearInfo}
        onFollowUpClick={handleFollowUpClick}
        hydrated={chatReady}
        accessGateContent={accessGateContent}
        bottomInset={composerInset}
        sessionId={win.sessionId}
        repairModelId={win.modelId}
        topic={chatContext.currentTopic}
        emptyState={
          <div style={{ padding: 16, textAlign: "center", color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>
            {win.seedText ? "就这段选中的内容，问点什么吧。" : "开始你的提问。"}
          </div>
        }
      />
      <ChatInput
        onSend={handleSend}
        onStop={stopGeneration}
        isLoading={isLoading}
        disabled={!canUseChat}
        disabledReason={disabledReason}
        sessionId={win.sessionId}
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
