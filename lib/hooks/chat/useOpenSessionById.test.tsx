import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 可变的假 store。钩子只通过 getState() 读它（不订阅），所以只需要「列出 meta」与「切会话」两件事；
 * 这里不做索引/订阅的仿真，避免把测试写进假 store 的细节里。
 */
const store = {
  sessionsMeta: [] as Array<{ id: string }>,
  activeSessionId: null as string | null,
};

const switchSession = vi.fn((id: string) => {
  store.activeSessionId = id;
});

/** 云端拉取的替身：默认什么都不做 = 云端也没有这条。 */
let pullImpl: () => Promise<void> = async () => {};
const bootstrap = vi.fn(async () => {});

vi.mock("@/lib/stores/chat/chatHistory", () => ({
  ensureChatHistoryBootstrap: () => bootstrap(),
  useChatHistory: {
    getState: () => ({ sessionsMeta: store.sessionsMeta, switchSession }),
  },
}));

// 钩子里是动态 import("@/lib/sync/engine")；vi.mock 对动态导入同样生效，
// 所以这里不需要真的把 supabase 同步栈拉起来。
vi.mock("@/lib/sync/engine", () => ({
  pullAndPushAll: () => pullImpl(),
}));

import { useOpenSessionById } from "./useOpenSessionById";

beforeEach(() => {
  store.sessionsMeta = [];
  store.activeSessionId = null;
  pullImpl = async () => {};
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useOpenSessionById", () => {
  it("本地已有这条对话 → 直接切过去，不碰云端", async () => {
    store.sessionsMeta = [{ id: "s1" }, { id: "s2" }];
    const pull = vi.fn(async () => {});
    pullImpl = pull;

    const { result } = renderHook(() => useOpenSessionById("s2"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(switchSession).toHaveBeenCalledWith("s2");
    expect(store.activeSessionId).toBe("s2");
    // 本地命中就不该再跑一遍全量同步：这是这条路径上最贵的动作。
    expect(pull).not.toHaveBeenCalled();
  });

  it("本地没有、云端也没有 → notFound（先拉一次）", async () => {
    const pull = vi.fn(async () => {});
    pullImpl = pull;

    const { result } = renderHook(() => useOpenSessionById("missing"));

    await waitFor(() => expect(result.current.status).toBe("notFound"));
    expect(pull).toHaveBeenCalledTimes(1);
    expect(switchSession).not.toHaveBeenCalled();
  });

  it("本地没有、云端有 → 拉回来之后再切", async () => {
    pullImpl = async () => {
      store.sessionsMeta = [{ id: "remote-1" }];
    };

    const { result } = renderHook(() => useOpenSessionById("remote-1"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(switchSession).toHaveBeenCalledWith("remote-1");
    expect(store.activeSessionId).toBe("remote-1");
  });

  it("云端还在拉的期间是 loading（不提前判 notFound）", async () => {
    let releasePull: () => void = () => {};
    pullImpl = () =>
      new Promise<void>((resolve) => {
        releasePull = () => {
          store.sessionsMeta = [{ id: "slow-1" }];
          resolve();
        };
      });

    const { result } = renderHook(() => useOpenSessionById("slow-1"));
    // 首帧就是 loading：SSR/水合两边一致，也避免「先闪一下找不到」。
    expect(result.current.status).toBe("loading");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.status).toBe("loading");

    releasePull();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(switchSession).toHaveBeenCalledWith("slow-1");
  });

  it("没有 id（路由参数异常）→ 直接 notFound，且不去拉云端", async () => {
    const pull = vi.fn(async () => {});
    pullImpl = pull;

    const { result } = renderHook(() => useOpenSessionById(null));

    expect(result.current.status).toBe("notFound");
    expect(pull).not.toHaveBeenCalled();
  });

  it("拉取抛错也只当没拉到，不把用户卡在 loading", async () => {
    pullImpl = async () => {
      throw new Error("offline");
    };

    const { result } = renderHook(() => useOpenSessionById("boom"));

    await waitFor(() => expect(result.current.status).toBe("notFound"));
  });
});
