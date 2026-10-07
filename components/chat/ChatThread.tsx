'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { AgentArrowUpIcon, AgentLoopIcon, AgentAlertIcon, AgentInfoIcon, AgentCloseIcon } from '@/components/icons/AgentIcons';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatMessageDots, { type UserDotEntry } from '@/components/chat/ChatMessageDots';
import { TRACE_COLLAPSE_MS } from '@/components/chat/AgentTrace';
import { pinScrollToBottom, STICK_THRESHOLD_PX, useStickToBottom } from '@/lib/hooks/useStickToBottom';
import { getMessageText } from '@/lib/chat/messageParts';
import { dotEntriesFromSpine } from '@/lib/chat/turnSpine';
import { useChatHistory } from '@/lib/stores/chatHistory';
import type { ChatMessage as ChatMessageType } from '@/lib/types/chat';
import { useT } from '@/lib/i18n';
import { useCompactionState } from '@/lib/context/compactionState';

interface ChatThreadProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
  /** 非持久化的本次请求提示，例如备用端点切换；每个面板独立。 */
  info?: string | null;
  onClearInfo?: () => void;
  onFollowUpClick: (question: string) => void;
  /** IndexedDB 水合完成标志；false 时显示加载占位。默认 true。 */
  hydrated?: boolean;
  /** Explicit account gate content; keeps hydrated=false and never renders another owner's messages. */
  accessGateContent?: React.ReactNode;
  /** 水合后消息为空时展示（主面板传 ChatEmptyState；划词浮窗传简短提示）。 */
  emptyState?: React.ReactNode;
  /** 对话字号缩放（写入 --chat-fs）。默认 1。 */
  fontScale?: number;
  /** 浮动输入区实际占用高度，包含工具栏、附件/引用和安全间距。 */
  bottomInset?: number;
  /** 外部滚动容器 ref（主面板传入，供 SelectionPopover 绑定划词选区）。 */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  sessionId?: string;
  repairModelId?: string;
  topic?: string;
  /** 是否在回答下方渲染追问块。窗内笔记对话传 false。默认 true。 */
  showFollowUps?: boolean;
  /**
   * 「定位点」轨道贴哪边。默认 right（Studio 右栏 / 划词浮窗 / 笔记窗保持原样）；
   * Agent 中央对话传 left —— 那边右侧要留给来源栏，左边那片留白正好放它。
   */
  dotsPlacement?: "right" | "left";
}

/**
 * 对话转录视图：虚拟列表 + 滚动容器 + 水合占位 + 空态 + 加载/错误 + 回到底部。
 */
