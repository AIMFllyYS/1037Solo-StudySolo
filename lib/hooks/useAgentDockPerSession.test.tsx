import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAgentDockMemoryForTests } from "@/lib/window/agentDockSession";

/** 可变的假 store：测试通过改这几个字段 + rerender 来模拟切会话 / 开右栏。 */
const state = {
  sessionId: "s1" as string | null,
  collapsed: true,
  dockGlobal: false,
  activeWindowId: null as string | null,
  pathname: "/agent",
  userCollapsedPreference: false,
};

const setCollapsed = vi.fn((value: boolean) => {
  state.collapsed = value;
});
const setDockGlobal = vi.fn((value: boolean) => {
  state.dockGlobal = value;
});
const setActiveWindow = vi.fn((value: string | null) => {
  state.activeWindowId = value;
});

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/hooks/useChatHistory", () => ({
  useChatHistory: (selector: (s: { activeSessionId: string | null }) => unknown) =>
    selector({ activeSessionId: state.sessionId }),
}));
vi.mock("@/lib/stores/ui", () => ({
  readAgentDockCollapsedPreference: () => state.userCollapsedPreference,
  useStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ agentDockCollapsed: state.collapsed, setAgentDockCollapsedTransient: setCollapsed }),
}));
vi.mock("@/lib/hooks/useWindowManager", () => ({
  useWindowManager: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeWindowId: state.activeWindowId, setActiveWindow }),
}));
vi.mock("@/lib/window/agentDockRuntime", () => ({
  useAgentDockRuntime: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ dockGlobal: state.dockGlobal, setDockGlobal }),
}));

import { useAgentDockPerSession } from "./useAgentDockPerSession";

function Harness() {
  useAgentDockPerSession();
  return null;
}

beforeEach(() => {
  __resetAgentDockMemoryForTests();
  state.sessionId = "s1";
  state.collapsed = true;
  state.dockGlobal = false;
  state.activeWindowId = null;
  state.pathname = "/agent";
  state.userCollapsedPreference = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAgentDockPerSession", () => {
  it("新对话（没有记忆或显式偏好）→ 默认展开右栏", () => {
    state.collapsed = true;
    render(<Harness />);
    expect(setCollapsed).toHaveBeenCalledWith(false);
    expect(state.collapsed).toBe(false);
  });

  it("新对话尊重新版用户明确的收起偏好", () => {
    state.userCollapsedPreference = true;
    state.collapsed = false;
    render(<Harness />);
    expect(setCollapsed).toHaveBeenCalledWith(true);
    expect(state.collapsed).toBe(true);
  });

  it("A 记忆与 B 记忆互不干扰；切回 A 会恢复 A 的展开状态与活动窗口", () => {
    // A：用户把右栏打开，并停在 document-viewer:d1 上
    state.sessionId = "s1";
    state.collapsed = true;
    const view = render(<Harness />);
    state.collapsed = false;
    state.activeWindowId = "document-viewer:d1";
    view.rerender(<Harness />);

    // 切到 B：B 没有记忆 → 默认展开，但不带 A 的窗口
    state.sessionId = "s2";
    view.rerender(<Harness />);
    expect(state.collapsed).toBe(false);
    expect(state.activeWindowId).toBeNull();

    // 切回 A：恢复 A 的展开状态与窗口
    state.sessionId = "s1";
    view.rerender(<Harness />);
    expect(state.collapsed).toBe(false);
    expect(state.activeWindowId).toBe("document-viewer:d1");
  });

  it("非对话页（资产/定时/插件）强制收起，且不覆盖该对话的记忆", () => {
    state.sessionId = "s1";
    state.collapsed = true;
    const view = render(<Harness />);
    state.collapsed = false;
    state.activeWindowId = "document-viewer:d1";
    view.rerender(<Harness />);

    // 进资产页：收起
    state.pathname = "/agent/assets";
    view.rerender(<Harness />);
    expect(state.collapsed).toBe(true);

    // 回到对话页：看到的仍是「离开 A 时的样子」
    state.pathname = "/agent";
    view.rerender(<Harness />);
    expect(state.collapsed).toBe(false);
    expect(state.activeWindowId).toBe("document-viewer:d1");
  });
});
