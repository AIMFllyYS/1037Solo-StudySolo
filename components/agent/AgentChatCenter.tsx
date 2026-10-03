"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import ChatPanel from "@/components/chat/ChatPanel";
import AgentLinksPane from "@/components/agent/AgentLinksPane";
import AgentImagesPane from "@/components/agent/AgentImagesPane";
import AgentSourcePanel from "@/components/agent/AgentSourcePanel";
import { useAgentChatContext } from "@/lib/hooks/useAgentChatContext";
import { SOURCES_PANEL_INSET, hydrateSourcesPanelSize, useAgentCenter } from "@/lib/stores/agentCenter";
import { useSessionSourceRounds } from "@/lib/hooks/useSessionSources";
import { useSessionProducts } from "@/lib/hooks/useSessionProducts";
import { useSessionImages } from "@/lib/hooks/useSessionImages";
import { useSessionDerivedTotals } from "@/lib/hooks/useSessionDerivedTotals";
import { useChatHistory } from "@/lib/stores/chatHistory";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useStore } from "@/lib/stores/ui";
import { loadSessionSummary, type SessionSummary } from "@/lib/storage/sessionSummary";
import { traceSourceKey, type SourceRound, type TraceSource } from "@/lib/chat/traceSources";
import { mergeGeneratedImages, type AgentImageItem, type GeneratedImage } from "@/lib/agent/sessionImages";
import { useImageGen } from "@/lib/stores/imageGen";

