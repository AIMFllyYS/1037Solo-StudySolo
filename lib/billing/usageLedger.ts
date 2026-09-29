/**
 * Provider detail evidence in ss_usage_ledger; shared credit_ledger is the financial authority.
 * Actual charging is performed by upfront providerAdmission/billableFetch, never by this best-effort detail insert.
 * 主聊天走 settleChatUsage；卫星路由 / 工具侧车走 settleUsage。
 * 0/0 不落行；reasoning / cache-write 进列并参与计价。
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { extractAccessToken, verifySupabaseAccessToken, type VerifyAccessToken } from "@/lib/auth/aiGate";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { getModelInfo, getModelInfoWithCustom, type CustomApiGroup } from "@/lib/ai/models";
import { BYOK_OVERHEAD_CNY_PER_MILLION, type UsagePool } from "@/lib/billing/usagePool";
import { invalidateQuotaCache } from "@/lib/billing/quotaGate";
import type { UsageSummary } from "@/lib/types/chat";

export type { UsagePool };

const CHAT_USAGE_ROUTE = "/api/chat";
const USAGE_WAIT_MS = 3_000;

export type UsageKind = "llm" | "image" | "embedding" | "rerank" | "web-search" | "image-search";

interface MappedUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface LedgerContext {
  userId?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  route?: string;
  pool?: UsagePool;
  /** 这一轮主模型花的是谁的 key。侧车据此决定进 platform 还是 byok 池。 */
  mainUsedPlatformCredentials?: boolean;
  selectedModelId?: string | null;
  actualModelId?: string | null;
  customGroups?: CustomApiGroup[];
  skipInsert?: boolean;
  insert?: (row: UsageLedgerRow) => Promise<void>;
}

const ledgerContext = new AsyncLocalStorage<LedgerContext>();

export function runWithLedgerContext<T>(ctx: LedgerContext, fn: () => T): T {
  return ledgerContext.run(ctx, fn);
}

function getLedgerContext(): LedgerContext | undefined {
  return ledgerContext.getStore();
}

/**
 * 侧车用：本轮主模型是否走平台凭证。没有上下文（脚本、索引构建等）时按平台算，
 * 与接入前的行为一致。
 */
export function mainUsedPlatformCredentials(): boolean {
  return getLedgerContext()?.mainUsedPlatformCredentials !== false;
}

interface ModelPricing {
  input: number;
  cachedInput: number;
  output: number;
  cacheWrite?: number;
}

export interface UsageLedgerRow {
  user_id: string;
  pool: UsagePool;
  route: string;
  kind: UsageKind;
  selected_model_id: string | null;
  actual_model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  cache_write_tokens: number;
  image_count: number;
  cost_cny: number;
  session_id: string | null;
  request_id: string | null;
  meta: Record<string, unknown>;
}

interface SettleChatUsageInput {
  rawUsage: unknown;
  userId?: string | null;
  selectedModelId?: string | null;
  actualModelId?: string | null;
  customGroups?: CustomApiGroup[];
  pool?: UsagePool;
  sessionId?: string | null;
  requestId?: string | null;
  route?: string;
  aborted?: boolean;
  skipInsert?: boolean;
  insert?: (row: UsageLedgerRow) => Promise<void>;
}

interface SettleUsageInput {
  rawUsage?: unknown;
  userId?: string | null;
  headers?: { get(name: string): string | null };
  selectedModelId?: string | null;
  actualModelId?: string | null;
  customGroups?: CustomApiGroup[];
  pool?: UsagePool;
  sessionId?: string | null;
  requestId?: string | null;
  route?: string;
  kind?: UsageKind;
  aborted?: boolean;
  imageCount?: number;
  units?: number;
  meta?: Record<string, unknown>;
  source?: string;
  /** false 时只用显式 userId（主聊天 settle，避免误吃 ALS）。 */
  bindContext?: boolean;
  /** BYOK 主模型不落台账。 */
  skipInsert?: boolean;
  insert?: (row: UsageLedgerRow) => Promise<void>;
}

