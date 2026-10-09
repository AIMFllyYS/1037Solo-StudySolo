"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Link2 } from "lucide-react";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
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

/** 网页来源每次多放出多少条（超过 3 条默认折叠，展开后也先只放一页）。 */
const WEB_PAGE = 8;

/**
 * 可折叠板块：标题行（箭头 + 标题）+ 内容。折叠时标题下面只留一行淡色摘要，
 * 这样一次联网搜索几十条结论不会把出题 / 演示 / 文档这些板块压到最底下。
 */
function RailSection({
  id,
  title,
  open,
  onToggle,
  summary,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  summary?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section data-testid={`agent-rail-section-${id}`} data-open={open || undefined} className="shrink-0 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? t("agent.rail.collapse") : t("agent.rail.expand")}
        className="press flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-1 text-left hover:bg-[var(--bg-muted)]"
      >
        <ChevronDown
          size={13}
          className="shrink-0 text-[var(--ink-faint)] transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide text-[var(--ink-soft)]">{title}</span>
      </button>
      {!open && summary ? (
        <div className="truncate pb-1 pl-[22px] pr-2 text-[11px] text-[var(--ink-faint)]">{summary}</div>
      ) : null}
      <AnimatedCollapse isOpen={open}>
        <div className="flex flex-col gap-1.5 pt-0.5">{children}</div>
      </AnimatedCollapse>
    </section>
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
  floating = false,
}: {
  sessionId?: string | null;
  rounds: SourceRound[];
  sources: TraceSource[];
  products?: DisplayProduct[];
  /** 右侧工作区展开时没有横向空间放一整列：改成浮在对话区右上角的卡片（点「来源与产物」小标签打开）。 */
  floating?: boolean;
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
  /** 各板块的展开状态：未手动切换过的用默认值（超过 3 条默认折叠）。 */
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [webLimit, setWebLimit] = useState(WEB_PAGE);
  const sectionOpen = (key: string, fallback: boolean) => openMap[key] ?? fallback;
  const toggleSection = (key: string, fallback: boolean) =>
    setOpenMap((prev) => ({ ...prev, [key]: !(prev[key] ?? fallback) }));

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
  if (floating && !open) return null;

  const rowOf = (source: TraceSource, index: number) => ({
    key: sourceItemKey(source, index),
    index: index + 1,
    kind: source.kind,
    title: source.title,
    snippet: source.snippet,
    meta: sourcePreviewMeta(source),
  });
  const webRows = sources.flatMap((source, index) => (source.kind === "web" ? [rowOf(source, index)] : []));
  const materialRows = sources.flatMap((source, index) => (source.kind !== "web" ? [rowOf(source, index)] : []));
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
      data-floating={floating || undefined}
      data-resizing={resizing || undefined}
      aria-hidden={!open || undefined}
      className={clsx(
        floating
          ? "absolute right-2 top-2 z-30 flex max-w-[calc(100%-1rem)] flex-col"
          : "agent-source-column relative flex h-full shrink-0 flex-col overflow-hidden",
        !open && "pointer-events-none",
      )}
      style={floating ? undefined : { width: open ? size.width + INSET * 2 : 0 }}
    >
    <div
      data-testid="agent-source-panel"
      className={clsx(
        "relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)]",
        floating ? "shadow-[0_8px_28px_rgba(0,0,0,0.16)]" : "ml-3 mt-3 shadow-[0_2px_10px_rgba(0,0,0,0.06)]",
      )}
      style={floating ? { width: size.width, maxWidth: "100%", height: size.height, maxHeight: "70vh" } : { width: size.width, height: size.height }}
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--line-soft)] px-3">
        <Link2 size={13} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[12px] font-semibold text-[var(--ink)]">
          {railTitle(t, sources, products)}
        </span>
      </header>

      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        {webItems.length > 0 ? (
          <RailSection
            id="web"
            title={t("agent.rail.webSearch", { count: webItems.length })}
            open={sectionOpen("web", webItems.length <= 3)}
            onToggle={() => toggleSection("web", webItems.length <= 3)}
            summary={webItems.slice(0, 3).map((item) => item.host).filter(Boolean).join(" · ")}
          >
            <WebSourceCarousel
              compact
              items={webItems}
              onOpen={(item) => {
                const source = sources[item.index - 1];
                if (source) openAt(source, item.index - 1);
              }}
              ariaLabel={t("agent.rail.sources")}
            />
            <SourcePreviewRows
              items={webRows.slice(0, webLimit)}
              onOpen={(item) => {
                const source = sources[item.index - 1];
                if (source) openAt(source, item.index - 1);
              }}
            />
            {webRows.length > WEB_PAGE ? (
              <button
                type="button"
                data-testid="agent-rail-web-more"
                onClick={() => setWebLimit((n) => (n >= webRows.length ? WEB_PAGE : n + WEB_PAGE))}
                className="press w-full rounded-md py-1 text-center text-[11.5px] text-[var(--accent)] hover:bg-[var(--bg-muted)]"
              >
                {webLimit >= webRows.length
                  ? t("agent.rail.showLess")
                  : t("agent.rail.showMore", { count: webRows.length - webLimit })}
              </button>
            ) : null}
          </RailSection>
        ) : null}

        {materialRows.length > 0 ? (
          <RailSection
            id="materials"
            title={t("agent.rail.materials", { count: materialRows.length })}
            open={sectionOpen("materials", materialRows.length <= 3)}
            onToggle={() => toggleSection("materials", materialRows.length <= 3)}
            summary={materialRows.slice(0, 3).map((item) => item.title).join(" · ")}
          >
            <SourcePreviewRows
              items={materialRows}
              onOpen={(item) => {
                const source = sources[item.index - 1];
                if (source) openAt(source, item.index - 1);
              }}
            />
          </RailSection>
        ) : null}

        {PRODUCT_SECTIONS.map((kind) => {
          const items = products.filter((item) => item.kind === kind);
          if (!items.length) return null;
          return (
            <RailSection
              key={kind}
              id={kind}
              title={productSectionLabel(t, kind, items.length)}
              open={sectionOpen(kind, items.length <= 3)}
              onToggle={() => toggleSection(kind, items.length <= 3)}
              summary={items.slice(0, 3).map((item) => item.title).join(" · ")}
            >
              <ProductRows items={items} onOpen={openProduct} />
            </RailSection>
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