function mergeRounds(older: SourceRound[], current: SourceRound[], offset: number): { rounds: SourceRound[]; sources: TraceSource[] } {
  const seen = new Set<string>();
  const rounds: SourceRound[] = [];
  for (const [fromWindow, group] of [[false, older], [true, current]] as const) {
    for (const round of group) {
      const id = fromWindow ? round.id.replace(/^(\d+):/, (_, raw: string) => `${Number(raw) + offset}:`) : round.id;
      const sources = round.sources.filter((source) => {
        const key = traceSourceKey(source);
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((source) => ({ ...source, roundId: id }));
      if (sources.length) rounds.push({ ...round, id, sources });
    }
  }
  return { rounds, sources: rounds.flatMap((round) => round.sources) };
}

/**
 * Agent 中央对话（`/agent` 的内容）。左栏与右侧工作区分别由 AgentShell / AppShell 承载。
 *
 * 版面与 Perplexity / Codex 一致：正文占满中央，**参考列是一块「看起来像悬浮卡片、实际占真实宽度」的列**
 * 钉在右上角（不是右侧那套统一面板 —— 那套要能装多种查看器，是另一回事）。它可拖动改大小，
 * 除了来源，也放出题 / 演示 / 文档入口；右栏一展开就整条让位。
 *
 * **回答页签只隐藏、不卸载** ChatPanel：ChatThread 的划词容器 ref 是它挂载时绑定的，
 * 卸载再挂载会让 SelectionPopover 错过新节点，Agent 里就再也选不中文字（见 ChatPanel 注释）。
 */
export default function AgentChatCenter() {
  const chatContext = useAgentChatContext();
  const centerTab = useAgentCenter((state) => state.centerTab);
  const sourcesPanelOpen = useAgentCenter((state) => state.sourcesPanelOpen);
  const dockCollapsed = useStore((state) => state.agentDockCollapsed);
  const isMobile = useIsMobile();
  const activeSessionId = useChatHistory((state) => state.activeSessionId);
  const windowStartIndex = useChatHistory((state) => activeSessionId ? state.sessionWindowById[activeSessionId]?.startIndex ?? 0 : 0);
  const generatedSessions = useImageGen((state) => state.sessions);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // 「还有没有在窗口外的来源/产物」看 spine 合计：sources.length 只覆盖已加载窗口。
  const totals = useSessionDerivedTotals();

  // 来源列尺寸存在 localStorage：首帧之后读回来，避免 SSR/水合不一致。
  useEffect(() => {
    hydrateSourcesPanelSize();
  }, []);

  /**
   * 把来源列的宽度写给顶栏：顶栏那三个切面要**只在对话列上居中**。
   * 不然它会居中在「对话列 + 来源列」上，视觉上偏右（用户口径：要偏左一点，跟 Perplexity 一样）。
   */
  const sourcesWidth = useAgentCenter((state) => state.sourcesPanelSize.width);

  const showSourcesPanel =
    !isMobile && dockCollapsed && sourcesPanelOpen && centerTab === "answer" && (totals.sources > 0 || totals.products > 0);
  const wantsSummary = centerTab === "links" || centerTab === "images" || showSourcesPanel;
  const visibleSummary = wantsSummary && summary?.sessionId === activeSessionId ? summary : null;

  // 明细清单只在对应视图开着时才扫消息：流式期 messages 每 tick 换新引用，
  // 三个 hook 无条件扫 = 每 tick 全量税（d2-P1-3）。开关用 spine 合计驱动，不吃这套扫描。
  const currentSources = useSessionSourceRounds(undefined, centerTab === "links" || showSourcesPanel);
  const currentProducts = useSessionProducts(undefined, showSourcesPanel);
  const currentImages = useSessionImages(centerTab === "images");

  useEffect(() => {
    if (!wantsSummary || !activeSessionId) return;
    const controller = new AbortController();
    void loadSessionSummary(activeSessionId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setSummary(value);
    }).catch(() => { if (!controller.signal.aborted) setSummary(null); });
    return () => controller.abort();
  }, [wantsSummary, activeSessionId]);

  const { rounds, sources } = useMemo(() => mergeRounds(
    visibleSummary?.sourceRefs.filter((ref) => ref.messageIndex < windowStartIndex).map((ref) => ref.round) ?? [],
    currentSources.rounds,
    windowStartIndex,
  ), [visibleSummary, currentSources.rounds, windowStartIndex]);
  const products = useMemo(() => {
    const older = visibleSummary?.productRefs.filter((ref) => ref.messageIndex < windowStartIndex) ?? [];
    const seen = new Set(older.map((item) => `${item.kind}:${item.id}`));
    return [...older, ...currentProducts.filter((item) => !seen.has(`${item.kind}:${item.id}`))];
  }, [visibleSummary, currentProducts, windowStartIndex]);
  const images = useMemo(() => {
    const older = visibleSummary?.imageRefs.filter((ref) => ref.messageIndex < windowStartIndex).map((ref) => ref.item) ?? [];
    const seen = new Set(older.map((item) => item.src));
    const base: AgentImageItem[] = [...older, ...currentImages.filter((item) => !seen.has(item.src))];
    const generated: GeneratedImage[] = [];
    const placeholders: AgentImageItem[] = [];
    for (const ref of visibleSummary?.productRefs ?? []) {
      if (ref.kind !== "image" || ref.messageIndex >= windowStartIndex) continue;
      const session = generatedSessions[ref.id];
      if (session?.status !== "done") continue;
      if (session.bodyRef && !session.images.length) {
        for (let index = 0; index < Math.max(1, session.count); index++) placeholders.push({ id: `gen:${session.id}:${index}`, kind: "generated", imageGenId: session.id, src: "", title: session.title, alt: session.prompt });
      } else if (session.images.length) generated.push({ imageGenId: session.id, title: session.title, prompt: session.prompt, images: session.images });
    }
    return [...mergeGeneratedImages(base, generated), ...placeholders].filter((item, index, all) => all.findIndex((other) => (other.src || other.id) === (item.src || item.id)) === index);
  }, [visibleSummary, windowStartIndex, currentImages, generatedSessions]);

  useEffect(() => {
    const root = document.documentElement;
    // 写 <html> 而不是本节点：消费方是顶栏（祖先）。
    root.style.setProperty("--agent-sources-width", showSourcesPanel ? `${sourcesWidth + SOURCES_PANEL_INSET * 2}px` : "0px");
    return () => {
      root.style.removeProperty("--agent-sources-width");
    };
  }, [showSourcesPanel, sourcesWidth]);

  return (
    /* 对话列与来源列是 flex 兄弟：来源列占真实宽度 → 对话列被压窄，正文不会钻到卡片底下。
       隐藏来源那一列时，对话列拿回整宽，居中自动重新落在「左栏右侧那块区域」的正中间。 */
    <div className="flex h-full min-h-0" data-testid="agent-chat-center">
      <div className="relative min-h-0 min-w-0 flex-1">
        <div className={clsx("h-full min-h-0", centerTab !== "answer" && "hidden")} data-testid="agent-center-answer">
          <ChatPanel chatContext={chatContext} hideHeader emptyLayout="agent" agentMain />
        </div>
        {centerTab === "links" ? <AgentLinksPane rounds={rounds} sources={sources} sessionId={activeSessionId} unknownTools={visibleSummary?.unknownToolRefs} /> : null}
        {centerTab === "images" ? <AgentImagesPane images={images} /> : null}
      </div>
      {/* 常驻（不是条件渲染）：宽度过渡才能跑起来，见 AgentSourcePanel 的 open。 */}
      <AgentSourcePanel sessionId={activeSessionId} rounds={rounds} sources={sources} products={products} open={showSourcesPanel} />
    </div>
  );
}
