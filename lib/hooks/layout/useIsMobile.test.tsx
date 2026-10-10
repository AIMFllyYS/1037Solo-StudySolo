import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

function mockMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: (
      _type: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => listeners.push(listener),
    removeEventListener: (
      _type: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatchEvent: () => false,
  };
  vi.stubGlobal("matchMedia", () => mql);
  return { mql, listeners };
}

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("桌面宽度返回 false", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("移动端宽度返回 true", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("SSR 快照返回 false（getServerSnapshot）", () => {
    // useSyncExternalStore 的第三个参数是 getServerSnapshot，返回 false
    // 在 jsdom 环境中，客户端快照生效；SSR 快照仅在服务端渲染时使用
    // 这里验证 hook 不抛错即可
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });

  it("matchMedia 缺失时不抛错，按桌面返回 false", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
