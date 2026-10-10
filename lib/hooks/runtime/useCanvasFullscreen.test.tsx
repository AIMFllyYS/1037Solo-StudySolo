import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCanvasFullscreen } from "./useCanvasFullscreen";

describe("useCanvasFullscreen", () => {
  it("初始 fullscreen 为 false", () => {
    const { result } = renderHook(() => useCanvasFullscreen());
    expect(result.current.fullscreen).toBe(false);
  });

  it("toggle 切换全屏状态", () => {
    const { result } = renderHook(() => useCanvasFullscreen());
    act(() => result.current.toggle());
    expect(result.current.fullscreen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.fullscreen).toBe(false);
  });

  it("exit 设置 fullscreen 为 false", () => {
    const { result } = renderHook(() => useCanvasFullscreen());
    act(() => result.current.toggle());
    expect(result.current.fullscreen).toBe(true);
    act(() => result.current.exit());
    expect(result.current.fullscreen).toBe(false);
  });
});
