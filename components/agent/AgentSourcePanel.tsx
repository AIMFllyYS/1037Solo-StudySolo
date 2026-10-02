"use client";

import { Fragment, useCallback, useState } from "react";
import clsx from "clsx";
import { Link2 } from "lucide-react";
import {
  AgentDocumentIcon,
  AgentImageIcon,
  AgentQuizIcon,
  AgentTerminalIcon,
} from "@/components/icons/AgentIcons";
import { SourcePreviewRows, sourcePreviewMeta } from "@/components/chat/SourcePreviewRows";
import WebSourceCarousel from "@/components/chat/WebSourceCarousel";
import { openSourceTrace, sourceItemKey } from "@/lib/chat/openSourceTrace";
import { webSourceHost } from "@/lib/chat/webSearchDisplay";
import type { AgentProductItem, AgentProductKind } from "@/lib/chat/sessionProducts";
import { collectSessionProducts } from "@/lib/chat/sessionProducts";
import type { SummaryProductRef } from "@/lib/storage/sessionSummary";
import { loadTurnsBefore } from "@/lib/storage/chatStorage";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import type { SourceRound, TraceSource } from "@/lib/chat/traceSources";
import { openAgentQuiz } from "@/lib/quiz-dock/open";
import { useArtifacts } from "@/lib/stores/artifacts";
import { useDocuments } from "@/lib/stores/documents";
import { useImageGen } from "@/lib/stores/imageGen";
import { useStore } from "@/lib/stores/ui";
import { SOURCES_PANEL_INSET as INSET, clampSourcesPanelSize, useAgentCenter } from "@/lib/stores/agentCenter";
import { useT } from "@/lib/i18n";

type ResizeAxes = "x" | "y" | "xy";
type DisplayProduct = AgentProductItem | SummaryProductRef;

/** 参考列里各产物板块的展示顺序：来源之外，出题 → 演示 → 生图 → 文档，同级并列。 */
const PRODUCT_SECTIONS: readonly AgentProductKind[] = ["quiz", "interactive", "image", "document"];

function productSectionLabel(t: ReturnType<typeof useT>, kind: AgentProductKind, count: number): string {
  if (kind === "quiz") return t("agent.rail.quiz", { count });
  if (kind === "interactive") return t("agent.rail.interactive", { count });
  if (kind === "image") return t("agent.rail.image", { count });
  return t("agent.rail.document", { count });
}

function productIcon(kind: AgentProductKind) {
  if (kind === "quiz") return AgentQuizIcon;
  if (kind === "document") return AgentDocumentIcon;
  if (kind === "image") return AgentImageIcon;
  return AgentTerminalIcon;
}

function productHint(t: ReturnType<typeof useT>, kind: AgentProductKind): string {
  if (kind === "quiz") return t("agent.rail.openQuiz");
  if (kind === "document") return t("agent.rail.openDocument");
  if (kind === "image") return t("agent.rail.openImage");
  return t("agent.rail.openInteractive");
}

/**
 * 面板标题。
 *
 * 只有**一类**内容时直接报这一类（"来源 · 46"），少一层冗余；一旦同类并列
 * （来源 / 出题 / 演示 / 生图 / 文档），标题退回中性的容器名，各板块再各自出小节标题——
 * 这样它们才是同一个层级，而不是"来源"当主标题、其余挂在下面。
 */
function railTitle(
  t: ReturnType<typeof useT>,
  sources: TraceSource[],
  products: DisplayProduct[],
): string {
  const kinds = productKinds(sources, products);
  if (kinds.length <= 1) {
    if (sources.length) return t("agent.sources.count", { count: sources.length });
    const kind = products[0]?.kind;
    if (kind) return productSectionLabel(t, kind, products.length);
  }
  return t("agent.rail.title", { count: sources.length + products.length });
}

/** 当前面板里实际出现的类别（按展示顺序），用于决定要不要出小节标题。 */
function productKinds(sources: TraceSource[], products: DisplayProduct[]): string[] {
  const kinds = PRODUCT_SECTIONS.filter((kind) => products.some((item) => item.kind === kind));
  return sources.length ? ["sources", ...kinds] : kinds;
}

