import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStore } from "@/lib/stores/ui";

const panel = vi.hoisted(() => ({
  collapsed: false,
  size: 35,
  savedSize: 35,
  onResize: undefined as ((size: number, previous?: number) => void) | undefined,
  resize: vi.fn(),
}));
vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hooks/useAgentDockPerSession", () => ({ useAgentDockPerSession: () => {} }));
vi.mock("./AgentConversationSidebar", () => ({ default: () => <div>Conversations</div> }));
vi.mock("react-resizable-panels", async () => {
  const React = await import("react");
  return {
    PanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PanelResizeHandle: () => <div />,
    Panel: React.forwardRef(function TestPanel({ id, children, onResize }: { id: string; children: React.ReactNode; onResize?: typeof panel.onResize }, ref) {
      React.useImperativeHandle(ref, () => ({
        isCollapsed: () => panel.collapsed,
        collapse: () => { panel.savedSize = panel.size; panel.size = 0; panel.collapsed = true; },
        expand: () => { panel.size = panel.savedSize; panel.collapsed = false; },
        resize: panel.resize,
      }));
      if (id === "agent-conversations") panel.onResize = onResize;
      return <div>{children}</div>;
    }),
  };
});
import AgentShell from "./AgentShell";

beforeEach(() => {
  panel.collapsed = false; panel.size = 35; panel.savedSize = 35; panel.resize.mockClear();
  localStorage.clear();
  useStore.setState({ sidebarCollapsed: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("ignores initialization and deferred programmatic callbacks; a user resize survives collapse and expand", async () => {
  const persist = vi.spyOn(useStore.getState(), "setSidebarCollapsed");
  render(<AgentShell><div>Composer</div></AgentShell>);
  await act(async () => { panel.onResize?.(35, undefined); await Promise.resolve(); });
  expect(persist).not.toHaveBeenCalled();
  panel.size = 39;
  act(() => panel.onResize?.(39, 35));
  expect(persist).not.toHaveBeenCalled();

  act(() => useStore.setState({ sidebarCollapsed: true }));
  // The library delivers collapse after the effect returns. It is still a restore.
  act(() => panel.onResize?.(0, 39));
  expect(persist).not.toHaveBeenCalled();
  act(() => useStore.setState({ sidebarCollapsed: false }));
  act(() => panel.onResize?.(39, 0));
  expect(persist).not.toHaveBeenCalled();
  expect(panel.size).toBe(39);
  expect(panel.resize).not.toHaveBeenCalled();

  panel.collapsed = true; panel.savedSize = panel.size; panel.size = 0;
  act(() => panel.onResize?.(0, 39));
  expect(persist).toHaveBeenCalledWith(true);
  expect(localStorage.getItem("gailvlun-sidebar-collapsed")).toBe("true");
});
