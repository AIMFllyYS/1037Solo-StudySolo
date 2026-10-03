import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ManagedWindow from "@/components/window/ManagedWindow";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useAppMode } from "@/lib/stores/appMode";
import { useAgentDockRuntime } from "@/lib/window/agentDockRuntime";
import { useOverlayStack } from "@/lib/keyboard/useOverlayStack";
import { useStore } from "@/lib/stores/ui";

const WIN_ID = "test-managed-window";

function openTestWindow() {
  useWindowManager.getState().openWindow({
    id: WIN_ID,
    type: "source-preview",
    title: "测试窗",
    pos: { x: 40, y: 50 },
    size: { width: 480, height: 360 },
    data: { url: "https://example.com", title: "测试窗" },
  });
}

function mountNotesPanel(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.id = NOTES_PANEL_ID;
  el.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => {},
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function mountDockHost() {
  const host = document.createElement("div");
  host.dataset.testid = "agent-dock-content";
  document.body.appendChild(host);
  useAgentDockRuntime.setState({ contentHost: host });
  // 明确设置此 fixture 的停靠状态，避免依赖其他用例留下的 UI 偏好。
  useStore.setState({ agentDockCollapsed: false });
  return host;
}

afterEach(() => {
  cleanup();
  useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: true });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useAgentDockRuntime.setState({ contentHost: null, openRequest: 0, dockGlobal: false });
  // 重置为此测试套件的收起基线；不是产品的新默认值。
  useStore.setState({ agentDockCollapsed: true });
  useOverlayStack.setState({ stack: [] });
  document.getElementById(NOTES_PANEL_ID)?.remove();
  vi.unstubAllGlobals();
});