function ProductRows({
  items,
  onOpen,
}: {
  items: readonly DisplayProduct[];
  onOpen: (item: DisplayProduct) => void;
}) {
  const t = useT();
  return (
    <>
      {items.map((item) => {
        const Icon = productIcon(item.kind);
        const detail = item.kind === "quiz"
          ? t("agent.rail.questions", { count: Number(item.detail) || 0 })
          : item.detail;
        const hint = productHint(t, item.kind);
        return (
          <button
            key={`${item.kind}:${item.id}`}
            type="button"
            data-testid={`agent-rail-${item.kind}`}
            onClick={() => onOpen(item)}
            title={hint}
            className="press flex w-full min-w-0 flex-col gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] px-2.5 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--bg-muted)]"
          >
            <span className="flex min-w-0 items-start gap-1.5">
              <Icon size={13} className="mt-[2px] shrink-0 text-[var(--ink-faint)]" />
              <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-medium leading-[1.35] text-[var(--ink)]">
                {item.title}
              </span>
            </span>
            {detail ? (
              <span className="line-clamp-2 pl-[18px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
                {detail}
              </span>
            ) : null}
            <span className="truncate pl-[18px] text-[10.5px] text-[var(--ink-faint)]">{hint}</span>
          </button>
        );
      })}
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-1 pt-1 text-[10.5px] font-semibold tracking-wide text-[var(--ink-faint)]">
      {children}
    </div>
  );
}

/**
 * 右上角参考列（用户口径，也是 Perplexity / Codex 的做法）。
 *
 * **反直觉点**：它看起来像一块悬浮卡片（圆角 + 阴影 + **可以拖动改大小**），但**占掉真实宽度** ——
 * 它是对话列旁边实打实的一列，正文会真的让开，不会被压住。
 *
 * 现在不只放来源：出题 / 演示 / 文档也从中间聊天迁到这里，点卡片再交给右侧统一面板细看。
 */
