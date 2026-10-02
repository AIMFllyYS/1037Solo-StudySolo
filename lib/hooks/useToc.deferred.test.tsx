import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useStore } from "@/lib/stores/ui";
import { useToc } from "./useToc";

afterEach(() => { vi.unstubAllGlobals(); useStore.setState({ tocItems: [], activeTocId: null }); });

it("builds the outline when an on-demand Markdown renderer mounts headings after the first scan", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    useToc(ref, true, "chapter", "deferred-ready");
    return <div ref={ref} data-testid="root" />;
  }
  const { getByTestId } = render(<Probe />);
  await new Promise((resolve) => setTimeout(resolve, 80));
  act(() => { getByTestId("root").innerHTML = "<article><h2>Late formula section</h2></article>"; });
  await waitFor(() => expect(useStore.getState().tocItems[0]?.text).toBe("Late formula section"));
});
