/**
 * Shared wallet read gate. Each actual provider call additionally reserves atomically.
 * Legacy grant/period helpers remain for archival tests only; production never spends them.
 */

import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { optionalPaidContext } from "./paidContext";

import type { UsagePool } from "@/lib/billing/usagePool";

/** Legacy archive units only; membership_plans controls current grants. */
export const TIER_QUOTA_CNY = { free: 7, plus: 70, pro: 700 } as const;
export type UserTier = keyof typeof TIER_QUOTA_CNY;

export const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const QUOTA_CACHE_TTL_MS = 5_000;
export const QUOTA_EXHAUSTED_CODE = "quota_exhausted" as const;
export const QUOTA_EXHAUSTED_STATUS = 402 as const;
export const QUOTA_UNAVAILABLE_CODE = "quota_unavailable" as const;
export const QUOTA_UNAVAILABLE_STATUS = 503 as const;
export const QUOTA_UNAVAILABLE_MESSAGE =
  "额度服务暂时不可用，请稍后重试。为避免记错账，本次请求未发往模型。";

export const PLATFORM_QUOTA_EXHAUSTED_MESSAGE =
  "生态共享 AI 额度已用完，请到统一个人中心查看或补充额度。";
export const BYOK_QUOTA_EXHAUSTED_MESSAGE =
  "生态共享 AI 额度已用完，BYOK 平台开销也使用同一额度池。";

const OVERHEAD_KINDS = new Set(["embedding", "rerank", "web-search", "image-search"]);
const OVERHEAD_SOURCES = new Set([
  "chat-title",
  "webSearch",
  "imageSearch",
  "embedding",
  "rerank",
]);

export interface QuotaPeriod {
  start: Date;
  end: Date;
}

export interface QuotaSnapshot {
  userId: string;
  tier: UserTier | "pro_plus" | "ultra";
  sharedWallet?: boolean;
  heldCny?: number;
  period: QuotaPeriod;
  rolled: boolean;
  cap: Record<UsagePool, number>;
  used: Record<UsagePool, number>;
  remaining: Record<UsagePool, number>;
}

export type QuotaDecision =
  | { ok: true; snapshot: QuotaSnapshot | null }
  | {
      ok: false;
      status: typeof QUOTA_EXHAUSTED_STATUS | typeof QUOTA_UNAVAILABLE_STATUS;
      code: typeof QUOTA_EXHAUSTED_CODE | typeof QUOTA_UNAVAILABLE_CODE;
      error: string;
      pool: UsagePool;
    };

export interface QuotaGrantRow {
  pool: UsagePool;
  tier: string;
  amount_cny: number;
  period_start: string;
  period_end: string;
}

export interface QuotaLedgerRow {
  pool: UsagePool;
  kind: string;
  cost_cny: number;
  meta?: Record<string, unknown> | null;
}

export interface QuotaUserRow {
  id: string;
  tier: string;
  period_start: string;
  period_end: string;
}

export interface QuotaLedgerSum {
  platform: number;
  byok: number;
}

export interface QuotaStore {
  getUser(userId: string): Promise<QuotaUserRow | null>;
  savePeriod(userId: string, period: QuotaPeriod, tier?: UserTier): Promise<void>;
  listGrants(userId: string): Promise<QuotaGrantRow[]>;
  listLedger(userId: string, period: QuotaPeriod): Promise<QuotaLedgerRow[]>;
  sumLedger?(userId: string, period: QuotaPeriod): Promise<QuotaLedgerSum>;
}

export interface QuotaGateTestDeps {
  resolveUserId?: (headers: { get(name: string): string | null }) => Promise<string | null>;
  store?: QuotaStore;
  now?: () => Date;
}

let testDeps: QuotaGateTestDeps | null = null;

const snapshotCache = new Map<string, { at: number; snapshot: QuotaSnapshot }>();
const snapshotInflight = new Map<string, Promise<QuotaSnapshot | null>>();

export function setQuotaGateTestDeps(deps: QuotaGateTestDeps | null): void {
  testDeps = deps;
  snapshotCache.clear();
  snapshotInflight.clear();
}

export function invalidateQuotaCache(userId?: string | null): void {
  if (!userId) {
    snapshotCache.clear();
    snapshotInflight.clear();
    return;
  }
  snapshotCache.delete(userId);
  snapshotInflight.delete(userId);
}

export function quotaExhaustedMessage(pool: UsagePool): string {
  return pool === "byok" ? BYOK_QUOTA_EXHAUSTED_MESSAGE : PLATFORM_QUOTA_EXHAUSTED_MESSAGE;
}

export function quotaRejectedJson(decision: Extract<QuotaDecision, { ok: false }>): Response {
  return Response.json(
    { error: decision.error, code: decision.code, pool: decision.pool },
    { status: decision.status },
  );
}

