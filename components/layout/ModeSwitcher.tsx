"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import {
  APP_MODES,
  APP_MODE_LABELS,
  APP_NAME,
  appModeTitle,
  hrefForAppMode,
  hrefForMobileAppMode,
  resolveAppMode,
  resolveMobileAppMode,
  type AppMode,
} from "@/lib/constants/app-mode";
import { useAppMode } from "@/lib/stores/appMode";
import { useT } from "@/lib/i18n";
import BrandLogo from "./BrandLogo";

/** 模式说明文案的 key；模式代号本身中英一致，不进词典。 */
const MODE_HINT_KEYS: Record<AppMode, string> = {
  studio: "menu.mode.hint.studio",
  agent: "menu.mode.hint.agent",
  class: "menu.mode.hint.class",
  review: "menu.mode.hint.review",
};

export default function ModeSwitcher({
  compact = false,
  stayOnStudioForAgent = false,
}: {
  compact?: boolean;
  /** 手机：切 Agent 不进 /agent 桌面工作区，标题仍显示 Agent。 */
  stayOnStudioForAgent?: boolean;
}) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const persisted = useAppMode((s) => s.mode);
  const lastStudioPath = useAppMode((s) => s.lastStudioPath);
  const setMode = useAppMode((s) => s.setMode);
  const mode = stayOnStudioForAgent
    ? resolveMobileAppMode(pathname, persisted)
    : resolveAppMode(pathname, persisted);
  const title = appModeTitle(mode);

  return (
    <AnchoredMenu
      label={t("menu.mode.switch")}
      role="menu"
      width={240}
      testId="app-mode-switcher"
      className={clsx(
        "flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--bg-muted)]",
        compact ? "max-w-[min(100%,11.5rem)]" : "max-w-[16rem]",
      )}
      trigger={
        <>
          <BrandLogo size={compact ? 20 : 24} />
          <span
            className={clsx(
              "min-w-0 truncate font-semibold tracking-tight",
              compact ? "text-[13px]" : "text-[15px]",
            )}
          >
            {title}
          </span>
          <ChevronDown size={14} className="shrink-0 text-[var(--ink-faint)]" />
        </>
      }
    >
      {(close) => (
        <>
          <div className="app-menu-heading">{APP_NAME}</div>
          {APP_MODES.map((item) => {
            const selected = item === mode;
            return (
              <button
                key={item}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="app-menu-item"
                data-testid={`app-mode-option-${item}`}
                onClick={() => {
                  setMode(item);
                  const href = stayOnStudioForAgent
                    ? hrefForMobileAppMode(item, lastStudioPath)
                    : hrefForAppMode(item, lastStudioPath);
                  if (href !== pathname) router.push(href);
                  close();
                }}
              >
                <span className="app-menu-check">{selected && <Check size={13} />}</span>
                <span>
                  <span>{APP_MODE_LABELS[item]}</span>
                  <small>{t(MODE_HINT_KEYS[item])}</small>
                </span>
              </button>
            );
          })}
        </>
      )}
    </AnchoredMenu>
  );
}
