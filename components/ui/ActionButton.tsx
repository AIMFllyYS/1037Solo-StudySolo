import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

export type ActionVariant = "primary" | "secondary" | "ghost" | "danger";
export type ActionSize = "sm" | "md";

const BASE =
  "press inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ActionVariant, string> = {
  primary: "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)] hover:brightness-110",
  secondary: "border border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--bg-muted)]",
  ghost: "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
  danger:
    "text-[var(--md-sys-color-error)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-error)_12%,transparent)]",
};

const SIZES: Record<ActionSize, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[12.5px]",
};

/** 链接 / 表单提交等非 <button> 元素也要同款外观时，直接拿这条 class。 */
export function actionClass(variant: ActionVariant = "secondary", size: ActionSize = "md", className?: string) {
  return clsx(BASE, VARIANTS[variant], SIZES[size], className);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionVariant;
  size?: ActionSize;
  icon?: ReactNode;
};

/** 统一按钮：主 / 次 / 幽灵 / 危险四种语气，两档高度。Agent / 资产 / 插件 / 课堂外围都走它。 */
const ActionButton = forwardRef<HTMLButtonElement, Props>(function ActionButton(
  { variant = "secondary", size = "md", icon, className, type = "button", children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} data-action-variant={variant} {...rest} className={actionClass(variant, size, className)}>
      {icon ? <span aria-hidden className="inline-flex shrink-0 items-center">{icon}</span> : null}
      {children}
    </button>
  );
});

export default ActionButton;
