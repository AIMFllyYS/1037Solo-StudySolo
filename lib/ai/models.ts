// 多提供商精选模型注册表 —— 供 AI 对话的模型选择菜单。
// 主力对话：七牛云（api.qnaigc.com，延迟最低）→ 自有中转（relay.protocom.org）容灾；
// MiMo 同样走自有中转；硅基流动负责廉价生图与向量/重排；xhuoai 提供高价慢速生图；
// 智谱仅保留向量/重排/联网搜索。
// model id（注册 id）与上游 apiModelId 分离；endpoints 链支持容灾降级。

export type ProviderKind = "siliconflow" | "mimo" | "zhipu" | "relay" | "qiniu" | "xhuoai";

/** 对话输入可选的思考强度档位（UI 值）。各模型的实际上游取值见 thinkingEffortMap。 */
export type ThinkingEffort = "low" | "medium" | "high" | "max";

export const THINKING_EFFORT_VALUES: readonly ThinkingEffort[] = ["low", "medium", "high", "max"];

export const THINKING_EFFORT_LABELS: Record<ThinkingEffort, string> = {
  low: "低",
  medium: "中",
  high: "高",
  max: "最强",
};

/** Prefix cache 命中窗口默认 5 分钟；看板倒计时与费用估算按此计费。 */
export const DEFAULT_CACHE_TTL_SEC = 300;

export function resolveCacheTtlSec(value?: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_CACHE_TTL_SEC;
}

/** 保留声明顺序，丢掉未知值。 */
export function normalizeThinkingLevels(levels: unknown): ThinkingEffort[] {
  if (!Array.isArray(levels)) return [];
  const allowed = new Set(levels);
  return THINKING_EFFORT_VALUES.filter((v) => allowed.has(v));
}

export type ThinkingRequestStyle =
  | "none"
  | "siliconflow"
  | "openai-reasoning-effort"
  | "openrouter-reasoning"
  | "anthropic-thinking"
  | "gemini-thinking-level"
  | "deepseek-thinking"
  | "mimo-thinking"
  /**
   * 七牛云方言：thinking type = enabled / disabled 二选一。
   * 为什么需要单独一档：这些模型**默认就思考**，不传参等于开着；要让"关思考"真正生效，
   * 必须在**没请求思考时也显式下发 disabled**（见 languageModel.ts 的 prepareCall）。
   * 对比：siliconflow 档发的是 enable_thinking，七牛云不认（实测 DS 会返回空正文）。
   */
  | "qiniu-toggle";

export interface ModelEndpoint {
  provider: ProviderKind;
  /** 发给 OpenAI 兼容 chat/completions 的精确 model 字符串 */
  apiModelId: string;
}

export interface ModelInfo {
  /** 注册 id：菜单、设置、持久化；不等于上游 apiModelId */
  id: string;
  label: string;
  /** 分组名（用于下拉菜单分区）。 */
  group: string;
  /**
   * 额外归属的菜单分类（与 group 同一命名空间，如 "多模态" / "快速模型"）。
   * 声明后模型会同时出现在这些分类列里，行内特征圆点也会包含它们。
   * 例：MiMo 2.6 Flash 主列在「快速模型」，extraGroups ["多模态"] 让它也进多模态列。
   */
  extraGroups?: string[];
  /** 是否支持思考链（reasoning_content）。 */
  thinking: boolean;
  /**
   * 可选手动选择的思考强度档位。空/缺省 = 不展示强度选择（仅 on/off 或不可关）。
   * 与 thinking 独立：有思考但不支持档位时不显示二级菜单。
   */
  thinkingLevels?: ThinkingEffort[];
  /** true 时思考不可关闭（如 GLM-5.3 / Gemini 3.7 Flash）。 */
  thinkingRequired?: boolean;
  /** UI 档位 → 上游 reasoning_effort / thinking_level 取值。 */
  thinkingEffortMap?: Partial<Record<ThinkingEffort, string>>;
  /** 选中该模型时的默认思考档位。 */
  defaultThinkingEffort?: ThinkingEffort;
  /** 内置模型的思考请求方言；缺省为 siliconflow。 */
  thinkingRequestStyle?: ThinkingRequestStyle;
  /** 是否支持 function calling（工具调用）。 */
  tools: boolean;
  /** 是否支持视觉（图片输入）。 */
  vision?: boolean;
  /** 上下文窗口（千 token），用于提示。 */
  contextK?: number;
  hint: string;
  /** 有序端点链：失败且可恢复时尝试下一项。 */
  endpoints: ModelEndpoint[];
  /** 品牌图标标识，用于模型下拉菜单显示官方 logo。 */
  icon?: string;
  /** 定价信息（¥ / 百万 token）。 */
  pricing?: {
    input: number;
    cachedInput: number;
    cacheWrite?: number;
    output: number;
  };
  /** Prefix cache 估算 TTL（秒）。缺省按 DEFAULT_CACHE_TTL_SEC（5 分钟）计费。 */
  cacheTtlSec?: number;
  /** chat/completions 请求超时（毫秒）；慢模型（MoE 冷启动）可加长。 */
  timeoutMs?: number;
  /** 模型类型：文本对话 or 生图。默认 'text'。 */
  type?: "text" | "image";
  /** 生图 API 格式；内置生图模型的显式声明（缺省按 provider 兜底为 siliconflow）。 */
  imageApiStyle?: "openai" | "siliconflow";
  /** 生图模型参数（仅 type='image' 时有效）。 */
  imageParams?: {
    /** 支持的图片尺寸预设。 */
    sizes?: string[];
    /** 最大生成数量。 */
    maxCount?: number;
    /**
     * 上游典型耗时（毫秒）中位估计：只用于前端进度条估算。
     * 慢速中转站 100–400s，廉价通道 10–40s，本地亚秒级给个兜底下限。
     */
    expectedMs?: number;
  };
  /** 生图请求上游超时（毫秒）；缺省 180s。慢速中转站要单独放宽。 */
  imageTimeoutMs?: number;
  /**
   * 厂商训练声明。有值时必须在模型菜单/设置里明示，不能只藏在 hint。
   * Muse Spark contributor SKU：对话可能用于厂商训练。
   */
  vendorTrainingNotice?: string;
}

