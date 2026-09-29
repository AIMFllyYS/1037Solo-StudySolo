import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { declaredMaxOutputTokens, FALLBACK_MAX_OUTPUT_TOKENS, getModelInfo, type ModelInfo } from "@/lib/ai/models";
import { allocateCall, releaseCall } from "./paidContext";
import { CreditAdmissionError, reserveCredit, settleMicrocredits, cancelCredit, type Admission } from "./centralCredits";

import { tokenTariff, tierPrice, reservationPrice, type Price } from "./tariffs";
export type { Price } from "./tariffs";
export interface CreditDriver {
  reserve: typeof reserveCredit; settleMicro: typeof settleMicrocredits; cancel: typeof cancelCredit;
}
const driver: CreditDriver = { reserve: reserveCredit, settleMicro: settleMicrocredits, cancel: cancelCredit };

export function priceForModel(modelId: string, byok = false): Price {
  return tierPrice(tokenTariff(getModelInfo(modelId)?.endpoints[0]?.provider,modelId,byok),0);
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
export function measuredTokens(raw: unknown): { input: number; output: number; cached: number; written: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  // AI SDK's OpenAI-compatible adapter sets cacheWrite=undefined and may normalize
  // absent counts to0, but preserves its loose wire usage in raw. Prefer that
  // verified receipt, including an empty raw receipt which must remain unknown.
  if(u.raw && typeof u.raw==='object' && !Array.isArray(u.raw))return measuredTokens({...u.raw as Record<string,unknown>,raw:undefined});
  const input = u.inputTokens, output = u.outputTokens;
  const i = typeof input === "object" && input ? input as Record<string, unknown> : {};
  const o = typeof output === "object" && output ? output as Record<string, unknown> : {};
  let inputCount = count(i.total ?? input ?? u.prompt_tokens ?? u.input_tokens);
  const outputCount = count(o.total ?? output ?? u.completion_tokens ?? u.output_tokens);
  if (inputCount === undefined || outputCount === undefined) return null;
  const details = (u.inputTokenDetails ?? u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const readRaw=i.cacheRead ?? details.cacheReadTokens ?? details.cached_tokens ?? u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens;
  const writeRaw=i.cacheWrite ?? details.cacheWriteTokens ?? details.cache_write_tokens ?? u.cache_creation_input_tokens;
  if([readRaw,writeRaw].some(v=>v!=null&&count(v)===undefined))throw new CreditAdmissionError("缓存用量格式异常",503);
  const cached=count(readRaw)??0,written=count(writeRaw)??0;
  // Native Anthropic input_tokens excludes cached tokens; SDK/OpenAI totals include them.
  if(input===undefined && u.prompt_tokens===undefined && u.input_tokens!==undefined && (u.cache_read_input_tokens!==undefined||u.cache_creation_input_tokens!==undefined))inputCount+=cached+written;
  if(!Number.isSafeInteger(inputCount)||cached+written>inputCount)throw new CreditAdmissionError("模型用量格式异常，账目待核对",503);
  return { input: inputCount, output: outputCount, cached, written };
}
function scaled(n: number): bigint {
    if (!Number.isFinite(n) || n < 0) throw new CreditAdmissionError("计价精度无效", 503);
    const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(n.toString());
    if (!match) throw new CreditAdmissionError("计价精度无效", 503);
    const places = (match[2] || "").length - Number(match[3] || 0);
    if (places > 8) throw new CreditAdmissionError("计价精度无效", 503);
    return BigInt(match[1] + (match[2] || "")) * 10n ** BigInt(8 - places);
}
function costNumerator(usage: NonNullable<ReturnType<typeof measuredTokens>>, price: Price): bigint {
  return BigInt(usage.input - usage.cached - usage.written) * scaled(price.input)
    + BigInt(usage.cached) * scaled(price.cachedInput) + BigInt(usage.written) * scaled(price.cacheWrite ?? price.input)
    + BigInt(usage.output) * scaled(price.output);
}
export function usageCny(usage: NonNullable<ReturnType<typeof measuredTokens>>, price: Price): number {
  const numerator = costNumerator(usage, price);
  const micro = (numerator + 99_999_999n) / 100_000_000n;
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) throw new CreditAdmissionError("计费金额超限", 503);
  return Number(micro) / 1_000_000;
}
export function usageMicrocredits(usage: NonNullable<ReturnType<typeof measuredTokens>>, price: Price, ratio = Number(process.env.ECOSYSTEM_CREDITS_PER_CNY || "1")): number {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new CreditAdmissionError("计价比例无效", 503);
  const numerator = costNumerator(usage, price) * scaled(ratio);
  const denominator = 10_000_000_000_000_000n;
  const amount = (numerator + denominator - 1n) / denominator;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new CreditAdmissionError("计费金额超限", 503);
  return Number(amount);
}
/** 单次调用的上限：由调用方（languageModel）按落地模型的注册表声明传入。 */
export interface CallLimits {
  /** 上下文窗口（token）。 */
  contextTokens?: number;
  /** 调用方没给 maxOutputTokens 时使用的注册表最大输出（token）。 */
  maxOutputTokens?: number;
}
/** 运营硬上限：ECOSYSTEM_MAX_OUTPUT_TOKENS，缺省 131072。超出时收紧而不是拒绝请求。 */
export function operatorMaxOutputTokens(): number {
  const maximum = Number(process.env.ECOSYSTEM_MAX_OUTPUT_TOKENS || "131072");
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 262144) throw new CreditAdmissionError("输出预算配置无效", 503);
  return maximum;
}
export function boundedCall(params: LanguageModelV4CallOptions, limitsOrInfo?: CallLimits | ModelInfo) {
  const limits: CallLimits = limitsOrInfo && "id" in limitsOrInfo
    ? { contextTokens: (limitsOrInfo.contextK ?? 128) * 1000, maxOutputTokens: declaredMaxOutputTokens(limitsOrInfo) }
    : (limitsOrInfo as CallLimits | undefined) ?? {};
  const requested = params.maxOutputTokens ?? limits.maxOutputTokens ?? FALLBACK_MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(requested) || requested < 1) throw new CreditAdmissionError("输出预算无效", 400);
  const output = Math.min(requested, operatorMaxOutputTokens());
  const serialized = JSON.stringify({ prompt: params.prompt, tools: params.tools });
  const context = Math.floor(limits.contextTokens && limits.contextTokens > 0 ? limits.contextTokens : 128_000);
  const hasMedia = params.prompt.some(m => Array.isArray(m.content) && m.content.some(p => p.type === "file"));
  // UTF-8 字节数是输入 token 的安全上界（中文 3 字节≈1–2 token），但它不能拿来和
  // 上下文窗口（token）比较——以前用字节数判「超出上下文」，中文长上下文会被误拒。
  // 上游不会接受超过窗口的输入，所以预留按 min(字节上界, 窗口)，是否超窗交给上游判定。
  const input = hasMedia ? context : Math.min(Buffer.byteLength(serialized, "utf8") + 8192, context);
  return { input, output, params: { ...params, maxOutputTokens: output } };
}
type ProviderUsage=Awaited<ReturnType<LanguageModelV4['doGenerate']>>['usage'];
function normalizeUsage(usage:ProviderUsage,measured:NonNullable<ReturnType<typeof measuredTokens>>):ProviderUsage {
  return {...usage,inputTokens:{total:measured.input,noCache:measured.input-measured.cached-measured.written,cacheRead:measured.cached,cacheWrite:measured.written},outputTokens:{...usage.outputTokens,total:measured.output}};
}
function definitiveRejection(error: unknown) {
  const code = (error as { statusCode?: number })?.statusCode;
  return code !== undefined && [400, 401, 403, 404, 413, 422, 429].includes(code);
}
/**
 * Wrap each real provider candidate; failover does not reuse or silently lose reservations.
 *
 * 结算失败（用量缺失、超出预留边界、账本请求失败）只影响账目，不影响回答：预留保持占用、
 * 记日志等待核对，模型输出照常交给调用方。以前这里抛错，会在回答写完的最后一刻把整条流
 * 变成报错——正文被截断、工具循环中断、收尾续写也不再运行。
 */
