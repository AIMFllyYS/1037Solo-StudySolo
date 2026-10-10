import { type CustomModelConfig, type CustomApiGroup, type ThinkingEffort } from "@/lib/ai/models";
import { type CapabilityEndpoints } from "@/lib/ai/endpoints/capabilityEndpoints";
import { type SelectionAssistantActions } from "@/lib/notes/selectionAssistant";

import { type Locale } from "@/lib/i18n/types";

import type { StoreApi } from "zustand";
export type ArtifactFullscreenTarget = "notes" | "viewport";

/**
 * 全站 AI 设置（localStorage 持久化）。统一管理：
 * - 选中的模型 / 自定义 API 分组（多组，每组独立 baseUrl/apiKey + 模型列表）
 * - 默认生图模型 / 生图模式文本模型 + 容灾降级
 * - 聊天区字体缩放、工具启用/禁用、默认思考/搜索（S4 设置面板消费）
 */
export interface SettingsState {
  settingsLoadWarning: string | null;
  importApiConfiguration: (groups: CustomApiGroup[], selectedModelId?: string) => void;
  // ── 模型 ──────────────────────────────
  selectedModelId: string;

  // ── 自定义 API 分组（新版多组架构）─────
  customApiGroups: CustomApiGroup[];
  /** 默认生图模型 ID（互斥 toggle，null = 降级使用硅基流动内置生图模型）。 */
  defaultImageModelId: string | null;
  /** 生图模式下的文本模型（用于理解用户意图并生成生图提示词）。 */
  imageModeTextModel: string;
  /** 生图模式文本模型的容灾降级模型。 */
  imageModeTextModelFallback: string;

  /**
   * 能力端点（生图 / 向量 / 重排 / 联网搜索 / 搜图）。
   * 字段全可选；空字符串 = 用平台默认。
   */
  capabilityEndpoints: CapabilityEndpoints;

  // ── 旧版字段（@deprecated，仅用于向后兼容读取/迁移）──
  /** @deprecated 已迁移到 customApiGroups[0]。 */
  customBaseUrl: string;
  /** @deprecated 已迁移到 customApiGroups[0]。 */
  customApiKey: string;
  /** @deprecated 已迁移到 customApiGroups[0].models。 */
  customModelId: string;
  /** @deprecated 已迁移到 customApiGroups[0].models。 */
  customModels: CustomModelConfig[];

  // ── 摘录与划词助手（独立模型，不跟随主对话选中模型）──
  /** 摘录功能（划词「记录」成卡）使用的模型。独立于 selectedModelId，
   *  避免右侧切换自定义模型时摘录因密钥/协议不匹配而报错。
   *  默认内置 DeepSeek V4 Flash（性价比高、成卡质量稳定）。 */
  recordModelId: string;
  /** 划词助手（划词「解释/追问」浮窗）使用的默认模型。 */
  floatingChatModelId: string;
  /** 答题 / 深度解答默认模型。出题代理读此字段，默认 DeepSeek。 */
  quizModelId: string;
  setRecordModelId: (id: string) => void;
  setFloatingChatModelId: (id: string) => void;
  setQuizModelId: (id: string) => void;

  /** Agent 单轮最大工具调用轮数（接到 ToolLoop stopWhen）。 */
  maxToolRounds: number;
  setMaxToolRounds: (v: number) => void;
  /**
   * Agent 每次模型调用的最大输出（token，含思考）。0 = 自动：按所选模型在注册表里
   * 声明的最大输出。调小能少占预留额度，但推理模型可能把额度用在思考上。
   */
  maxOutputTokens: number;
  setMaxOutputTokens: (v: number) => void;
  /** 一轮回答（含全部工具步骤）最多花多少积分。0 = 自动（服务端运营上限）；只能收紧。 */
  turnBudgetCredits: number;
  setTurnBudgetCredits: (v: number) => void;
  /**
   * 一次回答的最长等待时间（毫秒，客户端看门狗总闸）。
   * 深度思考 + 多步工具超过它会被本地停止；用户可在设置里提到 600s。
   */
  maxWaitMs: number;
  setMaxWaitMs: (v: number) => void;

  /** 是否开启本站划词助手。 */
  selectionAssistantEnabled: boolean;
  /** 划词助手展示哪些动作。 */
  selectionAssistantActions: SelectionAssistantActions;
  /** 尽量阻止浏览器 / 系统其它划词助手（前端手段有限）。 */
  blockForeignSelectionAssistants: boolean;
  setSelectionAssistantEnabled: (v: boolean) => void;
  setSelectionAssistantAction: (action: keyof SelectionAssistantActions, visible: boolean) => void;
  setBlockForeignSelectionAssistants: (v: boolean) => void;

