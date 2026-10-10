import type { I18nKey } from "@/lib/i18n";

export type ThemeMode = "light" | "dark";
export type AppearanceMode = "default" | "colorful" | "anthropic" | "ios" | "codex" | "custom";
export type GlobalFontId = "system" | "songti" | "kaiti" | "hei" | "serif" | "mono";

export interface CustomAppearanceSettings {
  lightBackground: string;
  lightAccent: string;
  lightText: string;
  darkBackground: string;
  darkAccent: string;
  darkText: string;
  selection: string;
  font: GlobalFontId;
}

export interface AppearanceSettings {
  mode: AppearanceMode;
  custom: CustomAppearanceSettings;
}

export const APPEARANCE_LS_KEY = "gailvlun-appearance-v1";

// labelKey 是设置页下拉项的文案 key（值见 settings.appearance.fontChoices.*），渲染处用 t() 取词。
export const FONT_CHOICES: Record<GlobalFontId, { labelKey: I18nKey; cssValue: string }> = {
  system: {
    labelKey: "settings.appearance.fontChoices.system",
    cssValue:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif',
  },
  songti: {
    labelKey: "settings.appearance.fontChoices.songti",
    cssValue:
      '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, Georgia, "Times New Roman", serif',
  },
  kaiti: {
    labelKey: "settings.appearance.fontChoices.kaiti",
    cssValue:
      'KaiTi, STKaiti, "Kaiti SC", "LXGW WenKai", "Ma Shan Zheng", "Microsoft YaHei", cursive',
  },
  hei: {
    labelKey: "settings.appearance.fontChoices.hei",
    cssValue:
      '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  },
  serif: {
    labelKey: "settings.appearance.fontChoices.serif",
    cssValue: 'Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif',
  },
  mono: {
    labelKey: "settings.appearance.fontChoices.mono",
    cssValue: '"JetBrains Mono", "Cascadia Code", Consolas, "Microsoft YaHei", monospace',
  },
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mode: "ios",
  custom: {
    lightBackground: "#fffbfe",
    lightAccent: "#6750a4",
    lightText: "#1c1b1f",
    darkBackground: "#131318",
    darkAccent: "#a8c7fa",
    darkText: "#e2e2e9",
    selection: "#ff9800",
    font: "system",
  },
};

/**
 * 每套预设主题的招牌字体（第一性原理：主题 = 配色 + 排印；只换颜色不换字，主题就只换了一半）。
 * 切主题时把字体一并切过去；之后用户仍可在字体下拉里单独改。custom 保留用户自己的选择。
 */
export const THEME_DEFAULT_FONTS: Record<Exclude<AppearanceMode, "custom">, GlobalFontId> = {
  default: "system",
  colorful: "hei",
  anthropic: "serif",
  ios: "system",
  codex: "mono",
};

export function fontForAppearanceMode(mode: AppearanceMode, current: GlobalFontId): GlobalFontId {
  return mode === "custom" ? current : THEME_DEFAULT_FONTS[mode];
}

const APPEARANCE_MODES = new Set<AppearanceMode>([
  "default",
  "colorful",
  "anthropic",
  "ios",
  "codex",
  "custom",
]);
const FONT_IDS = new Set<GlobalFontId>(Object.keys(FONT_CHOICES) as GlobalFontId[]);

const INLINE_VAR_NAMES = [
  "--appearance-light-bg",
  "--appearance-dark-bg",
  "--appearance-light-ink",
  "--appearance-dark-ink",
  "--appearance-light-extreme",
  "--appearance-dark-extreme",
  "--appearance-light-accent",
  "--appearance-dark-accent",
  "--appearance-light-on-accent",
  "--appearance-dark-on-accent",
  "--appearance-light-accent-container",
  "--appearance-dark-accent-container",
  "--appearance-light-on-accent-container",
  "--appearance-dark-on-accent-container",
  "--appearance-selection",
  "--appearance-selection-bg",
  "--appearance-highlight-a",
  "--appearance-highlight-b",
  "--appearance-highlight-c",
  "--appearance-highlight-d",
  "--appearance-highlight-shadow",
  "--font-sans",
] as const;

export function safeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function relativeLuminance(hex: string): number {
  const rgb = hex.slice(1).match(/.{2}/g)?.map((part) => parseInt(part, 16));
  if (!rgb || rgb.length !== 3) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 底上文字取深还是浅：与 #111318/#ffffff 的对比度在 L≈0.24 处相等（白 4.9 / 深 5.4）。 */
export function contrastText(hex: string): string {
  return relativeLuminance(hex) > 0.24 ? "#111318" : "#ffffff";
}

/** container-lowest / surface-bright 的推演方向：浅底往白推、深底往黑推。 */
function surfaceExtreme(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "#ffffff" : "#000000";
}

function readFontId(value: unknown): GlobalFontId {
  return typeof value === "string" && FONT_IDS.has(value as GlobalFontId)
    ? (value as GlobalFontId)
    : DEFAULT_APPEARANCE_SETTINGS.custom.font;
}

export function normalizeAppearanceSettings(value: unknown): AppearanceSettings {
  const parsed = parsePayload(value);
  if (!parsed || typeof parsed !== "object") return DEFAULT_APPEARANCE_SETTINGS;
  const raw = parsed as { mode?: unknown; custom?: unknown };
  if (typeof raw.mode !== "string" || !APPEARANCE_MODES.has(raw.mode as AppearanceMode)) {
    return DEFAULT_APPEARANCE_SETTINGS;
  }

  const custom = raw.custom && typeof raw.custom === "object"
    ? (raw.custom as Partial<CustomAppearanceSettings>)
    : {};

  return {
    mode: raw.mode as AppearanceMode,
    custom: {
      lightBackground: safeHexColor(custom.lightBackground, DEFAULT_APPEARANCE_SETTINGS.custom.lightBackground),
      lightAccent: safeHexColor(custom.lightAccent, DEFAULT_APPEARANCE_SETTINGS.custom.lightAccent),
      lightText: safeHexColor(custom.lightText, DEFAULT_APPEARANCE_SETTINGS.custom.lightText),
      darkBackground: safeHexColor(custom.darkBackground, DEFAULT_APPEARANCE_SETTINGS.custom.darkBackground),
      darkAccent: safeHexColor(custom.darkAccent, DEFAULT_APPEARANCE_SETTINGS.custom.darkAccent),
      darkText: safeHexColor(custom.darkText, DEFAULT_APPEARANCE_SETTINGS.custom.darkText),
      selection: safeHexColor(custom.selection, DEFAULT_APPEARANCE_SETTINGS.custom.selection),
      font: readFontId(custom.font),
    },
  };
}

export function serializeAppearanceSettings(settings: AppearanceSettings): string {
  const normalized = normalizeAppearanceSettings(settings);
  return JSON.stringify({
    mode: normalized.mode,
    custom: normalized.custom,
  });
}

export function buildAppearanceCssVars(settings: AppearanceSettings): Record<string, string> {
  const normalized = normalizeAppearanceSettings(settings);
  // 字体是主题的一部分：任何外观下都应用当前字体（切主题时 store 会换成该主题的招牌字体）。
  if (normalized.mode !== "custom") return { "--font-sans": FONT_CHOICES[normalized.custom.font].cssValue };

  const {
    lightBackground,
    lightAccent,
    lightText,
    darkBackground,
    darkAccent,
    darkText,
    selection,
    font,
  } = normalized.custom;
  return {
    "--appearance-light-bg": lightBackground,
    "--appearance-dark-bg": darkBackground,
    "--appearance-light-ink": lightText,
    "--appearance-dark-ink": darkText,
    "--appearance-light-extreme": surfaceExtreme(lightBackground),
    "--appearance-dark-extreme": surfaceExtreme(darkBackground),
    "--appearance-light-accent": lightAccent,
    "--appearance-dark-accent": darkAccent,
    "--appearance-light-on-accent": contrastText(lightAccent),
    "--appearance-dark-on-accent": contrastText(darkAccent),
    "--appearance-light-accent-container": `color-mix(in srgb, ${lightAccent} 16%, white)`,
    "--appearance-dark-accent-container": `color-mix(in srgb, ${darkAccent} 24%, #10131a)`,
    "--appearance-light-on-accent-container": contrastText(lightAccent),
    "--appearance-dark-on-accent-container": contrastText(darkAccent),
    "--appearance-selection": selection,
    "--appearance-selection-bg": `color-mix(in srgb, ${selection} 34%, transparent)`,
    "--appearance-highlight-a": `color-mix(in srgb, ${selection} 28%, transparent)`,
    "--appearance-highlight-b": `color-mix(in srgb, ${selection} 42%, transparent)`,
    "--appearance-highlight-c": `color-mix(in srgb, ${selection} 30%, transparent)`,
    "--appearance-highlight-d": `color-mix(in srgb, ${selection} 38%, transparent)`,
    "--appearance-highlight-shadow": `color-mix(in srgb, ${selection} 30%, transparent)`,
    "--font-sans": FONT_CHOICES[font].cssValue,
  };
}

export function readAppearanceFromStorage(storage: Storage | null | undefined): AppearanceSettings {
  if (!storage) return DEFAULT_APPEARANCE_SETTINGS;
  try {
    return normalizeAppearanceSettings(storage.getItem(APPEARANCE_LS_KEY));
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

export function writeAppearanceToStorage(
  storage: Storage | null | undefined,
  settings: AppearanceSettings,
): void {
  if (!storage) return;
  try {
    storage.setItem(APPEARANCE_LS_KEY, serializeAppearanceSettings(settings));
  } catch {
    /* ignore */
  }
}

export function applyAppearanceToDocument(
  doc: Document | null | undefined,
  settings: AppearanceSettings,
): void {
  if (!doc) return;
  const normalized = normalizeAppearanceSettings(settings);
  const root = doc.documentElement;
  root.setAttribute("data-appearance", normalized.mode);
  root.setAttribute("data-font", normalized.custom.font);

  for (const name of INLINE_VAR_NAMES) {
    root.style.removeProperty(name);
  }

  const vars = buildAppearanceCssVars(normalized);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
}