/** 区分「没配 Supabase」与「配了但查不通」：both fail closed; exported classification retained for legacy tests. */
export function isQuotaServiceUnconfigured(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.startsWith("Need SUPABASE_") ||
    message.startsWith("Need NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    message.startsWith("SUPABASE_URL must be")
  );
}

export function isUserTier(value: string): value is UserTier {
  return value === "free" || value === "plus" || value === "pro";
}

export function asUserTier(value: string | null | undefined): UserTier {
  return value && isUserTier(value) ? value : "free";
}

export function addPeriodMs(from: Date, months: number): Date {
  return new Date(from.getTime() + months * PERIOD_MS);
}

export function rollQuotaPeriod(period: QuotaPeriod, now: Date): { period: QuotaPeriod; rolled: boolean } {
  let start = period.start;
  let end = period.end;
  let rolled = false;
  if (end.getTime() - start.getTime() <= 0) {
    end = addPeriodMs(start, 1);
  }
  while (now.getTime() >= end.getTime()) {
    start = end;
    end = addPeriodMs(start, 1);
    rolled = true;
  }
  return { period: { start, end }, rolled };
}

export function isPlatformOverheadRow(row: { kind: string; meta?: Record<string, unknown> | null }): boolean {
  if (OVERHEAD_KINDS.has(row.kind)) return true;
  const source = typeof row.meta?.source === "string" ? row.meta.source : "";
  return OVERHEAD_SOURCES.has(source);
}

/** 历史错 pool 行不改；主模型 BYOK（pool=byok 且非平台侧开销）不计入任何池。 */
export function ledgerRowCountsTowardPool(row: QuotaLedgerRow): UsagePool | null {
  if (row.meta && row.meta.countsTowardQuota === false) return null;
  if (isPlatformOverheadRow(row)) return row.pool;
  if (row.pool === "byok") return null;
  return "platform";
}

function grantOverlaps(grant: QuotaGrantRow, period: QuotaPeriod): boolean {
  const start = new Date(grant.period_start).getTime();
  const end = new Date(grant.period_end).getTime();
  return start < period.end.getTime() && end > period.start.getTime();
}

export function sumGrantCap(
  grants: QuotaGrantRow[],
  period: QuotaPeriod,
  pool: UsagePool,
  tier: UserTier,
): number {
  let sum = 0;
  for (const grant of grants) {
    if (grant.pool !== pool) continue;
    if (grant.tier !== tier) continue;
    if (!grantOverlaps(grant, period)) continue;
    const amount = Number(grant.amount_cny);
    if (Number.isFinite(amount) && amount > 0) sum += amount;
  }
  return sum > 0 ? sum : TIER_QUOTA_CNY[tier];
}

export function sumLedgerUsed(rows: QuotaLedgerRow[], pool: UsagePool): number {
  let sum = 0;
  for (const row of rows) {
    if (ledgerRowCountsTowardPool(row) !== pool) continue;
    const cost = Number(row.cost_cny);
    if (Number.isFinite(cost) && cost > 0) sum += cost;
  }
  return sum;
}

function defaultStore(): QuotaStore {
  throw new Error("Legacy local grants are archival only; use shared credit accounts");
}

