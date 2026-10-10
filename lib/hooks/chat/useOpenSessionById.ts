"use client";

import { useEffect, useState } from "react";
import { ensureChatHistoryBootstrap, useChatHistory } from "@/lib/stores/chat/chatHistory";

/** 打开一条对话深链（`/c/<sessionId>`）时的三种终态。 */
export type OpenSessionStatus = "loading" | "ready" | "notFound";

export interface OpenSessionResult {
  status: OpenSessionStatus;
}

/**
 * 本地已有这条 meta 就把它切成当前对话，返回是否命中。
 * 读 getState() 而不是订阅：这里要的是「此刻有没有」，不是「以后变了要重渲染」
 * （会话列表的变化由左栏自己订阅，这里多订阅一份只会多一轮无意义的渲染）。
 */
function activateLocalSession(sessionId: string): boolean {
  const { sessionsMeta, switchSession } = useChatHistory.getState();
  if (!sessionsMeta.some((meta) => meta.id === sessionId)) return false;
  switchSession(sessionId);
  return true;
}

/**
 * 「按 id 打开一条对话」的唯一入口（给 `/c/<sessionId>` 深链用）。
 *
 * 顺序：**先等本地水合** → 本地已有就直接切 → 本地没有才拉一次云端 → 拉完仍没有才算 notFound。
 * 每一步都不能省：
 * - 不等水合：未水合时 `sessionsMeta` 还是空数组，会把「本机明明有的对话」误判成 notFound；
 * - 不先查本地：本地命中还要跑一次全量同步，白等好几秒；
 * - 云端拉取失败、未登录都只当作「没拉到」，不该把用户永远卡在 loading 上。
 *
 * 云端只走 `lib/sync/engine.ts` 公开的 `pullAndPushAll()`：engine 没有「按 kind + clientId 拉一条」
 * 的公开能力，而 `lib/sync/client.ts` 只有读接口 —— 拿到行之后要落进 store 得走 applyRemoteRow /
 * applyChatPayloadToZustand，那两个是模块私有且负责 manifest 合并（2026-09-19/20 的丢会话事故都出在
 * 「绕过它们手写 manifest」上）。所以这里宁可多花一次 list + push（冷启动本来也会走这一趟），
 * 也不在 hook 里重写一遍合并落库；改 engine 的公共行为不在本路由的权限内。
 */
export function useOpenSessionById(sessionId: string | null | undefined): OpenSessionResult {
  /**
   * 只记「已经判定完的那一条」。status 由它与当前 sessionId 推导出来：
   * 换成另一条 id 时天然回到 loading，不必在 effect 里同步 setState（那会多一轮级联渲染）。
   * 首帧两边的推导结果都是 loading：客户端页面同样会先产出 SSR HTML，
   * 若从 store 同步推导初始值，服务端（没有 IndexedDB）与客户端会不一致，直接水合失败。
   */
  const [resolved, setResolved] = useState<{ id: string; status: OpenSessionStatus } | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      await ensureChatHistoryBootstrap().catch(() => {});
      if (cancelled) return;
      if (activateLocalSession(sessionId)) {
        setResolved({ id: sessionId, status: "ready" });
        return;
      }
      // 动态 import：本地命中时不必把 supabase 同步栈装进 /c 的首屏包（与 lib/sync/schedule.ts 同款）。
      await import("@/lib/sync/engine")
        .then((mod) => mod.pullAndPushAll())
        .catch(() => {});
      if (cancelled) return;
      setResolved({ id: sessionId, status: activateLocalSession(sessionId) ? "ready" : "notFound" });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) return { status: "notFound" };
  return { status: resolved?.id === sessionId ? resolved.status : "loading" };
}
