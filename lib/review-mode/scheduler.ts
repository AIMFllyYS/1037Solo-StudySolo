// Review 模式闪卡的间隔重复调度（SM-2-lite，纯函数，无运行时依赖，服务端 / 单测可安全导入）。
//
// 设计取向：贴近 SM-2 但把参数收敛到「四档评分」的直觉模型，避免把整套 SuperMemo 搬进来：
// - again：没记住 → 重置到「学习中」，很快再见；
// - hard ：记住但吃力 → 间隔小幅增长，easiness 略降；
// - good ：正常记住 → 按 easiness 乘上间隔；
// - easy ：轻松 → 额外 easy bonus，间隔跳得更远。
//
// 时间单位统一用「天」表示间隔，due 用 epoch ms 表示到期时刻，便于和 Date.now() 直接比较。

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** 一张卡的调度状态。首次见到某卡时用 `initialSchedule()` 生成。 */
export interface CardSchedule {
  /** 连续答对次数（again 归零）。 */
  reps: number;
  /** 难度系数（SM-2 的 EF），区间约 [1.3, 3.0]，越大间隔增长越快。 */
  easiness: number;
  /** 当前间隔（天）。 */
  intervalDays: number;
  /** 到期时刻（epoch ms）。<= now 视为「到期待复习」。 */
  due: number;
  /** 最近一次复习时刻（epoch ms）；从未复习为 0。 */
  lastReviewed: number;
  /** 累计复习次数（含 again）。 */
  totalReviews: number;
  /** 累计答「记住」（good/easy/hard）的次数，用于粗略掌握度。 */
  lapses: number;
}

export const MIN_EASINESS = 1.3;
export const MAX_EASINESS = 3.0;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 新卡默认状态：立即到期（now），easiness 2.5（SM-2 默认）。 */
export function initialSchedule(now: number = Date.now()): CardSchedule {
  return {
    reps: 0,
    easiness: 2.5,
    intervalDays: 0,
    due: now,
    lastReviewed: 0,
    totalReviews: 0,
    lapses: 0,
  };
}

function clampEasiness(value: number): number {
  if (Number.isNaN(value)) return 2.5;
  return Math.min(MAX_EASINESS, Math.max(MIN_EASINESS, Math.round(value * 100) / 100));
}

/** 各档对 easiness 的增量（SM-2 q=5/4/3/2 的近似）。 */
const EASINESS_DELTA: Record<ReviewGrade, number> = {
  again: -0.2,
  hard: -0.15,
  good: 0,
  easy: 0.15,
};

/**
 * 依据评分推进一张卡的调度。纯函数：返回**新**对象，不改入参。
 *
 * - again：reps 归 0，间隔重置到 <1 天（约 10 分钟），easiness 略降 —— 尽快再问。
 * - hard ：间隔在旧间隔基础上小幅增长（×1.2，至少 +1 天）。
 * - good ：reps=1→1 天、reps=2→6 天、之后 ×easiness（标准 SM-2 曲线）。
 * - easy ：在 good 的基础上再 ×1.3 的 easy bonus。
 */
export function schedule(
  prev: CardSchedule,
  grade: ReviewGrade,
  now: number = Date.now(),
): CardSchedule {
  const easiness = clampEasiness(prev.easiness + EASINESS_DELTA[grade]);
  const totalReviews = prev.totalReviews + 1;

  if (grade === "again") {
    return {
      reps: 0,
      easiness,
      intervalDays: 0,
      // 约 10 分钟后再问（同一会话内可再遇到）。
      due: now + Math.round(DAY_MS / 144),
      lastReviewed: now,
      totalReviews,
      lapses: prev.lapses,
    };
  }

  const reps = prev.reps + 1;
  let intervalDays: number;
  if (grade === "hard") {
    intervalDays = Math.max(1, Math.round((prev.intervalDays || 1) * 1.2));
  } else if (reps === 1) {
    intervalDays = 1;
  } else if (reps === 2) {
    intervalDays = 6;
  } else {
    intervalDays = Math.round((prev.intervalDays || 6) * easiness);
  }
  if (grade === "easy") {
    intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * 1.3));
  }

  return {
    reps,
    easiness,
    intervalDays,
    due: now + intervalDays * DAY_MS,
    lastReviewed: now,
    totalReviews,
    lapses: prev.lapses + 1,
  };
}

/** 该卡此刻是否到期（含从未复习的新卡）。 */
export function isDue(s: CardSchedule | undefined, now: number = Date.now()): boolean {
  if (!s) return true;
  return s.due <= now;
}

/**
 * 粗略掌握度 0–1：由 reps 与 easiness 合成。
 * reps 越多、easiness 越高越接近 1；从未复习或反复 again 接近 0。
 */
export function masteryOf(s: CardSchedule | undefined): number {
  if (!s || s.totalReviews === 0) return 0;
  const repScore = Math.min(1, s.reps / 5);
  const efScore = (s.easiness - MIN_EASINESS) / (MAX_EASINESS - MIN_EASINESS);
  return Math.round((repScore * 0.65 + efScore * 0.35) * 100) / 100;
}

/** 统计一批调度里到期的张数。 */
export function countDue(schedules: Iterable<CardSchedule | undefined>, now: number = Date.now()): number {
  let n = 0;
  for (const s of schedules) if (isDue(s, now)) n += 1;
  return n;
}
