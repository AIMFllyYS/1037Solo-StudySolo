"use client";

import { useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SHORTCUTS } from "@/lib/keyboard/shortcuts";
import { findMatchingShortcut } from "@/lib/keyboard/match";
import { dispatchShortcutAction } from "@/lib/keyboard/actions";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";
import { useOverlayStack } from "@/lib/keyboard/useOverlayStack";
import { isTypingTarget, isDesktopViewport } from "@/lib/keyboard/guards";
import { useIsMobile } from "@/lib/hooks/layout/useIsMobile";
import { getActiveManagedWindow } from "@/lib/keyboard/windowActions";
import ShortcutHelpOverlay from "@/components/keyboard/ShortcutHelpOverlay";

/** 按优先级排序的 shortcut 列表（Esc 优先于全局等）。 */
const ORDERED_SHORTCUTS = [...SHORTCUTS].sort((a, b) => {
  const priority: Record<string, number> = {
    overlay: 0,
    window: 1,
    review: 2,
    global: 3,
    "chat-input": 4,
  };
  return (priority[a.scope] ?? 9) - (priority[b.scope] ?? 9);
});

export default function KeyboardShortcutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const hydrate = useKeyboardSettings((s) => s.hydrate);
  const isEnabled = useKeyboardSettings((s) => s.isEnabled);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isMobile || !isDesktopViewport()) return;
      if (typeof e.key !== "string") return;

      const typing = isTypingTarget(e.target);
      const isReviewPage = pathname.endsWith("/review");

      // Esc：浮层栈非空时优先
      if (e.key === "Escape" && isEnabled("overlay.escape")) {
        const closed = useOverlayStack.getState().closeTop();
        if (closed) {
          e.preventDefault();
          return;
        }
      }

      const def = findMatchingShortcut(e, ORDERED_SHORTCUTS, isEnabled);
      if (!def) return;

      // 输入框内：仅允许 chat-input scope（由 ChatInput 处理）和 overlay.escape
      if (typing) {
        if (def.scope === "chat-input") return; // ChatInput 自行处理
        if (def.scope !== "overlay") return;
      }

      // 复习板快捷键仅在复习页
      if (def.scope === "review" && !isReviewPage) return;

      // 窗口快捷键需要存在可操作的窗口
      if (def.scope === "window" && !getActiveManagedWindow()) return;

      // chat-input 由 ChatInput 组件处理
      if (def.scope === "chat-input") return;

      const handled = dispatchShortcutAction(def, {
        navigate: (href) => router.push(href),
        isReviewPage,
      });

      if (handled) e.preventDefault();
    },
    [isMobile, pathname, router, isEnabled],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {children}
      <ShortcutHelpOverlay />
    </>
  );
}
