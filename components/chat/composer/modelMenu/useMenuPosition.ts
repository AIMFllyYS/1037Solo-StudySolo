"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { submenuTop } from "@/lib/chat/composer/modelMenuPosition";

export const MENU_WIDTH = 320;
export const MODEL_LIST_WIDTH = 352;
export const MENU_GAP = 10;

/** Keep the first two levels on the same anchor; only the model list grows sideways. */
export function useMenuPosition(open: boolean, trigger: RefObject<HTMLButtonElement | null>) {
  const [position, setPosition] = useState({ left: 8, bottom: 8 as number | undefined, top: undefined as number | undefined, maxHeight: 480, mobile: false, growLeft: true, width: MENU_WIDTH });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const screenWidth = viewport?.width ?? window.innerWidth;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const narrow = screenWidth < 768 || window.matchMedia("(hover: none) and (pointer: coarse)").matches;
      const width = narrow ? Math.min(360, screenWidth - 24) : MENU_WIDTH;
      const left = Math.max(offsetLeft + 12, Math.min(rect.right - width, offsetLeft + screenWidth - width - 12));
      const fitsLeft = left - offsetLeft >= MODEL_LIST_WIDTH + MENU_GAP + 12;
      const fitsRight = offsetLeft + screenWidth - left - width >= MODEL_LIST_WIDTH + MENU_GAP + 12;
      const above = rect.top - offsetTop - 12;
      const below = offsetTop + height - rect.bottom - 12;
      const upward = above >= 280 || above >= below;
      setPosition({
        left, width, mobile: narrow || (!fitsLeft && !fitsRight), growLeft: fitsLeft,
        bottom: upward ? window.innerHeight - Math.max(offsetTop + 12, rect.top - 8) : undefined,
        top: upward ? undefined : Math.min(rect.bottom + 8, offsetTop + height - 12),
        maxHeight: Math.max(96, Math.min(520, upward ? above : below)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, trigger]);
  return position;
}

/** Opening a row detail keeps the flyout top fixed and scrolls within the remaining viewport. */
export function useFlyoutPosition(open: boolean, series: string | null, mobile: boolean, root: RefObject<HTMLDivElement | null>, anchor: RefObject<HTMLButtonElement | null>) {
  const [position, setPosition] = useState({ top: 0, maxHeight: 520 });
  useLayoutEffect(() => {
    if (!open || !series || mobile) return;
    const panel = root.current;
    if (!panel) return;
    const place = () => {
      const list = panel.querySelector<HTMLElement>('[data-menu-level="3"]');
      if (!list || !anchor.current) return;
      const viewport = window.visualViewport;
      // Reserve room in the viewport, not an empty rendered footer, for a row's detail card.
      const footprint = Math.min(list.offsetHeight + 220, (viewport?.height ?? window.innerHeight) - 16);
      const next = submenuTop(anchor.current.getBoundingClientRect().top, footprint, viewport?.offsetTop ?? 0, viewport?.height ?? window.innerHeight);
      setPosition({ top: next - panel.getBoundingClientRect().top, maxHeight: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - next - 8 });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(panel);
    panel.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { observer?.disconnect(); panel.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open, series, mobile, root, anchor]);
  return position;
}

/** Animate real height at a fixed bottom edge: the larger menu grows upward, without FLIP scale. */
export function useMenuHeight(open: boolean, step: string, content: RefObject<HTMLDivElement | null>, maximum: number) {
  const [height, setHeight] = useState<number | undefined>();
  const reset = useCallback(() => setHeight(undefined), []);
  useLayoutEffect(() => {
    if (!open) return;
    const element = content.current;
    if (!element) return;
    const measure = () => setHeight(Math.min(maximum, element.scrollHeight + 18));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [open, step, content, maximum]);
  return { height, reset };
}
