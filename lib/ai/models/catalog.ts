import { AUTO_MODEL_ID, CUSTOM_MODEL_ID, CUSTOM_OPENAI_MODEL_ID, CUSTOM_PREFIX, DEFAULT_CACHE_TTL_SEC, type ModelInfo, type ModelEndpoint, type ProviderKind } from "./contracts";
import { normalizeRegistryId } from "./aliases";
export const MUSE_VENDOR_TRAINING_NOTICE = "对话可能用于厂商训练";

/** A selection policy, not an upstream model. No fabricated price or fixed window. */
export const AUTO_MODEL_INFO: ModelInfo = {
  id: AUTO_MODEL_ID, label: "自动", group: "自动模型", thinking: true,
  tools: true, vision: true, hint: "根据当前任务自动选择合适的模型", endpoints: [],
};

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
    maxOutputK: 32,
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
    maxOutputK: 64,
    hint: "全局默认 · 七牛优先 · 固定峰值平台费率 · 备用按渠道结算",
    // 七牛云第一跳（延迟最低），Protocom 中转容灾。七牛云支持 thinking 真正关闭。
    endpoints: [ep(QINIU, "deepseek/deepseek-v4.1-flash"), ep(RELAY, "deepseek/deepseek-v4.1-flash")],
    icon: "deepseek",
    pricing: { input: 2, cachedInput: 0.04, output: 8 },
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
  },
  {
    id: "deepseek/deepseek-v4.1-flash-fast",
    label: "DeepSeek V4.1 Flash Fast",
    group: "快速模型",
    thinking: true,
    thinkingRequired: false,
    thinkingLevels: ["low", "medium", "high", "max"],
    thinkingEffortMap: { medium: "high" },
    defaultThinkingEffort: "medium",
    thinkingRequestStyle: "deepseek-thinking",
    tools: true,
    vision: true,
    contextK: 1000,
    maxOutputK: 64,
    hint: "Fast · DeepSeek 官方原生 API · 普通模式 2× 平台费率",
    // Fast is our direct official channel; the wire model has no fabricated Fast suffix.
    endpoints: [ep("deepseek", "deepseek-flash")],
    icon: "deepseek",
    pricing: { input: 4, cachedInput: 0.08, output: 16 },
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
    maxOutputK: 32,
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
    maxOutputK: 64,
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
    maxOutputK: 64,
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
    maxOutputK: 128,
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
    maxOutputK: 64,
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
    maxOutputK: 64,
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
    maxOutputK: 128,
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
    maxOutputK: 32,
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
    maxOutputK: 32,
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
    maxOutputK: 32,
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
    maxOutputK: 32,
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
    maxOutputK: 128,
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
    maxOutputK: 64,
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

/** 注册表没声明 maxOutputK 时（自定义模型、未知上游）的单次输出上限。 */
export const FALLBACK_MAX_OUTPUT_TOKENS = 32_768;

/** 注册表声明的单次最大输出（token，含思考）。 */
export function declaredMaxOutputTokens(info: Pick<ModelInfo, "maxOutputK"> | undefined): number {
  const k = info?.maxOutputK;
  return typeof k === "number" && Number.isFinite(k) && k > 0 ? Math.round(k * 1000) : FALLBACK_MAX_OUTPUT_TOKENS;
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