interface SettleChatUsageResult {
  usage: MappedUsage;
  summary: UsageSummary | undefined;
  row: UsageLedgerRow | null;
  recorded: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function optionalToken(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** 同时吃 LanguageModelUsage（扁平 + details）和 SDK mock 的嵌套 {total, cacheRead, …}。 */
export function mapLanguageModelUsage(raw: unknown): MappedUsage {
  const u = asRecord(raw) ?? {};
  const input = u.inputTokens;
  const output = u.outputTokens;
  const nestedInput = asRecord(input);
  const nestedOutput = asRecord(output);
  const inputDetails = asRecord(u.inputTokenDetails) ?? nestedInput ?? {};
  const outputDetails = asRecord(u.outputTokenDetails) ?? nestedOutput ?? {};

  const promptTokens = nestedInput
    ? tokenCount(nestedInput.total) ||
      tokenCount(nestedInput.noCache) + tokenCount(nestedInput.cacheRead) + tokenCount(nestedInput.cacheWrite)
    : tokenCount(input);
  const completionTokens = nestedOutput
    ? tokenCount(nestedOutput.total) || tokenCount(nestedOutput.text) + tokenCount(nestedOutput.reasoning)
    : tokenCount(output);
  const cachedTokens = tokenCount(inputDetails.cacheReadTokens) || tokenCount(nestedInput?.cacheRead);
  const cacheWriteTokens = tokenCount(inputDetails.cacheWriteTokens) || tokenCount(nestedInput?.cacheWrite);
  const reasoningTokens = tokenCount(outputDetails.reasoningTokens) || tokenCount(nestedOutput?.reasoning);
  const totalTokens = tokenCount(u.totalTokens) || promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
  };
}

export function hasBillableUsage(usage: MappedUsage): boolean {
  return (
    usage.promptTokens > 0 ||
    usage.completionTokens > 0 ||
    usage.cachedTokens > 0 ||
    usage.reasoningTokens > 0 ||
    usage.cacheWriteTokens > 0
  );
}

export function hasBillableLedger(input: {
  kind: UsageKind;
  usage: MappedUsage;
  imageCount?: number;
  units?: number;
}): boolean {
  const units = input.units ?? 0;
  const images = input.imageCount ?? 0;
  if (input.kind === "llm") return hasBillableUsage(input.usage);
  if (input.kind === "embedding" || input.kind === "rerank") {
    return hasBillableUsage(input.usage) || units > 0;
  }
  if (input.kind === "image") return images > 0 || hasBillableUsage(input.usage);
  return units > 0 || images > 0;
}

function toUsageSummary(usage: MappedUsage, actualModelId?: string | null): UsageSummary {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cachedTokens: usage.cachedTokens,
    totalTokens: usage.totalTokens,
    ...(actualModelId ? { actualModelId } : {}),
  };
}

/**
 * 落地端点的计价 id：apiModelId 能对上注册表时用它（GLM → mimo-v2.5），
 * 否则退回 registryId（自定义模型、同模型换供应商）。
 */
export function resolveActualBillingModelId(provider: {
  registryId: string;
  apiModelId: string;
  isCustom?: boolean;
}): string {
  if (!provider.isCustom && getModelInfo(provider.apiModelId)) return provider.apiModelId;
  return provider.registryId;
}

function roundCostCny(value: number): number {
  return Number(value.toFixed(6));
}

export function calcByokOverheadCny(usage: MappedUsage, units = 0): number {
  const tokens =
    usage.promptTokens +
    usage.completionTokens +
    usage.cachedTokens +
    usage.cacheWriteTokens +
    usage.reasoningTokens;
  const qty = tokens > 0 ? tokens : Math.max(0, units);
  return roundCostCny((qty * BYOK_OVERHEAD_CNY_PER_MILLION) / 1_000_000);
}

/**
 * ¥ / 百万 token。uncached 优先用 noCacheTokens；否则 prompt − cacheRead − cacheWrite。
 * reasoning 已含在 completion 里时不重复加；仅当 completion 为 0 时按 output 价计 reasoning。
 * DeepSeek 等注册了 cacheWrite 单价的模型，cache-write token 单独乘该单价。
 */
