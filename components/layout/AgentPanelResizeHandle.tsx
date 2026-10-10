"use client";

import { useRef } from "react";
import { useT } from "@/lib/i18n";

/** 直接调整一列的像素值；另一列不参与分配。支持鼠标、触摸和键盘。 */
export default function AgentPanelResizeHandle({ side, value, min, max, onResize, onCollapse, onDragging }: {
  side: "left" | "right";
  value: number;
  min: number;
  max: number;
  onResize: (pixels: number) => void;
  onCollapse: () => void;
  onDragging?: (dragging: boolean) => void;
}) {
  const t = useT();
  const drag = useRef<{ id: number; x: number; size: number; requested: number } | null>(null);
  const resize = (pixels: number) => onResize(Math.max(min, Math.min(Math.max(min, max), pixels)));
  const end = (cancelled: boolean) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (!cancelled && current.requested < min * 0.5) onCollapse();
    onDragging?.(false);
  };
  return <div
    role="separator"
    aria-orientation="vertical"
    aria-label={t(side === "left" ? "panel.layout.resizeLeft" : "panel.layout.resizeRight")}
    aria-valuemin={0}
    aria-valuemax={Math.round(max)}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    data-panel-resize-handle-id={`agent-${side}-resize`}
    data-testid={`agent-${side}-resize`}
    className="group relative h-full w-px shrink-0 touch-none cursor-col-resize bg-[var(--line-soft)] outline-none focus-visible:bg-[var(--accent)]"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, size: value, requested: value };
      onDragging?.(true);
    }}
    onPointerMove={(event) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.id) return;
      current.requested = current.size + (event.clientX - current.x) * (side === "left" ? 1 : -1);
      resize(current.requested);
    }}
    onPointerUp={() => end(false)}
    onPointerCancel={() => end(true)}
    onLostPointerCapture={() => end(true)}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Enter") { onCollapse(); return; }
      const delta = (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1) * (event.shiftKey ? 48 : 16);
      resize(event.key === "Home" ? min : event.key === "End" ? max : value + delta);
    }}
  ><span className="absolute inset-y-0 -left-1 -right-1 z-10 cursor-col-resize" /></div>;
}
