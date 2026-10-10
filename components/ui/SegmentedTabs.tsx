"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export interface SegmentedTab<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
  testId?: string;
}

/**
 * 胶囊标签条（资产 / 插件市场 / 课堂这类页面级分类切换）。
 * - 横向可滚，选中态用 accent-weak，计数用等宽数字；
 * - 左右方向键在标签间移动，焦点和选中同步（WAI-ARIA tablist 的自动激活模式）。
 */
export default function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  trailing,
  className,
}: {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** 条右端的附属信息（总数、筛选等），不参与方向键导航。 */
  trailing?: ReactNode;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = tabs.length - 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const target = tabs[next];
    onChange(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <div className={clsx("flex shrink-0 items-center gap-2 px-4 py-2", className)}>
      <div className="ss-tab-rail hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(node) => { refs.current[tab.id] = node; }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-testid={tab.testId}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => move(event, index)}
              className={clsx(
                "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                selected
                  ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
              )}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className={clsx("text-[11px] tabular-nums", selected ? "opacity-75" : "text-[var(--ink-faint)]")}>{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">{trailing}</div> : null}
    </div>
  );
}
