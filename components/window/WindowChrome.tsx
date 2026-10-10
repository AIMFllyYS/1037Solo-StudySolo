"use client";

import type { ReactNode } from "react";
import { ExternalLink, Maximize2, Minimize2, Minus, X } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";

interface WindowChromeProps {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  isMinimized?: boolean;
  children: ReactNode;
  onDragStart?: (event: React.PointerEvent) => void;
  showExternalLink?: boolean;
  externalLinkLabel?: string;
  onExternalLink?: () => void;
  actions?: ReactNode;
  bodyClassName?: string;
  surface?: "floating" | "dock" | "sheet";
}

function TrafficButton({
  tone,
  title,
  onClick,
  children,
}: {
  tone: "close" | "minimize" | "fullscreen";
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-no-drag
      onClick={onClick}
      title={title}
      className={clsx(
        "group flex h-3 w-3 items-center justify-center rounded-full border text-black/55 transition-colors",
        tone === "close" && "border-[#df514b] bg-[#ff5f57] hover:bg-[#ff4740]",
        tone === "minimize" && "border-[#d39c1d] bg-[#ffbd2e] hover:bg-[#f5aa13]",
        tone === "fullscreen" && "border-[#13a238] bg-[#28c840] hover:bg-[#20b837]",
      )}
    >
      <span className="opacity-0 transition-opacity group-hover:opacity-100">{children}</span>
    </button>
  );
}

export default function WindowChrome({
  title,
  icon,
  onClose,
  onMinimize,
  onFullscreen,
  isFullscreen,
  children,
  onDragStart,
  showExternalLink,
  externalLinkLabel,
  onExternalLink,
  actions,
  bodyClassName,
  surface = "floating",
}: WindowChromeProps) {
  const t = useT();
  const compactSurface = surface === "dock" || surface === "sheet";
  const dockSurface = surface === "dock";
  // dock 窗口的标题、关闭、收起、扩展都已由右栏标签条承担：这一行只在有业务动作/外链时才出现。
  const showHeader = !dockSurface || Boolean(actions) || Boolean(showExternalLink);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {showHeader && <div
        onPointerDown={compactSurface || isFullscreen ? undefined : onDragStart}
        className={clsx(
          "ss-chrome window-chrome-header relative flex min-h-8 shrink-0 items-center justify-center px-3",
          dockSurface ? "bg-[var(--bg-panel)]" : "bg-[var(--md-sys-color-surface-container-high)]",
          compactSurface || isFullscreen ? "cursor-default" : "cursor-grab",
        )}
        style={{ userSelect: "none", touchAction: "none" }}
      >
        {!dockSurface && <div className="absolute left-3 top-1/2 z-10 flex shrink-0 -translate-y-1/2 items-center gap-1">
          {compactSurface ? (
            <button
              type="button"
              data-no-drag
              onClick={onClose}
              title={t("panel.common.close")}
              className="press flex h-7 w-7 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)] hover:text-[var(--md-sys-color-error)]"
            >
              <X size={15} />
            </button>
          ) : (
            <>
              <TrafficButton tone="close" title={t("panel.common.close")} onClick={onClose}>
                <X size={9} strokeWidth={3} />
              </TrafficButton>
              <TrafficButton tone="minimize" title={t("panel.window.minimize")} onClick={onMinimize}>
                <Minus size={9} strokeWidth={3} />
              </TrafficButton>
              <TrafficButton tone="fullscreen" title={t(isFullscreen ? "panel.window.restore" : "panel.window.fullscreen")} onClick={onFullscreen}>
                {isFullscreen ? <Minimize2 size={8} strokeWidth={3} /> : <Maximize2 size={8} strokeWidth={3} />}
              </TrafficButton>
            </>
          )}
        </div>}

        {!dockSurface && <div className="pointer-events-none absolute inset-x-24 top-1/2 flex min-w-0 -translate-y-1/2 items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--md-sys-color-on-surface)]">
          {icon && <span className="shrink-0 text-[var(--md-sys-color-primary)]">{icon}</span>}
          <span className="min-w-0 truncate">{title}</span>
        </div>}

        <div className={clsx(
          "z-10 flex items-center justify-end gap-1",
          dockSurface ? "w-full" : "absolute right-3 top-1/2 max-w-[calc(100%-6rem)] -translate-y-1/2",
        )}>
          {/* 窄栏里业务 actions 可能比内容区还宽：让它们自己横向滚动，窗口控制按钮始终可点。 */}
          {actions ? (
            <div
              data-testid="window-chrome-actions"
              className="hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
            >
              {actions}
            </div>
          ) : null}
          {showExternalLink && (
            <button
              type="button"
              data-no-drag
              onClick={onExternalLink}
              title={externalLinkLabel || t("panel.window.openInNewTab")}
              className={clsx(
                "press flex h-7 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--md-sys-color-surface-variant)]",
                externalLinkLabel
                  ? "gap-1 px-2 text-[12px] font-medium text-[var(--md-sys-color-on-surface)]"
                  : "w-7",
              )}
            >
              <ExternalLink size={externalLinkLabel ? 13 : 15} />
              {externalLinkLabel ? <span>{externalLinkLabel}</span> : null}
            </button>
          )}
        </div>
      </div>}
      <div className={clsx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}
