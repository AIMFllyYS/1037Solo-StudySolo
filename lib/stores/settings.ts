import { create } from "zustand";
import { backupSettings, mergeApiGroups, normalizeStoredSettings, readSettingsBackup } from './settingsRecovery';
import {
  DEFAULT_MODEL_ID,
  normalizeCustomModelRegistryId,
  normalizeRegistryId,
  type CustomModelConfig,
  type CustomApiGroup,
  type ThinkingEffort,
} from "@/lib/ai/models";
import {
  EMPTY_CAPABILITY_ENDPOINTS,
  normalizeCapabilityEndpoints,
  type CapabilityEndpoints,
} from "@/lib/ai/capabilityEndpoints";
import { DEFAULT_SELECTION_ASSISTANT_ACTIONS, normalizeSelectionAssistantActions, type SelectionAssistantActions } from "@/lib/notes/selectionAssistant";
import { clampMaxToolRounds, MAX_TOOL_STEPS } from "@/lib/ai/agent/toolRounds";
import { clampTurnBudgetCredits, clampUserMaxOutputTokens } from "@/lib/ai/outputLimits";
import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/ai/models";
import { clampMaxWaitMs, DEFAULT_MAX_WAIT_MS } from "@/lib/chat/createStallWatchdog";
// 只依赖 types（不依赖 lib/i18n 的入口），避免 store ↔ i18n 形成运行时循环导入。
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/lib/i18n/types";
import {
  API_SECRETS_LS_KEY,
  applyCapabilitySecrets,
  applyGroupApiKeys,
  decodeDesktopCapabilitySecrets,
  decodeDesktopSecrets,
  encodeWebSecrets,
  extractPlainCapabilityKeys,
  extractPlainGroupKeys,
  getDesktopSecretsBridge,
  splitSettingsSecrets,
  stripCapabilitySecrets,
  stripGroupApiKeys,
  type StoredApiSecrets,
} from "@/lib/stores/apiSecrets";

export type { ThinkingEffort };
export type ArtifactFullscreenTarget = "notes" | "viewport";
const THINKING_EFFORTS: readonly ThinkingEffort[] = ['low', 'medium', 'high', 'max'];
function normalizeThinkingEffort(v: unknown): ThinkingEffort {
  return THINKING_EFFORTS.includes(v as ThinkingEffort) ? (v as ThinkingEffort) : 'medium';
}

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

const LS_KEY = "gailvlun-settings-v1";

/** 成功写入本机设置后递增。设置页用它判断 blur 时值是否已 persist。 */
let settingsPersistGeneration = 0;
export function getSettingsPersistGeneration(): number {
  return settingsPersistGeneration;
}

type Persisted = Pick<
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

