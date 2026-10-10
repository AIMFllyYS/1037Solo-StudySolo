// 生图进度估算（纯函数）。
//
// 上游不提供任何进度：/images/generations 是一次 POST，出图之前没有响应体、没有 SSE。
// 所以进度只能是估算，但"诚实的估算"远好过一个转圈：
//  - 时间常数取模型自己声明的 expectedMs（慢速中转站 100–400s，廉价通道 10–40s）；
//  - 每个会话按 id 派生一个固定随机系数，重渲染 / 切窗口都不会让进度倒退或乱跳；
//  - 曲线渐近 99%，**自己永远不会走到 100%**：卡在 99% 就是"还在跑"的诚实表达；
//  - 真完成时由 status 直接置 100%，提前完成不会被进度条拖着。

import type { ImageGenStatus } from "@/lib/stores/assets/imageGen";

/** 自走进度只到 99%：最后 1% 留给"上游真的返回了"。 */
export const IMAGE_GEN_PROGRESS_CEILING = 99;

const MIN_EXPECTED_MS = 4_000;
const MAX_EXPECTED_MS = 600_000;
const DEFAULT_EXPECTED_MS = 60_000;

/** FNV-1a：把会话 id 折成一个 [0,1) 的稳定随机数（不用 Math.random，避免重渲染抖动）。 */
export function seededUnit(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

export interface ImageGenProgressInput {
  status: ImageGenStatus;
  /** 本轮开始的墙钟时间（startLoading 时写入）。 */
  startedAt?: number;
  /** 模型声明的典型耗时。 */
  expectedMs?: number;
  /** 当前时间，由调用方注入（纯函数，好测）。 */
  now: number;
  /** 会话 id。 */
  seed: string;
}

export interface ImageGenProgress {
  /** 0–100 的整数。 */
  percent: number;
  elapsedMs: number;
  /** 估算的剩余毫秒（到 0 之后不再增长，改为 stalled）。 */
  remainingMs: number;
  /** 估算已经"用完"预期时长：还在跑就说明这个模型比预期慢。 */
  stalled: boolean;
}

export function estimateImageGenProgress(input: ImageGenProgressInput): ImageGenProgress {
  if (input.status === "done") {
    return { percent: 100, elapsedMs: 0, remainingMs: 0, stalled: false };
  }
  if (input.status !== "loading") {
    return { percent: 0, elapsedMs: 0, remainingMs: 0, stalled: false };
  }
  const expected = Math.min(
    MAX_EXPECTED_MS,
    Math.max(MIN_EXPECTED_MS, input.expectedMs ?? DEFAULT_EXPECTED_MS),
  );
  const startedAt = input.startedAt ?? input.now;
  const elapsedMs = Math.max(0, input.now - startedAt);
  // k 越大前期涨得越快；[2.2, 3.6] 区间让不同会话的曲线略有差异（"随机数估算"）。
  const k = 2.2 + seededUnit(input.seed) * 1.4;
  const raw = IMAGE_GEN_PROGRESS_CEILING * (1 - Math.exp((-k * elapsedMs) / expected));
  // 用 round 而不是 floor：floor 会让渐近值永远停在 98，看起来像"进度条坏了"。
  const percent = Math.min(IMAGE_GEN_PROGRESS_CEILING, Math.max(1, Math.round(raw)));
  return {
    percent,
    elapsedMs,
    remainingMs: Math.max(0, expected - elapsedMs),
    // "卡住"的判据是**预期时长已经用完**：这时百分比通常也贴到 99，但哪怕还没贴到，
    // 也该让文案从"预计还需 X 秒"切换成"慢速模型可能要好几分钟"。
    stalled: elapsedMs >= expected,
  };
}
