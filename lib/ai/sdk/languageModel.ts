import { endpointProvider, tokenTariff } from "@/lib/billing/tariffs";
import { withProviderAdmission, type CreditDriver } from "@/lib/billing/providerAdmission";
// AI SDK 模型工厂：把 provider.ts 的凭证/端点解析结果装配成一个可直接交给
// ToolLoopAgent / generateText / streamText 的 LanguageModel。
//
//  - openai / siliconflow 协议 → @ai-sdk/openai-compatible（原生解析 reasoning_content、cached_tokens）
//  - anthropic 协议           → @ai-sdk/anthropic（替代旧 anthropicAdapter 的双向翻译）
//  - endpoints 链 / 生图模式文本模型降级 → createFailoverLanguageModel
//  - 正文里内嵌 <think> 的模型 → extractReasoningMiddleware（服务端统一抽成 reasoning）
//  - 非标准思考字段（thinking / reasoning_details / 结构化对象）→ createReasoningNormalizingFetch
//
// Anthropic 原生路径的 reasoning（#94）：
//  SDK 返回结构化 `reasoning` part（thinking blocks），不是正文里的 <think> 标签，
//  也不走 OpenAI 兼容的 reasoning_content / 别名字段。因此 anthropic 分支
//  故意不套 extractReasoningMiddleware，也不包 createReasoningNormalizingFetch——
//  套上只会空转或误伤。思考参数走 providerOptions.anthropic.thinking（见
//  buildThinkingSettings 的 anthropic-thinking）。OpenAI 兼容中转透传 Anthropic
//  时仍走 openai-compatible + 归一化 fetch。
//
// 思考参数装配只走 buildThinkingSettings → thinkingSettings() / prepareCall。
// 仅服务端导入。

import type { LanguageModelV4, LanguageModelV4CallOptions, SharedV4ProviderOptions } from "@ai-sdk/provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel, extractReasoningMiddleware } from "ai";
import {
  resolveEntryProvider,
  resolveProvider,
  resolveNextProvider,
  thinkingBudget,
  type CustomProvider,
  type ResolvedProvider,
} from "@/lib/ai/provider";
import {
  declaredMaxOutputTokens,
  getModelInfo,
  getLandedModelInfo,
  getModelInfoWithCustom,
  wireThinkingEffort,
  type CustomApiGroup,
  type ModelInfo,
  type ThinkingEffort,
} from "@/lib/ai/models";
import { createFailoverLanguageModel, type FailoverCandidate } from "@/lib/ai/sdk/failoverModel";
import { createReasoningNormalizingFetch } from "@/lib/ai/sdk/reasoningNormalizer";
import { createPublicModelFetch } from "./publicModelFetch.server";
import { repairTextValues } from '@/lib/utils/unicode';

/** openai-compatible 实例统一用这个名字，providerOptions 也用同一个 key（无需按上游区分）。 */
export const UPSTREAM_PROVIDER_NAME = "upstream";

const ANTHROPIC_THINKING_MAX_TOKENS_MIN = 16_000;

export type { ThinkingEffort };

/** 思考相关的调用参数：providerOptions 按协议装配；Anthropic 还需要显式抬高 maxOutputTokens。 */
export interface ThinkingCallSettings {
  providerOptions?: SharedV4ProviderOptions;
  maxOutputTokens?: number;
}

export interface ResolvedLanguageModel {
  model: LanguageModelV4;
  /** 主端点的解析结果（registryId / 定价 / timeoutMs / apiModelId 等）。 */
  provider: ResolvedProvider;
  /** 最近一次成功落地的候选（failover 后可能不同于 provider）。 */
  getActualProvider: () => ResolvedProvider;
  /** 注册表声明的能力（自定义模型来自分组配置）。 */
  supportsThinking: boolean;
  supportsTools: boolean;
  /** 若启用思考，返回应合并进 generateText/streamText/Agent 的参数；模型不支持思考时返回 {}。 */
  thinkingSettings(effort: ThinkingEffort | undefined): ThinkingCallSettings;
  /**
   * 之后的调用不再下发思考参数（七牛云方言会显式下发 disabled）。
   * thinkingSettings() 一旦被调用，prepareCall 会给每一跳都补上思考参数；
   * 收尾续写（只写正文）必须用它关掉，否则续写仍在思考，可能再次没有正文。
   */
  suspendThinking(): void;
}

