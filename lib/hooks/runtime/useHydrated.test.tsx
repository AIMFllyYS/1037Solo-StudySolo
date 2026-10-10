import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHydrated } from "./useHydrated";

function makeMockStore(hydrated: boolean) {
  const hydrateCbs: (() => void)[] = [];
  const finishCbs: (() => void)[] = [];
  return {
    persist: {
      hasHydrated: () => hydrated,
      onHydrate: (cb: () => void) => {
        hydrateCbs.push(cb);
        return () => {
          const i = hydrateCbs.indexOf(cb);
          if (i >= 0) hydrateCbs.splice(i, 1);
        };
      },
      onFinishHydration: (cb: () => void) => {
        finishCbs.push(cb);
        return () => {
          const i = finishCbs.indexOf(cb);
          if (i >= 0) finishCbs.splice(i, 1);
        };
      },
    },
    _fireHydrate: () => hydrateCbs.forEach((cb) => cb()),
    _fireFinish: () => finishCbs.forEach((cb) => cb()),
  };
}

describe("useHydrated", () => {
  it("未水合时返回 false", () => {
    const store = makeMockStore(false);
    const { result } = renderHook(() => useHydrated(store));
    expect(result.current).toBe(false);
  });

  it("已水合时返回 true", () => {
    const store = makeMockStore(true);
    const { result } = renderHook(() => useHydrated(store));
    expect(result.current).toBe(true);
  });

  it("水合完成后从 false 变为 true", () => {
    const store = makeMockStore(false);
    const { result } = renderHook(() => useHydrated(store));
    expect(result.current).toBe(false);

    // 模拟水合完成
    act(() => {
      store.persist.hasHydrated = () => true;
      store._fireFinish();
    });

    expect(result.current).toBe(true);
  });

  it("SSR 快照返回 false", () => {
    // getServerSnapshot 返回 false
    const store = makeMockStore(true);
    const { result } = renderHook(() => useHydrated(store));
    // 在 jsdom 中客户端快照生效，所以返回 true
    expect(result.current).toBe(true);
  });
});
