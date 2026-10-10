'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo,useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { AgentAlertIcon, AgentInfoIcon, AgentPlusIcon } from '@/components/icons/AgentIcons';
import { clearCloudSyncMessage, useCloudSyncStatus } from '@/lib/sync/status';
import { useAutoHideChatHeader } from '@/lib/hooks/useAutoHideChatHeader';
import { useChat } from '@/lib/hooks/useChat';
import { useChatHistory, ensureChatHistoryBootstrap } from '@/lib/hooks/useChatHistory';
import { useFloatingChats } from '@/lib/hooks/useFloatingChats';
import { useChatReady } from '@/lib/hooks/useChatReady';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { useSettings } from '@/lib/hooks/useSettings';
import { useStore } from '@/lib/store';
import { useTokenTracker } from '@/lib/hooks/useTokenTracker';
import { SOFT_LIMIT_RATIO } from '@/lib/context/estimateFullContext';
import { subjectShortName } from '@/lib/content-data/subjects.registry';
import SelectionPopover from '@/components/notes/SelectionPopover';
import ChatThread from '@/components/chat/ChatThread';
import ChatInput from '@/components/chat/composer/ChatInput';
import ChatAccessNotice from '@/components/chat/ChatAccessNotice';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import ChatPanelHeader from '@/components/chat/ChatPanelHeader';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import { AgentWelcomeExamples, AgentWelcomeGreeting } from '@/components/chat/AgentWelcome';
import ChatHistoryOverlay from '@/components/chat/ChatHistoryOverlay';
import type { ChatContext, ChatOptions } from '@/lib/types/chat';
import type { SendMessageOptions } from '@/lib/chat/sendMessage';
import { useT } from '@/lib/i18n';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import {getSessionWriteFailure,hasDurableSessionRecovery,hydrateSessionRecoveryStatus,retrySessionWrite,subscribeSessionWriteStatus} from '@/lib/storage/chatStorage';
import {exportSessionRecovery} from '@/lib/chat/exportChats';

