"use client";

import { PanelRight, Pin, Type } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks/useSettings";
import { useStore } from "@/lib/stores/ui";
import { useTheme } from "@/lib/hooks/useTheme";
import AppearanceSettingsControls from "@/components/layout/settings/AppearanceSettingsControls";
import { h3Cls, Toggle } from "./_shared";

export function AppearanceSection() {
  const fontScale = useSettings((s) => s.fontScale);
  const setFontScale = useSettings((s) => s.setFontScale);
  const showRightPanelTabBar = useSettings((s) => s.showRightPanelTabBar);
  const setShowRightPanelTabBar = useSettings((s) => s.setShowRightPanelTabBar);
  const pinChatHeader = useSettings((s) => s.pinChatHeader);
  const setPinChatHeader = useSettings((s) => s.setPinChatHeader);
  const t = useT();
  const { theme, setTheme, appearance, setAppearanceMode, setCustomAppearance, resetAppearance } = useTheme();

  return (
    <section className="flex flex-col gap-3">
      <h3 className={h3Cls}>{t("settings.appearance.agentPanel")}</h3>
      {[
        {
          on: showRightPanelTabBar,
          set: (next: boolean) => {
            setShowRightPanelTabBar(next);
            if (!next) useStore.getState().setRightTab("ai");
          },
          label: t("settings.appearance.rightPanelTabBar"),
          desc: t("settings.appearance.rightPanelTabBarDesc"),
          icon: <PanelRight size={16} />,
          ariaLabel: t("settings.appearance.rightPanelTabBarAria"),
        },
        {
          on: pinChatHeader,
          set: setPinChatHeader,
          label: t("settings.appearance.pinChatHeader"),
          desc: t("settings.appearance.pinChatHeaderDesc"),
          icon: <Pin size={16} />,
          ariaLabel: t("settings.appearance.pinChatHeaderAria"),
        },
      ].map((it) => (
        <div
          key={it.label}
          className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--md-sys-color-primary)]">{it.icon}</span>
            <div>
              <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                {it.label}
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {it.desc}
              </div>
            </div>
          </div>
          <Toggle on={it.on} onClick={() => it.set(!it.on)} aria-label={it.ariaLabel} />
        </div>
      ))}
      <div className="settings-section-divider" />
      <h3 className={h3Cls}>{t("settings.appearance.project")}</h3>
      {/* 语言与「减少动画」都在 AppearanceSettingsControls 里：与全局设置页共用一份控件，不重复实现。 */}
      <AppearanceSettingsControls theme={theme} setTheme={setTheme} appearance={appearance}
        setAppearanceMode={setAppearanceMode} setCustomAppearance={setCustomAppearance} resetAppearance={resetAppearance} />
      <div className="settings-section-divider" />
      <h3 className={h3Cls}>{t("settings.appearance.reading")}</h3>
      <div className="flex items-center gap-2 text-[var(--md-sys-color-on-surface-variant)]">
        <Type size={14} />
        <span className="text-[12.5px]">{t("settings.appearance.fontSize")}</span>
        <span className="ml-auto text-[12px] font-medium text-[var(--md-sys-color-primary)]">
          {Math.round(fontScale * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0.85}
        max={1.35}
        step={0.05}
        value={fontScale}
        onChange={(e) => setFontScale(parseFloat(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--md-sys-color-primary)" }}
      />
      <div
        className="rounded-lg bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-[var(--md-sys-color-on-surface)]"
        style={{ fontSize: `${13 * fontScale}px`, lineHeight: 1.6 }}
      >
        {t("settings.appearance.fontPreview")}
      </div>
    </section>
  );
}