export default function ChatThread({
  messages,
  isLoading,
  error,
  onClearError,
  info,
  onClearInfo,
  onFollowUpClick,
  hydrated = true,
  accessGateContent,
  emptyState,
  fontScale = 1,
  bottomInset = 0,
  scrollContainerRef,
  sessionId,
  repairModelId,
  topic,
  showFollowUps = true,
  dotsPlacement = "right",
}: ChatThreadProps) {
  const t = useT();
  const compaction = useCompactionState(state => sessionId ? state.byId[sessionId] : undefined);
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? internalRef;
  const [stickActive, setStickActive] = useState(isLoading);
  if (isLoading && !stickActive) setStickActive(true);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading || stickActive;
  const wasLoadingRef = useRef(isLoading);

  const displayMessages = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
    [messages],
  );
  const lastDisplay = displayMessages[displayMessages.length - 1];
  const lastDisplayId = lastDisplay?.id;
  // 本轮那条用户消息的附件本来就随请求发送；只有更早的带图消息才需要「重新带入本轮」。
  const lastUserId = useMemo(
    () => [...displayMessages].reverse().find((m) => m.role === 'user')?.id,
    [displayMessages],
  );
  const safeBottomInset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  // Keep the unmeasured streaming-tail estimate close to a compact header +
  // thinking line. A 120px floor used to park 「AI 正在思考中」 far below
  // 「AI 助教」 on the first streamed row. Completed rows are estimated from
  // the mean measured size for that role, so offsets for never-mounted prefix
  // rows stay realistic. Mean, not latest sample: a single artifact-bearing
  // answer runs to thousands of px, and estimating every unmeasured assistant
  // row at that height overshoots the jump target as badly as 72px undershot.
  const MESSAGE_ESTIMATE_PX = 72;
  const reserveThreadLoading = lastDisplay?.role !== 'assistant';
  const displayMessagesRef = useRef(displayMessages);
  displayMessagesRef.current = displayMessages;
  const emptyRoleSizes = () => ({
    user: { sum: 0, count: 0 },
    assistant: { sum: 0, count: 0 },
  });
  const roleSizeRef = useRef(emptyRoleSizes());
  const sessionRef = useRef(sessionId);
  if (sessionRef.current !== sessionId) {
    sessionRef.current = sessionId;
    roleSizeRef.current = emptyRoleSizes();
  }
  const jumpRafRef = useRef(0);

  const roleEstimate = (role: 'user' | 'assistant') => {
    const { sum, count } = roleSizeRef.current[role];
    return count > 0 ? sum / count : MESSAGE_ESTIMATE_PX;
  };

  const estimateSize = (index: number) => {
    const list = displayMessagesRef.current;
    const msg = list[index];
    if (!msg) return MESSAGE_ESTIMATE_PX;
    const streamingTail = isLoadingRef.current && index === list.length - 1 && msg.role === 'assistant';
    if (streamingTail) return MESSAGE_ESTIMATE_PX;
    return roleEstimate(msg.role === 'user' ? 'user' : 'assistant');
  };

  const measureRow: typeof measureElement = (element, entry, instance) => {
    const size = measureElement(element, entry, instance);
    const index = instance.indexFromElement(element);
    const list = displayMessagesRef.current;
    const msg = list[index];
    const streamingTail = isLoadingRef.current && index === list.length - 1 && msg?.role === 'assistant';
    if (msg && (msg.role === 'user' || msg.role === 'assistant') && !streamingTail && size >= 1) {
      // 同一行重复测量（内容增高、字体缩放）会多次入样；对均值的影响有界，
      // 换来的是不必按 index 维护一份与 virtualizer 平行的尺寸表。
      const bucket = roleSizeRef.current[msg.role];
      bucket.sum += size;
      bucket.count += 1;
    }
    return size;
  };

  const virtualizer = useVirtualizer({
    useFlushSync: false,
    count: displayMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    measureElement: measureRow,
    overscan: 4,
    getItemKey: (index) => displayMessages[index]?.id ?? index,
    initialRect: { width: 0, height: 480 },
  });
  const virtualItems = virtualizer.getVirtualItems();
  const rows =
    virtualItems.length > 0
      ? virtualItems
      : displayMessages.slice(0, Math.min(displayMessages.length, 8)).map((_, index) => ({
          index,
          start: index * MESSAGE_ESTIMATE_PX,
        }));
  const totalSize = virtualizer.getTotalSize() || displayMessages.length * MESSAGE_ESTIMATE_PX;
  // 窗口化：sessionWindowById 给出全量 spine 与窗口起点。
  // 定位点用「全局消息下标」（spine.firstIndex），窗口外轮次的点也在轨道上，
  // 点击时按需回读对应轮次再拼进窗口 —— 而不是只给已加载段落画点。
  const sessionWindow = useChatHistory((state) =>
    sessionId ? state.sessionWindowById[sessionId] : undefined,
  );
  const windowStartIndex = sessionWindow?.startIndex ?? 0;
  const userDots = useMemo<UserDotEntry[]>(() => {
    const spine = sessionWindow?.spine;
    if (spine?.length) return dotEntriesFromSpine(spine);
    // 无窗口元信息（旧内存态/测试直写）：退回按已载数组画点，语义与旧版一致。
    return displayMessages.flatMap((msg, index) => (
      msg.role === 'user' ? [{ index, id: msg.id, preview: getMessageText(msg) }] : []
    ));
  }, [sessionWindow?.spine, displayMessages]);
  const firstVisibleIndex = windowStartIndex + (virtualItems[0]?.index ?? rows[0]?.index ?? 0);

  const { onScroll, isAtBottom, setWantStick, wantStickRef } = useStickToBottom(
    scrollRef,
    isLoading || stickActive,
    STICK_THRESHOLD_PX,
    [safeBottomInset],
  );

  useEffect(() => {
    if (isLoading) return;
    const timer = window.setTimeout(() => setStickActive(false), TRACE_COLLAPSE_MS + 48);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // v3.17 把该回调放在 instance 上，不是 useVirtualizer options（计划 19 B3）。
  useLayoutEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
      if (isLoadingRef.current && item.index === instance.options.count - 1) return false;
      return true;
    };
  }, [virtualizer]);

  // 非流式输入框增高：rAF 循环只在 isLoading 时跑，贴底时直接钉一次。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !wantStickRef.current) return;
    pinScrollToBottom(el);
  }, [safeBottomInset, scrollRef, wantStickRef]);

  // 非流式：新消息且贴底时滚到末尾。流式刚结束对齐一次（无 smooth）。
  useEffect(() => {
    const finishedStreaming = wasLoadingRef.current && !isLoading;
    wasLoadingRef.current = isLoading;
    if (isLoading || !wantStickRef.current || displayMessages.length === 0) return;
    virtualizer.scrollToIndex(
      displayMessages.length - 1,
      finishedStreaming ? { align: 'end' } : { align: 'end', behavior: 'smooth' },
    );
    // virtualizer 引用稳定；safeBottomInset 变化由 stick-to-bottom deps 重启循环处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 计划 19 B2：故意收窄依赖
  }, [displayMessages.length, isLoading]);

  useEffect(() => () => {
    if (jumpRafRef.current) cancelAnimationFrame(jumpRafRef.current);
  }, []);

  const jumpToBottom = () => {
    if (displayMessages.length > 0) {
      virtualizer.scrollToIndex(displayMessages.length - 1, { align: 'end', behavior: 'smooth' });
    }
    setWantStick(true);
  };

  const [earlierLoading, setEarlierLoading] = useState(false);
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const pendingJumpRef = useRef<number | null>(null);

  const scrollToLocalIndex = (index: number) => {
    setWantStick(false);
    const align = { align: 'start' as const };
    virtualizer.scrollToIndex(index, align);
    if (jumpRafRef.current) cancelAnimationFrame(jumpRafRef.current);
    let lastOffset = virtualizer.getOffsetForIndex(index, 'start')?.[0];
    let attempts = 0;
    const refine = () => {
      attempts += 1;
      virtualizer.scrollToIndex(index, align);
      const nextOffset = virtualizer.getOffsetForIndex(index, 'start')?.[0];
      const stable = lastOffset != null && nextOffset != null && Math.abs(nextOffset - lastOffset) < 1;
      lastOffset = nextOffset;
      if (stable || attempts >= 8) return;
      jumpRafRef.current = requestAnimationFrame(refine);
    };
    jumpRafRef.current = requestAnimationFrame(refine);
  };

  /**
   * 定位点点击：index 是全局消息下标。
   * 在窗口内 → 直接滚动；在窗口外 → 记录滚动锚点，回读对应轮次拼接后落到目标行。
   */
  const jumpToUserMessage = (globalIndex: number) => {
    if (globalIndex >= windowStartIndex) {
      scrollToLocalIndex(globalIndex - windowStartIndex);
      return;
    }
    const spine = sessionWindow?.spine;
    if (!sessionId || !spine?.length) return;
    const entry = spine.find((s) => s.firstIndex === globalIndex);
    if (!entry) return;
    const el = scrollRef.current;
    if (el) prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    pendingJumpRef.current = globalIndex;
    void useChatHistory.getState().jumpToTurn(sessionId, entry.turn);
  };

  const handleLoadEarlier = () => {
    if (!sessionId || earlierLoading) return;
    const el = scrollRef.current;
    if (el) prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    setEarlierLoading(true);
    void useChatHistory.getState().loadEarlierTurns(sessionId).finally(() => setEarlierLoading(false));
  };

  // 前置拼接后按 scrollHeight 差量回写 scrollTop：视口内容不因 prepend 跳变。
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!anchor) return;
    const el = scrollRef.current;
    if (el) {
      const delta = el.scrollHeight - anchor.height;
      if (delta !== 0) el.scrollTop = anchor.top + delta;
    }
    prependAnchorRef.current = null;
  });

  // 窗口外跳转：前置轮次落地后再换算成窗口内下标滚过去。
  useEffect(() => {
    const target = pendingJumpRef.current;
    if (target == null) return;
    const local = target - windowStartIndex;
    if (local < 0 || local >= displayMessages.length) return;
    pendingJumpRef.current = null;
    scrollToLocalIndex(local);
  });

  return (
    <div className="chat-thread" data-dots-placement={dotsPlacement}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="chat-messages"
        style={{
          ['--chat-fs' as string]: `${Math.round(13 * fontScale)}px`,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          paddingBottom: safeBottomInset || undefined,
          paddingRight: userDots.length ? 18 : undefined,
          overflowAnchor: 'none',
        } as React.CSSProperties}
      >
        {accessGateContent !== undefined ? accessGateContent : !hydrated ? (
          <div className="chat-loading">
            <AgentLoopIcon size={16} className="animate-pulse motion-reduce:animate-none" style={{ color: 'var(--ink-soft)' }} />
            <span className="chat-loading-text">{t('trace.thread.loadingHistory')}</span>
          </div>
        ) : displayMessages.length === 0 ? (
          emptyState ?? null
        ) : (
          <>
            {sessionWindow && sessionWindow.startTurn > 0 ? (
              <div className="chat-load-earlier-wrap">
                <button
                  type="button"
                  className="chat-load-earlier"
                  onClick={handleLoadEarlier}
                  disabled={earlierLoading}
                  data-testid="chat-load-earlier"
                >
                  {earlierLoading ? (
                    <AgentLoopIcon size={14} className="animate-pulse motion-reduce:animate-none" style={{ color: 'var(--ink-soft)' }} />
                  ) : null}
                  <span>{earlierLoading ? t('trace.thread.loadingEarlier') : t('trace.thread.loadEarlier')}</span>
                </button>
              </div>
            ) : null}
            <div
              // 定宽容器：虚拟行（position:absolute; width:100%）以它为基准。
              // Agent 中央对话靠这个类把正文收进可读宽度居中（见 globals.css 的 --agent-chat-max）。
              className="chat-messages-sizer"
              style={{
                height: totalSize,
                width: '100%',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {rows.map((virtualRow) => {
                const msg = displayMessages[virtualRow.index];
                if (!msg) return null;
                return (
                  <div
                    key={msg.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ChatMessage
                      message={msg}
                      onFollowUpSelect={onFollowUpClick}
                      isStreaming={isLoading && msg.id === lastDisplayId && msg.role === 'assistant'}
                      sessionId={sessionId}
                      repairModelId={repairModelId}
                      topic={topic}
                      showFollowUps={showFollowUps}
                      reincludable={msg.role === 'user'
                        && msg.id !== lastUserId
                        && (msg.attachments ?? []).some((attachment) => attachment.type === 'image')}
                    />
                  </div>
                );
              })}
            </div>
            {reserveThreadLoading && (
              <div
                className="chat-loading"
                data-testid="chat-thread-loading"
                style={{ visibility: isLoading ? 'visible' : 'hidden' }}
                aria-hidden={!isLoading}
              >
                <AgentLoopIcon size={16} className="animate-pulse motion-reduce:animate-none" style={{ color: 'var(--ink-soft)' }} />
                <span className="chat-loading-text">{t('trace.thread.thinking')}</span>
              </div>
            )}
          </>
        )}

        {compaction ? <div role="status" aria-live="polite" data-testid="context-compaction-status" className="mx-3 my-2 flex items-center gap-2 rounded-xl bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--ink-soft)]"><AgentLoopIcon size={16} className={compaction.phase === 'running' ? 'animate-spin motion-reduce:animate-none' : undefined} /><span>{compaction.message}</span></div> : null}
        {info ? (
          <div role="status" aria-live="polite" className="mx-3 my-2 flex items-start gap-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-secondary-container)]">
            <AgentInfoIcon size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{info}</span>
            {onClearInfo ? (
              <button type="button" onClick={onClearInfo} aria-label={t('trace.thread.closeInfo')} className="shrink-0 rounded p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2">
                <AgentCloseIcon size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {error && (
          <div className="chat-error" role="alert">
            <AgentAlertIcon size={16} />
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button type="button" onClick={onClearError} className="chat-error-close" aria-label={t('trace.thread.closeError')}>
              <AgentCloseIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {userDots.length > 0 ? (
        <ChatMessageDots
          entries={userDots}
          firstVisibleIndex={firstVisibleIndex}
          onJump={jumpToUserMessage}
        />
      ) : null}

      {!isAtBottom && (
        <button onClick={jumpToBottom} className="chat-scroll-btn" title={t('trace.thread.followOutput')} style={safeBottomInset ? { bottom: safeBottomInset + 8 } : undefined}>
          <AgentArrowUpIcon size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}
    </div>
  );
}