export function withProviderAdmission(model: LanguageModelV4, modelId: string, byok = false, credits: CreditDriver = driver, endpoint?: {provider?:string;model:string} & CallLimits): LanguageModelV4 {
  async function begin(params: LanguageModelV4CallOptions) {
    const tariff=tokenTariff(endpoint ? endpoint.provider : getModelInfo(modelId)?.endpoints[0]?.provider,endpoint?.model??modelId,byok);
    const info = getModelInfo(modelId);
    const bounded = boundedCall(params, {
      contextTokens: endpoint?.contextTokens ?? (info?.contextK ?? 128) * 1000,
      maxOutputTokens: endpoint?.maxOutputTokens ?? declaredMaxOutputTokens(info),
    });
    const cap=usageCny({input:bounded.input,output:bounded.output,cached:0,written:0},reservationPrice(tariff,bounded.input));
    const call=allocateCall(cap,modelId);
    let admission: Admission;
    try {
      admission=await credits.reserve(call.userId,call.key,cap,{...call.metadata,priceSnapshot:tariff,maxInputTokens:bounded.input,maxOutputTokens:bounded.output,creditsPerCny:process.env.ECOSYSTEM_CREDITS_PER_CNY||"1"});
    } catch (error) { releaseCall(call, 0); throw error; }
    return {admission,tariff,bounded,call};
  }
  type Begun = Awaited<ReturnType<typeof begin>>;
  async function cancel(begun: Begun) {
    await credits.cancel(begun.admission);
    releaseCall(begun.call, 0);
  }
  /** 结算；失败时返回 null（额度继续占用、待核对），绝不抛给回答流。 */
  async function settle(begun: Begun, usage: unknown) {
    const { admission, tariff } = begun;
    try {
      const measured=measuredTokens(usage);
      if(!measured)throw new CreditAdmissionError("模型未返回可核验用量，预留额度待核对",503);
      if(measured.input>Number(admission.metadata.maxInputTokens)||measured.output>Number(admission.metadata.maxOutputTokens))throw new CreditAdmissionError("模型用量超过预留边界，账目待核对",503);
      const price=tierPrice(tariff,measured.input);
      await credits.settleMicro(admission,usageMicrocredits(measured,price,Number(admission.metadata.creditsPerCny)));
      releaseCall(begun.call, usageCny(measured, price));
      return measured;
    } catch (error) {
      console.error("[billing] settlement pending reconciliation", {
        key: admission.requestKey, model: modelId, reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return {
    specificationVersion: "v4", provider: model.provider, modelId: model.modelId, supportedUrls: model.supportedUrls,
    async doGenerate(params) {
      const begun = await begin(params);
      if (params.abortSignal?.aborted) { await cancel(begun); throw params.abortSignal.reason; }
      let result: Awaited<ReturnType<LanguageModelV4["doGenerate"]>>;
      try {
        result = await model.doGenerate(begun.bounded.params);
      } catch (error) {
        if (definitiveRejection(error)) await cancel(begun);
        throw error; // Unknown provider outcome keeps funds held.
      }
      const measured = await settle(begun, result.usage);
      return measured ? { ...result, usage: normalizeUsage(result.usage, measured) } : result;
    },
    async doStream(params) {
      const begun = await begin(params);
      if (params.abortSignal?.aborted) { await cancel(begun); throw params.abortSignal.reason; }
      try {
        const result = await model.doStream(begun.bounded.params);
        let finalized = false;
        const reader = result.stream.getReader();
        return { ...result, stream: new ReadableStream<LanguageModelV4StreamPart>({
          async pull(controller) {
            try {
              const item = await reader.read();
              if (item.done) {
                if (!finalized) {
                  // 上游没发 finish 就收流：已输出的内容照常交付，预留保持占用待核对。
                  console.error("[billing] stream closed without usage; reservation held", { key: begun.admission.requestKey, model: modelId });
                }
                controller.close(); return;
              }
              if (item.value.type === "finish" && !finalized) {
                finalized = true;
                const measured = await settle(begun, item.value.usage);
                if (measured) item.value.usage = normalizeUsage(item.value.usage, measured);
              }
              if (item.value.type === "error" && definitiveRejection(item.value.error) && !finalized) {
                finalized = true;
                await cancel(begun);
                controller.enqueue(item.value); await reader.cancel(); controller.close(); return;
              }
              controller.enqueue(item.value);
            } catch (error) { void reader.cancel(error).catch(() => {}); controller.error(error); }
          },
          cancel: reason => reader.cancel(reason), // Unknown in-flight usage remains reserved.
        }) };
      } catch (error) { if (definitiveRejection(error)) await cancel(begun); throw error; }
    },
  };
}
