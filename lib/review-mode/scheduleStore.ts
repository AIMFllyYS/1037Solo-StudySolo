"use client";

import { createPersistedStore } from "@/lib/stores/_persist";
import {
  initialSchedule,
  isDue,
  schedule as advanceSchedule,
  type CardSchedule,
  type ReviewGrade,
} from "./scheduler";

// Review 模式闪卡的 SRS 调度数据（本机持久化，key = 复习卡 id）。
// 与 useReviewCards 解耦：卡片内容仍是 useReviewCards 的真相源，这里只挂调度状态，
// 所以给闪卡加间隔重复不需要动 reviewCards 的云同步 / 存储 schema。
//
// 存储用 localStorage（数据小：每卡几十字节），与设置 / 主题等小数据同层。

const STORAGE_KEY = "studysolo-review-schedule-v1";

interface ScheduleState {
  byCard: Record<string, CardSchedule>;
  /** 记录一次复习评分，推进该卡调度。返回新调度。 */
  grade: (cardId: string, grade: ReviewGrade, now?: number) => CardSchedule;
  /** 取某卡调度（无则返回一张「立即到期」的初始调度，不写库）。 */
  get: (cardId: string) => CardSchedule;
  /** 某卡此刻是否到期。 */
  due: (cardId: string, now?: number) => boolean;
  /** 从给定 cardId 列表里筛出到期的（含从未复习的新卡）。 */
  dueCards: (cardIds: string[], now?: number) => string[];
  /** 删除某卡调度（卡片删除时调用，避免脏数据堆积）。 */
  forget: (cardId: string) => void;
}

export const useReviewSchedule = createPersistedStore<ScheduleState>(
  (set, get) => ({
    byCard: {},
    grade: (cardId, grade, now = Date.now()) => {
      const prev = get().byCard[cardId] ?? initialSchedule(now);
      const next = advanceSchedule(prev, grade, now);
      set((s) => ({ byCard: { ...s.byCard, [cardId]: next } }));
      return next;
    },
    get: (cardId) => get().byCard[cardId] ?? initialSchedule(),
    due: (cardId, now = Date.now()) => isDue(get().byCard[cardId], now),
    dueCards: (cardIds, now = Date.now()) => cardIds.filter((id) => isDue(get().byCard[id], now)),
    forget: (cardId) =>
      set((s) => {
        if (!s.byCard[cardId]) return s;
        const byCard = { ...s.byCard };
        delete byCard[cardId];
        return { byCard };
      }),
  }),
  {
    name: STORAGE_KEY,
    storage: "local",
    version: 1,
    partialize: (s) => ({ byCard: s.byCard }),
  },
);
