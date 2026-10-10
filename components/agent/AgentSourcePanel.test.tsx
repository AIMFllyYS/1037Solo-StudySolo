import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AgentSourcePanel from "./AgentSourcePanel";
import { translate } from "@/lib/i18n";
import type { SourceRound, TraceSource } from "@/lib/chat/traceSources";
import { SOURCES_PANEL_DEFAULT_SIZE, useAgentCenter } from "@/lib/stores/workspace/agentCenter";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useStore } from "@/lib/stores/ui";
import { useArtifacts } from "@/lib/stores/assets/artifacts";
import { useImageGen } from "@/lib/stores/assets/imageGen";
import { resetAutoOpenedQuizzes } from "@/lib/quiz-dock/open";

const zh = (key: string, vars?: Record<string, string | number>) => translate("zh", key, vars);

/** jsdom 没有 PointerEvent，fireEvent.pointerXxx 造出来的事件不带坐标 —— 用 MouseEvent 带坐标派发。 */
function pointer(el: Element, type: "pointerdown" | "pointermove", x: number, y: number) {
  fireEvent(el, new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

const sources: TraceSource[] = [
  { kind: "web", title: "细胞膜的结构", url: "https://www.example.edu/cell", snippet: "磷脂双分子层构成基本骨架。" },
  { kind: "note", title: "心肌", path: "anatomy/textbook/ch09", snippet: "心肌纤维的横纹。" },
];
const rounds: SourceRound[] = [{ id: "webSearch:0:细胞膜", tool: "webSearch", query: "细胞膜", sources }];

afterEach(() => {
  cleanup();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useStore.setState({ agentDockCollapsed: true });
  useAgentCenter.setState({ sourcesPanelSize: { ...SOURCES_PANEL_DEFAULT_SIZE }, sourcesPanelOpen: true });
  useArtifacts.setState({ order: [], byId: {}, viewerId: null });
  useImageGen.setState({ openIds: [], sessions: {} });
  resetAutoOpenedQuizzes();
});

describe("AgentSourcePanel", () => {
  it("renders nothing when this conversation produced no sources or products", () => {
    render(<AgentSourcePanel rounds={[]} sources={[]} products={[]} open />);
    expect(screen.queryByTestId("agent-source-panel")).not.toBeInTheDocument();
  });

  it("lists quizzes in the same card so Agent chat does not need a mid-thread notice", () => {
    render(
      <AgentSourcePanel
        rounds={[]}
        sources={[]}
        products={[{
          kind: "quiz",
          id: "quiz_1",
          title: "即时检验",
          detail: "3",
          payload: { quizId: "quiz_1", title: "即时检验", questions: [] },
        }]}
        open
      />,
    );
    expect(screen.getAllByText(zh("agent.rail.quiz", { count: 1 })).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("即时检验")).toBeVisible();
    fireEvent.click(screen.getByTestId("agent-rail-quiz"));
    expect(useStore.getState().agentDockCollapsed).toBe(false);
    expect(useWindowManager.getState().windows.some((win) => win.type === "quiz-dock")).toBe(true);
  });

  it("looks like a floating card but reserves real width so it never covers the conversation", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open />);
    // 卡片本身是浮起来的（圆角 + 阴影 + 留白），像悬浮窗而不是占满整列的侧栏。
    const card = screen.getByTestId("agent-source-panel");
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("shadow-");
    expect(card.className).toContain("ml-3");
    // 外层这一列必须占真实宽度：对话列因此被压窄，正文不会钻到卡片底下。
    const column = screen.getByTestId("agent-source-column");
    expect(column.className).toContain("shrink-0");
    expect(column.style.width).toBe(`${SOURCES_PANEL_DEFAULT_SIZE.width + 24}px`);
  });

  it("collapses to zero width instead of unmounting, so the shared pane easing can run", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open={false} />);
    // 关键是"还在树上"：条件渲染会让宽度过渡没有起止两端，动画就跑不起来。
    const column = screen.getByTestId("agent-source-column");
    expect(column).toBeInTheDocument();
    expect(column.style.width).toBe("0px");
    expect(column).toHaveAttribute("aria-hidden", "true");
    expect(column.className).toContain("agent-source-column");
    expect(column.className).toContain("overflow-hidden");
  });

  it("shows the count plus every source's title, snippet and host", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open />);
    expect(screen.getByText(zh("agent.sources.count", { count: 2 }))).toBeVisible();
    // 网页来源同时进顶部走马灯卡与清单行（标题 / host 各出现两次）。
    expect(screen.getAllByText("细胞膜的结构")).toHaveLength(2);
    expect(screen.getByTestId("web-source-carousel")).toBeInTheDocument();
    expect(screen.getByText("磷脂双分子层构成基本骨架。")).toBeVisible();
    expect(screen.getAllByText("example.edu")).toHaveLength(2);
    expect(screen.getByText("心肌")).toBeVisible();
    expect(screen.getByText("anatomy/textbook/ch09")).toBeVisible();
  });

  it("opens the source panel and expands the right dock when a card is clicked", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open />);
    fireEvent.click(screen.getByText("心肌"));
    expect(useStore.getState().agentDockCollapsed).toBe(false);
    expect(useWindowManager.getState().windows.some((win) => win.type === "source-trace-viewer")).toBe(true);
  });

  it("is resizable from the left edge (drag left = wider)", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open />);
    const handle = screen.getByTestId("agent-source-panel-resize-x");
    pointer(handle, "pointerdown", 500, 100);
    pointer(handle, "pointermove", 420, 100);
    // 锚点在右上角：左边缘向左拖 80px = 变宽 80px。
    expect(useAgentCenter.getState().sourcesPanelSize.width).toBe(SOURCES_PANEL_DEFAULT_SIZE.width + 80);
  });

  it("is resizable from the bottom edge and clamps to the minimum", () => {
    render(<AgentSourcePanel rounds={rounds} sources={sources} open />);
    const handle = screen.getByTestId("agent-source-panel-resize-y");
    pointer(handle, "pointerdown", 100, 300);
    pointer(handle, "pointermove", 100, -5000);
    // 往上拖到负数：夹到最小高度，而不是变成 NaN 或负值。
    expect(useAgentCenter.getState().sourcesPanelSize.height).toBe(200);
  });

  /**
   * 「来源 / 出题 / 演示 / 生图 / 文档 同一个层级」（用户口径，对齐 Codex）：
   * 多类并存时标题退回中性容器名，每一类各自出小节标题、各自成行，谁也不从属于谁。
   */
  it("lists every product kind as a peer section under a neutral container title", () => {
    render(
      <AgentSourcePanel
        rounds={rounds}
        sources={sources}
        products={[
          { kind: "quiz", id: "quiz_1", title: "即时检验", detail: "2", payload: { quizId: "quiz_1", title: "即时检验", questions: [] } },
          { kind: "interactive", id: "art_1", title: "解偶联机理", detail: "" },
          { kind: "image", id: "img_1", title: "线粒体示意图", detail: "1024x1024 · 2 张", payload: { id: "img_1", prompt: "线粒体", title: "线粒体示意图", size: "1024x1024", count: 2 } },
          { kind: "document", id: "doc_1", title: "综述", detail: "" },
        ]}
        open
      />,
    );
    // 中性容器标题：不再拿「参考 · N」当主标题把其余几类压成子项。
    expect(screen.getByText(zh("agent.rail.title", { count: 6 }))).toBeVisible();
    for (const label of [
      zh("agent.rail.webSearch", { count: 1 }),
      zh("agent.rail.materials", { count: 1 }),
      zh("agent.rail.quiz", { count: 1 }),
      zh("agent.rail.interactive", { count: 1 }),
      zh("agent.rail.image", { count: 1 }),
      zh("agent.rail.document", { count: 1 }),
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    // 四类产物各自成卡，测试 id 齐备。
    expect(screen.getByTestId("agent-rail-quiz")).toBeVisible();
    expect(screen.getByTestId("agent-rail-interactive")).toBeVisible();
    expect(screen.getByTestId("agent-rail-image")).toBeVisible();
    expect(screen.getByTestId("agent-rail-document")).toBeVisible();
  });

  /** 单类时不该多挂一行冗余小节标题。 */
  it("keeps the header as the only label when a single kind is present", () => {
    render(
      <AgentSourcePanel
        rounds={[]}
        sources={[]}
        products={[{ kind: "image", id: "img_9", title: "海报", detail: "1024x1024 · 1 张", payload: { id: "img_9", prompt: "海报", title: "海报", size: "1024x1024", count: 1 } }]}
        open
      />,
    );
    // 单类时标题已报了这一类，板块自己的折叠标题同名（出现两次是预期）。
    expect(screen.getAllByText(zh("agent.rail.image", { count: 1 })).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("agent-rail-image")).toBeVisible();
  });

  /** 联网搜索结论多（>3 条）时默认折叠，不把出题等板块挤到最底下；点标题展开，条数多时分页放出。 */
  it("collapses a large web-search section by default and expands on demand", () => {
    const many: TraceSource[] = Array.from({ length: 12 }, (_, i) => ({
      kind: "web" as const,
      title: `结论 ${i}`,
      url: `https://site${i}.example.com/p`,
      snippet: `摘要 ${i}`,
    }));
    render(
      <AgentSourcePanel
        rounds={[{ id: "webSearch:0:q", tool: "webSearch", query: "q", sources: many }]}
        sources={many}
        products={[{ kind: "interactive", id: "art_1", title: "解偶联机理", detail: "" }]}
        open
      />,
    );
    const web = screen.getByTestId("agent-rail-section-web");
    expect(web).not.toHaveAttribute("data-open");
    // 产物板块（条数少）默认展开，且不被联网来源压到下面。
    expect(screen.getByTestId("agent-rail-section-interactive")).toHaveAttribute("data-open", "true");
    fireEvent.click(web.querySelector("button")!);
    expect(web).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("agent-rail-web-more")).toBeInTheDocument();
  });

  /** 生图入列后必须点得动：开图窗 + 建会话（以前这一列根本没有生图）。 */
  it("opens the image viewer from the rail, creating the session on the spot", () => {
    useImageGen.setState({ openIds: [], sessions: {} });
    render(
      <AgentSourcePanel
        rounds={[]}
        sources={[]}
        products={[{
          kind: "image",
          id: "img_7",
          title: "线粒体示意图",
          detail: "1024x1024 · 2 张",
          payload: { id: "img_7", prompt: "线粒体内膜", title: "线粒体示意图", size: "1024x1024", count: 2 },
        }]}
        open
      />,
    );
    fireEvent.click(screen.getByTestId("agent-rail-image"));
    expect(useStore.getState().agentDockCollapsed).toBe(false);
    expect(useWindowManager.getState().windows.some((win) => win.type === "image-gen-viewer")).toBe(true);
    expect(useImageGen.getState().sessions.img_7?.prompt).toBe("线粒体内膜");
    expect(useImageGen.getState().openIds).toContain("img_7");
    // 参考列是旁路入口：**不能**替用户批准（生图按张计费），图窗会先停在确认页。
    expect(useImageGen.getState().sessions.img_7?.autoStart).toBeFalsy();
  });

  /**
   * 演示在 Agent 面里是 silent 卡（中间栏不画），产物落盘前用户就可能点参考列。
   * 以前 openViewer 只在产物已存在时才开窗 —— 这一下点击完全没反应（用户口径「不好使」）。
   */
  it("opens the demo dock window even when the artifact has not been saved yet", () => {
    useArtifacts.setState({ order: [], byId: {}, viewerId: null });
    render(
      <AgentSourcePanel
        rounds={[]}
        sources={[]}
        products={[{ kind: "interactive", id: "art_pending", title: "解偶联机理", detail: "" }]}
        open
      />,
    );
    fireEvent.click(screen.getByTestId("agent-rail-interactive"));
    const win = useWindowManager.getState().windows.find((w) => w.type === "artifact-viewer");
    expect(win).toBeTruthy();
    expect(win?.title).toBe("解偶联机理");
    expect(useArtifacts.getState().viewerId).toBe("art_pending");
  });

  it("reuses the demo window instead of stacking duplicates", () => {
    useArtifacts.setState({ order: [], byId: {}, viewerId: null });
    const products = [{ kind: "interactive" as const, id: "art_dup", title: "演示", detail: "" }];
    render(<AgentSourcePanel rounds={[]} sources={[]} products={products} open />);
    fireEvent.click(screen.getByTestId("agent-rail-interactive"));
    fireEvent.click(screen.getByTestId("agent-rail-interactive"));
    expect(useWindowManager.getState().windows.filter((w) => w.type === "artifact-viewer")).toHaveLength(1);
  });
});
