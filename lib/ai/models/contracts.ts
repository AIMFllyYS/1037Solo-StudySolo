// 多提供商精选模型注册表 —— 供 AI 对话的模型选择菜单。
// 主力对话：七牛云（api.qnaigc.com，延迟最低）→ 自有中转（relay.protocom.org）容灾；
// MiMo 同样走自有中转；硅基流动负责廉价生图与向量/重排；xhuoai 提供高价慢速生图；
// 智谱仅保留向量/重排/联网搜索。
// DeepSeek Flash Fast 使用官方原生 API，普通模式继续沿用七牛/中转。
// model id（注册 id）与上游 apiModelId 分离；endpoints 链支持容灾降级。

export type ProviderKind = "siliconflow" | "mimo" | "zhipu" | "relay" | "qiniu" | "xhuoai" | "deepseek";

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
  /**
   * 单次调用最大输出（千 token，含思考 token）。用户没在设置里改「单次输出上限」时，
   * 每次调用都按它下发 max_tokens。缺省按 FALLBACK_MAX_OUTPUT_TOKENS。
   */
  maxOutputK?: number;
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

export const CUSTOM_MODEL_ID = "custom";
export const AUTO_MODEL_ID = "auto";

/** 桌面「自由中转」：用户自填 URL / API Key / 模型 ID，registry id 固定，上游 apiModelId 来自 env。 */
export const CUSTOM_OPENAI_MODEL_ID = "custom-openai";

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
