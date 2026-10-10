"use client";

import { useEffect, useState } from "react";

export interface MinimumSkeletonOptions {
  /** 骨架至少露脸的毫秒数（默认 900ms ≈ 用户要的「1 秒左右」）。传 0 = 不压时长。 */
  durationMs?: number;
  /** 数据是否已就绪。false 时无论时间到没到都继续显示骨架。 */
  ready: boolean;
}

/**
 * 「骨架至少露脸这么久」：本机 IndexedDB 往往几十毫秒就把数据喂回来了，
 * 骨架一闪而过、内容突然出现，观感很跳；压一个下限反而稳。
 *
 * 语义：返回 **true = 现在仍然显示骨架**。
 * - 数据没就绪 → 一直 true（该等就等，不糊弄）；
 * - 数据就绪但还没到下限 → 仍然 true（这一段是刻意的平滑，不是卡住）；
 * - 两个条件都满足 → false，换成真内容。
 *
 * 首帧（含服务端）恒为「还没到时」→ 渲染骨架，水合前后一致，不会有 mismatch。
 */
export function useMinimumSkeleton({ durationMs = 900, ready }: MinimumSkeletonOptions): boolean {
  const [elapsedAt, setElapsedAt] = useState<number | null>(null);

  useEffect(() => {
    if (durationMs <= 0) return;
    // 定时器回调里 setState 是允许的（刻意压时长，不是同步级联）。
    const id = window.setTimeout(() => setElapsedAt(Date.now()), durationMs);
    return () => window.clearTimeout(id);
  }, [durationMs]);

  if (durationMs <= 0) return !ready;
  return !ready || elapsedAt === null;
}