import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { resolveRouteLayout } from "@/lib/content/routeLayout";
import { useShellLifecycle } from "./useShellLifecycle";

const mocks = vi.hoisted(() => ({
  hydrateLayout: vi.fn(), setActiveRoute: vi.fn(), setTocData: vi.fn(), hydrateMode: vi.fn(),
  syncFromPathname: vi.fn(), rememberStudioPath: vi.fn(), hydrateSettings: vi.fn(), replace: vi.fn(),
  setWindowSessionProvider: vi.fn(), activeSessionId: "first",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/stores/ui", () => ({ useStore: (select: (state: typeof mocks) => unknown) => select(mocks) }));
vi.mock("@/lib/stores/appMode", () => ({ useAppMode: (select: (state: object) => unknown) => select({
  hydrate: mocks.hydrateMode, syncFromPathname: mocks.syncFromPathname, rememberStudioPath: mocks.rememberStudioPath,
  lastStudioPath: "/probability/detail/2.3",
}) }));
vi.mock("@/lib/stores/settings", () => ({ hydrateSettings: mocks.hydrateSettings }));
vi.mock("@/lib/stores/workspace/windowManager", () => ({ setWindowSessionProvider: mocks.setWindowSessionProvider }));
vi.mock("@/lib/stores/chat/chatHistory", () => ({ useChatHistory: { getState: () => ({ activeSessionId: mocks.activeSessionId }) } }));

function Harness({ pathname, mobile = false, resizing = false }: { pathname: string; mobile?: boolean; resizing?: boolean }) {
  const { modeShellRef, panelMotionReady } = useShellLifecycle({ pathname, route: resolveRouteLayout(pathname).route,
    isMobile: mobile, reducedMotion: false, isResizing: resizing });
  return <div ref={modeShellRef} data-testid="shell" data-ready={String(panelMotionReady)} />;
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.activeSessionId = "first"; });
afterEach(() => { cleanup(); vi.useRealTimers(); document.documentElement.removeAttribute("data-panels-ready"); });

describe("shell lifecycle ownership", () => {
  it("hydrates route state, reads live window sessions and releases the provider on unmount", () => {
    const { unmount } = render(<Harness pathname="/probability/detail/2.3" />);
    expect(mocks.hydrateLayout).toHaveBeenCalled();
    expect(mocks.hydrateMode).toHaveBeenCalled();
    expect(mocks.hydrateSettings).toHaveBeenCalled();
    expect(mocks.setActiveRoute).toHaveBeenCalledWith("probability", "detail", "2.3");
    expect(mocks.syncFromPathname).toHaveBeenCalledWith("/probability/detail/2.3", { retainAgentOnStudio: false });
    const provider = mocks.setWindowSessionProvider.mock.calls[0][0] as () => string;
    expect(provider()).toBe("first");
    mocks.activeSessionId = "second";
    expect(provider()).toBe("second");
    act(() => vi.advanceTimersByTime(120));
    expect(screen.getByTestId("shell")).toHaveAttribute("data-ready", "true");
    unmount();
    expect(mocks.setWindowSessionProvider).toHaveBeenLastCalledWith(null);
  });

  it("cancels a committed route animation as soon as resizing starts", () => {
    const { rerender } = render(<Harness pathname="/agent" />);
    rerender(<Harness pathname="/class" />);
    expect(screen.getByTestId("shell")).toHaveAttribute("data-mode-entering", "true");
    rerender(<Harness pathname="/class" resizing />);
    expect(screen.getByTestId("shell")).not.toHaveAttribute("data-mode-entering");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("shell")).not.toHaveAttribute("data-mode-entering");
  });

  it("keeps mobile conversation deep links while redirecting the ordinary Agent route", () => {
    const { rerender } = render(<Harness pathname="/c/deep-session" mobile />);
    expect(mocks.replace).not.toHaveBeenCalled();
    rerender(<Harness pathname="/agent" mobile />);
    expect(mocks.replace).toHaveBeenCalledWith("/probability/detail/2.3");
    expect(mocks.setTocData).toHaveBeenCalledWith([], null);
  });
});
