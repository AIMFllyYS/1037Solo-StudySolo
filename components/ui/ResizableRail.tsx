"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import clsx from "clsx";

const CHANGE_EVENT = "ss-rail-width-change";

function readStored(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/**
 * 可自由拖拽宽度的侧栏容器（Class / Review 这类自绘左栏用；Agent 与 Studio 走 react-resizable-panels）。
 * - 右缘是 separator：指针拖动、方向键 ±16px（Shift ±48）、Home / End 到极值、双击还原默认；
 * - 宽度按 storageKey 存本机，多标签页互相同步；SSR 与首帧用默认宽度，水合后才换成用户的值（无 hydration 抖动）；
 * - 收起态固定为 collapsedWidth，展开回到用户拖过的宽度；拖动期间关掉宽度过渡，跟手无迟滞。
 */
export default function ResizableRail({
  storageKey,
  defaultWidth = 320,
  minWidth = 240,
  maxWidth = 560,
  collapsed = false,
  collapsedWidth = 44,
  ariaLabel,
  className,
  children,
}: {
  storageKey: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsed?: boolean;
  collapsedWidth?: number;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const stored = useSyncExternalStore(subscribe, () => readStored(storageKey), () => null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const origin = useRef<{ x: number; width: number } | null>(null);

  const width = clamp(dragWidth ?? stored ?? defaultWidth, minWidth, maxWidth);

  const commit = useCallback((next: number | null) => {
    try {
      if (next === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, String(clamp(next, minWidth, maxWidth)));
    } catch {
      /* 隐私模式：只在本次会话里生效 */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [storageKey, minWidth, maxWidth]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, width };
    setDragWidth(width);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    if (!start) return;
    setDragWidth(clamp(start.width + event.clientX - start.x, minWidth, maxWidth));
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    origin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragWidth !== null) commit(dragWidth);
    setDragWidth(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next = event.key === "ArrowLeft" ? width - step : event.key === "ArrowRight" ? width + step : event.key === "Home" ? minWidth : event.key === "End" ? maxWidth : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const effective = collapsed ? collapsedWidth : width;
  const dragging = dragWidth !== null;
  return (
    <div
      data-rail-collapsed={collapsed || undefined}
      data-dragging={dragging || undefined}
      className={clsx("ss-rail relative", className)}
      style={{ width: effective, minWidth: effective }}
    >
      {/* 内容固定为展开宽度：收起 / 过渡期间由外层 overflow 裁剪，文字不重排。 */}
      <div className="h-full" style={{ width: collapsed ? collapsedWidth : "100%" }}>{children}</div>
      {collapsed ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={ariaLabel}
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          tabIndex={0}
          data-testid="rail-resize-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={onKeyDown}
          onDoubleClick={() => commit(null)}
          className="group absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none"
        >
          <span
            aria-hidden
            className={clsx(
              "absolute inset-y-0 right-0 w-px transition-colors duration-[var(--duration-fast)]",
              dragging ? "w-0.5 bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--accent)] group-focus-visible:bg-[var(--accent)]",
            )}
          />
        </div>
      )}
    </div>
  );
}
