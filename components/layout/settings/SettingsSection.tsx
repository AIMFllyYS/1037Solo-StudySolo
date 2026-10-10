"use client";

import { ChevronDown } from "lucide-react";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { DURATION, EASE } from "@/lib/motion";

const CHEVRON_EASE = `cubic-bezier(${EASE.decelerate.join(",")})`;

function Chevron({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <ChevronDown
      size={size}
      className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]"
      style={{
        transition: `transform ${DURATION.sidebar}s ${CHEVRON_EASE}`,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
      }}
    />
  );
}

/**
 * 设置面板里的一个折叠分区。外观由 variant 唯一决定，不再有第二个开关：
 * - card：手机全屏设置页。卡片样式，展开内容直接向下推后面的卡片（不截高度、不做高度动画）。
 * - menu：桌面弹出面板。扁平菜单项，一行「图标 标题 …… 摘要」；
 *   展开内容缩进 + 灰字并限高内部滚动，让各分区的展开位移保持在同一量级。
 */
export default function SettingsSection({
  title,
  icon,
  summary,
  children,
  open,
  onToggle,
  testId,
  variant = "card",
}: {
  title: string;
  icon: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  testId?: string;
  variant?: "card" | "menu";
}) {
  if (variant === "menu") {
    return (
      <section className="shrink-0" data-settings-expand="bounded" data-settings-variant="menu">
        <button
          type="button"
          aria-expanded={open}
          aria-label={title}
          data-testid={testId}
          onClick={onToggle}
          className="app-menu-item"
        >
          <span className="app-menu-check text-[var(--md-sys-color-on-surface-variant)]">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{title}</span>
              {summary ? (
                <span className="shrink-0 truncate text-[10.5px] font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  {summary}
                </span>
              ) : null}
            </span>
          </span>
          <Chevron open={open} size={14} />
        </button>
        <AnimatedCollapse isOpen={open}>
          {/* 限高 + 内部滚动：避免「快捷键」这类长内容把展开位移拉到 1500px 以上，
              使各分区的展开动画位移保持在同一量级。 */}
          <div className="max-h-[min(44vh,300px)] overflow-y-auto overscroll-contain pb-2 pl-[30px] pr-2 text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
            {children}
          </div>
        </AnimatedCollapse>
      </section>
    );
  }

  return (
    <section
      className="shrink-0 overflow-hidden rounded-[var(--md-sys-shape-corner-large,16px)]"
      data-settings-expand="unbounded"
      data-settings-variant="card"
      style={{
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={title}
        data-testid={testId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-0 bg-transparent px-3.5 py-3 text-left"
        style={{ color: "var(--md-sys-color-on-surface)", cursor: "pointer" }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold">{title}</span>
          {summary && (
            <span className="mt-0.5 block truncate text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
              {summary}
            </span>
          )}
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="border-t px-3.5 py-3" style={{ borderColor: "var(--md-sys-color-outline-variant)" }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