export const MUSE_VENDOR_TRAINING_NOTICE = "对话可能用于厂商训练";

export const CUSTOM_MODEL_ID = "custom";
export const AUTO_MODEL_ID = "auto";

/** A selection policy, not an upstream model. No fabricated price or fixed window. */
export const AUTO_MODEL_INFO: ModelInfo = {
  id: AUTO_MODEL_ID, label: "自动", group: "自动模型", thinking: true,
  tools: true, vision: true, hint: "根据当前任务自动选择合适的模型", endpoints: [],
};

/** 桌面「自由中转」：用户自填 URL / API Key / 模型 ID，registry id 固定，上游 apiModelId 来自 env。 */
export const CUSTOM_OPENAI_MODEL_ID = "custom-openai";

/** 网页模型菜单 / 设置内置列表不展示桌面专用「自由中转」；resolveProvider 仍识别该 id。 */
export function isPickerHiddenModel(id: string): boolean {
  return id === CUSTOM_OPENAI_MODEL_ID;
}

export function modelsForPicker(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => !isPickerHiddenModel(m.id));
}

/** 菜单分类列名归一：注册表 group 值 → 菜单分类名（多模态 → 多模态模型）。 */
export function menuCategoryOfGroup(group: string): string {
  return group === "多模态" ? "多模态模型" : group;
}

