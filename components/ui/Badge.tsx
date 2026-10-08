import type { ReactNode } from "react";
import clsx from "clsx";

export type BadgeTone = "neutral" | "accent" | "warn" | "danger" | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-muted)] text-[var(--ink-soft)]",
  accent: "bg-[var(--accent-weak)] text-[var(--accent-ink)]",
  warn: "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
  danger: "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
  outline: "border border-[var(--line-soft)] text-[var(--ink-faint)]",
};

/** 小徽章 / 状态胶囊：全站统一的标签形态，颜色全部走主题令牌，换主题自动跟随。 */
export default function Badge({
  tone = "neutral",
  icon,
  dot = false,
  className,
  children,
  ...rest
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  /** 前置一颗状态点（用于连接 / 同步这类「有状态」的徽章）。 */
  dot?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "className" | "children">) {
  return (
    <span
      {...rest}
      className={clsx(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" /> : null}
      {icon ? <span aria-hidden className="inline-flex shrink-0 items-center">{icon}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
