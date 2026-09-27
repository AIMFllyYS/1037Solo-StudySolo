/** Non-streaming provider transport: reserve before network, settle only verifiable results. */
import { tokenTariff, tierPrice, reservationPrice, endpointProvider, configuredTariff } from "./tariffs";
import { allocateCall } from "./paidContext";
import { CreditAdmissionError, reserveCredit, settleMicrocredits, cancelCredit } from "./centralCredits";
import { measuredTokens, usageCny, usageMicrocredits } from "./providerAdmission";

export interface FetchBilling {
  model: string;
  provider?: string;
  kind: "llm" | "embedding" | "rerank" | "image" | "search" | "image-search";
  byok?: boolean;
  quantity?: number;
  actualUnits?: (data: Record<string, unknown>) => number;
}
function unitPrice(kind: string, model: string, byok: boolean): number {
  // Explicit operator config, in CNY per unit/request. Unknown is never zero.
  let configured: Record<string, unknown>;
  try { configured = JSON.parse(process.env.ECOSYSTEM_SERVICE_PRICES_JSON || "{}"); }
  catch { throw new CreditAdmissionError("服务计价配置无效", 503); }
  const value = configured[`${byok ? "byok:" : ""}${kind}:${model}`] ?? (byok ? configured[`byok:${kind}:*`] : undefined);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new CreditAdmissionError("该服务尚未配置可信计价", 503);
  return value;
}
export async function billableJsonFetch(url: RequestInfo | URL, init: RequestInit, billing: FetchBilling): Promise<Response> {
  let body: Record<string, unknown> = {};
  if (init.body) {
    if (typeof init.body !== "string") throw new CreditAdmissionError("不支持的计费请求格式", 400);
    try { body = JSON.parse(init.body); } catch { throw new CreditAdmissionError("无效服务请求", 400); }
  }
  if (body.stream === true) throw new CreditAdmissionError("流式请求必须使用受控 SDK 通道", 400);
  const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
  const provider=billing.provider??endpointProvider(urlString);
  const inputOnly=billing.kind==='embedding'||(billing.kind==='rerank'&&!billing.byok&&provider==='zhipu'&&billing.model==='rerank');
  const tokenBilled=billing.kind==='llm'||inputOnly;
  const tariff=tokenBilled?tokenTariff(provider,billing.model,billing.byok):null;
  const inputBound=Buffer.byteLength(JSON.stringify(body),"utf8")+4096;
  if(inputBound>1_000_000)throw new CreditAdmissionError("请求超出服务预算范围",413);
  let outputBound=0;
  if (billing.kind === "llm" || new URL(urlString).pathname.endsWith("/chat/completions")) {
    outputBound = Number(body.max_tokens ?? body.max_completion_tokens ?? 4096);
    if (!Number.isSafeInteger(outputBound) || outputBound < 1 || outputBound > 32768) throw new CreditAdmissionError("输出预算无效", 400);
    body.max_tokens = outputBound;
    init = { ...init, body: JSON.stringify(body) };
  }
  const quantity = billing.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new CreditAdmissionError("服务数量超限", 400);
  const imageTariff=billing.kind==='image'&&!billing.byok&&provider?configuredTariff(provider,billing.model):undefined;
  if(billing.kind==='image'&&!billing.byok&&(!imageTariff||imageTariff.unit!=='image'))throw new CreditAdmissionError('当前图片渠道缺少核实的按张计价',503);
  const perUnit=tokenBilled?0:billing.kind==='image'&&!billing.byok?Number(imageTariff!.unitPrice):unitPrice(billing.kind,billing.model,billing.byok??false);
  if(!Number.isFinite(perUnit)||perUnit<0)throw new CreditAdmissionError('服务计价无效',503);
  const cap=tariff?usageCny({input:inputBound,output:outputBound,cached:0,written:0},reservationPrice(tariff,inputBound)):
    usageCny({input:quantity*1_000_000,output:0,cached:0,written:0},{input:perUnit,cachedInput:perUnit,output:0});
  const call = allocateCall(cap, billing.model);
  const admission = await reserveCredit(call.userId, call.key, cap, {
    ...call.metadata, kind: billing.kind, priceSnapshot: tariff ?? imageTariff ?? { perUnit, unit: "request", source: "operator-explicit-service-tariff" }, provider,
    creditsPerCny: process.env.ECOSYSTEM_CREDITS_PER_CNY || "1",
  });
  if (init.signal?.aborted) { await cancelCredit(admission); throw init.signal.reason; }
  // Transport failures are ambiguous and deliberately leave their reservation held.
  const response = await fetch(url, init);
  if (!response.ok) {
    if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) await cancelCredit(admission);
    return response;
  }
  const data = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (!data) throw new CreditAdmissionError("服务未返回可核验结果，账目待核对", 503);
  let actualMicrocredits: number;
  if (tariff) {
    const raw = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : {};
    const usage = measuredTokens(inputOnly ? { ...raw, prompt_tokens: raw.prompt_tokens ?? raw.input_tokens ?? raw.total_tokens, output_tokens: 0 } : raw);
    if (!usage) throw new CreditAdmissionError("服务未返回用量，预留额度待核对", 503);
    actualMicrocredits = usageMicrocredits(usage, tierPrice(tariff,usage.input),Number(admission.metadata.creditsPerCny));
  } else {
    const units = billing.actualUnits ? billing.actualUnits(data) : quantity;
    if (!Number.isSafeInteger(units) || units < 0 || units > quantity) throw new CreditAdmissionError("服务计量不一致，账目待核对", 503);
    if (billing.kind === "image" && units === 0) throw new CreditAdmissionError("没有可核验的图片结果，额度待核对", 503);
    // One million synthetic pricing units convert a per-request price without float multiplication.
    actualMicrocredits = usageMicrocredits({ input: units * 1_000_000, output: 0, cached: 0, written: 0 }, { input: perUnit, cachedInput: perUnit, output: 0 },Number(admission.metadata.creditsPerCny));
  }
  await settleMicrocredits(admission, actualMicrocredits);
  return response;
}