const DEFAULTS: Persisted = {
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

let settingsCanPersist = true;
function load(): Persisted & { settingsLoadWarning?: string | null } {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    let raw = localStorage.getItem(LS_KEY);
    let recoveredSecrets: string | null | undefined;
    let warning: string | null = null;
    if (raw) {
      try { normalizeStoredSettings(raw); } catch {
        const backup = readSettingsBackup(localStorage);
        if (backup) { settingsCanPersist = false; raw = backup.settings; recoveredSecrets = backup.secrets; warning = '原设置无法读取，已载入本机备份；原始记录未删除。点击恢复本机备份后再保存。'; }
        else { settingsCanPersist = false; return { ...DEFAULTS, settingsLoadWarning: '设置文件无法读取。原始记录已保留，请导入旧配置恢复，勿清空浏览器数据。' }; }
      }
    }
    if (raw) {
      const parsed = { ...DEFAULTS, ...normalizeStoredSettings(raw) } as Persisted;
      // 向后兼容 1：旧版 customModelId 非空但 customModels 为空时，自动迁移
      if (parsed.customModelId && (!parsed.customModels || parsed.customModels.length === 0)) {
        parsed.customModels = [{ id: parsed.customModelId }];
      }
      if (!parsed.customModels) parsed.customModels = [];

      // 向后兼容 2：旧版单组 API → 迁移到 customApiGroups
      if (!parsed.customApiGroups || parsed.customApiGroups.length === 0) {
        const hasOldConfig =
          (parsed.customBaseUrl && parsed.customBaseUrl.trim()) ||
          (parsed.customApiKey && parsed.customApiKey.trim()) ||
          parsed.customModels.length > 0;
        if (hasOldConfig) {
          parsed.customApiGroups = [{
            id: "migrated",
            name: "我的 API",
            baseUrl: parsed.customBaseUrl || "",
            apiKey: parsed.customApiKey || "",
            models: parsed.customModels,
          }];
        } else {
          parsed.customApiGroups = [];
        }
      }
      if (!parsed.defaultImageModelId) parsed.defaultImageModelId = null;
      if (!parsed.imageModeTextModel) parsed.imageModeTextModel = "mimo-v2.6-pro";
      if (!parsed.imageModeTextModelFallback) parsed.imageModeTextModelFallback = "mimo-v2.6-pro";
      parsed.capabilityEndpoints = normalizeCapabilityEndpoints(parsed.capabilityEndpoints);
      if (typeof parsed.usdExchangeRate !== "number" || !Number.isFinite(parsed.usdExchangeRate) || parsed.usdExchangeRate <= 0) {
        parsed.usdExchangeRate = 7.00;
      }
      parsed.defaultThinkingEffort = normalizeThinkingEffort(parsed.defaultThinkingEffort);
      parsed.artifactFullscreenTarget =
        parsed.artifactFullscreenTarget === "viewport" ? "viewport" : "notes";
      parsed.selectedModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.selectedModelId),
        parsed.customApiGroups,
      );
      parsed.defaultImageModelId = parsed.defaultImageModelId
        ? normalizeCustomModelRegistryId(normalizeRegistryId(parsed.defaultImageModelId), parsed.customApiGroups)
        : null;
      parsed.imageModeTextModel = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.imageModeTextModel),
        parsed.customApiGroups,
      );
      parsed.imageModeTextModelFallback = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.imageModeTextModelFallback),
        parsed.customApiGroups,
      );
      // 摘录 / 划词助手模型同样需要归一化，防止旧版自定义模型 ID 迁移后指向失效分组。
      parsed.recordModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.recordModelId || DEFAULTS.recordModelId),
        parsed.customApiGroups,
      );
      parsed.floatingChatModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.floatingChatModelId || DEFAULTS.floatingChatModelId),
        parsed.customApiGroups,
      );
      parsed.quizModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.quizModelId || DEFAULTS.quizModelId),
        parsed.customApiGroups,
      );
      parsed.maxToolRounds = clampMaxToolRounds(parsed.maxToolRounds);
      parsed.maxOutputTokens = clampUserMaxOutputTokens(parsed.maxOutputTokens);
      parsed.turnBudgetCredits = clampTurnBudgetCredits(parsed.turnBudgetCredits);
      parsed.maxWaitMs = clampMaxWaitMs(parsed.maxWaitMs);
      parsed.selectionAssistantEnabled = parsed.selectionAssistantEnabled !== false;
      parsed.selectionAssistantActions = normalizeSelectionAssistantActions(parsed.selectionAssistantActions);
      parsed.blockForeignSelectionAssistants = parsed.blockForeignSelectionAssistants === true;
      parsed.showRightPanelTabBar = parsed.showRightPanelTabBar !== false;
      parsed.pinChatHeader = parsed.pinChatHeader === true;
      // 盘上可能是旧版本 / 手改过的语言值，不认识的一律回中文（词典真相源）。
      parsed.locale = normalizeLocale(parsed.locale);
      parsed.reduceMotion = parsed.reduceMotion === true;
      parsed.centerTabsAutoHide = parsed.centerTabsAutoHide !== false;

      let secretsRaw = recoveredSecrets;
      if (secretsRaw === undefined) {
        try { secretsRaw = localStorage.getItem(API_SECRETS_LS_KEY); } catch { settingsCanPersist = false; warning = '分组已保留，但密钥存储暂不可读取。'; }
      }
      if (secretsRaw) {
        try {
          const payload = JSON.parse(secretsRaw);
          if (!payload || payload.v !== 1 || !payload.groups || typeof payload.groups !== 'object') throw new Error('invalid secret store');
        } catch { settingsCanPersist = false; warning = '分组已保留，但旧密钥记录无法解析；已阻止覆盖，请导入备份恢复。'; }
      }
      const split = splitSettingsSecrets(
        parsed.customApiGroups,
        secretsRaw,
        parsed.customApiKey,
        parsed.capabilityEndpoints,
      );
      parsed.customApiGroups = split.groupsForMemory;
      parsed.customApiKey = split.groupsForMemory[0]?.apiKey ?? "";
      parsed.capabilityEndpoints = split.capabilityForMemory;
      let secretsSaved = !split.rewriteSecrets;
      if (split.rewriteSecrets && !warning) {
        backupSettings(localStorage);
        try {
          localStorage.setItem(API_SECRETS_LS_KEY, encodeWebSecrets(split.groupKeys, split.capabilityKeys));
          secretsSaved = true;
        } catch { warning = '密钥迁移暂未完成，旧配置和当前分组已保留；请检查浏览器存储空间。'; }
      }
      if (split.rewriteSettings && secretsSaved && !warning) {
        const disk = {
          ...parsed,
          customApiGroups: stripGroupApiKeys(parsed.customApiGroups),
          customApiKey: "",
          capabilityEndpoints: stripCapabilitySecrets(parsed.capabilityEndpoints),
        };
        try { localStorage.setItem(LS_KEY, JSON.stringify(disk)); }
        catch { warning = '设置暂不可写入，当前分组与旧配置已保留。'; }
      }
      return { ...parsed, settingsLoadWarning: warning };
    }
  } catch {
    settingsCanPersist = false;
    return { ...DEFAULTS, settingsLoadWarning: '本机设置读取失败，已阻止空配置覆盖原记录。请检查浏览器存储权限。' };
  }
  return DEFAULTS;
}

