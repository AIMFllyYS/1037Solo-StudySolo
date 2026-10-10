import type { ModelInfo, ThinkingEffort } from "./contracts";
export function modelThinkingLevels(info: ModelInfo | undefined): ThinkingEffort[] {
  if (!info?.thinking) return [];
  return info.thinkingLevels ?? [];
}

export function modelSupportsThinkingEffort(info: ModelInfo | undefined): boolean {
  return modelThinkingLevels(info).length > 0;
}

export function modelAllowsDisableThinking(info: ModelInfo | undefined): boolean {
  return !!info?.thinking && !info.thinkingRequired;
}

export function clampThinkingEffort(
  info: ModelInfo | undefined,
  effort: ThinkingEffort,
): ThinkingEffort {
  const levels = modelThinkingLevels(info);
  if (levels.length === 0) return effort;
  if (levels.includes(effort)) return effort;
  if (effort === "medium" && levels.includes("high")) return "high";
  if ((effort === "max" || effort === "high") && levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return info?.defaultThinkingEffort && levels.includes(info.defaultThinkingEffort)
    ? info.defaultThinkingEffort
    : levels[0];
}

export function defaultEffortFor(info: ModelInfo | undefined): ThinkingEffort {
  if (!info) return "medium";
  if (info.defaultThinkingEffort && modelThinkingLevels(info).includes(info.defaultThinkingEffort)) {
    return info.defaultThinkingEffort;
  }
  return clampThinkingEffort(info, "medium");
}

/** UI 档位映射为上游 reasoning_effort / thinking_level 字符串。 */
export function wireThinkingEffort(
  info: ModelInfo | undefined,
  effort: ThinkingEffort | undefined,
): string {
  const ui = effort ?? defaultEffortFor(info);
  const mapped = info?.thinkingEffortMap?.[ui];
  if (mapped) return mapped;
  if (ui === "low" || ui === "medium") return ui;
  if (ui === "max" && info?.thinkingLevels?.includes("max")) return "max";
  return "high";
}