interface ChatPanelProps {
  chatContext: ChatContext;
  /**
   * 不渲染顶部导航行（AI 助教标题 / 设置 / 历史 / 新对话）。
   * Agent 中央对话用它：这些入口左侧对话栏已经全都有了，两套并存只会重复。
   */
  hideHeader?: boolean;
  /**
   * 空对话时的版式。'classic'（默认）保持原来的居中占位卡（Studio 右侧 AI、手机端 AI），
   * 'agent' 走 Agent 的欢迎页：问候语在上、输入框居中、示例清单在下，输入框不贴底。
   */
  emptyLayout?: 'classic' | 'agent';
  agentMain?: boolean;
  /** Agent 执行模式（询问/完全同意）入口：ChatPanel 的聊天面一律显示，置 false 可关。 */
  showAgentModeMenu?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ chatContext, hideHeader = false, emptyLayout = 'classic', agentMain = false, showAgentModeMenu = true }) => {
  const t = useT();
  const [chatOptions] = useState<ChatOptions>({
    enableThinking: false,
    enableSearch: false,
    contextMode: 'full',
  });
  const { messages, isLoading, error, info, sendMessage, stopGeneration, clearError, clearInfo, sessionId } = useChat(chatContext, chatOptions, { agentMain });
  const outbound = useStore((s) => s.outbound);
  const clearOutbound = useStore((s) => s.clearOutbound);
  const openLoginOverlay = useStore((s) => s.openLoginOverlay);
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const writeFailure=useSyncExternalStore(subscribeSessionWriteStatus,()=>activeSessionId?getSessionWriteFailure(activeSessionId):null,()=>null);
  useEffect(() => { if (activeSessionId) void hydrateSessionRecoveryStatus(activeSessionId); }, [activeSessionId]);
  const startNewChat = useChatHistory((s) => s.startNewChat);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [composerInset, setComposerInset] = useState(150);
  const fontScale = useSettings((s) => s.fontScale);
  const pinChatHeader = useSettings((s) => s.pinChatHeader);
  const showRightPanelTabBar = useSettings((s) => s.showRightPanelTabBar);
  const openAgentSettings = useStore((s) => s.openAgentSettings);
  const layoutProfile = useStore((s) => s.layoutProfile);
  const setRightCollapsedForProfile = useStore((s) => s.setRightCollapsedForProfile);
  const selectedModelId = useSettings((s) => s.selectedModelId);
  const chatReady = useChatReady();
  const auth = useAuthSession();
  const ownerId = getStorageOwner();
  const ownerEpoch = getOwnerEpoch();
  const isCapturedOwnerCurrent = useCallback(() => ownerId !== null
    && getStorageOwner() === ownerId
    && getOwnerEpoch() === ownerEpoch, [ownerId, ownerEpoch]);
  const canUseChat = auth.status === 'signedIn' && ownerId !== null && auth.userId === ownerId && chatReady;
  const outboundOwnerMatches = !!outbound && outbound.ownerId === ownerId && outbound.ownerEpoch === ownerEpoch;
  const accessGateContent = auth.status === 'signedOut'
    ? <ChatAccessNotice status="signedOut" onOpenLogin={openLoginOverlay} />
    : auth.status === 'loading' || ownerId === null || auth.userId !== ownerId
      ? <ChatAccessNotice status="checking" onOpenLogin={openLoginOverlay} />
      : undefined;
  const disabledReason = auth.status === 'signedOut'
    ? t('menu.chatInput.placeholder.signInRequired')
    : auth.status === 'loading' || ownerId === null || auth.userId !== ownerId
      ? t('menu.chatInput.placeholder.checkingAccount')
      : !chatReady
        ? t('menu.chatInput.placeholder.historyLoading')
        : undefined;
  const isMobile = useIsMobile();

  useEffect(() => {
    void ensureChatHistoryBootstrap();
  }, []);

  const ctxTokens = useTokenTracker((s) => s.currentContextTokens);
  const ctxLimit = useTokenTracker((s) => s.modelContextLimit);
  const contextWarning = useTokenTracker((s) => s.contextWarning);
  const contextTruncated = useTokenTracker((s) => s.contextTruncated);
  const ctxRatio = ctxLimit > 0 ? ctxTokens / ctxLimit : 0;
  const showWarning = ctxRatio >= SOFT_LIMIT_RATIO || contextTruncated;
  const cloudSync = useCloudSyncStatus();

  // 切换会话时重置 token 统计——外部 store 同步，置于 effect。
  useEffect(() => {
    useTokenTracker.getState().resetSession();
  }, [activeSessionId]);

  useEffect(() => {
    if (outbound && !outboundOwnerMatches && useStore.getState().outbound === outbound) clearOutbound();
  }, [clearOutbound, outbound, outboundOwnerMatches]);

  /**
   * 不在卸载时 stopGeneration：离开对话页/切路由不杀运行中的生成
   * （运行态在 sessionRuns store 里，与组件生命周期解耦；关站时 fetch 自然死亡）。
   */

  /**
   * 「点了新建对话、但其实已经站在一条空白新对话里」→ 轻反馈：聚焦输入框 + 一行提示。
   * 用 store 订阅而不是 effect 里读值再 setState——后者正是 react-hooks/set-state-in-effect 拦的写法。
   */
  const [blankHint, setBlankHint] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const blankHintTimerRef = useRef<number | null>(null);
  useEffect(() => {
    let seen = useChatHistory.getState().blankChatPulse;
    const unsubscribe = useChatHistory.subscribe((state) => {
      if (state.blankChatPulse === seen) return;
      seen = state.blankChatPulse;
      setBlankHint(true);
      setFocusSignal((n) => n + 1);
      if (blankHintTimerRef.current !== null) window.clearTimeout(blankHintTimerRef.current);
      blankHintTimerRef.current = window.setTimeout(() => {
        blankHintTimerRef.current = null;
        setBlankHint(false);
      }, 2000);
    });
    return () => {
      unsubscribe();
      if (blankHintTimerRef.current !== null) window.clearTimeout(blankHintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canUseChat || !outboundOwnerMatches || isLoading || !outbound?.content.trim()) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !isCapturedOwnerCurrent() || outbound.ownerId !== ownerId || outbound.ownerEpoch !== ownerEpoch
        || useStore.getState().outbound !== outbound) return;
      // busy/hydration 的同步门控可能在 effect 排队后变化；被拒绝的项仍等待下一次就绪。
      if (sendMessage(outbound.content, { memoryCommit: outbound.memoryCommit }) && useStore.getState().outbound === outbound) clearOutbound();
    });
    return () => { cancelled = true; };
  }, [outbound, sendMessage, clearOutbound, canUseChat, outboundOwnerMatches, isLoading, ownerId, ownerEpoch, isCapturedOwnerCurrent]);

  const handleSend = (content: string, options?: SendMessageOptions) => {
    if (!canUseChat || !isCapturedOwnerCurrent()) return;
    sendMessage(content, options);
  };

  const handleFollowUpClick = useCallback((question: string) => {
    if (canUseChat && isCapturedOwnerCurrent()) sendMessage(question);
  }, [canUseChat, sendMessage, isCapturedOwnerCurrent]);
  const handleNewChat = () => {
    // 不 stopGeneration：新对话另开跑道，当前这条继续在后台跑（Codex 式并行）。
    startNewChat(chatContext);
    useTokenTracker.getState().resetSession();
  };
  const subjectName = subjectShortName(chatContext?.subjectId);

  const hasUserSent = useMemo(() => messages.some((m) => m.role === 'user'), [messages]);

  /**
   * Agent 欢迎页：还没有任何可见消息、且历史已就绪。
   * 发送是同步落一条 user 消息的，所以一开始对话这里立刻变 false，输入框自己回到贴底位置。
   * 注意 ChatThread **不卸载**（只被隐藏）：划词助手的容器 ref 是它挂载时绑定的，
   * 卸载再挂载会让 SelectionPopover 的 effect 错过新节点，Agent 里就再也选不中文字了。
   */
  const showAgentWelcome = emptyLayout === 'agent'
    && canUseChat
    && !isLoading
    && !messages.some((m) => m.role === 'user' || m.role === 'assistant');
  const headerPinned = pinChatHeader || showHistory;
  const {
    autoHideEnabled,
    headerCollapsed,
    onRevealZoneEnter,
    onHeaderEnter,
    onHeaderLeave,
    onHeaderPointerDown,
    onHeaderPointerUp,
  } = useAutoHideChatHeader(hasUserSent, headerPinned);

  return (
    <div
      className={clsx(
        'chat-panel',
        showAgentWelcome && 'chat-panel--welcome',
        !hideHeader && autoHideEnabled && 'chat-panel--auto-hide-header',
        !hideHeader && headerCollapsed && 'chat-panel--header-collapsed',
      )}
    >
      {/* Agent 中央对话：设置/历史/新对话都已由左侧对话栏承载，这一行整个不渲染。 */}
      {!hideHeader && <div
        className={clsx(
          'chat-header-sticky',
          autoHideEnabled && 'chat-header-sticky--overlay',
          headerCollapsed && 'chat-header-sticky--hidden',
        )}
        aria-hidden={headerCollapsed || undefined}
        onPointerEnter={onHeaderEnter}
        onPointerLeave={onHeaderLeave}
        onPointerDown={onHeaderPointerDown}
        onPointerUp={onHeaderPointerUp}
      >
        {autoHideEnabled && headerCollapsed && (
          <div
            className="chat-header-reveal-zone"
            aria-hidden
            onPointerEnter={onRevealZoneEnter}
          />
        )}
        <ChatPanelHeader
          topic={chatContext?.currentTopic ?? ''}
          hideTopic={isMobile}
          onOpenSettings={openAgentSettings}
          onOpenHistory={() => setShowHistory(true)}
          onNewChat={handleNewChat}
          onCollapseRight={
            showRightPanelTabBar !== false
              ? undefined
              : () => setRightCollapsedForProfile(layoutProfile, true)
          }
        />
      </div>}

      {/* 欢迎页只在空对话时露脸；ChatThread 照旧挂着，由 .chat-panel--welcome 隐藏。 */}
      {showAgentWelcome && <AgentWelcomeGreeting />}

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
        fontScale={fontScale}
        bottomInset={composerInset}
        scrollContainerRef={scrollContainerRef}
        sessionId={sessionId ?? undefined}
        repairModelId={selectedModelId}
        topic={chatContext?.currentTopic ?? ''}
        // 只有 Agent 中央对话把「定位点」放左边（右侧要留给来源栏）；其它场景保持默认右侧。
        dotsPlacement={emptyLayout === 'agent' ? 'left' : 'right'}
        emptyState={
          emptyLayout === 'agent' ? null : (
            <ChatEmptyState
              topic={chatContext?.currentTopic ?? ''}
              subjectName={subjectName}
              onFollowUpClick={handleFollowUpClick}
            />
          )
        }
      />

      <ChatInput
        onSend={handleSend}
        onStop={stopGeneration}
        isLoading={isLoading}
        disabled={!canUseChat}
        disabledReason={disabledReason}
        sessionId={sessionId ?? undefined}
        chatContext={chatContext}
        // 只有 Agent 中央对话给「对话所属项目」这个入口（划词浮窗 / 题目解析 / 手机迷你聊天都不给）。
        showProjectPicker={emptyLayout === "agent"}
        showAgentModeMenu={showAgentModeMenu}
        onOpenSettings={openAgentSettings}
        onComposerInsetChange={setComposerInset}
        focusSignal={focusSignal}
        notice={(showWarning || cloudSync.message || blankHint || writeFailure) ? (
          <>
            {writeFailure&&<div role="alert" className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-error-container)]"><AgentAlertIcon size={14}/><span className="flex-1">{writeFailure==='checkpoint_conflict'?(activeSessionId&&hasDurableSessionRecovery(activeSessionId)?'本地会话与其他写入发生版本冲突，草稿已另存本机恢复副本；请导出核对。':'本地会话发生版本冲突，草稿只在当前标签保留；请立即导出。'):'本地会话保存未完成，旧记录仍可读取；请检查存储空间后重试。'}</span>{writeFailure==='checkpoint_conflict'&&activeSessionId&&<button type="button" className="underline" onClick={()=>void exportSessionRecovery(activeSessionId)}>导出草稿</button>}{writeFailure!=='checkpoint_conflict'&&activeSessionId&&<button type="button" className="underline" onClick={()=>void retrySessionWrite(activeSessionId)}>重试保存</button>}</div>}
            {blankHint ? (
              <div
                role="status"
                data-testid="blank-chat-hint"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', marginBottom: 8,
                  borderRadius: 10, fontSize: 12,
                  background: 'var(--md-sys-color-surface-container-high)',
                  color: 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                <AgentInfoIcon size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{t('trace.panel.blankHint')}</span>
              </div>
            ) : null}
            {showWarning ? (
          <div role="status" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', marginBottom: 8,
            borderRadius: 10, fontSize: 12,
            background: 'var(--md-sys-color-error-container)',
            color: 'var(--md-sys-color-on-error-container)',
          }}>
            <AgentAlertIcon size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              {contextWarning || t('trace.panel.contextWarning', { percent: Math.round(ctxRatio * 100) })}
            </span>
            <button type="button" onClick={handleNewChat} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8, border: 'none',
              background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <AgentPlusIcon size={12} /> {t('agent.menu.newChat')}
            </button>
          </div>
            ) : null}
            {cloudSync.message ? (
              <div
                role={cloudSync.phase === 'error' ? 'alert' : 'status'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', marginBottom: 8,
                  borderRadius: 10, fontSize: 12,
                  background: cloudSync.phase === 'error'
                    ? 'var(--md-sys-color-error-container)'
                    : 'var(--md-sys-color-secondary-container)',
                  color: cloudSync.phase === 'error'
                    ? 'var(--md-sys-color-on-error-container)'
                    : 'var(--md-sys-color-on-secondary-container)',
                }}
              >
                <AgentAlertIcon size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{cloudSync.message}</span>
                <button
                  type="button"
                  onClick={clearCloudSyncMessage}
                  style={{
                    padding: '4px 10px', borderRadius: 8, border: 'none',
                    background: 'transparent', color: 'inherit',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {t('panel.common.close')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      />

      {showAgentWelcome && <AgentWelcomeExamples onSelect={handleFollowUpClick} />}

      <SelectionPopover containerRef={scrollContainerRef} noteSource="agent" />

      {showHistory && (
        <ChatHistoryOverlay
          onSelectMain={(id) => { useChatHistory.getState().switchSession(id); setShowHistory(false); }}
          onRestoreFloating={(id) => { useFloatingChats.getState().restoreWindow(id); setShowHistory(false); }}
          onClose={() => setShowHistory(false)}
        />
      )}
      <ImageLightbox />
    </div>
  );
};

export default ChatPanel;