let desktopSecretsReady = false;
function persistSecrets(groupKeys: Record<string, string>, capabilityKeys: Record<string, string>): boolean {
  try {
    localStorage.setItem(API_SECRETS_LS_KEY, encodeWebSecrets(groupKeys, capabilityKeys));
  } catch {
    return false;
  }
  const bridge = getDesktopSecretsBridge();
  if (!bridge || !desktopSecretsReady) return true;
  const payload: StoredApiSecrets = { v: 1, groups: groupKeys, capability: capabilityKeys };
  void bridge.save(payload).catch(() => {});
  return true;
}

function persist(get: () => SettingsState) {
  if (typeof window === "undefined") return;
  // 未水合时 store 里是 DEFAULTS：先补齐盘上配置再落盘（hydrateSettings 是加性合并，不会冲掉已改字段）。
  if (!get().hydrated) hydrateSettings();
  if (!settingsCanPersist) return;
  const s = get();
  // 旧版字段从 customApiGroups[0] 派生，保持向后兼容；密钥不写进 settings JSON。
  const firstGroup = s.customApiGroups[0];
  const groupKeys = extractPlainGroupKeys(s.customApiGroups);
  const capabilityKeys = extractPlainCapabilityKeys(s.capabilityEndpoints);
  backupSettings(localStorage);
  if (!persistSecrets(groupKeys, capabilityKeys)) {
    useSettings.setState({ settingsLoadWarning: '密钥保存失败，原有分组记录未被覆盖；请检查浏览器存储空间。' });
    return;
  }
  const data: Persisted = {
    selectedModelId: s.selectedModelId,
    customApiGroups: stripGroupApiKeys(s.customApiGroups),
    defaultImageModelId: s.defaultImageModelId,
    imageModeTextModel: s.imageModeTextModel,
    imageModeTextModelFallback: s.imageModeTextModelFallback,
    capabilityEndpoints: stripCapabilitySecrets(normalizeCapabilityEndpoints(s.capabilityEndpoints)),
    recordModelId: s.recordModelId,
    floatingChatModelId: s.floatingChatModelId,
    quizModelId: s.quizModelId,
    maxToolRounds: clampMaxToolRounds(s.maxToolRounds),
    maxOutputTokens: clampUserMaxOutputTokens(s.maxOutputTokens),
    turnBudgetCredits: clampTurnBudgetCredits(s.turnBudgetCredits),
    maxWaitMs: clampMaxWaitMs(s.maxWaitMs),
    selectionAssistantEnabled: s.selectionAssistantEnabled !== false,
    selectionAssistantActions: normalizeSelectionAssistantActions(s.selectionAssistantActions),
    blockForeignSelectionAssistants: s.blockForeignSelectionAssistants === true,
    customBaseUrl: firstGroup?.baseUrl ?? "",
    customApiKey: "",
    customModelId: "",
    customModels: firstGroup?.models ?? [],
    fontScale: s.fontScale,
    disabledTools: s.disabledTools,
    defaultThinking: s.defaultThinking,
    defaultThinkingEffort: s.defaultThinkingEffort,
    defaultSearch: s.defaultSearch,
    artifactFullscreenTarget: s.artifactFullscreenTarget,
    showRightPanelTabBar: s.showRightPanelTabBar !== false,
    pinChatHeader: s.pinChatHeader === true,
    globalContext: s.globalContext,
    usdExchangeRate: s.usdExchangeRate,
    locale: normalizeLocale(s.locale),
    reduceMotion: s.reduceMotion === true,
    centerTabsAutoHide: s.centerTabsAutoHide !== false,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    settingsPersistGeneration += 1;
  } catch {
    useSettings.setState({ settingsLoadWarning: '当前配置尚未保存成功，请检查存储空间后重试。' });
  }
}