export function calcUsageCostCny(usage: MappedUsage, pricing?: ModelPricing, raw?: unknown): number {
  if (!pricing) return 0;
  const details = asRecord(asRecord(raw)?.inputTokenDetails) ?? asRecord(asRecord(raw)?.inputTokens);
  const noCache = optionalToken(details?.noCacheTokens) ?? optionalToken(details?.noCache);
  const uncached = noCache ?? Math.max(0, usage.promptTokens - usage.cachedTokens - usage.cacheWriteTokens);
  const outputTokens = usage.completionTokens > 0 ? usage.completionTokens : usage.reasoningTokens;
  const cacheWritePrice = pricing.cacheWrite ?? 0;
  return roundCostCny(
    (uncached * pricing.input +
      usage.cachedTokens * pricing.cachedInput +
      usage.cacheWriteTokens * cacheWritePrice +
      outputTokens * pricing.output) /
      1_000_000,
  );
}

export function buildUsageLedgerRow(input: {
  usage: MappedUsage;
  userId: string;
  selectedModelId?: string | null;
  actualModelId?: string | null;
  customGroups?: CustomApiGroup[];
  pool?: UsagePool;
  sessionId?: string | null;
  requestId?: string | null;
  route?: string;
  kind?: UsageKind;
  aborted?: boolean;
  imageCount?: number;
  units?: number;
  rawUsage?: unknown;
  meta?: Record<string, unknown>;
  source?: string;
}): UsageLedgerRow | null {
  const kind = input.kind ?? "llm";
  const imageCount = input.imageCount ?? (kind === "image-search" ? input.units ?? 0 : 0);
  if (!hasBillableLedger({ kind, usage: input.usage, imageCount, units: input.units })) return null;
  const actualModelId = input.actualModelId ?? input.selectedModelId ?? null;
  const selectedModelId = input.selectedModelId ?? null;
  const pricing = actualModelId
    ? getModelInfoWithCustom(actualModelId, input.customGroups ?? [])?.pricing
    : undefined;
  const pool = input.pool ?? "platform";
  const tokenCost = calcUsageCostCny(input.usage, pricing, input.rawUsage);
  const imageCost =
    kind === "image" && imageCount > 0 && pricing && tokenCost === 0
      ? roundCostCny(imageCount * pricing.output)
      : 0;
  const costCny =
    pool === "byok"
      ? calcByokOverheadCny(input.usage, input.units ?? imageCount)
      : tokenCost || imageCost;
  return {
    user_id: input.userId,
    pool,
    route: input.route ?? CHAT_USAGE_ROUTE,
    kind,
    selected_model_id: selectedModelId,
    actual_model_id: actualModelId,
    prompt_tokens: input.usage.promptTokens,
    completion_tokens: input.usage.completionTokens,
    cached_tokens: input.usage.cachedTokens,
    reasoning_tokens: input.usage.reasoningTokens,
    cache_write_tokens: input.usage.cacheWriteTokens,
    image_count: imageCount,
    cost_cny: costCny,
    session_id: input.sessionId ?? null,
    request_id: input.requestId ?? null,
    meta: {
      aborted: input.aborted === true,
      source: input.source ?? (typeof input.meta?.source === "string" ? input.meta.source : "chat-main"),
      ...(input.units != null ? { units: input.units } : {}),
      ...input.meta,
    },
  };
}