  // ── 体验（S4）────────────────────────
  fontScale: number; // 0.85 ~ 1.35
  disabledTools: string[]; // 被禁用的工具名
  defaultThinking: boolean;
  /** 新对话默认思考力度（仅在 defaultThinking=true 时生效）。 */
  defaultThinkingEffort: ThinkingEffort;
  defaultSearch: boolean;
  /** Artifact 浮窗全屏对齐：笔记栏或整个视口。默认笔记栏，保持历史行为。 */
  artifactFullscreenTarget: ArtifactFullscreenTarget;
  /** 右侧 Agent 面板是否显示最顶部文字（AI 对话 / 动画讲解 / 可交互）。 */
  showRightPanelTabBar: boolean;
  /** 是否固定 AI 助教顶部导航（设置 / 历史 / 新对话）。关闭则对话开始后自动隐藏。 */
  pinChatHeader: boolean;

  // ── 全局补充上下文 ────────────────────
  /** 所有对话自动注入的用户自定义文本（拼入稳定系统前缀）。 */
  globalContext: string;

  // ── 计费换算 ──────────────────────────
  /** 人民币兑美元汇率，默认 7.00 */
  usdExchangeRate: number;

  // ── 语言（i18n）──────────────────────
  /** 界面语言。默认中文（词典真相源）；与其它设置一样本机持久化，切换后立即生效。 */
  locale: Locale;

  /**
   * 「减少动画」用户开关：与系统 prefers-reduced-motion 是「或」的关系，
   * 任一为真即按减少动态处理（CSS 经 html[data-reduce-motion]，framer-motion 经 MotionConfig）。
   */
  reduceMotion: boolean;
  /** Studio center tab strip hides until the pointer reaches the top edge (default on). */
  centerTabsAutoHide: boolean;

  /** 本机持久化设置是否已应用。首帧（含 SSR 与 hydration）恒为 false，值等于 DEFAULTS。 */
  hydrated: boolean;

  // ── Actions ──────────────────────────
  setSelectedModelId: (id: string) => void;

  // 新版：API 分组管理
  addApiGroup: (group: CustomApiGroup) => void;
  updateApiGroup: (id: string, patch: Partial<Omit<CustomApiGroup, "id">>) => void;
  removeApiGroup: (id: string) => void;
  addModelToGroup: (groupId: string, model: CustomModelConfig) => void;
  updateModelInGroup: (groupId: string, modelId: string, model: CustomModelConfig) => void;
  removeModelFromGroup: (groupId: string, modelId: string) => void;

  // 新版：生图设置
  setDefaultImageModel: (modelId: string | null) => void;
  setImageModeTextModel: (modelId: string) => void;
  setImageModeTextModelFallback: (modelId: string) => void;
  setCapabilityEndpoints: (patch: Partial<CapabilityEndpoints>) => void;

  // 旧版 Actions（@deprecated，操作 customApiGroups[0]）
  setCustomProvider: (p: { baseUrl?: string; apiKey?: string }) => void;
  addCustomModel: (model: CustomModelConfig) => void;
  updateCustomModel: (id: string, model: CustomModelConfig) => void;
  removeCustomModel: (id: string) => void;

  setFontScale: (v: number) => void;
  setLocale: (locale: Locale) => void;
  setReduceMotion: (v: boolean) => void;
  setCenterTabsAutoHide: (v: boolean) => void;
  toggleTool: (name: string, enabled: boolean) => void;
  setDefaultThinking: (v: boolean) => void;
  setDefaultThinkingEffort: (v: ThinkingEffort) => void;
  setDefaultSearch: (v: boolean) => void;
  setArtifactFullscreenTarget: (v: ArtifactFullscreenTarget) => void;
  setShowRightPanelTabBar: (v: boolean) => void;
  setPinChatHeader: (v: boolean) => void;
  setGlobalContext: (v: string) => void;
  setUsdExchangeRate: (v: number) => void;
}

export type Persisted = Pick<
  SettingsState,
  | "selectedModelId"
  | "customApiGroups"
  | "defaultImageModelId"
  | "imageModeTextModel"
  | "imageModeTextModelFallback"
  | "capabilityEndpoints"
  | "recordModelId"
  | "floatingChatModelId"
  | "quizModelId"
  | "maxToolRounds"
  | "maxOutputTokens"
  | "turnBudgetCredits"
  | "maxWaitMs"
  | "selectionAssistantEnabled"
  | "selectionAssistantActions"
  | "blockForeignSelectionAssistants"
  | "customBaseUrl"
  | "customApiKey"
  | "customModelId"
  | "customModels"
  | "fontScale"
  | "disabledTools"
  | "defaultThinking"
  | "defaultThinkingEffort"
  | "defaultSearch"
  | "artifactFullscreenTarget"
  | "showRightPanelTabBar"
  | "pinChatHeader"
  | "globalContext"
  | "usdExchangeRate"
  | "locale"
  | "reduceMotion"
  | "centerTabsAutoHide"
>;
export type SettingsSet = StoreApi<SettingsState>["setState"];
export type SettingsGet = StoreApi<SettingsState>["getState"];