async function loadSharedSnapshot(userId: string): Promise<QuotaSnapshot> {
  const client = createServiceAuthClient();
  const allowance = await client.rpc("ensure_period_credits", { p_user_id: userId });
  if (allowance.error) throw new Error("Shared allowance unavailable");
  const [balance, membership] = await Promise.all([
    client.rpc("credit_account_summary", { p_user_id: userId }),
    client.rpc("ecosystem_entitlements", { p_user_id: userId }),
  ]);
  if (balance.error || membership.error) throw new Error("Shared credit summary unavailable");
  const wallet = Array.isArray(balance.data) ? balance.data[0] : balance.data;
  const convert = (value: unknown) => {
    const number = Number(value ?? 0);
    const ratio = Number(process.env.ECOSYSTEM_CREDITS_PER_CNY || "1");
    if (!Number.isSafeInteger(number) || number < 0 || !Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid central credit balance");
    return number / 1_000_000 / ratio;
  };
  const available = convert(wallet?.available_microcredits), held = convert(wallet?.held_microcredits);
  const charged = convert(wallet?.charged_microcredits);
  const period = Array.isArray(allowance.data) ? allowance.data[0] : allowance.data;
  const start = new Date(period?.period_start), end = new Date(period?.period_end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Shared allowance period unavailable");
  const cap = available + held + charged;
  return { userId, tier: membership.data?.plan_id ?? "free", period: { start, end }, rolled: false,
    cap: { platform: cap, byok: cap }, used: { platform: charged, byok: charged },
    remaining: { platform: available, byok: available }, sharedWallet: true, heldCny: held };
}

function store(): QuotaStore {
  return testDeps?.store ?? defaultStore();
}

function nowDate(): Date {
  return testDeps?.now ? testDeps.now() : new Date();
}

/**
 * 仅限 proxy 付费路由（PAID_AI_API_PATHS）使用：那里 proxy 已验证 bearer，
 * 注入的 x-studyreview-user-id 是可信的，直接复用可省一次 Supabase 校验。
 * 非 proxy 名单上的路由请用 resolveSessionUserId。
 */
export async function resolveQuotaUserId(
  headers: { get(name: string): string | null },
): Promise<string | null> {
  if (testDeps?.resolveUserId) return testDeps.resolveUserId(headers);
  const { resolveLedgerUserId } = await import("@/lib/billing/usageLedger");
  return resolveLedgerUserId(headers, { allowTrustedProxyHeader: true });
}

/**
 * 账户类路由（quota / redeem / share / usage …，不在 proxy 付费名单上）的身份解析：
 * 永远验证 bearer/cookie token，不信任客户端自报的 x-studyreview-user-id。
 * proxy.ts 对每条 /api 请求都会剥掉该 header，这里再加一层纵深防御：
 * 万一哪天 proxy 配置被绕过，身份也不会被伪造 header 劫持。
 */
export async function resolveSessionUserId(
  headers: { get(name: string): string | null },
): Promise<string | null> {
  if (testDeps?.resolveUserId) return testDeps.resolveUserId(headers);
  const { resolveLedgerUserId } = await import("@/lib/billing/usageLedger");
  return resolveLedgerUserId(headers);
}

async function loadQuotaSnapshotFresh(userId: string): Promise<QuotaSnapshot | null> {
  if (!testDeps?.store) return loadSharedSnapshot(userId);
  const now = nowDate();
  const db = store();
  const user = await db.getUser(userId);
  if (!user) return null;

  const rolled = rollQuotaPeriod(
    { start: new Date(user.period_start), end: new Date(user.period_end) },
    now,
  );
  const tier = asUserTier(user.tier);
  if (rolled.rolled) {
    await db.savePeriod(userId, rolled.period);
    snapshotCache.delete(userId);
  }

  const [grants, used] = await Promise.all([
    db.listGrants(userId),
    db.sumLedger
      ? db.sumLedger(userId, rolled.period)
      : db.listLedger(userId, rolled.period).then((ledger) => ({
          platform: sumLedgerUsed(ledger, "platform"),
          byok: sumLedgerUsed(ledger, "byok"),
        })),
  ]);

  const cap = {
    platform: sumGrantCap(grants, rolled.period, "platform", tier),
    byok: sumGrantCap(grants, rolled.period, "byok", tier),
  };
  const snapshot: QuotaSnapshot = {
    userId,
    tier,
    period: rolled.period,
    rolled: rolled.rolled,
    cap,
    used,
    remaining: {
      platform: cap.platform - used.platform,
      byok: cap.byok - used.byok,
    },
  };
  snapshotCache.set(userId, { at: now.getTime(), snapshot });
  return snapshot;
}

export async function loadQuotaSnapshot(userId: string): Promise<QuotaSnapshot | null> {
  const cached = snapshotCache.get(userId);
  const now = nowDate();
  if (cached && now.getTime() - cached.at < QUOTA_CACHE_TTL_MS) return cached.snapshot;
  const pending = snapshotInflight.get(userId);
  if (pending) return pending;
  const next = loadQuotaSnapshotFresh(userId).finally(() => {
    snapshotInflight.delete(userId);
  });
  snapshotInflight.set(userId, next);
  return next;
}

/**
 * All operator usage and BYOK overhead share one wallet. Missing identity/config fails closed.
 */
export async function assertQuotaAvailable(input: {
  userId?: string | null;
  headers?: { get(name: string): string | null };
  pool: UsagePool | null;
}): Promise<QuotaDecision> {
  const pool = input.pool ?? "platform";
  const userId = optionalPaidContext()?.userId ?? input.userId ?? (input.headers ? await resolveQuotaUserId(input.headers) : null);
  if (!userId) return { ok: false, status: QUOTA_UNAVAILABLE_STATUS, code: QUOTA_UNAVAILABLE_CODE, error: "需要统一账号身份", pool };

  try {
    const snapshot = await loadQuotaSnapshot(userId);
    if (!snapshot) throw new Error("Shared account unavailable");
    if (snapshot.remaining[pool] <= 0) {
      return {
        ok: false,
        status: QUOTA_EXHAUSTED_STATUS,
        code: QUOTA_EXHAUSTED_CODE,
        error: quotaExhaustedMessage(pool),
        pool,
      };
    }
    return { ok: true, snapshot };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // 配了但查不通：必须拒。放行等于无限额度，而且这笔钱花出去还不会入账。
    console.error("[quota] 额度查询失败，拒绝本次请求:", detail);
    return {
      ok: false,
      status: QUOTA_UNAVAILABLE_STATUS,
      code: QUOTA_UNAVAILABLE_CODE,
      error: QUOTA_UNAVAILABLE_MESSAGE,
      pool,
    };
  }
}
