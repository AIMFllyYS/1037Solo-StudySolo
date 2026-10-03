import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentShell from "./AgentShell";
import { useStore } from "@/lib/stores/ui";

let mobile = false;

vi.mock("@/lib/hooks/useIsMobile", () => ({
  useIsMobile: () => mobile,
}));

vi.mock("./AgentConversationSidebar", () => ({
  default: () => <div>对话</div>,
}));

/** 中央区现在是路由插槽（`app/agent/layout.tsx` 传 children），不再是写死的 ChatPanel。 */
function Center() {
  return <div data-testid="agent-center-child">中央内容</div>;
}

describe("AgentShell", () => {
  afterEach(() => {
    cleanup();
    useStore.setState({
      sidebarCollapsed: false,
      layoutProfile: "full",
      rightCollapsedByProfile: { full: false, article: true, reference: false },
    });
    mobile = false;
  });

  it("桌面固定左对话栏 + 中央插槽；右侧工作区不在这里（由顶层外壳承载）", () => {
    mobile = false;
    render(<AgentShell><Center /></AgentShell>);
    expect(document.querySelector("[data-agent-workspace]")).not.toBeNull();
    expect(document.querySelector('[data-agent-slot="conversations"]')).not.toBeNull();
    expect(document.querySelector('[data-agent-slot="main"]')).not.toBeNull();
    expect(document.querySelector('[data-agent-slot="windows"]')).toBeNull();
    expect(screen.getByTestId("agent-center-child")).toBeInTheDocument();
  });

  it("每个 Agent 子路由中央都有 notes-panel 锚点（窗口全屏要量它）", () => {
    mobile = false;
    render(<AgentShell><Center /></AgentShell>);
    const panel = document.getElementById("notes-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-agent-slot", "main");
  });

  it("左对话栏可收起：面板留在树上（宽度 0），展开入口在顶栏而不是中间", () => {
    mobile = false;
    useStore.setState({ sidebarCollapsed: true });
    render(<AgentShell><Center /></AgentShell>);
    // 收起不再卸载面板：分栏库要留着它才能在展开时还原用户上次拖到的宽度。
    const conversations = document.querySelector('[data-agent-slot="conversations"]');
    expect(conversations).not.toBeNull();
    expect(conversations).toHaveAttribute("data-agent-sidebar-container");
    expect(conversations).toHaveAttribute("data-collapsed", "true");
    expect(document.querySelector('[data-agent-slot="main"]')).not.toBeNull();
    // 展开只有顶栏那一个入口（AppShell TopBar 的 sidebar-toggle，与 Studio 同款）；
    // 中间不再浮「展开对话栏」——它会压住正文，也和顶栏那个开关重复。
    expect(screen.queryByRole("button", { name: "展开对话栏" })).toBeNull();
    expect(document.querySelector('[data-testid="sidebar-toggle"]')).toBeNull();
    // 内容定宽 + 外层裁剪：收起过程中文字不重排。
    const inner = conversations?.firstElementChild as HTMLElement | null;
    expect(inner?.style.width).toContain("--agent-left-content-width");
  });

  it("中央面板里没有悬浮的全屏按钮（F11 那个键归顶栏）", () => {
    mobile = false;
    render(<AgentShell><Center /></AgentShell>);
    // 悬浮版会压在第一条消息上（实测 1440 下按钮 y=60~92，正文从 48 起），
    // 现在它挂在顶栏、紧贴右侧工作区开关左侧；这里只断言"面板里不再有它"。
    expect(screen.queryByRole("button", { name: "全屏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "退出全屏" })).toBeNull();
    expect(document.querySelector('[data-testid="agent-chat-fullscreen"]')).toBeNull();
    expect(document.querySelector('[data-testid="browser-fullscreen"]')).toBeNull();
  });

  it("手机只留中央插槽，不套桌面左栏", () => {
    mobile = true;
    render(<AgentShell><Center /></AgentShell>);
    expect(document.querySelector("[data-agent-workspace]")).not.toBeNull();
    expect(document.querySelector('[data-agent-slot="conversations"]')).toBeNull();
    expect(document.querySelector('[data-agent-slot="windows"]')).toBeNull();
    expect(document.querySelector('[data-agent-slot="main"]')).not.toBeNull();
    expect(screen.getByTestId("agent-center-child")).toBeInTheDocument();
  });
});
