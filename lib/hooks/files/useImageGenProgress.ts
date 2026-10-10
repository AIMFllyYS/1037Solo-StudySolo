"use client";

import { useEffect, useState } from "react";
import {
  estimateImageGenProgress,
  type ImageGenProgress,
} from "@/lib/chat/imageGenProgress";
import type { ImageGenStatus } from "@/lib/stores/assets/imageGen";

/** 只在生成中走时钟；其它状态不挂 timer，也不产生任何额外渲染。 */
export function useImageGenProgress(
  session: { id: string; status: ImageGenStatus; startedAt?: number; expectedMs?: number } | null | undefined,
  intervalMs = 250,
): ImageGenProgress {
  const status = session?.status;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "loading") return;
    // 不在 effect 里同步 setState（会触发级联渲染）：初始 now 已在 useState 里取过，
    // 之后交给轮询。250ms 的首次误差对进度条不可见。
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [status, intervalMs]);

  if (!session) return { percent: 0, elapsedMs: 0, remainingMs: 0, stalled: false };
  return estimateImageGenProgress({
    status: session.status,
    startedAt: session.startedAt,
    expectedMs: session.expectedMs,
    now,
    seed: session.id,
  });
}
