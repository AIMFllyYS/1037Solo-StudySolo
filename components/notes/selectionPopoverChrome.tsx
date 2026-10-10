"use client";

import type { ComponentType, MouseEventHandler, ReactNode, Ref } from "react";
import { BookmarkPlus, Copy, Lightbulb, MessageSquare, Send, StickyNote } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { SelectionAssistantAction } from "@/lib/notes/selection/selectionAssistant";

export const SELECTION_POPOVER_BAR_CLASS =
  "flex items-center gap-0.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-1 shadow-lg";

export const SELECTION_POPOVER_BTN_CLASS =
  "press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-secondary-container)] hover:text-[var(--md-sys-color-on-secondary-container)]";

export const SELECTION_POPOVER_ICON_BTN_CLASS =
  "press flex items-center justify-center rounded-lg p-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-secondary-container)] hover:text-[var(--md-sys-color-on-secondary-container)]";

export const SELECTION_ACTION_ICONS: Record<
  SelectionAssistantAction,
  ComponentType<{ size?: number }>
> = {
  copy: Copy,
  explain: Lightbulb,
  record: BookmarkPlus,
  note: StickyNote,
  ask: MessageSquare,
  quote: Send,
};

export function SelectionPopoverDivider() {
  return <div className="mx-0.5 h-5 w-px bg-[var(--md-sys-color-outline-variant)]" />;
}

export function SelectionPopoverCaret() {
  return (
    <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]" />
  );
}

export function SelectionPopBtn({
  onClick,
  icon: Icon,
  label,
  active = true,
  disabled = false,
  testId,
}: {
  onClick: () => void;
  icon: ComponentType<{ size?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={active ? label : t("menu.selection.hidden", { label })}
      data-testid={testId}
      className={
        SELECTION_POPOVER_BTN_CLASS +
        (active ? "" : " line-through decoration-[1.5px] opacity-40 hover:opacity-70")
      }
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

export function SelectionPopIconBtn({
  onClick,
  icon: Icon,
  copiedIcon: CopiedIcon,
  copied = false,
  title,
  active = true,
  disabled = false,
  testId,
}: {
  onClick: () => void;
  icon: ComponentType<{ size?: number }>;
  copiedIcon?: ComponentType<{ size?: number }>;
  copied?: boolean;
  title: string;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const t = useT();
  const ActiveIcon = copied && CopiedIcon ? CopiedIcon : Icon;
  const label = copied ? t("common.copied") : title;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={active ? label : t("menu.selection.hidden", { label: title })}
      aria-label={title}
      aria-pressed={active}
      data-testid={testId}
      className={
        SELECTION_POPOVER_ICON_BTN_CLASS +
        (active ? "" : " opacity-40 hover:opacity-70")
      }
    >
      <ActiveIcon size={15} />
    </button>
  );
}

export function SelectionPopoverCard({
  children,
  boxRef,
  onMouseDown,
  className,
}: {
  children: ReactNode;
  boxRef?: Ref<HTMLDivElement>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div ref={boxRef} onMouseDown={onMouseDown} className={className ?? "animate-fade-up"}>
      <div className={SELECTION_POPOVER_BAR_CLASS}>{children}</div>
      <SelectionPopoverCaret />
    </div>
  );
}
