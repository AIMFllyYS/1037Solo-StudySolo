"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";
import { WindowTypeIcon } from "@/components/window/WindowTypeIcon";
import { fileTypeAccent } from "@/components/icons/file-types/FileTypeIcon";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";

interface OverflowMenuProps {
  windows: ManagedWindow[];
  onToggle: (id: string) => void;
}

function overflowAccent(win: ManagedWindow): string | undefined {
  if (win.type !== "attachment-preview") return undefined;
  return fileTypeAccent(win.data as { kind?: string; mimeType?: string; name?: string });
}

export default function OverflowMenu({ windows, onToggle }: OverflowMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuRect, setMenuRect] = useState({ right: 12, top: 48 });

  useLayoutEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuRect({
      right: Math.max(8, window.innerWidth - rect.right),
      top: rect.bottom + 6,
    });
  }, [open, windows.length]);

  const closeMenu = useCallback(() => setOpen(false), []);
  useOverlayRegistration({ id: "overflow-menu", open, onClose: closeMenu, priority: 35 });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (windows.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t("menu.window.more")}
        className="press flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--ink-soft)] shadow-sm hover:bg-[var(--bg-muted)]"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && createPortal(
        <div
          ref={ref}
          style={{ position: "fixed", right: menuRect.right, top: menuRect.top }}
          className="z-[10000] min-w-52 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] py-1 shadow-2xl"
        >
          {windows.map((win) => (
            <button
              key={win.id}
              type="button"
              onClick={() => {
                onToggle(win.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--bg-muted)]"
            >
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                style={{
                  background: overflowAccent(win)
                    ? `color-mix(in srgb, ${overflowAccent(win)} 18%, var(--bg-muted))`
                    : "var(--md-sys-color-primary-container)",
                  color: overflowAccent(win) ?? "var(--md-sys-color-primary)",
                }}
              >
                <WindowTypeIcon type={win.type} icon={win.icon} data={win.data} size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate">{win.title}</span>
              {win.badge && win.badge > 1 && (
                <span className="text-[11px] text-[var(--ink-faint)]">{win.badge}</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
