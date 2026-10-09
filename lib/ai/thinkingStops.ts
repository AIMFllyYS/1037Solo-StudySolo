import {
  modelAllowsDisableThinking,
  modelThinkingLevels,
  clampThinkingEffort,
  type ModelInfo,
  type ThinkingEffort,
} from "@/lib/ai/models";

/** 滑杆上的一个档位：关 / 单一“开” / 具体强度。 */
export type ThinkingStopId = "off" | "on" | ThinkingEffort;

export interface ThinkingValue {
  enabled: boolean;
  effort: ThinkingEffort;
}

/**
 * 按模型能力排出滑杆档位（从左到右）：
 * - 不支持思考：空数组（界面不出滑杆）
 * - 可关闭的模型最左多一个「关」
 * - 有强度档的模型列出它自己的档位（有的只有 high / max，有的 low~max）
 * - 只能开关、没有强度的模型用单个「开」
 * - 必须思考且没有强度档：只剩一个「开」（滑杆不可动）
 */
export function thinkingStopIds(model: ModelInfo | undefined): ThinkingStopId[] {
  if (!model?.thinking) return [];
  const levels = modelThinkingLevels(model);
  const stops: ThinkingStopId[] = [];
  if (modelAllowsDisableThinking(model)) stops.push("off");
  if (levels.length > 0) stops.push(...levels);
  else stops.push("on");
  return stops;
}

/** 当前值落在哪个档位上（越界时回退到最接近的合法档）。 */
export function currentStopIndex(model: ModelInfo | undefined, stops: ThinkingStopId[], value: ThinkingValue): number {
  if (stops.length === 0) return 0;
  if (!value.enabled && stops.includes("off")) return stops.indexOf("off");
  if (stops.includes("on")) return stops.indexOf("on");
  const effort = clampThinkingEffort(model, value.effort);
  const index = stops.indexOf(effort);
  return index >= 0 ? index : stops.length - 1;
}

/** 档位 → 要写回的值；effort 保留上一次有效强度，切到“关”时不丢。 */
export function valueForStop(stop: ThinkingStopId, previous: ThinkingValue): ThinkingValue {
  if (stop === "off") return { enabled: false, effort: previous.effort };
  if (stop === "on") return { enabled: true, effort: previous.effort };
  return { enabled: true, effort: stop };
}
