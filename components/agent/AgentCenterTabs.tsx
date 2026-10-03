"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Image as ImageIcon, Link2, MessagesSquare } from "lucide-react";
import { useAgentCenter, type AgentCenterTab } from "@/lib/stores/agentCenter";
import { useSessionDerivedTotals } from "@/lib/hooks/useSessionDerivedTotals";
import { useActiveChatSessionId } from "@/lib/window/sessionScope";
import { useT } from "@/lib/i18n";

/**
 * Agent 的视图开关（回答 / 来源 / 图片）。
 *
 * 它是**视图开关**而不是第二个导航行：三个页签说的是同一件事的不同切面。
 * 所以它不占自己的那一行，而是**并进顶栏**——顶栏本来就在左侧对话栏的正上方，
 * 再另起一行就成了"两个顶部导航栏"（用户口径）。
 *
 * 计数徽标只在有内容时出现：空对话里挂一个 0 只会是噪声。
 */
export default function AgentCenterTabs({
  linksCount,
  imagesCount,
}: {
  linksCount: number;
  imagesCount: number;
}) {
  const t = useT();
  const centerTab = useAgentCenter((state) => state.centerTab);
  const setCenterTab = useAgentCenter((state) => state.setCenterTab);

  const tabs: { id: AgentCenterTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "answer", label: t("agent.center.tab.answer"), icon: <MessagesSquare size={15} />, count: 0 },
    { id: "links", label: t("agent.center.tab.links"), icon: <Link2 size={15} />, count: linksCount },
    { id: "images", label: t("agent.center.tab.images"), icon: <ImageIcon size={15} />, count: imagesCount },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("agent.center.tabs.aria")}
      data-testid="agent-center-tabs"
      className="flex items-center gap-1 rounded-xl bg-[var(--bg-muted)] p-0.5"
    >
      {tabs.map((tab) => {
        const active = tab.id === centerTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-selected={active}
            data-testid={`agent-center-tab-${tab.id}`}
            onClick={() => setCenterTab(tab.id)}
            className={clsx(
              "press flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[12.5px] font-medium transition-colors",
              active
                ? "bg-[var(--bg-panel)] text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
            )}
          >
            {tab.icon}
            <span className="agent-center-tab-label">{tab.label}</span>
            {tab.count > 0 ? (
              <span
                className={clsx(
                  "agent-center-tab-count rounded-full px-1.5 text-[11px] leading-4 tabular-nums",
                  active ? "bg-[var(--accent)]/15 text-[var(--accent-ink)]" : "bg-[var(--bg-muted)] text-[var(--ink-faint)]",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 顶栏用的接线版：自己取这条对话的来源 / 图片计数。
 *
 * 数据取在这里而不是由 AppShell 透传，是为了让顶栏只多一个自包含组件——
 * 顶栏不该知道"来源轮次"这种业务概念。
 */
export function AgentCenterTabsLive() {
  // 徽标计数走 spine 合计：窗口外的轮次也计入，且不为计数扫消息正文。
  const totals = useSessionDerivedTotals();
  const activeSessionId = useActiveChatSessionId();
  const setCenterTab = useAgentCenter((state) => state.setCenterTab);

  // 来源与图片是「这条对话」的附属视图：换对话就回回答页，否则会看到一条不属于它的清单。
  const lastSessionRef = useRef(activeSessionId);
  useEffect(() => {
    if (lastSessionRef.current === activeSessionId) return;
    lastSessionRef.current = activeSessionId;
    setCenterTab("answer");
  }, [activeSessionId, setCenterTab]);

  return <AgentCenterTabs linksCount={totals.sources} imagesCount={totals.images} />;
}
