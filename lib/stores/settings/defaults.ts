import { DEFAULT_MODEL_ID, type ThinkingEffort } from "@/lib/ai/models";
import { EMPTY_CAPABILITY_ENDPOINTS } from "@/lib/ai/endpoints/capabilityEndpoints";
import { DEFAULT_SELECTION_ASSISTANT_ACTIONS } from "@/lib/notes/selection/selectionAssistant";
import { MAX_TOOL_STEPS } from "@/lib/ai/agent/toolRounds";

import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/ai/models";
import { DEFAULT_MAX_WAIT_MS } from "@/lib/chat/streaming/createStallWatchdog";
import { DEFAULT_LOCALE } from "@/lib/i18n/types";

import type { SettingsState, Persisted } from "./types";
const THINKING_EFFORTS: readonly ThinkingEffort[] = ['low', 'medium', 'high', 'max'];
export function normalizeThinkingEffort(v: unknown): ThinkingEffort {
  return THINKING_EFFORTS.includes(v as ThinkingEffort) ? (v as ThinkingEffort) : 'medium';
}

export const DEFAULTS: Persisted = {
  selectedModelId: DEFAULT_MODEL_ID,
  customApiGroups: [],
  // 默认走廉价快速通道（10–40s 出图）；慢速高价模型由用户显式选择。
  defaultImageModelId: DEFAULT_IMAGE_MODEL_ID,
  imageModeTextModel: "mimo-v2.6-pro",
  imageModeTextModelFallback: "mimo-v2.6-pro",
  capabilityEndpoints: EMPTY_CAPABILITY_ENDPOINTS,
  // 摘录默认用中转站 DeepSeek V4 Flash：性价比高、成卡质量稳定。
  recordModelId: "deepseek/deepseek-v4-flash",
  // 划词助手默认：Qwen3.8 27B（视觉 + 混合思考）。
  floatingChatModelId: "Qwen/Qwen3.8-27B",
  quizModelId: DEFAULT_MODEL_ID,
  maxToolRounds: MAX_TOOL_STEPS,
  maxOutputTokens: 0,
  turnBudgetCredits: 0,
  maxWaitMs: DEFAULT_MAX_WAIT_MS,
  selectionAssistantEnabled: true,
  selectionAssistantActions: DEFAULT_SELECTION_ASSISTANT_ACTIONS,
  blockForeignSelectionAssistants: false,
  customBaseUrl: "",
  customApiKey: "",
  customModelId: "",
  customModels: [],
  fontScale: 1,
  disabledTools: [],
  defaultThinking: false,
  defaultThinkingEffort: 'medium',
  defaultSearch: false,
  artifactFullscreenTarget: "notes",
  showRightPanelTabBar: true,
  pinChatHeader: false,
  globalContext: "",
  usdExchangeRate: 7.00,
  locale: DEFAULT_LOCALE,
  reduceMotion: false,
  centerTabsAutoHide: true,
};

/**
 * 只挑出"盘上确实与默认值不同"的字段。
 *
 * 为什么不整份覆盖：水合可能发生在一次早期写入之后（persist 会先补水合），
 * 整份覆盖会把刚改的字段冲回旧值。加性合并保证"水合只补充、不破坏"，
 * 对正常路径（盘上就是用户配置）结果与整份覆盖等价。
 */
export function pickStoredOverrides(loaded: Persisted): Partial<SettingsState> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof Persisted)[]) {
    const next = loaded[key];
    const fallback = DEFAULTS[key];
    const same = typeof next === "object" && next !== null
      ? JSON.stringify(next) === JSON.stringify(fallback)
      : next === fallback;
    if (!same) patch[key] = next;
  }
  return patch as Partial<SettingsState>;
}
