"use client";

import { Languages, Moon, PanelTopClose, RotateCcw, Sun, Type, Zap } from "lucide-react";
import AppSelect from "@/components/ui/AppSelect";
import { Toggle } from "@/components/chat/settings/_shared";
import { LOCALES, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/stores/settings";
import {
  FONT_CHOICES,
  contrastText,
  type AppearanceMode,
  type AppearanceSettings,
  type CustomAppearanceSettings,
  type GlobalFontId,
  type ThemeMode,
} from "@/lib/theme/appearance";

/** 外观模式 → 文案 key（值见 settings.appearance.mode*）；渲染方用 t() 取词。 */
export const APPEARANCE_LABEL_KEYS: Record<AppearanceMode, string> = {
  default: "settings.appearance.modeDefault",
  colorful: "settings.appearance.modeColorful",
  anthropic: "settings.appearance.modeAnthropic",
  ios: "settings.appearance.modeIos",
  codex: "settings.appearance.modeCodex",
  custom: "settings.appearance.modeCustom",
};

/** 预设模式在模式格子里露一小条三色色板，便于一眼认出来。 */
const APPEARANCE_SWATCHES: Partial<Record<AppearanceMode, string[]>> = {
  colorful: ["#3d6db5", "#8a5bb8", "#2c8470"],
  anthropic: ["#faf9f5", "#d97757", "#1f1e1b"],
  ios: ["#ffffff", "#007aff", "#1c1c1e"],
  codex: ["#0d1117", "#3fb950", "#39c5cf"],
};

function AppearanceModeButton({
  mode,
  active,
  onClick,
}: {
  mode: AppearanceMode;
  active: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const swatches = APPEARANCE_SWATCHES[mode];
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
      style={{
        background: active ? "var(--md-sys-color-primary)" : "transparent",
        color: active
          ? "var(--md-sys-color-on-primary)"
          : "var(--md-sys-color-on-surface-variant)",
      }}
    >
      <span className="flex items-center justify-center gap-1.5">
        {swatches ? (
          <span className="flex items-center -space-x-1" aria-hidden>
            {swatches.map((color) => (
              <span
                key={color}
                className="h-2.5 w-2.5 rounded-full border"
                style={{ background: color, borderColor: "rgba(128,128,128,0.35)" }}
              />
            ))}
          </span>
        ) : null}
        {t(APPEARANCE_LABEL_KEYS[mode])}
      </span>
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
      <span className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">{label}</span>
      <span className="flex items-center gap-2">
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-7 w-9 cursor-pointer rounded border border-[var(--md-sys-color-outline-variant)] bg-transparent p-0.5"
        />
        <span className="w-[66px] text-right font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {value}
        </span>
      </span>
    </label>
  );
}

/** 自定义模式的迷你预览：按当前明暗侧用所选颜色画一条假界面。 */
function CustomPreview({
  theme,
  custom,
}: {
  theme: ThemeMode;
  custom: CustomAppearanceSettings;
}) {
  const t = useT();
  const light = theme === "light";
  const bg = light ? custom.lightBackground : custom.darkBackground;
  const ink = light ? custom.lightText : custom.darkText;
  const accent = light ? custom.lightAccent : custom.darkAccent;
  const onAccent = contrastText(accent);
  const cardBg = `color-mix(in srgb, ${bg} 93%, ${ink})`;
  return (
    <div
      aria-label={t("settings.appearance.preview")}
      className="overflow-hidden rounded-lg border border-[var(--md-sys-color-outline-variant)]"
      style={{ background: bg, color: ink }}
    >
      <div
        className="px-3 py-1.5 text-[11px] font-semibold"
        style={{ background: cardBg }}
      >
        {t("settings.appearance.preview")}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-[12px]">{t("settings.appearance.previewText")}</span>
        <span
          className="press ml-auto rounded-full px-3 py-1 text-[11.5px] font-semibold"
          style={{ background: accent, color: onAccent }}
        >
          {t("settings.appearance.previewButton")}
        </span>
      </div>
    </div>
  );
}

export default function AppearanceSettingsControls({
  theme,
  setTheme,
  appearance,
  setAppearanceMode,
  setCustomAppearance,
  resetAppearance,
}: {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  appearance: AppearanceSettings;
  setAppearanceMode: (mode: AppearanceMode) => void;
  setCustomAppearance: (next: Partial<CustomAppearanceSettings>) => void;
  resetAppearance: () => void;
}) {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const setReduceMotion = useSettings((s) => s.setReduceMotion);
  const centerTabsAutoHide = useSettings((s) => s.centerTabsAutoHide);
  const setCenterTabsAutoHide = useSettings((s) => s.setCenterTabsAutoHide);
  const updateCustomAppearance = (patch: Partial<CustomAppearanceSettings>) => {
    if (appearance.mode !== "custom") setAppearanceMode("custom");
    setCustomAppearance(patch);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 语言是全局设置：全局设置页与 AI 设置页共用这份控件，分段控件复用明暗主题那组胶囊的写法。 */}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
          <Languages size={14} /> {t("settings.language.title")}
        </span>
        <div
          role="group"
          aria-label={t("settings.language.title")}
          className="flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
          style={{ background: "var(--md-sys-color-surface-container-highest)" }}
        >
          {LOCALES.map((value) => {
            const active = locale === value;
            return (
              <button
                key={value}
                type="button"
                data-testid={`settings-locale-${value}`}
                aria-pressed={active}
                onClick={() => setLocale(value)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--md-sys-color-primary)" : "transparent",
                  color: active
                    ? "var(--md-sys-color-on-primary)"
                    : "var(--md-sys-color-on-surface-variant)",
                }}
              >
                {value === "zh" ? t("settings.language.zh") : t("settings.language.en")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
        <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{t("settings.appearance.theme")}</span>
        <div
          className="flex items-center gap-0.5 rounded-full p-0.5"
          style={{ background: "var(--md-sys-color-surface-container-highest)" }}
        >
          {(["light", "dark"] as const).map((mode) => {
            const active = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--md-sys-color-primary)" : "transparent",
                  color: active
                    ? "var(--md-sys-color-on-primary)"
                    : "var(--md-sys-color-on-surface-variant)",
                }}
              >
                {mode === "light" ? <Sun size={13} /> : <Moon size={13} />}
                {t(mode === "light" ? "settings.appearance.light" : "settings.appearance.dark")}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-0.5 rounded-2xl p-0.5"
        style={{ background: "var(--md-sys-color-surface-container-highest)" }}
      >
        {(["default", "colorful", "anthropic", "ios", "codex", "custom"] as const).map((mode) => (
          <AppearanceModeButton
            key={mode}
            mode={mode}
            active={appearance.mode === mode}
            onClick={() => setAppearanceMode(mode)}
          />
        ))}
      </div>

      {appearance.mode === "custom" ? (
        <CustomPreview theme={theme} custom={appearance.custom} />
      ) : null}

      <div className="grid grid-cols-1 gap-2">
        <div className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.appearance.light")}
        </div>
        <ColorField
          label={t("settings.appearance.lightBackground")}
          value={appearance.custom.lightBackground}
          onChange={(value) => updateCustomAppearance({ lightBackground: value })}
        />
        <ColorField
          label={t("settings.appearance.lightAccent")}
          value={appearance.custom.lightAccent}
          onChange={(value) => updateCustomAppearance({ lightAccent: value })}
        />
        <ColorField
          label={t("settings.appearance.lightText")}
          value={appearance.custom.lightText}
          onChange={(value) => updateCustomAppearance({ lightText: value })}
        />
        <div className="text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.appearance.dark")}
        </div>
        <ColorField
          label={t("settings.appearance.darkBackground")}
          value={appearance.custom.darkBackground}
          onChange={(value) => updateCustomAppearance({ darkBackground: value })}
        />
        <ColorField
          label={t("settings.appearance.darkAccent")}
          value={appearance.custom.darkAccent}
          onChange={(value) => updateCustomAppearance({ darkAccent: value })}
        />
        <ColorField
          label={t("settings.appearance.darkText")}
          value={appearance.custom.darkText}
          onChange={(value) => updateCustomAppearance({ darkText: value })}
        />
        <ColorField
          label={t("settings.appearance.selectionColor")}
          value={appearance.custom.selection}
          onChange={(value) => updateCustomAppearance({ selection: value })}
        />
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
          <Type size={14} /> {t("settings.appearance.font")}
        </span>
        <AppSelect label={t("settings.appearance.font")} value={appearance.custom.font}
          onValueChange={(font) => updateCustomAppearance({ font })}
          className="max-w-[150px]"
          options={(Object.keys(FONT_CHOICES) as GlobalFontId[]).map((fontId) => ({
            value: fontId, label: t(FONT_CHOICES[fontId].labelKey),
          }))} />
      </label>

      {/* 「减少动画」：用户可控的全局收口（系统 prefers-reduced-motion 之外的开关），
          与上面的主题/字体同属「看着舒服」一档。 */}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
        <span className="flex items-center gap-1.5">
          <Zap size={14} className="text-[var(--md-sys-color-on-surface-variant)]" />
          <span>
            <span className="block text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
              {t("settings.appearance.reduceMotion")}
            </span>
            <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.appearance.reduceMotionDesc")}
            </span>
          </span>
        </span>
        <Toggle
          on={reduceMotion}
          onClick={() => setReduceMotion(!reduceMotion)}
          aria-label={t("settings.appearance.reduceMotionAria")}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2">
        <span className="flex items-center gap-1.5">
          <PanelTopClose size={14} className="text-[var(--md-sys-color-on-surface-variant)]" />
          <span>
            <span className="block text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
              {t("settings.appearance.centerTabsAutoHide")}
            </span>
            <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.appearance.centerTabsAutoHideDesc")}
            </span>
          </span>
        </span>
        <Toggle
          on={centerTabsAutoHide}
          onClick={() => setCenterTabsAutoHide(!centerTabsAutoHide)}
          aria-label={t("settings.appearance.centerTabsAutoHideAria")}
        />
      </div>

      <button
        type="button"
        onClick={resetAppearance}
        className="press flex items-center justify-center gap-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-lowest)] px-3 py-2 text-[12.5px] font-semibold text-[var(--md-sys-color-on-surface-variant)]"
      >
        <RotateCcw size={14} /> {t("settings.appearance.reset")}
      </button>
    </div>
  );
}
