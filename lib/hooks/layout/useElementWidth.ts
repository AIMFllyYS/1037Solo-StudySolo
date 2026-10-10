"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 观察元素的内容宽度（content-box 内宽），供阅读器按宽度自适应。
 *
 * - 首帧返回 0（还没测量），调用方用固定回退宽度兜底。
 * - 默认 120ms 防抖：分栏拖拽 / 右栏展开动画期间不要反复重建预览器。
 * - 没有 ResizeObserver（jsdom、老浏览器）时恒返回 0，走回退宽度。
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  debounceMs = 120,
): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let timer: number | null = null;
    const apply = () => {
      const next = Math.round(el.clientWidth);
      // 宽度没变（含 0 → 0）就不重渲染，避免抖动。
      setWidth((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(apply, debounceMs);
    };

    apply();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref, debounceMs]);

  return width;
}