export default function AgentSourcePanel({
  sessionId,
  rounds,
  sources,
  products = [],
  open,
}: {
  sessionId?: string | null;
  rounds: SourceRound[];
  sources: TraceSource[];
  products?: DisplayProduct[];
  /**
   * 是否展开。**不卸载**：列常驻、宽度在 0 ↔ 满宽之间过渡，
   * 这样「拉开 / 收起」才能复用全局面板那条横向缓动（见 globals.css 的 .agent-source-column）。
   */
  open: boolean;
}) {
  const t = useT();
  const size = useAgentCenter((state) => state.sourcesPanelSize);
  const setSize = useAgentCenter((state) => state.setSourcesPanelSize);
  const setAgentDockCollapsed = useStore((state) => state.setAgentDockCollapsed);
  const openArtifact = useArtifacts((state) => state.openViewer);
  const openDocument = useDocuments((state) => state.openViewer);
  const openImageGen = useImageGen((state) => state.openViewer);
  /** 拖拽改尺寸期间关掉过渡，否则跟手迟滞（与 [data-resizing] 对全局面板的处理同一个道理）。 */
  const [resizing, setResizing] = useState(false);

  const expandDock = useCallback(() => {
    setAgentDockCollapsed(false);
  }, [setAgentDockCollapsed]);

  const openAt = useCallback(
    (source: TraceSource, index: number) => {
      if (!sources.length) return;
      openSourceTrace(sources, { rounds, activeKey: sourceItemKey(source, index) });
      expandDock();
    },
    [expandDock, rounds, sources],
  );

  const openProduct = useCallback(
    async (item: DisplayProduct) => {
      let full: AgentProductItem | null = "payload" in item ? item as AgentProductItem : null;
      if (!full && (item.kind === "quiz" || item.kind === "image") && sessionId && "turn" in item) {
        const owner = getStorageOwner(), epoch = getOwnerEpoch();
        const window = await loadTurnsBefore(sessionId, item.turn + 1, 1);
        if (owner !== getStorageOwner() || epoch !== getOwnerEpoch()) return;
        full = collectSessionProducts(window?.messages ?? []).find((candidate) => candidate.kind === item.kind && candidate.id === item.id) ?? null;
      }
      if (item.kind === "quiz") { if (full?.kind !== "quiz") return; openAgentQuiz(full.payload); }
      else if (item.kind === "interactive") openArtifact(item.id, item.title);
      else if (item.kind === "image") { if (full?.kind !== "image") return; openImageGen(full.payload); }
      else openDocument(item.id, item.title);
      expandDock();
    },
    [expandDock, openArtifact, openDocument, openImageGen, sessionId],
  );

  /**
   * 拖动改大小。锚点在右上角，所以：
   * - 左边缘向左拖 = 变宽（用起始宽度减去位移）；
   * - 下边缘向下拖 = 变高。
   * 用指针捕获 + 原生监听，拖出面板外也不会断。
   */
  const startResize = useCallback(
    (axes: ResizeAxes) => (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = size;
      const pointerId = event.pointerId;
      setResizing(true);
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        /* jsdom / 老旧浏览器：没有捕获也能靠 document 上的监听走完。 */
      }
      const onMove = (move: PointerEvent) => {
        setSize(
          clampSourcesPanelSize({
            width: axes.includes("x") ? startSize.width - (move.clientX - startX) : startSize.width,
            height: axes.includes("y") ? startSize.height + (move.clientY - startY) : startSize.height,
          }),
        );
      };
      const onEnd = () => {
        setResizing(false);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [setSize, size],
  );

  if (sources.length === 0 && products.length === 0) return null;

  const kinds = productKinds(sources, products);
  /** 同类并列时才出小节标题：单类时标题已经报了它，再挂一行是冗余。 */
  const showSections = kinds.length > 1;
  // Perplexity 式来源条：网页来源横排在清单顶，编号与正文 [n] 对齐（扁平数组序号）。
  const webItems = sources.flatMap((source, index) =>
    source.kind === "web"
      ? [{
          key: sourceItemKey(source, index),
          index: index + 1,
          title: source.title,
          url: source.url,
          host: webSourceHost(source.url),
          icon: source.icon,
          snippet: source.snippet,
        }]
      : [],
  );

  return (
    <aside
      data-testid="agent-source-column"
      data-open={open || undefined}
      data-resizing={resizing || undefined}
      aria-hidden={!open || undefined}
      className={clsx(
        "agent-source-column relative flex h-full shrink-0 flex-col overflow-hidden",
        !open && "pointer-events-none",
      )}
      style={{ width: open ? size.width + INSET * 2 : 0 }}
    >
    <div
      data-testid="agent-source-panel"
      className="relative ml-3 mt-3 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
      style={{ width: size.width, height: size.height }}
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--line-soft)] px-3">
        <Link2 size={13} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[12px] font-semibold text-[var(--ink)]">
          {railTitle(t, sources, products)}
        </span>
      </header>

      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        {sources.length > 0 ? (
          <>
            {showSections ? <SectionLabel>{t("agent.rail.sources")}</SectionLabel> : null}
            {webItems.length > 0 ? (
              <WebSourceCarousel
                compact
                items={webItems}
                onOpen={(item) => {
                  const source = sources[item.index - 1];
                  if (source) openAt(source, item.index - 1);
                }}
                ariaLabel={t("agent.rail.sources")}
              />
            ) : null}
            <SourcePreviewRows
              items={sources.map((source, index) => ({
                key: sourceItemKey(source, index),
                index: index + 1,
                kind: source.kind,
                title: source.title,
                snippet: source.snippet,
                meta: sourcePreviewMeta(source),
              }))}
              onOpen={(item) => {
                const source = sources[item.index - 1];
                if (source) openAt(source, item.index - 1);
              }}
            />
          </>
        ) : null}

        {PRODUCT_SECTIONS.map((kind) => {
          const items = products.filter((item) => item.kind === kind);
          if (!items.length) return null;
          return (
            <Fragment key={kind}>
              {showSections ? (
                <SectionLabel>{productSectionLabel(t, kind, items.length)}</SectionLabel>
              ) : null}
              <ProductRows items={items} onOpen={openProduct} />
            </Fragment>
          );
        })}
      </div>

      <span
        data-testid="agent-source-panel-resize-x"
        onPointerDown={startResize("x")}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize"
      />
      <span
        data-testid="agent-source-panel-resize-y"
        onPointerDown={startResize("y")}
        className="absolute bottom-0 left-0 h-1.5 w-3/4 cursor-ns-resize"
      />
      <span
        data-testid="agent-source-panel-resize-xy"
        onPointerDown={startResize("xy")}
        className="absolute bottom-0 left-0 h-3.5 w-3.5 cursor-nesw-resize"
      />
    </div>
    </aside>
  );
}
