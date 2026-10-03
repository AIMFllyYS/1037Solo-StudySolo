"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";

export const AGENT_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] focus-visible:bg-[var(--bg-muted)] focus-visible:outline-none";

export interface AgentMenuSurfaceProps {
  id: string;
  x: number;
  y: number;
  label: string;
  testId?: string;
  returnFocusElement?: HTMLElement | null;
  onClose: (restoreFocus?: boolean) => void;
  children: ReactNode;
}

/** Shared Agent menu shell for consistent focus, Escape, outside-click, and viewport handling. */
export function AgentMenuSurface({
  id,
  x,
  y,
  label,
  testId,
  returnFocusElement,
  onClose,
  children,
}: AgentMenuSurfaceProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const closeAndRestoreFocus = useCallback(() => {
    onClose(true);
    if (returnFocusElement?.isConnected) {
      window.requestAnimationFrame(() => returnFocusElement.focus({ preventScroll: true }));
    }
  }, [onClose, returnFocusElement]);

  useOverlayRegistration({ id, open: true, onClose: closeAndRestoreFocus, priority: 72 });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const placeAndFocus = () => {
      const rect = menu.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      });
      menu.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(placeAndFocus);
    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    const dismissOnViewportChange = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose(false);
    };

    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("scroll", dismissOnViewportChange, true);
    window.addEventListener("resize", dismissOnViewportChange);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("scroll", dismissOnViewportChange, true);
      window.removeEventListener("resize", dismissOnViewportChange);
    };
  }, [x, y, onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-testid={testId}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left: position?.left ?? x,
        top: position?.top ?? y,
        visibility: position ? "visible" : "hidden",
      }}
      className="z-[12000] max-h-[min(70vh,calc(100dvh-1rem))] w-56 overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-1.5 shadow-xl outline-none"
    >
      {children}
    </div>,
    document.body,
  );
}
