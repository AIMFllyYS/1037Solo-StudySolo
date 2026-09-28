import { create } from "zustand";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  applyAppearanceToDocument,
  fontForAppearanceMode,
  normalizeAppearanceSettings,
  readAppearanceFromStorage,
  writeAppearanceToStorage,
  type AppearanceMode,
  type AppearanceSettings,
  type CustomAppearanceSettings,
  type ThemeMode,
} from "@/lib/theme/appearance";

/**
 * 全站主题（深色 / 浅色）单一真相源。
 * 侧栏底部的快捷切换与「设置」面板共用此 store，避免两处状态各自漂移。
 * 落地 localStorage；首屏由 app/layout.tsx 内联脚本在 paint 前应用，杜绝闪烁。
 */
export type { ThemeMode };

const LS_KEY = "gailvlun-theme";

/** 读 DOM 上当前生效的主题（无 data-theme 时默认浅色，见 globals.css :root）。 */
function domTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function apply(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    /* ignore */
  }
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function getDocument(): Document | null {
  if (typeof document === "undefined") return null;
  return document;
}

function persistAppearance(settings: AppearanceSettings): void {
  writeAppearanceToStorage(getLocalStorage(), settings);
  applyAppearanceToDocument(getDocument(), settings);
}

interface ThemeState {
  theme: ThemeMode;
  /** 是否已与 DOM/本地存储对齐（用于避免 SSR/首挂载误显示）。 */
  hydrated: boolean;
  /** 全局外观：默认 / 彩色 / 自定义。 */
  appearance: AppearanceSettings;
  setTheme: (mode: ThemeMode) => void;
  toggle: () => void;
  setAppearanceMode: (mode: AppearanceMode) => void;
  setCustomAppearance: (next: Partial<CustomAppearanceSettings>) => void;
  resetAppearance: () => void;
  /** 客户端挂载后调用：从 DOM（已由内联脚本应用本地值）回填真实主题。 */
  hydrate: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: "light",
  hydrated: false,
  appearance: DEFAULT_APPEARANCE_SETTINGS,
  setTheme: (mode) => {
    apply(mode);
    set({ theme: mode });
  },
  toggle: () => {
    const next: ThemeMode = get().theme === "light" ? "dark" : "light";
    apply(next);
    set({ theme: next });
  },
  setAppearanceMode: (mode) => {
    const current = get().appearance;
    const next = normalizeAppearanceSettings({
      ...current,
      mode,
      custom: { ...current.custom, font: fontForAppearanceMode(mode, current.custom.font) },
    });
    persistAppearance(next);
    set({ appearance: next });
  },
  setCustomAppearance: (customPatch) => {
    const current = get().appearance;
    const next = normalizeAppearanceSettings({
      ...current,
      custom: { ...current.custom, ...customPatch },
    });
    persistAppearance(next);
    set({ appearance: next });
  },
  resetAppearance: () => {
    persistAppearance(DEFAULT_APPEARANCE_SETTINGS);
    set({ appearance: DEFAULT_APPEARANCE_SETTINGS });
  },
  hydrate: () => {
    const appearance = readAppearanceFromStorage(getLocalStorage());
    applyAppearanceToDocument(getDocument(), appearance);
    set({ theme: domTheme(), appearance, hydrated: true });
  },
}));
