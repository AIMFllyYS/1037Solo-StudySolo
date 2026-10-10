import type { SettingsState } from "./settings/types";
export type { SettingsState, ArtifactFullscreenTarget } from "./settings/types";
import { DEFAULTS, pickStoredOverrides } from "./settings/defaults";
import { load, persist, hydrateDesktopSecrets } from "./settings/persistence";
export { getSettingsPersistGeneration } from "./settings/persistence";
import { createApiActions } from "./settings/apiActions";
import { createPreferenceActions } from "./settings/preferenceActions";
import { create } from "zustand";

import { type ThinkingEffort } from "@/lib/ai/models";

export type { ThinkingEffort };

export const useSettings = create<SettingsState>((rawSet, get) => {
  // 首帧一律 DEFAULTS：服务端拿不到 localStorage；客户端若在模块初始化时同步读，
  // 「本机值 ≠ 默认值」的用户首帧 DOM 就与服务端不一致（React 报 Hydration failed）。
  // 本机值统一由根组件水合后调用 hydrateSettings() 应用，与 theme / academicYear / appMode / ui 同一约定。
  //
  // setter 包装：万一在水合之前就被调用（理论上不会），先补齐本机值再改，
  // 否则这次修改会被随后的水合冲掉、落盘也会写成默认值。
  // hydrateSettings 是加性合并（只覆盖盘上非默认字段），因此不会破坏已改状态。
  const set: typeof rawSet = (partial, replace) => {
    if (typeof window !== "undefined" && !get().hydrated) hydrateSettings();
    rawSet(partial as never, replace as never);
  };
  return {
    settingsLoadWarning: null,
    hydrated: false,
    ...DEFAULTS,

    ...createApiActions(set, get, () => persist(get, rawSet, hydrateSettings)),
    ...createPreferenceActions(set, get, () => persist(get, rawSet, hydrateSettings)),
  };
});

/**
 * 在根组件水合之后应用本机持久化设置（幂等）。
 *
 * 为什么必须等到水合之后：服务端渲染拿不到 localStorage，只能输出 DEFAULTS；
 * 客户端若在模块初始化时就把本机值塞进 store，首帧 DOM 与服务端不一致，
 * React 会报 "Hydration failed" 并丢弃整棵子树在客户端重建。
 * 这里与 theme / academicYear / appMode / ui 等 store 保持同一约定。
 */
export function hydrateSettings(): void {
  if (typeof window === "undefined") return;
  if (useSettings.getState().hydrated) return;
  const loaded = load();
  useSettings.setState({
    ...pickStoredOverrides(loaded),
    // 恢复提示不属于持久化字段，必须单独带上，否则恢复流程的警告会丢。
    settingsLoadWarning: loaded.settingsLoadWarning ?? null,
    hydrated: true,
  });
  hydrateDesktopSecrets(useSettings.setState, useSettings.getState);
}