export interface ResolveLanguageModelOptions {
  /** Server-configured custom endpoint, not a user-supplied BYOK credential. Never read from request JSON. */
  platformManagedCredentials?: boolean;
  /** Server-owned dependency injection for integration tests; never accepted from JSON. */
  creditDriver?: CreditDriver;
  /** An automatic selection is a closed candidate set, including every fallback hop. */
  allowedModelIds?: readonly string[];
  /** 切换到备用端点/备用模型时回调（用于向前端推送提示）。 */
  onFailover?: (next: { label: string }, error: unknown) => void;
  /** 额外的整模型降级链（如生图模式：主文本模型 → imageModeTextModelFallback）。 */
  fallbackModelIds?: string[];
  /** 覆盖 failover 首字节超时。交互 HTML 生成要把深度思考等完，需远大于对话默认。 */
  firstChunkTimeoutMs?: number;
}

/** 兼容用户填 https://api.anthropic.com、…/v1、以及各种 One-API 中转（如 https://xxx.com/anthropic）。 */
export function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function buildBaseModel(p: ResolvedProvider): LanguageModelV4 {
  // Website BYOK cannot use DNS rebinding or redirects to reach infrastructure.
  // The desktop's local server contains user keys only and retains local proxy compatibility.
  const publicFetch = p.isCustom && process.env.STUDYSOLO_DESKTOP_RUNTIME !== "true"
    ? createPublicModelFetch(p.baseUrl, p.timeoutMs) : undefined;
  if (p.apiProtocol === "anthropic") {
    const anthropic = createAnthropic({ baseURL: normalizeAnthropicBaseUrl(p.baseUrl), apiKey: p.apiKey, ...(publicFetch ? { fetch: publicFetch } : {}) });
    // Anthropic の prompt cache は明示的な cache_control マーカが無いと cache_read が常に 0。
    // トップレベル cache_control は「最後の cacheable ブロックまで」に breakpoint を打つ
    // API 仕様で、system + tools の大きな共有 prefix を吸収する。
    // 呼び出し側が自分で cacheControl を指定した場合はそちらを尊重する。
    // failover の prepareCall マージ（applyThinkingCallSettings）は thinking 以外の
    // anthropic キーを保持するため、注入した cacheControl は全ホップで生き残る。
    return wrapLanguageModel({
      model: anthropic(p.apiModelId),
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => {
          const providerOptions = { ...(params.providerOptions ?? {}) } as Record<string, unknown>;
          const anthropicOptions = {
            ...((providerOptions.anthropic as Record<string, unknown> | undefined) ?? {}),
          };
          if (anthropicOptions.cacheControl == null) {
            anthropicOptions.cacheControl = { type: "ephemeral" };
          }
          providerOptions.anthropic = anthropicOptions;
          return {
            ...params,
            providerOptions: providerOptions as SharedV4ProviderOptions,
          };
        },
      },
    });
  }
  const upstream = createOpenAICompatible({
    name: UPSTREAM_PROVIDER_NAME,
    baseURL: p.baseUrl.replace(/\/+$/, ""),
    apiKey: p.apiKey,
    includeUsage: true,
    // The built-in gateway is the standard OpenAI-compatible path. Legacy/vendor
    // response normalization belongs only to user-configured direct connections.
    ...(p.gatewayDefaults ? (publicFetch ? { fetch: publicFetch } : {}) : { fetch: createReasoningNormalizingFetch(p.reasoningField, publicFetch) }),
  });
  if (p.gatewayDefaults) return upstream(p.apiModelId);
  return wrapLanguageModel({
    model: upstream(p.apiModelId),
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
}

/** 把主端点 + endpoints 链 + 额外降级模型展开成候选列表（只保留已配置凭证的）。 */
function collectCandidates(
  primary: ResolvedProvider,
  custom: CustomProvider | CustomApiGroup[] | null | undefined,
  fallbackModelIds: string[],
): ResolvedProvider[] {
  const list: ResolvedProvider[] = [primary];
  let cur = primary;
  while (true) {
    const next = resolveNextProvider(cur.registryId, cur.endpointIndex, custom);
    if (!next) break;
    list.push(next);
    cur = next;
  }
  for (const id of fallbackModelIds) {
    const p = resolveProvider(id, custom);
    if (p.configured && !list.some((x) => x.registryId === p.registryId && x.endpointIndex === p.endpointIndex)) {
      list.push(p);
    }
  }
  return list;
}

export function buildThinkingSettings(
  p: ResolvedProvider,
  effort: ThinkingEffort | undefined,
  info?: ModelInfo,
): ThinkingCallSettings {
  const budget = thinkingBudget(effort);
  const modelInfo = info ?? (p.isCustom ? undefined : getModelInfo(p.registryId));
  const effortStr = wireThinkingEffort(modelInfo, effort);
  const style = p.thinkingRequestStyle;
  switch (style) {
    case "none":
      return {};
    case "openai-reasoning-effort":
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { reasoningEffort: effortStr } } };
    case "openrouter-reasoning":
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { reasoning: { effort: effortStr } } } };
    case "gemini-thinking-level":
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking_level: effortStr } } };
    case "deepseek-thinking":
      return {
        providerOptions: {
          [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" }, reasoning_effort: effortStr },
        },
      };
    case "mimo-thinking":
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" } } } };
    case "anthropic-thinking": {
      const maxOutputTokens = Math.max(ANTHROPIC_THINKING_MAX_TOKENS_MIN, budget + 4096);
      if (p.apiProtocol === "anthropic") {
        return {
          providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: budget } } },
          maxOutputTokens,
        };
      }
      // "OpenAI 兼容"中转把 Anthropic 请求体原样透传时，仍按原生字段下发。
      return {
        providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled", budget_tokens: budget } } },
        maxOutputTokens,
      };
    }
    case "qiniu-toggle":
      // 七牛云：thinking type 二态。能被调用到这里就说明"本轮请求了思考"，发 enabled。
      // 关掉的那一半在 prepareCall 里下发（见 QINIU_THINKING_DISABLED）——因为七牛云的
      // 这些模型**默认就思考**，不显式下发 disabled 等于没关。
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "enabled" } } } };
    case "siliconflow":
    default:
      return { providerOptions: { [UPSTREAM_PROVIDER_NAME]: { enable_thinking: true, thinking_budget: budget } } };
  }
}

