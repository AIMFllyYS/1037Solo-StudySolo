import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const resource = vi.hoisted(() => ({ acquire: vi.fn(), hydrate: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/stores/assets/imageGen", () => ({
  acquireImageGenLease: resource.acquire,
  hydrateImageGenImages: resource.hydrate,
}));

import AgentImagesPane from "./AgentImagesPane";

afterEach(() => { vi.unstubAllGlobals(); resource.acquire.mockReset(); resource.hydrate.mockReset(); resource.release.mockReset(); });

it("hydrates only a visible generated image tile and releases its payload offscreen", () => {
  let notify!: (entries: Array<{ isIntersecting: boolean }>) => void;
  class Observer {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  resource.acquire.mockReturnValue(resource.release);
  resource.hydrate.mockResolvedValue(true);
  render(<AgentImagesPane images={[{ id: "gen:synthetic:0", imageGenId: "synthetic", kind: "generated", src: "", title: "分子图" }]} />);
  expect(screen.getByText("图片载入中…")).toBeInTheDocument();
  expect(resource.acquire).not.toHaveBeenCalled();
  act(() => notify([{ isIntersecting: true }]));
  expect(resource.acquire).toHaveBeenCalledWith("synthetic");
  expect(resource.hydrate).toHaveBeenCalledWith("synthetic");
  act(() => notify([{ isIntersecting: false }]));
  expect(resource.release).toHaveBeenCalledTimes(1);
});
