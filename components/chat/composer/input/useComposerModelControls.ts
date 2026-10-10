import { useState, useMemo } from 'react';

import { useSettings, type ThinkingEffort } from '@/lib/stores/settings';

import { getModelInfoWithCustom, modelSupportsThinkingEffort, clampThinkingEffort } from '@/lib/ai/models';

export function useComposerModelControls(modelId?: string) {

  // 本机默认值只在水合完成后由 hydrateSettings() 应用（首帧是 DEFAULTS，见 lib/stores/settings.ts），
  // 用户手动改过就以覆盖值为准：既不会 hydration mismatch，也避免在 effect 里 setState。
  const defaultThinking = useSettings((s) => s.defaultThinking);
  const defaultThinkingEffort = useSettings((s) => s.defaultThinkingEffort);
  const defaultSearch = useSettings((s) => s.defaultSearch);
  const [thinkingEnabledOverride, setThinkingEnabledOverride] = useState<boolean | null>(null);
  const [thinkingEffortOverride, setThinkingEffortOverride] = useState<ThinkingEffort | null>(null);
  const [searchOverride, setSearchOverride] = useState<boolean | null>(null);
  const enableThinking = thinkingEnabledOverride ?? defaultThinking;
  const thinkingEffort = thinkingEffortOverride ?? defaultThinkingEffort;
  const enableSearch = searchOverride ?? defaultSearch;
  const setEnableThinking = setThinkingEnabledOverride;
  const setThinkingEffort = setThinkingEffortOverride;
  const setEnableSearch = setSearchOverride;
  const globalSelectedModelId = useSettings((s) => s.selectedModelId);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const selectedModelId = modelId ?? globalSelectedModelId;
  const selectedModelInfo = useMemo(
    () => getModelInfoWithCustom(selectedModelId, customApiGroups),
    [selectedModelId, customApiGroups],
  );
  const thinkingSupported = selectedModelInfo?.thinking === true;
  const thinkingEffortSupported = modelSupportsThinkingEffort(selectedModelInfo);
  const displayEffort = thinkingEffortSupported
    ? clampThinkingEffort(selectedModelInfo, thinkingEffort)
    : thinkingEffort;
  const effectiveEnableThinking = (enableThinking || !!selectedModelInfo?.thinkingRequired) && thinkingSupported;
  const effectiveThinkingEffort = effectiveEnableThinking ? displayEffort : undefined;
  return { enableSearch, setEnableSearch, displayEffort, effectiveEnableThinking, effectiveThinkingEffort, setEnableThinking, setThinkingEffort };
}