/**
 * 七牛云「显式关思考」。原来只有"请求思考"时才改 callOptions，没请求就什么都不发；
 * 而七牛云的 DeepSeek / Qwen 默认就会思考（实测不传参 reasoning_content 照样有内容，
 * 而且会吃掉 max_tokens），所以必须把"不开启"也显式说出来，才真的低延迟。
 */
const QINIU_THINKING_DISABLED: ThinkingCallSettings = {
  providerOptions: { [UPSTREAM_PROVIDER_NAME]: { thinking: { type: "disabled" } } },
};

const THINKING_UPSTREAM_KEYS = [
  "reasoningEffort",
  "reasoning_effort",
  "reasoning",
  "thinking",
  "thinking_level",
  "enable_thinking",
  "thinking_budget",
] as const;

/** 用落地端点的思考方言替换 callOptions 里冻住的上一跳参数，避免 merge 残留 GLM 的 reasoningEffort。 */
export function applyThinkingCallSettings(
  callOptions: LanguageModelV4CallOptions,
  settings: ThinkingCallSettings,
): LanguageModelV4CallOptions {
  const providerOptions = { ...(callOptions.providerOptions ?? {}) } as Record<string, unknown>;
  const upstream = { ...((providerOptions[UPSTREAM_PROVIDER_NAME] as Record<string, unknown> | undefined) ?? {}) };
  for (const key of THINKING_UPSTREAM_KEYS) delete upstream[key];
  const nextUpstream = settings.providerOptions?.[UPSTREAM_PROVIDER_NAME as keyof SharedV4ProviderOptions];
  if (nextUpstream && typeof nextUpstream === "object") Object.assign(upstream, nextUpstream);
  if (Object.keys(upstream).length > 0) providerOptions[UPSTREAM_PROVIDER_NAME] = upstream;
  else delete providerOptions[UPSTREAM_PROVIDER_NAME];

  const anthropic = { ...((providerOptions.anthropic as Record<string, unknown> | undefined) ?? {}) };
  if (settings.providerOptions?.anthropic) Object.assign(anthropic, settings.providerOptions.anthropic);
  else delete anthropic.thinking;
  if (Object.keys(anthropic).length > 0) providerOptions.anthropic = anthropic;
  else delete providerOptions.anthropic;

  return {
    ...callOptions,
    providerOptions: providerOptions as SharedV4ProviderOptions,
    // 思考方言要求的最小输出（Anthropic：budget + 4096）只能抬高调用方的上限，不能压低它。
    ...(settings.maxOutputTokens != null
      ? { maxOutputTokens: Math.max(callOptions.maxOutputTokens ?? 0, settings.maxOutputTokens) }
      : {}),
  };
}

