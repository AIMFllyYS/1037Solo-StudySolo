"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

/** 分组标题行（PROJECTS / RECENTS）：展开箭头在左，hover 时右侧露出该组的动作（加号）。 */
export default function AgentSectionHeader({
  label,
  expanded,
  onToggle,
  action,
  testId,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="group/section flex items-center gap-0.5 px-1.5 pb-0.5 pt-3"
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-[var(--md-sys-color-surface-container-high)]"
      >
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--ink-faint)]">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--md-sys-color-outline)]">
          {label}
        </span>
      </button>
      {action ? (
        <div className="shrink-0 opacity-60 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">
          {action}
        </div>
      ) : null}
    </div>
  );
}
