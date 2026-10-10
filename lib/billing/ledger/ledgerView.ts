/**
 * 看板与账本的展示层：金额只认已落库的 cost_cny，不用当前模型单价重算历史。
 */

import { getModelInfoWithCustom, type CustomApiGroup } from "@/lib/ai/models";
import {
  getProviderCategory,
  type BillingRecord,
  type BillingRecordType,
} from "@/lib/stores/billing";

export const DEFAULT_USD_CNY_RATE = 7;

export interface UsageLedgerViewRow {
  id: string;
  occurredAt: string;
  sessionId: string | null;
  kind: string;
  selectedModelId: string | null;
  actualModelId: string | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  imageCount: number;
  costCny: number;
  route: string;
}

export interface SessionLedgerSummary {
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** 本会话有缓存命中的计费笔数。 */
  cacheHitCount: number;
  /** 命中笔数 / 本会话计费笔数；无记录时为 0。 */
  cacheHitRate: number;
  turnCount: number;
  costCny: number;
  lastTurn: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    costCny: number;
  };
}

const EMPTY_TURN = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costCny: 0 };

export function asFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function resolveUsdCnyRate(rate: unknown): number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_CNY_RATE;
}

export function costCnyToUsd(costCny: number, rate: unknown = DEFAULT_USD_CNY_RATE): number {
  return costCny / resolveUsdCnyRate(rate);
}

export function toUsageLedgerViewRow(raw: Record<string, unknown>): UsageLedgerViewRow {
  const occurred = raw.occurred_at ?? raw.occurredAt;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : "",
    occurredAt: typeof occurred === "string" ? occurred : "",
    sessionId: typeof raw.session_id === "string" ? raw.session_id : typeof raw.sessionId === "string" ? raw.sessionId : null,
    kind: typeof raw.kind === "string" ? raw.kind : "llm",
    selectedModelId:
      typeof raw.selected_model_id === "string"
        ? raw.selected_model_id
        : typeof raw.selectedModelId === "string"
          ? raw.selectedModelId
          : null,
    actualModelId:
      typeof raw.actual_model_id === "string"
        ? raw.actual_model_id
        : typeof raw.actualModelId === "string"
          ? raw.actualModelId
          : null,
    promptTokens: asFiniteNumber(raw.prompt_tokens ?? raw.promptTokens),
    completionTokens: asFiniteNumber(raw.completion_tokens ?? raw.completionTokens),
    cachedTokens: asFiniteNumber(raw.cached_tokens ?? raw.cachedTokens),
    imageCount: asFiniteNumber(raw.image_count ?? raw.imageCount),
    costCny: asFiniteNumber(raw.cost_cny ?? raw.costCny),
    route: typeof raw.route === "string" ? raw.route : "",
  };
}

export function ledgerViewToBillingRecord(
  row: UsageLedgerViewRow,
  customGroups: CustomApiGroup[] = [],
): BillingRecord {
  const modelId = row.actualModelId || row.selectedModelId || "";
  const info = modelId ? getModelInfoWithCustom(modelId, customGroups) : undefined;
  const type: BillingRecordType = row.kind === "image" ? "image" : "chat";
  const ts = row.occurredAt ? Date.parse(row.occurredAt) : Date.now();
  return {
    id: row.id || crypto.randomUUID(),
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    modelId,
    modelLabel: info?.label || modelId,
    providerCategory: modelId ? getProviderCategory(modelId, customGroups) : "unknown",
    type,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    cachedTokens: row.cachedTokens,
    totalTokens: row.promptTokens + row.completionTokens,
    imageCount: row.imageCount > 0 ? row.imageCount : undefined,
    cost: row.costCny,
    sessionId: row.sessionId ?? "",
  };
}

export function billingRecordsFromLedger(
  rows: UsageLedgerViewRow[],
  customGroups: CustomApiGroup[] = [],
): BillingRecord[] {
  return rows.map((row) => ledgerViewToBillingRecord(row, customGroups));
}

/** 用来对齐「本地乐观行」和「服务端行」：不计 modelId（actual 可能与 selected 不同）。 */
export function billingRecordFingerprint(
  r: Pick<BillingRecord, "sessionId" | "type" | "promptTokens" | "completionTokens" | "cachedTokens" | "imageCount">,
): string {
  return [
    r.sessionId,
    r.type,
    r.promptTokens ?? 0,
    r.completionTokens ?? 0,
    r.cachedTokens ?? 0,
    r.imageCount ?? 0,
  ].join("|");
}

/**
 * 服务端台账为准。本地乐观行按指纹 1:1 消费：服务端同指纹出现 N 次，
 * 只能消掉 N 条本地同行（已回读、UUID 可能不同），多出来的乐观行保留。
 * 避免切会话刷新冲掉尚未读回的第二笔同 token 记录，也不因 UUID 不同重复计。
 */
export function mergeLedgerWithLocal(
  server: readonly BillingRecord[],
  local: readonly BillingRecord[],
): BillingRecord[] {
  const serverIds = new Set(server.map((r) => r.id));
  const remainingFps = new Map<string, number>();
  for (const r of server) {
    const fp = billingRecordFingerprint(r);
    remainingFps.set(fp, (remainingFps.get(fp) ?? 0) + 1);
  }
  const extras = local.filter((r) => {
    if (serverIds.has(r.id)) return false;
    const fp = billingRecordFingerprint(r);
    const remaining = remainingFps.get(fp) ?? 0;
    if (remaining > 0) {
      remainingFps.set(fp, remaining - 1);
      return false;
    }
    return true;
  });
  return [...server, ...extras].sort((a, b) => b.timestamp - a.timestamp);
}

/** 按会话汇总已入账记录。换模型不会改写 cost（只读 cost 字段）。 */
export function summarizeSessionLedger(
  records: ReadonlyArray<Pick<BillingRecord, "sessionId" | "promptTokens" | "completionTokens" | "cachedTokens" | "cost" | "timestamp">>,
  sessionId: string | null | undefined,
): SessionLedgerSummary {
  const sid = sessionId ?? "";
  const rows = sid ? records.filter((r) => r.sessionId === sid) : [];
  const last = rows.reduce<(typeof rows)[number] | undefined>((best, row) => {
    if (!best || row.timestamp > best.timestamp) return row;
    return best;
  }, undefined);
  const cacheHitCount = rows.filter((r) => (r.cachedTokens ?? 0) > 0).length;
  return {
    sessionId: sid,
    promptTokens: rows.reduce((n, r) => n + (r.promptTokens ?? 0), 0),
    completionTokens: rows.reduce((n, r) => n + (r.completionTokens ?? 0), 0),
    cachedTokens: rows.reduce((n, r) => n + (r.cachedTokens ?? 0), 0),
    cacheHitCount,
    cacheHitRate: rows.length > 0 ? cacheHitCount / rows.length : 0,
    turnCount: rows.length,
    costCny: rows.reduce((n, r) => n + r.cost, 0),
    lastTurn: last
      ? {
          promptTokens: last.promptTokens ?? 0,
          completionTokens: last.completionTokens ?? 0,
          cachedTokens: last.cachedTokens ?? 0,
          costCny: last.cost,
        }
      : { ...EMPTY_TURN },
  };
}

export function filterLedgerByRange<T extends { timestamp: number }>(
  records: readonly T[],
  range: "7d" | "30d" | "all",
  now = Date.now(),
): T[] {
  if (range === "all") return [...records];
  const days = range === "7d" ? 7 : 30;
  return records.filter((r) => (now - r.timestamp) / (1000 * 60 * 60 * 24) <= days);
}
