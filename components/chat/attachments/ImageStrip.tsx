"use client";

import { useRef, useCallback, type ReactNode, type PointerEvent as RPointerEvent } from "react";

interface ImageStripProps {
  children: ReactNode;
}

const DRAG_THRESHOLD = 4;

interface DragState {
  startX: number;
  scrollLeft: number;
  pointerId: number;
  captured: boolean;
}

export function ImageStrip({ children }: ImageStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = {
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      pointerId: e.pointerId,
      captured: false,
    };
  }, []);

  const handlePointerMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    const el = containerRef.current;
    if (!state || !el) return;
    const dx = e.clientX - state.startX;
    if (!state.captured && Math.abs(dx) >= DRAG_THRESHOLD) {
      el.setPointerCapture(state.pointerId);
      state.captured = true;
      el.style.cursor = "grabbing";
    }
    if (state.captured) {
      el.scrollLeft = state.scrollLeft - dx;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const state = dragRef.current;
    const el = containerRef.current;
    if (state?.captured && el) {
      el.releasePointerCapture(state.pointerId);
      el.style.cursor = "";
    }
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="chat-image-strip"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </div>
  );
}