/** 模型归属的全部菜单分类：主分类在前，extraGroups 归一后去重追加。 */
export function modelMenuCategories(model: ModelInfo): string[] {
  const out = [menuCategoryOfGroup(model.group)];
  for (const g of model.extraGroups ?? []) {
    const c = menuCategoryOfGroup(g);
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** 已下架注册 id → 当前注册 id（用户本地设置兼容） */
export const LEGACY_REGISTRY_ALIASES: Record<string, string> = {
  "MiniMaxAI/MiniMax-M3": "Qwen/Qwen3.8-Flash",
  "MiniMaxAI/MiniMax-M2.5": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.6-35B-A3B": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.6-27B": "Qwen/Qwen3.8-Flash",
  "moonshotai/Kimi-K2.7-Code": "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.8-27B": "Qwen/Qwen3.8-Flash",
  // 上游真实 id（Omni）回指注册表 id：落地查询/计费归集都用得上。
  "Qwen/Qwen3.8-Omni-Flash": "Qwen/Qwen3.8-Flash",
  "Pro/moonshotai/Kimi-K2.6": "kimi-k3",
  "google/gemini-3.7-flash": "google/gemini-3.8-flash",
  "deepseek-ai/DeepSeek-V4-Pro": "deepseek/deepseek-v4.1-flash",
  "deepseek-ai/DeepSeek-V4-Flash": "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4-flash": "deepseek/deepseek-v4.1-flash",
  // MiMo 2.5 整系退役：Pro 接多模态位，Flash 接快速位。
  "mimo-v2.5": "mimo-v2.6-pro",
  "mimo-v2.5-pro": "mimo-v2.6-pro",
  "mimo-v2-flash": "mimo-v2.6-flash",
  "zai-org/GLM-5.2": "z-ai/glm-5.3-flash",
  "Pro/zai-org/GLM-5.1": "z-ai/glm-5.3-flash",
  "zai-org/GLM-Z1-AirX": "z-ai/glm-5.3-flash",
  "zai-org/GLM-4.7-FlashX": "z-ai/glm-5.3-flash",
  "inclusionai/ling-3.0-flash-sante:free": "inclusionai/ling-3.0-flash-sante:free",
  // 免费档换血：LongCat 从菜单/自动路由移除，旧设置平滑迁移到 Laguna S 2.1。
  "meituan/LongCat-2.0:free": "poolside/laguna-s-2.1-free",
  "meituan/LongCat-2.0": "poolside/laguna-s-2.1-free",
};

export function normalizeRegistryId(id: string): string {
  return LEGACY_REGISTRY_ALIASES[id] ?? id;
}

const SF = "siliconflow" as const;
const RELAY = "relay" as const;
/** 七牛云（OpenAI 兼容；主力文本供应商，延迟最低）。 */
const QINIU = "qiniu" as const;
/** xhuoai 中转站（OpenAI 兼容；慢速高价生图）。 */
const XHUOAI = "xhuoai" as const;

function ep(provider: ProviderKind, apiModelId: string): ModelEndpoint {
  return { provider, apiModelId };
}

function sf(id: string): ModelEndpoint[] {
  return [ep(SF, id)];
}

export const MODELS: ModelInfo[] = [
  // ── 自由中转（用户自填 OpenAI 兼容端点，不必使用项目默认中转站）──
  {
    id: CUSTOM_OPENAI_MODEL_ID,
    label: "自由中转",
    group: "自由中转",
    thinking: true,
    thinkingLevels: ["low", "medium", "high", "max"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 128,
    hint: "自定义 OpenAI 兼容端点 · 在桌面设置中填写 URL / 模型 ID / API Key",
    endpoints: [ep(RELAY, CUSTOM_OPENAI_MODEL_ID)],
  },
  // ── 快速模型 ──────────────────────────
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    group: "快速模型",
    thinking: true,
    // 七牛云支持 thinking 真正关闭（实测 disabled 后 9 token 出结果），所以不再锁死思考。
    thinkingRequired: false,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    // 七牛云方言（thinking 二态开关，可真正关闭）；中转站那一跳仍由 relay 覆盖为 reasoning_effort。
    thinkingRequestStyle: "qiniu-toggle",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "全局默认 · 七牛优先 · 固定峰值平台费率 · 备用按渠道结算",
    // 七牛云第一跳（延迟最低），Protocom 中转容灾。七牛云支持 thinking 真正关闭。
    endpoints: [ep(QINIU, "deepseek/deepseek-v4.1-flash"), ep(RELAY, "deepseek/deepseek-v4.1-flash")],
    icon: "deepseek",
    pricing: { input: 2, cachedInput: 0.04, output: 8 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  {
    id: "Qwen/Qwen3.7-Flash",
    label: "Qwen3.7 Flash",
    group: "快速模型",
    thinking: true,
    // 同 DeepSeek：七牛云支持真正关掉思考。
    thinkingRequired: false,
    thinkingLevels: ["low", "medium", "high", "max"],
    defaultThinkingEffort: "medium",
    // 七牛云方言：thinking 二态开关（可真正关掉）；中转站仍走 reasoning_effort。
    thinkingRequestStyle: "qiniu-toggle",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台渠道暂未启用：供应商上下文分档与价格待核验",
    endpoints: [ep(QINIU, "qwen/qwen3.7-flash"), ep(RELAY, "Qwen/Qwen3.7-Flash")],
    icon: "qwen",
    pricing: { input: 1.2, cachedInput: 0.24, output: 4.8 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  {
    id: "mimo-v2.6-flash",
    label: "MiMo 2.6 Flash",
    group: "快速模型",
    // 全模态模型但只列在「快速模型」：不重复占多模态行；vision=true 仍给 ▦ 特征圆点。
    thinking: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台固定额度价 · 中转供应商成本未核实 · 全模态",
    endpoints: [ep(RELAY, "mimo-v2.6-flash")],
    icon: "mimo",
    // 运营批准的平台固定额度价；不宣称已核实 Protocom 的供应商成本。
    pricing: { input: 1, cachedInput: 0.02, cacheWrite: 1, output: 2 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  {
    id: "xiaomi/mimo-v2.6-pro-ultraspeed",
    label: "MiMo 2.6 Pro UltraSpeed",
    group: "快速模型",
    thinking: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台固定额度价 · 中转供应商成本未核实 · Pro的10倍",
    endpoints: [ep(RELAY, "xiaomi/mimo-v2.6-pro-ultraspeed")],
    icon: "mimo",
    // 运营批准的平台固定额度价，供应商中转成本仍待核实。
    pricing: { input: 30, cachedInput: 0.25, cacheWrite: 30, output: 60 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  // ── 多模态 ──────────────────────────
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    group: "多模态",
    thinking: true,
    thinkingLevels: ["low", "medium", "high", "max"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台渠道暂未启用：当前聚合组不能套用Codex优惠价",
    endpoints: [ep(RELAY, "gpt-5.6-luna")],
    icon: "openai",
    pricing: { input: 1.4, cachedInput: 0.14, cacheWrite: 1.75, output: 8.4 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  {
    id: "mimo-v2.6-pro",
    label: "MiMo 2.6 Pro",
    group: "多模态",
    thinking: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台固定额度价 · 中转供应商成本未核实 · 1M",
    endpoints: [ep(RELAY, "mimo-v2.6-pro")],
    icon: "mimo",
    // 运营批准的平台固定额度价，供应商中转成本仍待核实。
    pricing: { input: 3, cachedInput: 0.025, cacheWrite: 3, output: 6 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    group: "多模态",
    // 同时归入「快速模型」分类（低延迟主力），特征圆点会带上 ⚡。
    extraGroups: ["快速模型"],
    thinking: true,
    thinkingRequired: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "1M · 思考不可关",
    endpoints: [ep(RELAY, "google/gemini-3.8-flash")],
    icon: "gemini",
    pricing: { input: 10.5, cachedInput: 1.05, output: 52.5 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM-5.3 Flash",
    group: "多模态",
    thinking: true,
    thinkingRequired: true,
    thinkingLevels: ["low", "high", "max"],
    thinkingEffortMap: { low: "low", medium: "low", high: "high", max: "max" },
    // 默认低档：七牛云把它作为主力模型之一，低档延迟显著更低（实测 low 几乎不出思考正文）。
    // 注意七牛云该模型「始终思考、不可关闭」，所以 thinkingRequired 保持 true。
    defaultThinkingEffort: "low",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "1M · 思考不可关",
    // 第一跳七牛云，第二跳 Protocom 同模型，第三跳 MiMo 2.6 Flash（换模型兜底）。
    endpoints: [
      ep(QINIU, "z-ai/glm-5.3-flash"),
      ep(RELAY, "z-ai/glm-5.3-flash"),
      ep(RELAY, "mimo-v2.6-flash"),
    ],
    icon: "zhipu",
    pricing: { input: 0.8, cachedInput: 0.23, output: 2.8 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  {
    id: "Qwen/Qwen3.8-Flash",
    label: "Qwen3.8 Flash",
    group: "多模态",
    thinking: true,
    thinkingLevels: ["low", "medium", "high", "max"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "平台渠道暂未启用：多模态与缓存单位待核验",
    // 上游真实模型 id 是 Omni 版；registry id / 前端展示名保持 3.8 Flash 不变。
    endpoints: [ep(RELAY, "Qwen/Qwen3.8-Omni-Flash")],
    icon: "qwen",
    pricing: { input: 0.8, cachedInput: 0.1, output: 2.7 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  {
    id: "meta/muse-spark-1.3-contributor",
    label: "Muse Spark 1.3",
    group: "多模态",
    thinking: true,
    thinkingLevels: ["high", "max"],
    thinkingEffortMap: { high: "xhigh", max: "max" },
    defaultThinkingEffort: "high",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "视觉 · 1M · high→xhigh",
    vendorTrainingNotice: MUSE_VENDOR_TRAINING_NOTICE,
    endpoints: [ep(RELAY, "meta/muse-spark-1.3-contributor")],
    icon: "meta",
    pricing: { input: 0.7, cachedInput: 0.014, output: 1.4 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  // ── 免费模型 ──────────────────────────
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1",
    group: "免费模型",
    thinking: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    contextK: 256,
    hint: "免费 · 256K",
    endpoints: [ep(RELAY, "poolside/laguna-s-2.1-free")],
    icon: "poolside",
    pricing: { input: 0, cachedInput: 0, output: 0 },
  },
  {
    id: "inclusionai/ling-3.0-flash-sante:free",
    label: "Ling 3.0 Flash Sante",
    group: "免费模型",
    thinking: true,
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    contextK: 256,
    hint: "免费 · 256K",
    endpoints: [ep(RELAY, "inclusionai/ling-3.0-flash-sante:free")],
    icon: "inclusionai",
    pricing: { input: 0, cachedInput: 0, output: 0 },
  },
  // ── 旗舰模型 ──────────────────────────
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    group: "旗舰模型",
    thinking: true,
    thinkingLevels: ["low", "medium", "high", "max"],
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "openai-reasoning-effort",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "旗舰 · ≤272K展示基础价；>272K整单使用高档价",
    endpoints: [ep(RELAY, "gpt-5.6-sol")],
    icon: "openai",
    pricing: { input: 35, cachedInput: 3.5, cacheWrite: 43.75, output: 210 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  {
    id: "kimi-k3",
    label: "Kimi K3",
    group: "旗舰模型",
    thinking: true,
    thinkingRequired: true,
    thinkingLevels: [],
    thinkingRequestStyle: "none",
    tools: true,
    vision: true,
    contextK: 1000,
    hint: "旗舰 · 1M · 平台USD固定7换算 · 默认推理配置",
    endpoints: [ep(RELAY, "kimi-k3")],
    icon: "kimi",
    pricing: { input: 7, cachedInput: 0.7, cacheWrite: 0, output: 35 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    timeoutMs: 120_000,
  },
  // ── 生图模型 ──────────────────────────
  // 默认生图模型（settings.defaultImageModelId 的初始值）：廉价快速通道，10–40s 出图。
  {
    id: "baidu/ERNIE-Image-Turbo",
    label: "ERNIE Image Turbo",
    group: "生图模型",
    type: "image",
    thinking: false,
    thinkingRequestStyle: "none",
    tools: false,
    contextK: 0,
    hint: "硅基流动 · 按实际出图数量结算 · 0.11元/张",
    endpoints: sf("baidu/ERNIE-Image-Turbo"),
    icon: "baidu",
    pricing: { input: 0, cachedInput: 0, output: 0.11 },
    imageApiStyle: "siliconflow",
    imageParams: {
      sizes: ["1024x1024", "960x1280", "768x1024", "720x1440", "720x1280"],
      maxCount: 4,
      expectedMs: 25_000,
    },
    imageTimeoutMs: 90_000,
  },
  {
    id: "Tongyi-MAI/Z-Image-Turbo",
    label: "Z-Image Turbo",
    group: "生图模型",
    type: "image",
    thinking: false,
    thinkingRequestStyle: "none",
    tools: false,
    contextK: 0,
    hint: "通义生图 · ¥0.10/张 · 亚秒级 · 中英文文字",
    endpoints: sf("Tongyi-MAI/Z-Image-Turbo"),
    icon: "tongyi",
    pricing: { input: 0, cachedInput: 0, output: 0.1 },
    imageApiStyle: "siliconflow",
    imageParams: {
      sizes: ["1024x1024", "960x1280", "768x1024", "720x1440", "720x1280"],
      maxCount: 4,
      expectedMs: 6_000,
    },
    imageTimeoutMs: 90_000,
  },
  // xhuoai 中转站：效果好但慢（实测 100–400s）、单张 ¥1。前端进度条按 expectedMs 估算。
  {
    id: "nano-banana",
    label: "Nano Banana",
    group: "生图模型",
    type: "image",
    thinking: false,
    thinkingRequestStyle: "none",
    tools: false,
    contextK: 0,
    hint: "Gemini 生图 · ¥1.00/张 · 约 100–400s",
    endpoints: [ep(XHUOAI, "nano-banana")],
    icon: "gemini",
    pricing: { input: 0, cachedInput: 0, output: 1 },
    imageApiStyle: "openai",
    imageParams: { sizes: ["1024x1024", "960x1280", "1280x960"], maxCount: 4, expectedMs: 120_000 },
    imageTimeoutMs: 420_000,
  },
  {
    id: "gpt-image-2.5",
    label: "GPT Image 2.5",
    group: "生图模型",
    type: "image",
    thinking: false,
    thinkingRequestStyle: "none",
    tools: false,
    contextK: 0,
    hint: "OpenAI 生图 · ¥1.00/张 · 约 100–400s",
    endpoints: [ep(XHUOAI, "gpt-image-2.5")],
    icon: "openai",
    pricing: { input: 0, cachedInput: 0, output: 1 },
    imageApiStyle: "openai",
    imageParams: { sizes: ["1024x1024", "1536x1024", "1024x1536"], maxCount: 4, expectedMs: 150_000 },
    imageTimeoutMs: 420_000,
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    group: "生图模型",
    type: "image",
    thinking: false,
    thinkingRequestStyle: "none",
    tools: false,
    contextK: 0,
    hint: "OpenAI 生图 · ¥1.00/张 · 约 100–400s",
    endpoints: [ep(XHUOAI, "gpt-image-2")],
    icon: "openai",
    pricing: { input: 0, cachedInput: 0, output: 1 },
    imageApiStyle: "openai",
    imageParams: { sizes: ["1024x1024", "1536x1024", "1024x1536"], maxCount: 4, expectedMs: 150_000 },
    imageTimeoutMs: 420_000,
  },
];

/** 默认生图模型：廉价快速通道（未显式选择时使用）。 */
export const DEFAULT_IMAGE_MODEL_ID = "baidu/ERNIE-Image-Turbo";

export const DEFAULT_MODEL_ID = "deepseek/deepseek-v4.1-flash";

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

export const CUSTOM_PREFIX = "custom:";

export function buildCustomModelRegistryId(groupId: string, modelId: string): string {
  return `${CUSTOM_PREFIX}${encodeURIComponent(groupId)}:${encodeURIComponent(modelId)}`;
}


export interface CustomModelConfig {
  id: string;
  label?: string;
  contextK?: number;
  pricing?: {
    input: number;
    cachedInput?: number;
    cacheWrite?: number;
    output: number;
  };
  cacheTtlSec?: number;
  /** 是否支持视觉（图片输入）。 */
  vision?: boolean;
  /** 是否支持思考链。 */
  thinking?: boolean;
  /**
   * 该模型支持的思考强度档位。
   *  - 缺省且 thinking=true：视为四档全开（兼容旧配置，菜单/请求才能按强度工作）
   *  - 空数组：仅 on/off，不展示强度
   */
  thinkingLevels?: ThinkingEffort[];
  /** true 时思考不可关闭。 */
  thinkingRequired?: boolean;
  /** UI 档位 → 上游 reasoning_effort / thinking_level 取值。 */
  thinkingEffortMap?: Partial<Record<ThinkingEffort, string>>;
  /** 选中该模型时的默认思考档位。 */
  defaultThinkingEffort?: ThinkingEffort;
  /** 是否支持工具调用。 */
  tools?: boolean;
  /**
   * API 兼容格式（业界最佳实践的三选一）：
   *  - openai：OpenAI Chat Completions（含 One-API/OpenRouter/DeepSeek/OpenAI 官方）
   *  - anthropic：真·Anthropic Messages 协议（/v1/messages, x-api-key）
   *  - siliconflow：硅基流动 / 原生 Qwen / 原生 GLM 的 enable_thinking 方言
   * 若未设置，视为 openai。所有底层字段（reasoningField / thinkingRequestStyle）
   * 由 apiProtocol 自动装配，用户无需手填。
   */
  apiProtocol?: "openai" | "anthropic" | "siliconflow";
  /**
   * @deprecated 由 apiProtocol 自动装配；仍作为高级 override 保留。
   * 流式推理内容字段名；常见值为 reasoning_content、reasoning、reasoning_text。
   */
  reasoningField?: string;
  /**
   * @deprecated 由 apiProtocol 自动装配；仍作为高级 override 保留。
   * 思考参数请求风格；OpenAI-compatible 模型可关闭或使用 reasoning_effort。
   */
  thinkingRequestStyle?: ThinkingRequestStyle;
  /** 生图 API 格式；auto 按模型名推断，OpenAI-compatible 自定义生图可显式设为 openai。 */
  imageApiStyle?: "auto" | "openai" | "siliconflow";
  /** 模型类型：文本对话 or 生图。默认 'text'。 */
  type?: "text" | "image";
  /** 生图模型参数（仅 type='image' 时有效）。 */
  imageParams?: {
    sizes?: string[];
    maxCount?: number;
  };
  /** chat/completions 超时（毫秒）；缺省用分组 timeoutMs 或默认 45s。 */
  timeoutMs?: number;
}

export type CustomApiProtocol = NonNullable<CustomModelConfig["apiProtocol"]>;

/** 自定义 API 分组：每组独立的 baseUrl/apiKey + 模型列表。 */
export interface CustomApiGroup {
  /** 分组唯一 ID。 */
  id: string;
  /** 用户命名的分组名（显示在模型菜单中）。 */
  name: string;
  baseUrl: string;
  apiKey: string;
  models: CustomModelConfig[];
  /** 该分组默认超时（毫秒）；模型级 timeoutMs 优先。 */
  timeoutMs?: number;
}

export function getModelInfo(id: string): ModelInfo | undefined {
  if (id === AUTO_MODEL_ID) return AUTO_MODEL_INFO;
  return MODELS.find((m) => m.id === normalizeRegistryId(id));
}

/**
 * 落地端点的 ModelInfo：apiModelId 能对上注册表时用它（GLM → mimo-v2.5），
 * 否则退回 registryId（同模型换供应商、未知上游 id）。
 * `resolveBuiltinEndpoint` 与 `landedThinkingContext` 必须共用这一判据。
 */
export function getLandedModelInfo(apiModelId: string, registryId: string): ModelInfo | undefined {
  return getModelInfo(apiModelId) ?? getModelInfo(registryId);
}

/** 主路由 provider（endpoints[0]）。 */
export function primaryProvider(info: ModelInfo): ProviderKind {
  return info.endpoints[0]?.provider ?? SF;
}

/** 模型 fetch 超时（毫秒）。 */
export function getFetchTimeoutMs(registryId: string): number {
  const info = getModelInfo(registryId);
  return info?.timeoutMs ?? 45_000;
}

/** 自定义分组（含 `custom:` / 旧 `custom`）不支持 failover：只有用户填的那一个端点。 */
export function isCustomRegistryId(registryId: string | undefined): boolean {
  return !!registryId && (registryId === CUSTOM_MODEL_ID || registryId.startsWith(CUSTOM_PREFIX));
}

/** 是否还有备用端点可尝试。自定义分组恒为 false（方案 b：不支持 failover）。 */
export function hasNextEndpoint(registryId: string, currentIndex: number): boolean {
  if (isCustomRegistryId(registryId)) return false;
  const info = getModelInfo(registryId);
  return !!info && currentIndex + 1 < info.endpoints.length;
}

/**
 * 本次请求真正会用到的自定义分组（0 或 1 个，偶发两个：生图默认模型兜底）。
 * 内置模型（含 custom-openai）不匹配任何分组，返回 []。
 */
export function selectCustomApiGroupsForRequest(
  groups: CustomApiGroup[],
  ...modelIds: Array<string | null | undefined>
): CustomApiGroup[] {
  if (!groups.length) return [];
  const seen = new Set<string>();
  const selected: CustomApiGroup[] = [];
  for (const modelId of modelIds) {
    if (!modelId) continue;
    const found = findCustomModelGroup(groups, modelId);
    if (!found || seen.has(found.group.id)) continue;
    seen.add(found.group.id);
    selected.push(found.group);
  }
  return selected;
}

/** 有模型信息时必须显式 vision:true 才接受图片；未知 id 不拦截。 */
export function modelAcceptsImageInput(id: string, groups: CustomApiGroup[]): boolean {
  const info = getModelInfoWithCustom(id, groups);
  if (!info) return true;
  return info.vision === true;
}


/** 在分组中查找包含某模型的分组（custom: 前缀）。 */
export function findCustomModelGroup(
  groups: CustomApiGroup[],
  modelId: string,
): { group: CustomApiGroup; model: CustomModelConfig } | undefined {
  const rawId = modelId.startsWith(CUSTOM_PREFIX) ? modelId.slice(CUSTOM_PREFIX.length) : modelId;
  for (const group of groups) {
    const encodedGroupId = encodeURIComponent(group.id);
    const scopedPrefix = `${encodedGroupId}:`;
    if (!rawId.startsWith(scopedPrefix)) continue;
    const encodedModelId = rawId.slice(scopedPrefix.length);
    let scopedModelId = encodedModelId;
    try {
      scopedModelId = decodeURIComponent(encodedModelId);
    } catch {
      // Keep the raw value as a best-effort fallback for malformed historical data.
    }
    const model = group.models.find((m) => m.id === scopedModelId);
    if (model) return { group, model };
  }

  for (const group of groups) {
    const model = group.models.find((m) => m.id === rawId);
    if (model) return { group, model };
  }
  return undefined;
}

export function normalizeCustomModelRegistryId(modelId: string, groups: CustomApiGroup[]): string {
  if (!modelId.startsWith(CUSTOM_PREFIX)) return modelId;

  const found = findCustomModelGroup(groups, modelId);
  if (!found) return modelId;

  const canonical = buildCustomModelRegistryId(found.group.id, found.model.id);
  const rawId = modelId.slice(CUSTOM_PREFIX.length);
  const scopedPrefix = `${encodeURIComponent(found.group.id)}:`;
  if (rawId.startsWith(scopedPrefix)) return canonical;

  const legacyMatches = groups.flatMap((group) =>
    group.models
      .filter((model) => model.id === rawId)
      .map((model) => ({ group, model })),
  );

  return legacyMatches.length === 1 ? canonical : modelId;
}

function customThinkingLevels(c: CustomModelConfig): ThinkingEffort[] | undefined {
  if (!c.thinking) return undefined;
  if (c.thinkingLevels === undefined) return [...THINKING_EFFORT_VALUES];
  const levels = normalizeThinkingLevels(c.thinkingLevels);
  return levels.length > 0 ? levels : undefined;
}

function customDefaultEffort(c: CustomModelConfig, levels: ThinkingEffort[] | undefined): ThinkingEffort | undefined {
  if (!c.thinking || !levels?.length) return undefined;
  if (c.defaultThinkingEffort && levels.includes(c.defaultThinkingEffort)) return c.defaultThinkingEffort;
  if (levels.includes("medium")) return "medium";
  return levels[0];
}

/** 将单个 CustomModelConfig 转换为 ModelInfo（内部辅助）。 */
function customModelToInfo(
  c: CustomModelConfig,
  group: Pick<CustomApiGroup, "id" | "name" | "timeoutMs">,
  options?: { scopedId?: boolean },
): ModelInfo {
  const isImage = c.type === "image";
  const thinking = c.thinking ?? false;
  const levels = customThinkingLevels(c);
  const timeoutMs = c.timeoutMs ?? group.timeoutMs;
  return {
    id: options?.scopedId === false ? CUSTOM_PREFIX + c.id : buildCustomModelRegistryId(group.id, c.id),
    label: c.label || c.id,
    group: group.name || "自定义 API",
    thinking,
    thinkingLevels: levels,
    thinkingRequired: thinking ? !!c.thinkingRequired : undefined,
    thinkingEffortMap: c.thinkingEffortMap,
    defaultThinkingEffort: customDefaultEffort(c, levels),
    thinkingRequestStyle: c.thinkingRequestStyle,
    tools: c.tools ?? (isImage ? false : true),
    vision: c.vision,
    contextK: c.contextK ?? 128,
    hint: isImage ? `${c.id} · 生图模型` : c.id,
    // 自定义分组没有内置 endpoints 链；凭证走分组 baseUrl/apiKey，不支持 failover。
    endpoints: [],
    pricing: c.pricing
      ? {
          input: c.pricing.input,
          cachedInput: c.pricing.cachedInput ?? c.pricing.input,
          cacheWrite: c.pricing.cacheWrite ?? c.pricing.cachedInput ?? c.pricing.input,
          output: c.pricing.output,
        }
      : undefined,
    cacheTtlSec: resolveCacheTtlSec(c.cacheTtlSec),
    timeoutMs: typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    type: c.type ?? "text",
    imageParams: c.imageParams,
  };
}

/** 合并内置模型 + 自定义模型，供菜单和 getModelInfo 使用。 */
export function getAllModels(groups: CustomApiGroup[]): ModelInfo[] {
  const custom: ModelInfo[] = groups.flatMap((g) =>
    g.models.map((c) => customModelToInfo(c, g)),
  );
  return [...modelsForPicker(MODELS), ...custom];
}

/** 向后兼容：接收 CustomModelConfig[] 的旧版 getAllModels。 */
export function getAllModelsFlat(customModels: CustomModelConfig[]): ModelInfo[] {
  return [
    ...modelsForPicker(MODELS),
    ...customModels.map((c) =>
      customModelToInfo(c, { id: "legacy", name: "自定义 API" }, { scopedId: false }),
    ),
  ];
}

/** 查找模型信息，支持自定义模型（custom: 前缀）。 */
export function getModelInfoWithCustom(id: string, groups: CustomApiGroup[]): ModelInfo | undefined {
  if (id.startsWith(CUSTOM_PREFIX)) {
    const found = findCustomModelGroup(groups, id);
    if (!found) return undefined;
    return customModelToInfo(found.model, found.group);
  }
  return getModelInfo(id);
}

/** 按 group 聚合，保持声明顺序，供菜单分区渲染。 */
export function getModelGroups(): { group: string; models: ModelInfo[] }[] {
  const order: string[] = [];
  const map = new Map<string, ModelInfo[]>();
  for (const m of modelsForPicker(MODELS)) {
    if (!map.has(m.group)) {
      map.set(m.group, []);
      order.push(m.group);
    }
    map.get(m.group)!.push(m);
  }
  return order.map((group) => ({ group, models: map.get(group)! }));
}

/** 按 group 聚合（含自定义模型），保持声明顺序。 */
export function getModelGroupsWithCustom(groups: CustomApiGroup[]): { group: string; models: ModelInfo[] }[] {
  const all = getAllModels(groups);
  const order: string[] = [];
  const map = new Map<string, ModelInfo[]>();
  for (const m of all) {
    if (!map.has(m.group)) {
      map.set(m.group, []);
      order.push(m.group);
    }
    map.get(m.group)!.push(m);
  }
  return order.map((group) => ({ group, models: map.get(group)! }));
}
