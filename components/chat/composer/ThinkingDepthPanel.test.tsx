import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThinkingDepthPanel from "./ThinkingDepthPanel";
import { getModelInfo } from "@/lib/ai/models";
import { useSettings } from "@/lib/stores/settings";
import type { ThinkingValue } from "@/lib/ai/models/selection/thinkingStops";

function Fixture() {
  const [value, setValue] = useState<ThinkingValue>({ enabled: false, effort: "medium" });
  return <ThinkingDepthPanel model={getModelInfo("mimo-v2.6-pro")!} modelLabel="MiMo 2.6 Pro" selected
    thinkingEnabled={value.enabled} thinkingEffort={value.effort} onPick={setValue}
    fast={{ supported: true, active: true, onToggle() {} }} onChooseModel={() => {}} />;
}
function pointer(input: HTMLElement, type: string, x: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(input, event);
}

describe("effort slider pointer and keyboard contract", () => {
  beforeEach(() => useSettings.setState({ reduceMotion: true, defaultThinking: false, defaultThinkingEffort: "medium" }));
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("captures a drag, clamps both endpoints and snaps on release outside the track", () => {
    render(<Fixture />);
    const range = screen.getByRole("slider") as HTMLInputElement;
    const capture = vi.fn();
    Object.defineProperty(range, "setPointerCapture", { value: capture });
    vi.spyOn(range, "getBoundingClientRect").mockReturnValue({ left: 100, right: 400, width: 300, top: 0, bottom: 44, height: 44, x: 100, y: 0, toJSON() {} });
    pointer(range, "pointerdown", 115);
    expect(capture).toHaveBeenCalledWith(1);
    pointer(range, "pointermove", 500);
    expect(range.value).toBe("3");
    expect(range).toHaveAttribute("aria-valuetext", "High");
    pointer(range, "pointermove", 215);
    expect(range.value).toBe("1");
    expect(screen.getByTestId("model-effort-slider")).toHaveAttribute("data-dragging", "true");
    pointer(range, "pointerup", 0);
    expect(range.value).toBe("0");
    expect(range).toHaveAttribute("aria-valuetext", "关闭");
    expect(screen.getByTestId("model-effort-slider")).not.toHaveAttribute("data-dragging");
  });

  it("cancelling pointer capture stops a later stray move from changing the effort", () => {
    render(<Fixture />);
    const range = screen.getByRole("slider") as HTMLInputElement;
    Object.defineProperty(range, "setPointerCapture", { value: vi.fn() });
    vi.spyOn(range, "getBoundingClientRect").mockReturnValue({ left: 100, right: 400, width: 300, top: 0, bottom: 44, height: 44, x: 100, y: 0, toJSON() {} });
    pointer(range, "pointerdown", 215);
    pointer(range, "pointercancel", 215);
    pointer(range, "pointermove", 500);
    expect(range.value).toBe("1");
    expect(screen.getByTestId("model-effort-slider")).not.toHaveAttribute("data-dragging");
  });

  it("retains native range input and reset while reduced motion skips the Fast sweep", () => {
    render(<Fixture />);
    const range = screen.getByRole("slider");
    fireEvent.change(range, { target: { value: "2" } });
    expect(range).toHaveAttribute("aria-valuetext", "Med");
    fireEvent.click(screen.getByRole("button", { name: "恢复默认思考深度" }));
    expect(range).toHaveAttribute("aria-valuetext", "关闭");
    expect(document.querySelector(".thinking-depth-sheen")).toBeNull();
  });
});
