import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStore } from "@/lib/stores/ui";
import { AGENT_PANEL_SIZES_KEY } from "@/lib/layout/agentPanelSizes";

vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hooks/useAgentDockPerSession", () => ({ useAgentDockPerSession: () => {} }));
vi.mock("./AgentConversationSidebar", () => ({ default: () => <div>Conversations</div> }));
import AgentShell from "./AgentShell";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  localStorage.clear();
  useStore.setState({ sidebarCollapsed: false, agentDockCollapsed: false, agentPanelSizes: { left: 280, right: 480 } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("右栏拖动和开合不改变左栏一帧的像素宽度；用户左栏尺寸在收起展开后恢复", () => {
  const persist = vi.spyOn(useStore.getState(), "setSidebarCollapsed");
  render(<AgentShell><div>Composer</div></AgentShell>);
  const left = document.querySelector<HTMLElement>('[data-agent-slot="conversations"]')!;
  expect(left.style.width).toBe("280px");
  expect(persist).not.toHaveBeenCalled();
  act(() => useStore.getState().setAgentPanelSize("right", 600));
  expect(left.style.width).toBe("280px");
  act(() => useStore.setState({ agentDockCollapsed: true }));
  expect(left.style.width).toBe("280px");
  act(() => useStore.setState({ agentDockCollapsed: false }));
  expect(left.style.width).toBe("280px");

  fireEvent.keyDown(screen.getByTestId("agent-left-resize"), { key: "ArrowRight" });
  expect(left.style.width).toBe("296px");
  expect(useStore.getState().agentPanelSizes?.right).toBe(600);
  expect(JSON.parse(localStorage.getItem(AGENT_PANEL_SIZES_KEY)!)).toEqual({ left: 296, right: 600 });
  act(() => useStore.setState({ sidebarCollapsed: true }));
  expect(left.style.width).toBe("0px");
  act(() => useStore.setState({ sidebarCollapsed: false }));
  expect(left.style.width).toBe("296px");
  expect(persist).not.toHaveBeenCalled();

  fireEvent.keyDown(screen.getByTestId("agent-left-resize"), { key: "Enter" });
  expect(persist).toHaveBeenCalledWith(true);
  expect(localStorage.getItem("gailvlun-sidebar-collapsed")).toBe("true");
});

it("路由重挂载直接使用统一尺寸，不发生比例布局后再恢复", () => {
  const view = render(<AgentShell><div>Composer</div></AgentShell>);
  fireEvent.keyDown(screen.getByTestId("agent-left-resize"), { key: "ArrowRight" });
  view.unmount();
  render(<AgentShell><div>Another page</div></AgentShell>);
  expect(document.querySelector<HTMLElement>('[data-agent-slot="conversations"]')?.style.width).toBe("296px");
});
