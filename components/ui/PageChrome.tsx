import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AlertCircle, Info, Search, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * Agent 子页面（资产 / 插件市场 / 定时任务 / 详情）共用的页面骨架。
 * 以前每页各写各的 header、搜索框、空态和提示条，间距与字号逐页漂移；统一收口后只调这里。
 */

export function PageShell({ className, ...rest }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...rest}
      className={clsx(
        "flex h-full min-h-0 min-w-0 flex-col bg-[var(--agent-content-bg,var(--md-sys-color-surface-container-low))]",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  leading,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** 标题左侧的导航（返回按钮等）。 */
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line-soft)] px-5 py-3", className)}>
      {leading}
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold leading-tight text-[var(--ink)]">{title}</h1>
          {description ? <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--ink-faint)]">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  testId,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  testId?: string;
  className?: string;
}) {
  return (
    <label
      className={clsx(
        "flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] px-2.5 transition-colors focus-within:border-[var(--accent)]",
        className,
      )}
    >
      <Search size={14} className="shrink-0 text-[var(--ink-faint)]" aria-hidden />
      <input
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-[min(200px,40vw)] min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
      />
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span aria-hidden className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--ink-faint)]">
          <Icon size={20} strokeWidth={1.6} />
        </span>
      ) : null}
      <p className="text-[13px] font-medium text-[var(--ink-soft)]">{title}</p>
      {description ? <p className="max-w-[360px] text-[12px] leading-relaxed text-[var(--ink-faint)]">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

const NOTICE_TONES = {
  info: "border-[var(--line-soft)] bg-[var(--bg-muted)] text-[var(--ink-soft)]",
  warn: "border-transparent bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
  danger: "border-transparent bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]",
} as const;

/** 行内提示条：同步问题 / 读取失败 / 额度说明。danger 与 warn 自动带 role="alert"。 */
export function InlineNotice({
  tone = "info",
  children,
  actions,
  className,
  ...rest
}: {
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">) {
  const Icon = tone === "info" ? Info : AlertCircle;
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      {...rest}
      className={clsx("flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed", NOTICE_TONES[tone], className)}
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
