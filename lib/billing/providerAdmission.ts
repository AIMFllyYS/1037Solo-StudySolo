import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { getModelInfo, type ModelInfo } from "@/lib/ai/models";
import { allocateCall } from "./paidContext";
import { CreditAdmissionError, reserveCredit, settleMicrocredits, cancelCredit, type Admission } from "./centralCredits";

import { tokenTariff, tierPrice, reservationPrice, type TokenTariff, type Price } from "./tariffs";
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
export function boundedCall(params: LanguageModelV4CallOptions, info?: ModelInfo) {
  // Existing maximum thinking uses 32k reasoning + 4096 output; do not break that mode.
  const maximum = Number(process.env.ECOSYSTEM_MAX_OUTPUT_TOKENS || "65536");
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 131072) throw new CreditAdmissionError("输出预算配置无效", 503);
  const output = params.maxOutputTokens ?? 4096;
  if (!Number.isSafeInteger(output) || output < 1 || output > maximum) throw new CreditAdmissionError("输出预算超出安全范围", 400);
  const serialized = JSON.stringify({ prompt: params.prompt, tools: params.tools });
  const context = Math.floor((info?.contextK ?? 128) * 1000);
  const hasMedia = params.prompt.some(m => Array.isArray(m.content) && m.content.some(p => p.type === "file"));
  const input = hasMedia ? context : Buffer.byteLength(serialized, "utf8") + 8192;
  if (input > context) throw new CreditAdmissionError("输入超过可计费上下文上限", 400);
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
/** Wrap each real provider candidate; failover does not reuse or silently lose reservations. */
export function withProviderAdmission(model: LanguageModelV4, modelId: string, byok = false, credits: CreditDriver = driver, endpoint?: {provider?:string;model:string}): LanguageModelV4 {
  async function begin(params: LanguageModelV4CallOptions) {
    const tariff=tokenTariff(endpoint ? endpoint.provider : getModelInfo(modelId)?.endpoints[0]?.provider,endpoint?.model??modelId,byok);
    const bounded = boundedCall(params, getModelInfo(modelId));
    const cap=usageCny({input:bounded.input,output:bounded.output,cached:0,written:0},reservationPrice(tariff,bounded.input));
    const call=allocateCall(cap,modelId);
    const admission=await credits.reserve(call.userId,call.key,cap,{...call.metadata,priceSnapshot:tariff,maxInputTokens:bounded.input,maxOutputTokens:bounded.output,creditsPerCny:process.env.ECOSYSTEM_CREDITS_PER_CNY||"1"});
    return {admission,tariff,bounded};
  }
  async function finish(admission:Admission,tariff:TokenTariff,usage:unknown){
    const measured=measuredTokens(usage);
    if(!measured)throw new CreditAdmissionError("模型未返回可核验用量，预留额度待核对",503);
    if(measured.input>Number(admission.metadata.maxInputTokens)||measured.output>Number(admission.metadata.maxOutputTokens))throw new CreditAdmissionError("模型用量超过预留边界，账目待核对",503);
    await credits.settleMicro(admission,usageMicrocredits(measured,tierPrice(tariff,measured.input),Number(admission.metadata.creditsPerCny)));
    return measured;
  }

  return {
    specificationVersion: "v4", provider: model.provider, modelId: model.modelId, supportedUrls: model.supportedUrls,
    async doGenerate(params) {
      const call = await begin(params);
      if (params.abortSignal?.aborted) { await credits.cancel(call.admission); throw params.abortSignal.reason; }
      try {
        const result = await model.doGenerate(call.bounded.params);
        const measured=await finish(call.admission, call.tariff, result.usage);
        return {...result,usage:normalizeUsage(result.usage,measured)};
      } catch (error) {
        if (definitiveRejection(error)) await credits.cancel(call.admission);
        throw error; // Unknown provider outcome/settlement failure keeps funds held.
      }
    },
    async doStream(params) {
      const call = await begin(params);
      if (params.abortSignal?.aborted) { await credits.cancel(call.admission); throw params.abortSignal.reason; }
      try {
        const result = await model.doStream(call.bounded.params);
        let finalized = false, upstreamFailed = false;
        const reader = result.stream.getReader();
        return { ...result, stream: new ReadableStream<LanguageModelV4StreamPart>({
          async pull(controller) {
            try {
              const item = await reader.read();
              if (item.done) {
                if (!finalized && !upstreamFailed) throw new CreditAdmissionError("流未返回完整用量，额度待核对", 503);
                controller.close(); return;
              }
              if (item.value.type === "finish" && !finalized && (!upstreamFailed || measuredTokens(item.value.usage))) { const measured=await finish(call.admission, call.tariff, item.value.usage); item.value.usage=normalizeUsage(item.value.usage,measured); finalized = true; }
              if (item.value.type === "error") {
                upstreamFailed = true;
                if (definitiveRejection(item.value.error) && !finalized) {
                  await credits.cancel(call.admission); finalized = true;
                  controller.enqueue(item.value); await reader.cancel(); controller.close(); return;
                }
              }
              controller.enqueue(item.value);
            } catch (error) { void reader.cancel(error).catch(() => {}); controller.error(error); }
          },
          cancel: reason => reader.cancel(reason), // Unknown in-flight usage remains reserved.
        }) };
      } catch (error) { if (definitiveRejection(error)) await credits.cancel(call.admission); throw error; }
    },
  };
}
