"use client";

import { useReducedMotion } from "framer-motion";
import { useSettings } from "@/lib/stores/settings";

/**
 * 全站「减少动画」的单一判定：系统 prefers-reduced-motion 或设置里的「减少动画」开关，
 * 任一为真即按减少动态处理。组件里替代 framer-motion 的 useReducedMotion，
 * 让用户开关能管到所有动画路径（CSS 侧由 html[data-reduce-motion] 收口，见 globals.css）。
 */
export function useUiReducedMotion(): boolean {
  const systemReduced = useReducedMotion();
  const userReduced = useSettings((s) => s.reduceMotion);
  return systemReduced === true || userReduced;
}
