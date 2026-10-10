import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElementWidth } from "./useElementWidth";

type ObserverCallback = () => void;

function stubResizeObserver() {
  const callbacks: ObserverCallback[] = [];
  class FakeResizeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return { fire: () => callbacks.forEach((cb) => cb()) };
}

/** jsdom 没有布局，clientWidth 恒为 0，只能自己定义。 */
function elementWithWidth(width: number): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true, writable: true });
  return el;
}

describe("useElementWidth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("没有 ResizeObserver 时恒返回 0，让调用方走回退宽度", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const el = elementWithWidth(640);
    const { result } = renderHook(() => useElementWidth({ current: el }));
    expect(result.current).toBe(0);
  });

  it("挂载后立刻读出宽度，后续变化按防抖合并", () => {
    vi.useFakeTimers();
    const { fire } = stubResizeObserver();
    const el = elementWithWidth(640);
    const { result } = renderHook(() => useElementWidth({ current: el }, 120));

    expect(result.current).toBe(640);

    // 连续两次抖动只应产生最后一次结果。
    Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
    act(() => {
      fire();
      vi.advanceTimersByTime(60);
    });
    Object.defineProperty(el, "clientWidth", { value: 512, configurable: true });
    act(() => {
      fire();
      vi.advanceTimersByTime(120);
    });

    expect(result.current).toBe(512);
  });

  it("宽度没变时不重渲染（避免分栏动画期间空转）", () => {
    vi.useFakeTimers();
    const { fire } = stubResizeObserver();
    const el = elementWithWidth(400);
    const { result } = renderHook(() => useElementWidth({ current: el }, 120));

    const before = result.current;
    act(() => {
      fire();
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(before);
    expect(result.current).toBe(400);
  });
});