/** failover 后按落地端点的 apiModelId/provider 重取 ModelInfo，方言跟落地模型。 */
function landedThinkingContext(
  landed: ResolvedProvider,
  customGroups: CustomApiGroup[],
  fallbackInfo: ModelInfo | undefined,
): { provider: ResolvedProvider; info: ModelInfo | undefined } {
  if (landed.isCustom) {
    const info = getModelInfoWithCustom(landed.registryId, customGroups) ?? fallbackInfo;
    return { provider: landed, info };
  }
  const info = getLandedModelInfo(landed.apiModelId, landed.registryId) ?? fallbackInfo;
  return {
    provider: landed,
    info,
  };
}

export function resolveLanguageModel(
  modelId: string | undefined,
  custom?: CustomProvider | CustomApiGroup[] | null,
  options: ResolveLanguageModelOptions = {},
): ResolvedLanguageModel {
  // 链首未配置凭证时从链上第一个配好的端点起步（否则空 key 会拿到不可降级的 401）。
  const primary = resolveEntryProvider(modelId, custom);
  const customGroups = Array.isArray(custom) ? custom : [];
  const info = getModelInfoWithCustom(primary.registryId, customGroups);
  const supportsThinking = primary.isCustom ? primary.thinkingRequestStyle !== "none" && (info?.thinking ?? true) : info?.thinking === true;
  const supportsTools = info?.tools !== false;

  const providers = collectCandidates(primary, custom, options.fallbackModelIds ?? [])
    .filter((p) => !options.allowedModelIds || options.allowedModelIds.includes(p.registryId))
    .filter((p) => {
      if(!options.allowedModelIds)return true;
      try{tokenTariff(p.billingProvider??endpointProvider(p.baseUrl),p.apiModelId,p.isCustom===true&&options.platformManagedCredentials!==true);return true;}
      catch{return false;} // Automatic routing never selects a pending/unpriced channel.
    });
  if (!providers.length) throw new Error('当前没有可用的自动模型，请稍后重试或手动选择模型。');
  let actualProvider = providers[0] ?? primary;
  const candidates: FailoverCandidate[] = providers.map((p) => {
    const hopInfo = getModelInfoWithCustom(p.registryId, customGroups) ?? getLandedModelInfo(p.apiModelId, p.registryId);
    return {
      model: withProviderAdmission(
        buildBaseModel(p),
        options.platformManagedCredentials || (!p.isCustom && getModelInfo(p.apiModelId)) ? p.apiModelId : p.registryId,
        p.isCustom === true && options.platformManagedCredentials !== true,
        options.creditDriver,
        {
          provider: p.billingProvider ?? endpointProvider(p.baseUrl), model: p.apiModelId,
          contextTokens: (hopInfo?.contextK ?? 128) * 1000,
          maxOutputTokens: declaredMaxOutputTokens(hopInfo),
        },
      ),
      label: p.apiModelId,
    };
  });

  let thinkingSettingsRequested = false;
  let lastThinkingEffort: ThinkingEffort | undefined;

  const failoverModel = createFailoverLanguageModel(candidates, {
    onFailover: (next, _index, error) => options.onFailover?.({ label: next.label }, error),
    onLanded: (_next, index) => {
      actualProvider = providers[index] ?? actualProvider;
    },
    // 与旧实现一致：首字节超时视为端点不可用（慢模型如 MoE 冷启动在 models.ts 单独放宽）。
    firstChunkTimeoutMs: options.firstChunkTimeoutMs ?? primary.timeoutMs,
    prepareCall: (index, callOptions) => {
      const hop = providers[index] ?? actualProvider;
      const landed = landedThinkingContext(hop, customGroups, info);
      // 三条分支：请求了思考 → 下发该跳方言；没请求但该跳属于"默认思考"的七牛云方言 → 显式关闭；
      // 其余保持不传参（历史行为）。
      const thinkingSettings = thinkingSettingsRequested && supportsThinking
        ? buildThinkingSettings(landed.provider, lastThinkingEffort, landed.info)
        : (hop.thinkingRequestStyle === "qiniu-toggle" ? QINIU_THINKING_DISABLED : undefined);
      const prepared = thinkingSettings
        ? applyThinkingCallSettings(callOptions, thinkingSettings)
        : callOptions;
      if (!hop.gatewayDefaults) return prepared;
      const defaults = {
        ...prepared, temperature: hop.temperature,
        topP: undefined, frequencyPenalty: undefined, presencePenalty: undefined, seed: undefined,
      };
      // These gateway models reject named/required tool_choice while reasoning. Keep only
      // the requested tool, but use the supported OpenAI auto choice; no vendor fields.
      if (['deepseek/deepseek-v4.1-flash', 'kimi-k3'].includes(hop.registryId)
        && (defaults.toolChoice?.type === 'tool' || defaults.toolChoice?.type === 'required')) {
        const name = defaults.toolChoice.type === 'tool' ? defaults.toolChoice.toolName : undefined;
        if (name) defaults.tools = defaults.tools?.filter((tool) => tool.type === 'function' && tool.name === name);
        defaults.toolChoice = { type: 'auto' };
      }
      return hop.thinkingRequestStyle === 'none' ? applyThinkingCallSettings(defaults, {}) : defaults;
    },
  });

  // One final boundary for every model and every tool-loop step, including
  // history produced by older clients and text truncated by satellite features.
  const model = wrapLanguageModel({
    model: failoverModel,
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) => ({
        ...params,
        prompt: repairTextValues(params.prompt),
        tools: repairTextValues(params.tools),
      }),
    },
  });

  return {
    model,
    provider: primary,
    getActualProvider: () => actualProvider,
    supportsThinking,
    supportsTools,
    thinkingSettings: (effort) => {
      thinkingSettingsRequested = true;
      lastThinkingEffort = effort;
      if (!supportsThinking) return {};
      const landed = landedThinkingContext(actualProvider, customGroups, info);
      return buildThinkingSettings(landed.provider, effort, landed.info);
    },
    suspendThinking: () => {
      thinkingSettingsRequested = false;
    },
  };
}
