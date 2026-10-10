"use client";

import { useRef } from "react";
import { MoreHorizontal, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { DEFAULT_BROWSER_ZOOM_PERCENT, MAX_BROWSER_ZOOM_PERCENT, MIN_BROWSER_ZOOM_PERCENT } from "@/lib/stores/workspace/browser";
import { useT } from "@/lib/i18n";

/** Controlled page actions shared by the browser tab and each source window. */
export default function PageControls({
  zoomPercent,
  onZoomChange,
  onReload,
  canZoom = true,
  canReload = true,
  testIdPrefix = "browser",
}: {
  zoomPercent: number;
  onZoomChange: (percent: number) => void;
  onReload: () => void;
  canZoom?: boolean;
  canReload?: boolean;
  testIdPrefix?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const t = useT();
  const itemClass = "flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] text-[var(--ink)] hover:bg-[var(--bg-muted)] disabled:opacity-40";
  return (
    <AnchoredMenu
      label={t("window.browser.pageControls")}
      width={210}
      placement="bottom"
      testId={`${testIdPrefix}-page-controls`}
      triggerRef={triggerRef}
      triggerData={{ "data-no-drag": "true" }}
      className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
      trigger={<MoreHorizontal size={16} />}
    >
      {(close) => {
        const run = (action: () => void) => {
          action();
          close();
          triggerRef.current?.focus({ preventScroll: true });
        };
        return (
          <div className="flex flex-col gap-1 p-1">
            <button type="button" role="menuitem" disabled={!canZoom || zoomPercent <= MIN_BROWSER_ZOOM_PERCENT}
              onClick={() => run(() => onZoomChange(zoomPercent - 10))} className={itemClass} data-testid={`${testIdPrefix}-zoom-out`}>
              <ZoomOut size={15} /><span className="flex-1">{t("window.browser.zoomOut")}</span><span>{zoomPercent}%</span>
            </button>
            <button type="button" role="menuitem" disabled={!canZoom || zoomPercent >= MAX_BROWSER_ZOOM_PERCENT}
              onClick={() => run(() => onZoomChange(zoomPercent + 10))} className={itemClass} data-testid={`${testIdPrefix}-zoom-in`}>
              <ZoomIn size={15} /><span className="flex-1">{t("window.browser.zoomIn")}</span><span>{zoomPercent}%</span>
            </button>
            <button type="button" role="menuitem" disabled={!canZoom || zoomPercent === DEFAULT_BROWSER_ZOOM_PERCENT}
              onClick={() => run(() => onZoomChange(DEFAULT_BROWSER_ZOOM_PERCENT))} className={itemClass} data-testid={`${testIdPrefix}-zoom-reset`}>
              <span className="flex-1">{t("window.browser.zoomReset")}</span><span>100%</span>
            </button>
            <button type="button" role="menuitem" disabled={!canReload}
              onClick={() => run(onReload)} className={itemClass} data-testid={`${testIdPrefix}-menu-refresh`}>
              <RotateCw size={15} />{t("window.browser.refresh")}
            </button>
          </div>
        );
      }}
    </AnchoredMenu>
  );
}
