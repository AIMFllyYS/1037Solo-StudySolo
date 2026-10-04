import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/stores/ui";
import { useCloseMobileSidebarOnModeChange } from "./useCloseMobileSidebarOnModeChange";

function Probe({ mode, isMobile }: { mode: string; isMobile: boolean }) {
  useCloseMobileSidebarOnModeChange(mode, isMobile);
  return null;
}

describe("useCloseMobileSidebarOnModeChange", () => {
  beforeEach(() => useStore.setState({ mobileSidebarOpen: false }));
  afterEach(cleanup);

  it("closes the shared drawer when the mode or viewport shell changes", () => {
    const view = render(<Probe mode="class" isMobile />);
    useStore.getState().setMobileSidebarOpen(true);
    expect(useStore.getState().mobileSidebarOpen).toBe(true);

    view.rerender(<Probe mode="review" isMobile />);
    expect(useStore.getState().mobileSidebarOpen).toBe(false);

    useStore.getState().setMobileSidebarOpen(true);
    view.rerender(<Probe mode="review" isMobile={false} />);
    expect(useStore.getState().mobileSidebarOpen).toBe(false);
  });
});