export async function awaitUsage(
  totalUsage: PromiseLike<unknown> | unknown,
  timeoutMs = USAGE_WAIT_MS,
): Promise<unknown | undefined> {
  try {
    return await Promise.race([
      Promise.resolve(totalUsage),
      new Promise<undefined>((resolve) => {
        setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } catch {
    return undefined;
  }
}

export async function resolveLedgerUserId(
  headers: { get(name: string): string | null },
  deps?: { verify?: VerifyAccessToken; allowTrustedProxyHeader?: boolean },
): Promise<string | null> {
  const token = extractAccessToken(headers);
  if (!token) return null;
  try {
    const user = await (deps?.verify ?? verifySupabaseAccessToken)(token);
    return user && !user.mfaRequired ? user.id : null;
  } catch {
    return null;
  }
}

async function defaultInsert(row: UsageLedgerRow): Promise<void> {
  const client = createServiceAuthClient();
  const { error } = await client.from("ss_usage_ledger").insert(row);
  if (error) throw new Error(error.message);
}

async function resolveSettleUserId(input: SettleUsageInput, ctx?: LedgerContext): Promise<string | null> {
  if (input.bindContext === false) return input.userId ?? null;
  if (typeof input.userId === "string" && input.userId) return input.userId;
  if (typeof ctx?.userId === "string" && ctx.userId) return ctx.userId;
  if (input.headers) return resolveLedgerUserId(input.headers);
  return input.userId ?? null;
}

function mergeLedgerFields<T>(explicit: T | undefined, fallback: T | undefined): T | undefined {
  return explicit !== undefined ? explicit : fallback;
}

/** 有消耗才写库。缺 user / 0 消耗 / 写库失败都不抛。卫星与侧车用此函数；主聊天用 settleChatUsage。 */
export async function settleUsage(input: SettleUsageInput): Promise<SettleChatUsageResult> {
  const ctx = input.bindContext === false ? undefined : getLedgerContext();
  const usage = mapLanguageModelUsage(input.rawUsage);
  const actualModelId = mergeLedgerFields(input.actualModelId, ctx?.actualModelId);
  const summary = hasBillableUsage(usage) ? toUsageSummary(usage, actualModelId) : undefined;
  const userId = await resolveSettleUserId(input, ctx);
  // 显式 false 能压过上下文里的 true：BYOK 主模型不入账，但同一轮里我们垫付的侧车要入账。
  const skipInsert = input.skipInsert ?? ctx?.skipInsert;
  if (!userId || skipInsert) {
    return { usage, summary, row: null, recorded: false };
  }
  const row = buildUsageLedgerRow({
    usage,
    userId,
    selectedModelId: mergeLedgerFields(input.selectedModelId, ctx?.selectedModelId),
    actualModelId,
    customGroups: mergeLedgerFields(input.customGroups, ctx?.customGroups),
    pool: mergeLedgerFields(input.pool, ctx?.pool),
    sessionId: mergeLedgerFields(input.sessionId, ctx?.sessionId),
    requestId: mergeLedgerFields(input.requestId, ctx?.requestId),
    route: input.route ?? ctx?.route ?? CHAT_USAGE_ROUTE,
    kind: input.kind ?? "llm",
    aborted: input.aborted,
    imageCount: input.imageCount,
    units: input.units,
    rawUsage: input.rawUsage,
    meta: input.meta,
    source: input.source ?? (typeof input.meta?.source === "string" ? input.meta.source : undefined),
  });
  if (!row) return { usage, summary, row: null, recorded: false };
  try {
    await (input.insert ?? ctx?.insert ?? defaultInsert)(row);
    invalidateQuotaCache(userId);
    return { usage, summary, row, recorded: true };
  } catch (error) {
    console.warn("[usage_ledger] insert failed:", error instanceof Error ? error.message : error);
    return { usage, summary, row, recorded: false };
  }
}

/** 有消耗才写库。缺 user / 0/0 / 写库失败都不抛，避免打断对话流。 */
export async function settleChatUsage(input: SettleChatUsageInput): Promise<SettleChatUsageResult> {
  return settleUsage({
    ...input,
    route: input.route ?? CHAT_USAGE_ROUTE,
    kind: "llm",
    source: "chat-main",
    bindContext: false,
  });
}

export async function withRequestLedger<T>(
  headers: { get(name: string): string | null },
  extra: Omit<LedgerContext, "userId">,
  fn: () => Promise<T> | T,
): Promise<T> {
  const userId = await resolveLedgerUserId(headers);
  return runWithLedgerContext({ ...extra, userId }, fn);
}