describe("ManagedWindow", () => {
  it("renders null when the window is not in the manager", () => {
    render(
      <ManagedWindow windowId="missing" title="缺失" onClose={() => {}}>
        <span>payload</span>
      </ManagedWindow>,
    );
    expect(screen.queryByText("payload")).not.toBeInTheDocument();
    expect(screen.queryByText("缺失")).not.toBeInTheDocument();
  });

  it("snaps to #notes-panel when fullscreenTarget is notes", async () => {
    mountNotesPanel({ left: 100, top: 80, width: 700, height: 500 });
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="测试窗" onClose={() => {}} fullscreenTarget="notes">
        <span>payload</span>
      </ManagedWindow>,
    );

    await userEvent.click(screen.getByTitle("全屏"));

    await waitFor(() => {
      const win = useWindowManager.getState().windows.find((w) => w.id === WIN_ID);
      expect(win?.fullscreen).toBe(true);
      expect(win?.pos).toEqual({ x: 100, y: 80 });
      expect(win?.size).toEqual({ width: 700, height: 500 });
    });
  });

  it("fills the viewport when fullscreenTarget is viewport", async () => {
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="测试窗" onClose={() => {}} fullscreenTarget="viewport">
        <span>payload</span>
      </ManagedWindow>,
    );

    await userEvent.click(screen.getByTitle("全屏"));

    await waitFor(() => {
      const win = useWindowManager.getState().windows.find((w) => w.id === WIN_ID);
      expect(win?.fullscreen).toBe(true);
      expect(win?.pos).toEqual({ x: 0, y: 0 });
      expect(win?.size).toEqual({ width: window.innerWidth, height: window.innerHeight });
    });
  });

  it("restores pre-expand geometry when leaving fullscreen", async () => {
    mountNotesPanel({ left: 100, top: 80, width: 700, height: 500 });
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="测试窗" onClose={() => {}} fullscreenTarget="notes">
        <span>payload</span>
      </ManagedWindow>,
    );

    await userEvent.click(screen.getByTitle("全屏"));
    await waitFor(() => {
      expect(useWindowManager.getState().windows[0]?.fullscreen).toBe(true);
    });
    await userEvent.click(screen.getByTitle("还原"));

    await waitFor(() => {
      const win = useWindowManager.getState().windows.find((w) => w.id === WIN_ID);
      expect(win?.fullscreen).toBe(false);
      expect(win?.pos).toEqual({ x: 40, y: 50 });
      expect(win?.size).toEqual({ width: 480, height: 360 });
    });
  });

  it("tracks #notes-panel size when the right panel resizes", async () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const panel = mountNotesPanel({ left: 80, top: 40, width: 900, height: 600 });
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="测试窗" onClose={() => {}} fullscreenTarget="notes">
        <span>payload</span>
      </ManagedWindow>,
    );

    await userEvent.click(screen.getByTitle("全屏"));
    await waitFor(() => {
      expect(useWindowManager.getState().windows[0]?.fullscreen).toBe(true);
      expect(useWindowManager.getState().windows[0]?.size).toEqual({ width: 900, height: 600 });
    });

    panel.getBoundingClientRect = () =>
      ({
        left: 80,
        top: 40,
        width: 520,
        height: 600,
        right: 600,
        bottom: 640,
        x: 80,
        y: 40,
        toJSON: () => {},
      }) as DOMRect;

    act(() => resize?.([], {} as ResizeObserver));

    await waitFor(() => {
      expect(useWindowManager.getState().windows[0]?.size).toEqual({ width: 520, height: 600 });
      expect(useWindowManager.getState().windows[0]?.pos).toEqual({ x: 80, y: 40 });
    });
  });

  it("unmounts children when unmountWhenMinimized is true", async () => {
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="测试窗" onClose={() => {}} unmountWhenMinimized>
        <span>payload</span>
      </ManagedWindow>,
    );
    expect(screen.getByText("payload")).toBeInTheDocument();

    act(() => {
      useWindowManager.getState().minimizeWindow(WIN_ID);
    });

    await waitFor(() => {
      expect(screen.queryByText("payload")).not.toBeInTheDocument();
    });
  });

  it("portals the same business body into the Agent dock without using floating geometry", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    const host = mountDockHost();
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="文档查看器" onClose={() => {}}>
        <span>shared document body</span>
      </ManagedWindow>,
    );

    await waitFor(() => {
      const surface = host.querySelector('[data-surface="dock"]') as HTMLElement | null;
      expect(surface).not.toBeNull();
      expect(surface).toHaveStyle({ display: "flex", width: "100%", height: "100%" });
      expect(surface).toHaveTextContent("shared document body");
      expect(document.body.querySelector('[data-surface="floating"]')).toBeNull();
    });
  });

  it("keeps inactive dock bodies mounted while showing only the active tab", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    const host = mountDockHost();
    const secondId = "second-managed-window";
    openTestWindow();
    useWindowManager.getState().openWindow({
      id: secondId,
      type: "source-preview",
      title: "第二个窗",
      pos: { x: 60, y: 60 },
      size: { width: 480, height: 360 },
      data: { url: "https://example.com/second", title: "第二个窗" },
    });
    render(
      <>
        <ManagedWindow windowId={WIN_ID} title="第一个窗" onClose={() => {}}>
          <span>first body</span>
        </ManagedWindow>
        <ManagedWindow windowId={secondId} title="第二个窗" onClose={() => {}}>
          <span>second body</span>
        </ManagedWindow>
      </>,
    );

    await waitFor(() => {
      expect(host).toHaveTextContent("first body");
      expect(host).toHaveTextContent("second body");
      expect(host.querySelector('[data-surface="dock"][data-window-active]')).toHaveTextContent("second body");
      const surfaces = host.querySelectorAll('[data-surface="dock"]');
      expect(surfaces).toHaveLength(2);
      expect((surfaces[0] as HTMLElement).style.display).toBe("none");
      expect((surfaces[1] as HTMLElement).style.display).toBe("flex");
    });

    act(() => {
      useWindowManager.getState().bringToFront(WIN_ID);
    });

    await waitFor(() => {
      const active = host.querySelector('[data-surface="dock"][data-window-active]');
      expect(active).toHaveTextContent("first body");
      expect(active).not.toHaveTextContent("second body");
    });
  });

  it("does not answer the foreground Esc while the user is typing outside the dock", async () => {
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    const host = mountDockHost();
    openTestWindow();
    render(
      <>
        <textarea data-testid="outside-chat-input" />
        <ManagedWindow windowId={WIN_ID} title="文档" onClose={() => {}}>
          <button type="button" data-testid="dock-inner">
            正文
          </button>
        </ManagedWindow>
      </>,
    );

    await waitFor(() => expect(host.querySelector('[data-surface="dock"]')).not.toBeNull());
    await waitFor(() =>
      expect(useOverlayStack.getState().stack.map((entry) => entry.id)).toContain(WIN_ID),
    );

    await act(async () => screen.getByTestId("outside-chat-input").focus());
    await waitFor(() =>
      expect(useOverlayStack.getState().stack.map((entry) => entry.id)).not.toContain(WIN_ID),
    );

    await act(async () => screen.getByTestId("dock-inner").focus());
    await waitFor(() =>
      expect(useOverlayStack.getState().stack.map((entry) => entry.id)).toContain(WIN_ID),
    );
  });

  it("returns focus to the trigger when a mobile sheet closes", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    openTestWindow();
    render(
      <>
        <button type="button" data-testid="sheet-trigger">
          打开
        </button>
        <ManagedWindow windowId={WIN_ID} title="移动文档" onClose={() => {}}>
          <span>mobile body</span>
        </ManagedWindow>
      </>,
    );

    const trigger = screen.getByTestId("sheet-trigger");
    await act(async () => trigger.focus());
    await waitFor(() => expect(document.body.querySelector('[data-surface="sheet"]')).not.toBeNull());

    await act(async () => {
      useWindowManager.getState().closeWindow(WIN_ID);
    });

    await waitFor(() => expect(document.body.querySelector('[data-surface="sheet"]')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("uses a mobile sheet when Agent has no desktop dock host and does not expose floating controls", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    useAppMode.setState({ mode: "agent", lastStudioPath: "/", hydrated: true });
    openTestWindow();
    render(
      <ManagedWindow windowId={WIN_ID} title="移动文档" onClose={() => {}}>
        <span>mobile body</span>
      </ManagedWindow>,
    );

    await waitFor(() => {
      const surface = document.body.querySelector('[data-surface="sheet"]') as HTMLElement | null;
      expect(surface).not.toBeNull();
      expect(surface).toHaveTextContent("mobile body");
      expect(surface?.style.position).toBe("fixed");
      expect(screen.queryByTitle("收起当前标签")).not.toBeInTheDocument();
      expect(screen.queryByTitle("扩展窗口")).not.toBeInTheDocument();
    });
  });
});
