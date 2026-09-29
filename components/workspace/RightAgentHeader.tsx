"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { LAYOUT_REFLOW, reflowItemProps } from "@/lib/motion";
import { useUiReducedMotion } from "@/lib/hooks/useUiReducedMotion";
import {
  AgentPlusIcon,
  AgentHistoryIcon,
  AgentSettingsIcon,
  AgentPanelCloseIcon,
} from "@/components/icons/AgentIcons";
import ChatHistoryOverlay from "@/components/chat/ChatHistoryOverlay";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { useFloatingChats } from "@/lib/hooks/useFloatingChats";
import { useTokenTracker } from "@/lib/hooks/useTokenTracker";
import { useAgentTabs } from "@/lib/stores/agentTabs";
import type { ChatContext } from "@/lib/types/chat";
import { useT } from "@/lib/i18n";
import type { SessionMeta } from "@/lib/storage/chatStorage";

const MAX_RECENT_TABS = 12;

/** 只有普通主对话进标签条：浮窗 / 笔记记录 / 定时任务归属由来源决定，不该混进「最近对话」。 */
function isMainSession(meta: SessionMeta): boolean {
  return meta.kind !== "floating" && meta.kind !== "note" && meta.kind !== "scheduled" && !meta.archived;
}

/**
 * 右栏 Agent 顶部（Cursor 式）。
 *
 * 左侧：一条**横向可滚动**的最近对话标签条——每个标签是一条会话，标题截断、
 * 当前高亮、点了切会话、悬停出关闭按钮；末尾一个「＋」开新对话。
 * 右侧：**纯图标**动作——历史（时钟）、设置（滑杆）、收起（右栏关闭 SVG），
 * 都有 title / aria-label，但界面上不出名称，也**没有「AI 助教」标题**。
 *
 * 第一性原理：右栏唯一的职责是对话本身，标题是噪声；把最近对话做成标签让
 * 上下文切换是 O(1)（不必开历史面板找），图标化把纵向空间尽量留给消息流。
 */
export default function RightAgentHeader({
  chatContext,
  onOpenSettings,
  onCollapse,
}: {
  chatContext: ChatContext;
  onOpenSettings: () => void;
  onCollapse: () => void;
}) {
  const t = useT();
  const sessionsMeta = useChatHistory((s) => s.sessionsMeta);
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const switchSession = useChatHistory((s) => s.switchSession);
  const startNewChat = useChatHistory((s) => s.startNewChat);
  const closedIds = useAgentTabs((s) => s.closedIds);
  const closeTab = useAgentTabs((s) => s.closeTab);
  const reopenTab = useAgentTabs((s) => s.reopenTab);
  const [showHistory, setShowHistory] = useState(false);
  const reducedMotion = useUiReducedMotion();

  // 当前会话（无论从历史、侧栏还是新建切过来）总在标签条上。
  useEffect(() => {
    if (activeSessionId) reopenTab(activeSessionId);
  }, [activeSessionId, reopenTab]);

  const recent = useMemo(() => {
    const closed = new Set(closedIds);
    return sessionsMeta
      .filter((meta) => isMainSession(meta) && (!closed.has(meta.id) || meta.id === activeSessionId))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECENT_TABS);
  }, [sessionsMeta, closedIds, activeSessionId]);

  /** 关闭标签：只从标签条移走，对话留在历史里。关的是当前标签就切到相邻标签，没有就开一个空对话。 */
  const handleCloseTab = (id: string) => {
    closeTab(id);
    if (id !== activeSessionId) return;
    const index = recent.findIndex((meta) => meta.id === id);
    const neighbor = recent[index + 1] ?? recent[index - 1];
    if (neighbor) switchSession(neighbor.id);
    else handleNewChat();
  };

  const handleNewChat = () => {
    startNewChat(chatContext);
    useTokenTracker.getState().resetSession();
  };

  const iconBtnCls =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]";

  return (
    <div
      data-testid="right-agent-header"
      className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] pl-1.5 pr-1"
    >
      {/* 最近对话标签条（横向可滚动） */}
      <div
        role="tablist"
        aria-label={t("panel.agentBar.recentAria")}
        data-testid="recent-chat-tabs"
        className="hide-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        <AnimatePresence initial={false} mode="popLayout">
        {recent.map((meta) => {
          const active = meta.id === activeSessionId;
          const title = meta.title?.trim() || t("panel.agentBar.untitled");
          return (
            <motion.span
              key={meta.id}
              {...reflowItemProps(reducedMotion)}
              role="tab"
              aria-selected={active}
              data-testid="recent-chat-tab"
              data-active={active || undefined}
              className={clsx(
                "group relative flex h-7 shrink-0 items-center gap-1 rounded-lg py-1 pl-2.5 pr-1 text-[12.5px] font-medium transition-colors duration-[var(--duration-fast)]",
                active ? "text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
              )}
            >
              {/* 选中底色跟随切换滑动（与中间 Tab 栏同一套 LAYOUT_REFLOW 弹簧）。 */}
              {active && (
                <motion.span
                  layoutId={reducedMotion ? undefined : "agent-tab-active"}
                  transition={LAYOUT_REFLOW}
                  className="absolute inset-0 z-0 rounded-lg bg-[var(--accent-weak)]"
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => switchSession(meta.id)}
                title={title}
                className="press relative z-[1] max-w-[128px] truncate text-left"
              >
                {title}
              </button>
              {/* 关闭 = 从标签条移走（不是删除），所以用中性色而不是报错红。 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(meta.id);
                }}
                title={t("panel.agentBar.closeTab", { title })}
                aria-label={t("panel.agentBar.closeTab", { title })}
                className={clsx(
                  "relative z-[1] flex h-4 w-4 items-center justify-center rounded text-[var(--ink-faint)] transition-opacity duration-[var(--duration-fast)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
                  active ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                <X size={11} />
              </button>
            </motion.span>
          );
        })}
        </AnimatePresence>
        <button
          type="button"
          onClick={handleNewChat}
          title={t("panel.agentBar.newChat")}
          aria-label={t("panel.agentBar.newChat")}
          data-testid="right-agent-new-chat"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
        >
          <AgentPlusIcon size={14} />
        </button>
      </div>

      {/* 纯图标动作：历史 / 设置 / 收起（无文字、无「AI 助教」标题） */}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-[var(--line-soft)] pl-1">
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          title={t("panel.agentBar.history")}
          aria-label={t("panel.agentBar.history")}
          data-testid="right-agent-history"
          className={iconBtnCls}
        >
          <AgentHistoryIcon size={14} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title={t("panel.agentBar.settings")}
          aria-label={t("panel.agentBar.settings")}
          data-testid="right-agent-settings"
          className={iconBtnCls}
        >
          <AgentSettingsIcon size={14} />
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title={t("panel.agentBar.collapse")}
          aria-label={t("panel.agentBar.collapse")}
          data-testid="right-agent-collapse"
          className={iconBtnCls}
        >
          <AgentPanelCloseIcon size={14} />
        </button>
      </div>

      {showHistory && (
        <ChatHistoryOverlay
          onSelectMain={(id) => {
            switchSession(id);
            setShowHistory(false);
          }}
          onRestoreFloating={(id) => {
            useFloatingChats.getState().restoreWindow(id);
            setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
