"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject, type ReactNode } from "react";
import { MoreHorizontal, MoreVertical, X } from "lucide-react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { closeManagedWindow } from "@/lib/keyboard/windowActions";
import { WindowTypeIcon } from "@/components/window/WindowTypeIcon";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { reflowItemProps } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import {
  splitAgentDockWindows,
} from "@/lib/window/agentDockTabs";
import { AgentDockOverflowMenu, AgentDockTabMenu } from "./AgentDockTabMenus";

type DockMenuState =
  | { kind: "tab"; target: ManagedWindow; x: number; y: number; trigger: HTMLElement }
  | { kind: "overflow"; x: number; y: number; trigger: HTMLElement };

/** Agent 资源工作区：三项直接显示，旧窗口仍留在溢出菜单里，可随时重新打开。 */
export default function AgentDockTabs({
  windows,
  addContent,
  addContentFocusRef,
}: {
  windows: ManagedWindow[];
  addContent?: ReactNode;
  addContentFocusRef?: MutableRefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const activeWindowId = useWindowManager((state) => state.activeWindowId);
  const bringToFront = useWindowManager((state) => state.bringToFront);
  const restoreWindow = useWindowManager((state) => state.restoreWindow);
  const reducedMotion = useUiReducedMotion();
  const [menu, setMenu] = useState<DockMenuState | null>(null);
  const windowsRef = useRef(windows);
  const menuRef = useRef(menu);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const tablistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    windowsRef.current = windows;
    menuRef.current = menu;
  }, [menu, windows]);

  const { visible, overflow } = useMemo(
    () => splitAgentDockWindows(windows, activeWindowId),
    [activeWindowId, windows],
  );
  const rovingTabId = visible.find((window) => activeWindowId === window.id && !window.minimized)?.id
    ?? visible[0]?.id;

  const activateWindow = useCallback((window: ManagedWindow) => {
    if (window.minimized) restoreWindow(window.id);
    else bringToFront(window.id);
  }, [bringToFront, restoreWindow]);

  const closeMenu = useCallback((restoreFocus = true) => {
    const previousMenu = menuRef.current;
    setMenu(null);
    if (!restoreFocus) return;

    window.requestAnimationFrame(() => {
      const trigger = previousMenu?.trigger;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
        return;
      }

      const state = useWindowManager.getState();
      const remaining = windowsRef.current.filter((window) => state.windows.some((current) => current.id === window.id));
      const next = splitAgentDockWindows(remaining, state.activeWindowId).visible[0];
      const nextTab = next ? tabRefs.current.get(next.id) : null;
      (nextTab ?? addContentFocusRef?.current ?? tablistRef.current)?.focus({ preventScroll: true });
    });
  }, [addContentFocusRef]);

  const openTabMenu = useCallback((window: ManagedWindow, trigger: HTMLElement, x: number, y: number) => {
    setMenu({ kind: "tab", target: window, trigger, x, y });
  }, []);

  const openTabMenuAtElement = useCallback((window: ManagedWindow, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    openTabMenu(window, trigger, rect.left, rect.bottom);
  }, [openTabMenu]);

  const openOverflowMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((current) => current?.kind === "overflow"
      ? null
      : { kind: "overflow", trigger: event.currentTarget, x: rect.right, y: rect.bottom });
  };

  const closeWindow = useCallback((managedWindow: ManagedWindow) => {
    closeManagedWindow(managedWindow);
    window.requestAnimationFrame(() => {
      const state = useWindowManager.getState();
      const remaining = windowsRef.current.filter((item) => state.windows.some((current) => current.id === item.id));
      const next = splitAgentDockWindows(remaining, state.activeWindowId).visible[0];
      const target = next ? tabRefs.current.get(next.id) : null;
      (target ?? addContentFocusRef?.current ?? tablistRef.current)?.focus({ preventScroll: true });
    });
  }, [addContentFocusRef]);

  const closeOthers = useCallback((target: ManagedWindow) => {
    const current = useWindowManager.getState().windows.find((window) => window.id === target.id) ?? target;
    activateWindow(current);
    for (const window of windowsRef.current) {
      if (window.id !== target.id) closeManagedWindow(window);
    }
  }, [activateWindow]);

  const closeAll = useCallback(() => {
    for (const window of windowsRef.current.slice()) closeManagedWindow(window);
  }, []);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const current = visible[index];
    if (!current) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openTabMenuAtElement(current, event.currentTarget);
      return;
    }

    const nextIndex = event.key === "ArrowRight"
      ? (index + 1) % visible.length
      : event.key === "ArrowLeft"
        ? (index - 1 + visible.length) % visible.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? visible.length - 1
            : -1;
    if (nextIndex < 0 || !visible[nextIndex]) return;
    event.preventDefault();
    const next = visible[nextIndex];
    activateWindow(next);
    window.requestAnimationFrame(() => tabRefs.current.get(next.id)?.focus({ preventScroll: true }));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {addContent}
      <div
        ref={tablistRef}
        data-testid="agent-dock-tabs"
        role="tablist"
        aria-label={t("panel.window.tabsAria")}
        tabIndex={-1}
        className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((window, index) => {
            const selected = activeWindowId === window.id && !window.minimized;
            const title = window.title?.trim() || t("panel.window.untitledTab");
            return (
              <motion.div
                key={window.id}
                role="presentation"
                {...reflowItemProps(reducedMotion)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const tabButton = tabRefs.current.get(window.id) ?? event.currentTarget;
                  openTabMenu(window, tabButton, event.clientX, event.clientY);
                }}
                className={clsx(
                  "group flex min-w-0 max-w-[min(18rem,48%)] shrink-0 items-center rounded-lg border transition-colors",
                  selected
                    ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                    : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-[var(--bg-muted)]",
                  window.minimized && "opacity-70",
                )}
              >
                <button
                  ref={(node) => {
                    if (node) tabRefs.current.set(window.id, node);
                    else tabRefs.current.delete(window.id);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={window.id === rovingTabId ? 0 : -1}
                  aria-label={t("panel.window.openTab", { title })}
                  title={title}
                  data-testid="agent-dock-tab"
                  onClick={() => activateWindow(window)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className="press flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium focus-visible:rounded-l-lg"
                >
                  <WindowTypeIcon type={window.type} icon={window.icon} data={window.data} size={14} />
                  <span className="min-w-0 truncate">{title}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("panel.window.tabActions", { title })}
                  title={t("panel.window.tabActions", { title })}
                  aria-haspopup="menu"
                  aria-expanded={menu?.kind === "tab" && menu.target.id === window.id}
                  data-testid={`agent-dock-tab-menu-${window.id}`}
                  onClick={(event) => openTabMenuAtElement(window, event.currentTarget)}
                  className="agent-dock-tab-action grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--ink-faint)] opacity-0 transition-opacity hover:bg-[var(--bg-panel)] hover:text-[var(--ink)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <MoreVertical size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t("panel.window.closeTab", { title })}
                  title={t("panel.window.closeTab", { title })}
                  onClick={() => closeWindow(window)}
                  className="agent-dock-tab-close mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[var(--ink-faint)] opacity-0 transition-opacity hover:bg-[var(--bg-panel)] hover:text-[var(--md-sys-color-error)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {overflow.length > 0 ? (
        <button
          type="button"
          onClick={openOverflowMenu}
          aria-label={t("panel.window.moreTabs", { count: overflow.length })}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === "overflow"}
          title={t("panel.window.moreTabs", { count: overflow.length })}
          data-testid="agent-dock-overflow-trigger"
          className="press inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium tabular-nums text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
        >
          <MoreHorizontal size={15} />
          <span>+{overflow.length}</span>
        </button>
      ) : null}

      {menu?.kind === "tab" ? (
        <AgentDockTabMenu
          target={menu.target}
          windows={windows}
          x={menu.x}
          y={menu.y}
          returnFocusElement={menu.trigger}
          onClose={closeMenu}
          onCloseTab={closeWindow}
          onCloseOthers={closeOthers}
          onCloseAll={closeAll}
        />
      ) : menu?.kind === "overflow" ? (
        <AgentDockOverflowMenu
          windows={overflow}
          x={menu.x}
          y={menu.y}
          returnFocusElement={menu.trigger}
          onClose={closeMenu}
          onSelect={activateWindow}
        />
      ) : null}
    </div>
  );
}
