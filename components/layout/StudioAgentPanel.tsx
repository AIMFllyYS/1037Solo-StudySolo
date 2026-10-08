"use client";

import { useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { useStore } from "@/lib/stores/ui";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import type { ChatContext } from "@/lib/types/chat";
import { useT } from "@/lib/i18n";
import RightAgentHeader from "@/components/workspace/RightAgentHeader";
import { PanelSkeleton } from "@/components/shared/LoadingStates";

const ChatPanel = dynamic(() => import("@/components/chat/ChatPanel"), {
  ssr: false,
  loading: () => <AgentPanelLoading />,
});

function AgentPanelLoading() {
  const t = useT();
  return <PanelSkeleton variant="chat" label={t("panel.rightTab.loading", { label: t("panel.rightTab.ai") })} />;
}

/**
 * 全站唯一的 Agent 面板（Cursor 式）：顶部最近对话标签 + 「＋」，右侧纯图标
 * （历史 / 设置 / 收起），下面是同一个 ChatPanel。
 *
 * Studio 右栏、Class 右栏都挂它——同一套会话、标签、历史、工具卡片、计费与动效，
 * 不再各写一套聊天。场景差异只通过 chatContext（Studio 绑定当前页；Class 不绑页，
 * 课堂上下文由课堂工作台注册的 provider 随请求上行）表达。
 */
export default function StudioAgentPanel({
  onCollapse,
  chatContext: override,
  className,
}: {
  onCollapse?: () => void;
  /** 覆盖默认的「当前页」语境（Class 模式不绑定 Studio 页面）。 */
  chatContext?: ChatContext;
  className?: string;
}) {
  const openAgentSettings = useStore((s) => s.openAgentSettings);
  const layoutProfile = useStore((s) => s.layoutProfile);
  const setRightCollapsedForProfile = useStore((s) => s.setRightCollapsedForProfile);

  const activeSubjectId = useStore((s) => s.activeSubjectId);
  const activeCategoryId = useStore((s) => s.activeCategoryId);
  const activeItemId = useStore((s) => s.activeItemId);
  const academicYear = useAcademicYear((s) => s.year);
  const pageContext: ChatContext = useMemo(
    () => ({
      subjectId: activeSubjectId,
      categoryId: activeCategoryId,
      itemId: activeItemId,
      currentTopic: `${activeSubjectId} ${activeCategoryId} ${activeItemId}`,
      academicYear,
    }),
    [activeSubjectId, activeCategoryId, activeItemId, academicYear],
  );
  const chatContext = override ?? pageContext;

  const collapse = useCallback(() => {
    if (onCollapse) onCollapse();
    else setRightCollapsedForProfile(layoutProfile, true);
  }, [layoutProfile, onCollapse, setRightCollapsedForProfile]);

  return (
    <div
      data-testid="studio-agent-panel"
      className={clsx("flex h-full flex-col border-l border-[var(--line-soft)] bg-[var(--bg-panel)]", className)}
    >
      <RightAgentHeader chatContext={chatContext} onOpenSettings={openAgentSettings} onCollapse={collapse} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ChatPanel chatContext={chatContext} hideHeader />
      </div>
    </div>
  );
}
