"use client";

import { useCallback, useRef } from "react";

/**
 * 拖拽手柄 hook：拖动期间用 requestAnimationFrame 直接改元素 transform（零 React 重渲染），
 * 松手时一次性把屏幕位移 (dx, dy) 交给 onCommit 落库。彻底消除「每帧 setState → 整面板重渲染」
 * 造成的拖动卡顿。位置模型（left/top 或 left/bottom）由调用方在 onCommit 里换算。
 *
 * 用法：
 *   const { elRef, onPointerDown } = useDraggable((dx, dy) => setPos(p => ({ x: p.x + dx, y: p.y - dy })));
 *   <div ref={elRef} style={{ position:'fixed', left:pos.x, bottom:pos.y }}>
 *     <div onPointerDown={onPointerDown}>拖我</div>
 *   </div>
 */
export function useDraggable(onCommit: (dx: number, dy: number) => void) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startX: number; startY: number; dx: number; dy: number; raf: number | null } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 点中按钮/输入/标注了 data-no-drag 的元素不拖
      if ((e.target as HTMLElement).closest("button, input, [data-no-drag]")) return;
      e.preventDefault();
      drag.current = { startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, raf: null };

      const onMove = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        d.dx = ev.clientX - d.startX;
        d.dy = ev.clientY - d.startY;
        if (d.raf == null) {
          d.raf = requestAnimationFrame(() => {
            if (!drag.current || !elRef.current) return;
            drag.current.raf = null;
            elRef.current.style.transform = `translate(${drag.current.dx}px, ${drag.current.dy}px)`;
          });
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const d = drag.current;
        drag.current = null;
        if (d?.raf != null) cancelAnimationFrame(d.raf);
        if (elRef.current) elRef.current.style.transform = "";
        if (d && (d.dx !== 0 || d.dy !== 0)) onCommit(d.dx, d.dy);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onCommit],
  );

  return { elRef, onPointerDown };
}
