"use client";

import { useCallback } from "react";

/**
 * 缩放手柄 hook（useDraggable 的姊妹）：拖右下角手柄时直接改元素 width/height
 * （rAF 写 style，零 React 重渲染），松手一次性把最终尺寸交给 onCommit 落库。
 * 左上角固定（只向右/下伸缩），并夹紧最小尺寸与视口右/下边界。
 *
 * 用法：
 *   const onResizeStart = useResizable(elRef, (w, h) => resize(id, w, h));
 *   <div onPointerDown={onResizeStart} data-no-drag style={{ cursor: "nwse-resize" }} />
 */
export function useResizable(
  elRef: React.RefObject<HTMLElement | null>,
  onCommit: (w: number, h: number) => void,
  opts?: { minW?: number; minH?: number },
) {
  const minW = opts?.minW ?? 320;
  const minH = opts?.minH ?? 360;

  return useCallback(
    (e: React.PointerEvent) => {
      const el = elRef.current;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      let last = { w: rect.width, h: rect.height };
      let raf: number | null = null;

      const clampSize = (w: number, h: number) => {
        const maxW = window.innerWidth - rect.left - 12;
        const maxH = window.innerHeight - rect.top - 12;
        return {
          w: Math.max(minW, Math.min(w, maxW)),
          h: Math.max(minH, Math.min(h, maxH)),
        };
      };

      const onMove = (ev: PointerEvent) => {
        last = clampSize(rect.width + (ev.clientX - startX), rect.height + (ev.clientY - startY));
        if (raf == null) {
          raf = requestAnimationFrame(() => {
            raf = null;
            if (elRef.current) {
              elRef.current.style.width = `${last.w}px`;
              elRef.current.style.height = `${last.h}px`;
            }
          });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (raf != null) cancelAnimationFrame(raf);
        onCommit(last.w, last.h);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [elRef, onCommit, minW, minH],
  );
}
