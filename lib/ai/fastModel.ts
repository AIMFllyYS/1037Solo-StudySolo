import { billableJsonFetch } from "@/lib/billing/billableFetch";
import { CreditAdmissionError } from "@/lib/billing/centralCredits";
// 极轻量「快速模型」调用（服务端）：只服务内部调度——自动路由选模型、标签页命名。
//
// 为什么不用 AI SDK 走一遍：这类调用要的是**确定性**——必须真正关掉思考、temperature 0、
// max_tokens 个位数、结构化输出，且不被任何思考方言 / 中间件 / 重试改写。直接打 OpenAI 兼容的
// /chat/completions 最可预测、也最少开销（少几层封装，单次 200–600ms）。
//
// 默认用七牛云的 doubao-seed-2.0-mini：实测关思考后 max_tokens=8 就能返回干净 JSON，
// 普通上游失败返回 null，调用方可回落到规则；身份、余额和幂等拒绝必须向上传递。
//
// env 在**每次请求**读取（对比 provider.ts 的模块级读取）：这两个变量属于"运维调优"，
// 改完应当立刻生效，而不是重启进程。
import { normalizeOpenAIBaseUrl } from "@/lib/ai/openaiBaseUrl";

/** 快速模型超时：够慢启动的冷实例，又不至于让用户等出感受。 */
export const FAST_MODEL_TIMEOUT_MS = 6_000;

export interface FastModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export function fastModelConfig(): FastModelConfig {
  const baseUrl = normalizeOpenAIBaseUrl(
    process.env.AI_FAST_BASE_URL || process.env.QINIU_BASE_URL || "https://api.qnaigc.com/v1",
  );
  const apiKey = process.env.AI_FAST_API_KEY || process.env.QINIU_API_KEY || "";
  const model = process.env.AI_FAST_MODEL || "doubao-seed-2.0-mini";
  return { baseUrl, apiKey, model, enabled: !!(baseUrl && apiKey && model) };
}

export interface FastModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FastModelResult {
  text: string;
  usage?: FastModelUsage;
  elapsedMs: number;
  model: string;
}

export interface CallFastModelInput {
  system: string;
  user: string;
  maxTokens: number;
  /** 要求 JSON 输出（上游 response_format=json_object）。 */
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
  /** 默认 true：七牛云这些模型不显式关就会思考，白烧 token 还慢。 */
  disableThinking?: boolean;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * 普通上游失败返回 null；中央准入或结算错误向上传递，避免再买一次备用调用。
 */
export async function callFastModel(input: CallFastModelInput): Promise<FastModelResult | null> {
  const config = fastModelConfig();
  if (!config.enabled) return null;

  const timeoutMs = input.timeoutMs ?? FAST_MODEL_TIMEOUT_MS;
  const startedAt = Date.now();
  try {
    const res = await billableJsonFetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: input.temperature ?? 0,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        ...(input.disableThinking === false ? {} : { thinking: { type: "disabled" } }),
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }, { model: config.model, kind: "llm" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return null;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const text = typeof first?.message?.content === "string" ? first.message.content : "";
    const rawUsage = (data.usage ?? {}) as Record<string, unknown>;
    return {
      text,
      usage: {
        inputTokens: readNumber(rawUsage.prompt_tokens ?? rawUsage.input_tokens),
        outputTokens: readNumber(rawUsage.completion_tokens ?? rawUsage.output_tokens),
        totalTokens: readNumber(rawUsage.total_tokens),
      },
      elapsedMs: Date.now() - startedAt,
      model: config.model,
    };
  } catch (error) {
    // A duplicate/denied admission must stop the request, not buy a fallback call.
    if (error instanceof CreditAdmissionError) throw error;
    return null;
  }
}
