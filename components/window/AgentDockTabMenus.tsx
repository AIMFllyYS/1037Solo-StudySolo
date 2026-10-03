"use client";

import { Copy, Layers, X, type LucideIcon } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import type { ManagedWindow } from "@/lib/hooks/useWindowManager";
import { useT } from "@/lib/i18n";
import { AGENT_MENU_ITEM_CLASS, AgentMenuSurface } from "@/components/agent/AgentMenuSurface";
import { WindowTypeIcon } from "@/components/window/WindowTypeIcon";

function MenuItem({
  testId,
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  testId?: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      disabled={disabled}
      className={`${AGENT_MENU_ITEM_CLASS} disabled:cursor-not-allowed disabled:opacity-45`}
      onClick={onClick}
    >
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div aria-hidden="true" className="my-1 border-t border-[var(--line-soft)]" />;
}

export function AgentDockTabMenu({
  target,
  windows,
  x,
  y,
  returnFocusElement,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
}: {
  target: ManagedWindow;
  windows: ManagedWindow[];
  x: number;
  y: number;
  returnFocusElement?: HTMLElement | null;
  onClose: (restoreFocus?: boolean) => void;
  onCloseTab: (window: ManagedWindow) => void;
  onCloseOthers: (window: ManagedWindow) => void;
  onCloseAll: () => void;
}) {
  const t = useT();
  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <AgentMenuSurface
      id="agent-dock-tab-menu"
      x={x}
      y={y}
      label={t("panel.window.tabMenuAria", { title: target.title })}
      testId="agent-dock-tab-menu"
      returnFocusElement={returnFocusElement}
      onClose={onClose}
    >
      <div className="truncate px-2.5 py-1 text-[11px] text-[var(--ink-faint)]" title={target.title}>
        {target.title}
      </div>
      <MenuItem
        testId="agent-dock-menu-copy-title"
        label={t("panel.window.copyTitle")}
        icon={Copy}
        onClick={() => run(() => { void copyTextToClipboard(target.title); })}
      />
      <MenuDivider />
      <MenuItem
        testId="agent-dock-menu-close-tab"
        label={t("panel.window.closeTabAction")}
        icon={X}
        onClick={() => run(() => onCloseTab(target))}
      />
      <MenuItem
        testId="agent-dock-menu-close-others"
        label={t("panel.window.closeOthers")}
        icon={Layers}
        disabled={windows.length <= 1}
        onClick={() => run(() => onCloseOthers(target))}
      />
      <MenuItem
        testId="agent-dock-menu-close-all"
        label={t("panel.window.closeAll")}
        icon={X}
        onClick={() => run(onCloseAll)}
      />
    </AgentMenuSurface>
  );
}

export function AgentDockOverflowMenu({
  windows,
  x,
  y,
  returnFocusElement,
  onClose,
  onSelect,
}: {
  windows: ManagedWindow[];
  x: number;
  y: number;
  returnFocusElement?: HTMLElement | null;
  onClose: (restoreFocus?: boolean) => void;
  onSelect: (window: ManagedWindow) => void;
}) {
  const t = useT();

  return (
    <AgentMenuSurface
      id="agent-dock-overflow-menu"
      x={x}
      y={y}
      label={t("panel.window.overflowMenuAria")}
      testId="agent-dock-overflow-menu"
      returnFocusElement={returnFocusElement}
      onClose={onClose}
    >
      <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--ink-faint)]">
        {t("panel.window.moreTabs", { count: windows.length })}
      </div>
      {windows.map((window) => (
        <button
          key={window.id}
          type="button"
          role="menuitem"
          data-testid={`agent-dock-overflow-item-${window.id}`}
          aria-label={t("panel.window.openTab", { title: window.title })}
          onClick={() => {
            onSelect(window);
            onClose();
          }}
          className={AGENT_MENU_ITEM_CLASS}
        >
          <WindowTypeIcon type={window.type} icon={window.icon} data={window.data} size={14} />
          <span className="min-w-0 flex-1 truncate">{window.title}</span>
          {window.minimized ? <span className="text-[10px] text-[var(--ink-faint)]">{t("panel.window.minimizedShort")}</span> : null}
        </button>
      ))}
    </AgentMenuSurface>
  );
}