function hydrateDesktopSecrets(
  set: (partial: Partial<SettingsState> | ((s: SettingsState) => Partial<SettingsState>)) => void,
  get: () => SettingsState,
) {
  const bridge = getDesktopSecretsBridge();
  if (!bridge) return;
  const initialGroups = extractPlainGroupKeys(get().customApiGroups);
  const initialCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
  void (async () => {
    try {
      const stored = await bridge.load();
      const desktopKeys = decodeDesktopSecrets(stored);
      const desktopCapability = decodeDesktopCapabilitySecrets(stored);
      const currentGroups = extractPlainGroupKeys(get().customApiGroups);
      const liveCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
      for (const id of Object.keys(desktopKeys)) if (currentGroups[id] !== initialGroups[id]) delete desktopKeys[id];
      for (const id of Object.keys(desktopCapability)) if (liveCapability[id] !== initialCapability[id]) delete desktopCapability[id];
      desktopSecretsReady = true;
      const hasDesktopGroups = Object.keys(desktopKeys).length > 0;
      const hasDesktopCapability = Object.keys(desktopCapability).length > 0;
      if (hasDesktopGroups || hasDesktopCapability) {
        set((s) => {
          const nextGroups = hasDesktopGroups
            ? applyGroupApiKeys(s.customApiGroups, { ...desktopKeys, ...extractPlainGroupKeys(s.customApiGroups) })
            : s.customApiGroups;
          const nextCapability = hasDesktopCapability
            ? applyCapabilitySecrets(
              s.capabilityEndpoints,
              { ...desktopCapability, ...extractPlainCapabilityKeys(s.capabilityEndpoints) },
            )
            : s.capabilityEndpoints;
          return {
            customApiGroups: nextGroups,
            customApiKey: nextGroups[0]?.apiKey ?? "",
            capabilityEndpoints: nextCapability,
          };
        });
        const memoryGroups = extractPlainGroupKeys(get().customApiGroups);
        const memoryCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
        const backfillGroups = !hasDesktopGroups && Object.keys(memoryGroups).length > 0;
        const backfillCapability = !hasDesktopCapability && Object.keys(memoryCapability).length > 0;
        if (backfillGroups || backfillCapability) {
          await bridge.save({
            v: 1,
            groups: hasDesktopGroups ? desktopKeys : memoryGroups,
            capability: hasDesktopCapability ? desktopCapability : memoryCapability,
          });
        }
        return;
      }
      const current = extractPlainGroupKeys(get().customApiGroups);
      const currentCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
      if (Object.keys(current).length > 0 || Object.keys(currentCapability).length > 0) {
        await bridge.save({ v: 1, groups: current, capability: currentCapability });
      }
    } catch {
      /* ignore */
    }
  })();
}

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

  importApiConfiguration: (groups, selectedModelId) => {
    settingsCanPersist = true;
    set((s) => {
      const merged = mergeApiGroups(s.customApiGroups, groups);
      return { customApiGroups: merged, settingsLoadWarning: null,
        selectedModelId: selectedModelId ? normalizeCustomModelRegistryId(normalizeRegistryId(selectedModelId), merged) : s.selectedModelId };
    });
    persist(get);
  },

  setSelectedModelId: (id) => {
    set({ selectedModelId: id });
    persist(get);
  },

  // ── 新版：API 分组管理 ──────────────
  addApiGroup: (group) => {
    set((s) => ({ customApiGroups: [...s.customApiGroups, group] }));
    persist(get);
  },
  updateApiGroup: (id, patch) => {
    set((s) => ({
      customApiGroups: s.customApiGroups.map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      ),
    }));
    persist(get);
  },
  removeApiGroup: (id) => {
    set((s) => ({
      customApiGroups: s.customApiGroups.filter((g) => g.id !== id),
    }));
    persist(get);
  },
  addModelToGroup: (groupId, model) => {
    set((s) => ({
      customApiGroups: s.customApiGroups.map((g) =>
        g.id === groupId
          ? { ...g, models: [...g.models.filter((m) => m.id !== model.id), model] }
          : g,
      ),
    }));
    persist(get);
  },
  updateModelInGroup: (groupId, modelId, model) => {
    set((s) => ({
      customApiGroups: s.customApiGroups.map((g) =>
        g.id === groupId
          ? { ...g, models: g.models.map((m) => (m.id === modelId ? model : m)) }
          : g,
      ),
    }));
    persist(get);
  },
  removeModelFromGroup: (groupId, modelId) => {
    set((s) => ({
      customApiGroups: s.customApiGroups.map((g) =>
        g.id === groupId
          ? { ...g, models: g.models.filter((m) => m.id !== modelId) }
          : g,
      ),
    }));
    persist(get);
  },

  // ── 新版：生图设置 ──────────────────
  setDefaultImageModel: (modelId) => {
    set({ defaultImageModelId: modelId });
    persist(get);
  },
  setImageModeTextModel: (modelId) => {
    set({ imageModeTextModel: modelId });
    persist(get);
  },
  setImageModeTextModelFallback: (modelId) => {
    set({ imageModeTextModelFallback: modelId });
    persist(get);
  },
  setCapabilityEndpoints: (patch) => {
    set((s) => ({
      capabilityEndpoints: normalizeCapabilityEndpoints({ ...s.capabilityEndpoints, ...patch }),
    }));
    persist(get);
  },

  // ── 旧版 Actions（@deprecated，操作 customApiGroups[0]）──
  setCustomProvider: (p) => {
    set((s) => {
      const groups = [...s.customApiGroups];
      if (groups.length === 0) {
        groups.push({ id: "migrated", name: "我的 API", baseUrl: "", apiKey: "", models: [] });
      }
      if (p.baseUrl !== undefined) groups[0] = { ...groups[0], baseUrl: p.baseUrl };
      if (p.apiKey !== undefined) groups[0] = { ...groups[0], apiKey: p.apiKey };
      return { customApiGroups: groups };
    });
    persist(get);
  },
  addCustomModel: (model) => {
    set((s) => {
      const groups = [...s.customApiGroups];
      if (groups.length === 0) {
        groups.push({ id: "migrated", name: "我的 API", baseUrl: "", apiKey: "", models: [] });
      }
      groups[0] = {
        ...groups[0],
        models: [...groups[0].models.filter((m) => m.id !== model.id), model],
      };
      return { customApiGroups: groups };
    });
    persist(get);
  },
  updateCustomModel: (id, model) => {
    set((s) => {
      const groups = [...s.customApiGroups];
      if (groups.length === 0) return s;
      groups[0] = {
        ...groups[0],
        models: groups[0].models.map((m) => (m.id === id ? model : m)),
      };
      return { customApiGroups: groups };
    });
    persist(get);
  },
  removeCustomModel: (id) => {
    set((s) => {
      const groups = [...s.customApiGroups];
      if (groups.length === 0) return s;
      groups[0] = {
        ...groups[0],
        models: groups[0].models.filter((m) => m.id !== id),
      };
      return { customApiGroups: groups };
    });
    persist(get);
  },

  setFontScale: (v) => {
    set({ fontScale: Math.min(1.35, Math.max(0.85, v)) });
    persist(get);
  },
  setLocale: (locale) => {
    set({ locale: normalizeLocale(locale) });
    persist(get);
  },
  setReduceMotion: (v) => {
    set({ reduceMotion: v === true });
    persist(get);
  },
  setCenterTabsAutoHide: (v) => {
    set({ centerTabsAutoHide: v !== false });
    persist(get);
  },
  toggleTool: (name, enabled) => {
    set((s) => ({
      disabledTools: enabled
        ? s.disabledTools.filter((t) => t !== name)
        : Array.from(new Set([...s.disabledTools, name])),
    }));
    persist(get);
  },
  setDefaultThinking: (v) => {
    set({ defaultThinking: v });
    persist(get);
  },
  setDefaultThinkingEffort: (v) => {
    set({ defaultThinkingEffort: normalizeThinkingEffort(v) });
    persist(get);
  },
  setDefaultSearch: (v) => {
    set({ defaultSearch: v });
    persist(get);
  },
  setArtifactFullscreenTarget: (v) => {
    set({ artifactFullscreenTarget: v === "viewport" ? "viewport" : "notes" });
    persist(get);
  },
  setShowRightPanelTabBar: (v) => {
    set({ showRightPanelTabBar: v });
    persist(get);
  },
  setPinChatHeader: (v) => {
    set({ pinChatHeader: v });
    persist(get);
  },
  setGlobalContext: (v) => {
    set({ globalContext: v });
    persist(get);
  },
  setUsdExchangeRate: (v) => {
    // 单一真相源：clamp 到 [0.01, 10]，非有限数回退默认 7.00
    const safe = Number.isFinite(v) ? Math.max(0.01, Math.min(10, v)) : 7.00;
    set({ usdExchangeRate: safe });
    persist(get);
  },

  setRecordModelId: (id) => {
    set({ recordModelId: id });
    persist(get);
  },
  setFloatingChatModelId: (id) => {
    set({ floatingChatModelId: id });
    persist(get);
  },
  setQuizModelId: (id) => {
    set({ quizModelId: id });
    persist(get);
  },
  setMaxToolRounds: (v) => {
    set({ maxToolRounds: clampMaxToolRounds(v) });
    persist(get);
  },
  setMaxOutputTokens: (v) => {
    set({ maxOutputTokens: clampUserMaxOutputTokens(v) });
    persist(get);
  },
  setTurnBudgetCredits: (v) => {
    set({ turnBudgetCredits: clampTurnBudgetCredits(v) });
    persist(get);
  },
  setMaxWaitMs: (v) => {
    set({ maxWaitMs: clampMaxWaitMs(v) });
    persist(get);
  },
  setSelectionAssistantEnabled: (v) => {
    set({ selectionAssistantEnabled: v });
    persist(get);
  },
  setSelectionAssistantAction: (action, visible) => {
    set((s) => ({
      selectionAssistantActions: {
        ...normalizeSelectionAssistantActions(s.selectionAssistantActions),
        [action]: visible,
      },
    }));
    persist(get);
  },
  setBlockForeignSelectionAssistants: (v) => {
    set({ blockForeignSelectionAssistants: v });
    persist(get);
  },
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

/**
 * 只挑出"盘上确实与默认值不同"的字段。
 *
 * 为什么不整份覆盖：水合可能发生在一次早期写入之后（persist 会先补水合），
 * 整份覆盖会把刚改的字段冲回旧值。加性合并保证"水合只补充、不破坏"，
 * 对正常路径（盘上就是用户配置）结果与整份覆盖等价。
 */
function pickStoredOverrides(loaded: Persisted): Partial<SettingsState> {
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
