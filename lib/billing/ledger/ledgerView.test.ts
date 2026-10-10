import assert from "node:assert/strict";
import { test } from "node:test";
import { getModelInfo } from "@/lib/ai/models";
import { isPaidAiApiPath } from "@/lib/auth/server/aiGate";
import {
  billingRecordsFromLedger,
  costCnyToUsd,
  DEFAULT_USD_CNY_RATE,
  filterLedgerByRange,
  ledgerViewToBillingRecord,
  mergeLedgerWithLocal,
  resolveUsdCnyRate,
  summarizeSessionLedger,
  toUsageLedgerViewRow,
} from "./ledgerView.ts";
import { readOwnUsageLedger, type UsageLedgerDbRow } from "./readUsageLedger.ts";

const MIMO = "mimo-v2.5";
const MIMO_PRO = "gpt-5.6-sol";
const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function dbRow(over: Partial<UsageLedgerDbRow> = {}): UsageLedgerDbRow {
  return {
    id: over.id ?? "11111111-1111-1111-1111-111111111111",
    occurred_at: over.occurred_at ?? "2026-09-12T00:00:00.000Z",
    session_id: over.session_id ?? "sess-a",
    kind: over.kind ?? "llm",
    selected_model_id: over.selected_model_id ?? MIMO,
    actual_model_id: over.actual_model_id ?? MIMO,
    prompt_tokens: over.prompt_tokens ?? 1_000,
    completion_tokens: over.completion_tokens ?? 500,
    cached_tokens: over.cached_tokens ?? 0,
    image_count: over.image_count ?? 0,
    cost_cny: over.cost_cny ?? 0.002,
    route: over.route ?? "/api/chat",
  };
}

function rec(over: Partial<ReturnType<typeof ledgerViewToBillingRecord>> = {}) {
  const base = ledgerViewToBillingRecord(toUsageLedgerViewRow(dbRow() as unknown as Record<string, unknown>));
  return { ...base, ...over };
}

test("台账映射用 cost_cny，不用当前模型单价重算", () => {
  const expensive = getModelInfo(MIMO_PRO)?.pricing;
  assert.ok(expensive);
  const recalculated = (1_000 * expensive.input + 500 * expensive.output) / 1_000_000;
  const row = toUsageLedgerViewRow(dbRow({ cost_cny: "0.002", actual_model_id: MIMO }) as unknown as Record<string, unknown>);
  const record = ledgerViewToBillingRecord(row);
  assert.equal(record.cost, 0.002);
  assert.notEqual(record.cost, recalculated);
  assert.ok(recalculated > record.cost);
});

test("换模型不改写历史：汇总只读已入账 cost", () => {
  const records = [
    rec({ sessionId: "s1", cost: 0.002, modelId: MIMO, timestamp: 1 }),
  ];
  const before = summarizeSessionLedger(records, "s1").costCny;
  const afterSwitch = summarizeSessionLedger(
    records.map((r) => ({ ...r, modelId: MIMO_PRO, modelLabel: "pro" })),
    "s1",
  ).costCny;
  assert.equal(before, 0.002);
  assert.equal(afterSwitch, 0.002);
});

test("切会话不丢计：A 的金额在切到 B 后仍在", () => {
  const records = [
    rec({ id: "a1", sessionId: "sess-a", cost: 0.01, timestamp: 10 }),
    rec({ id: "b1", sessionId: "sess-b", cost: 0.05, timestamp: 20 }),
  ];
  const viewingB = summarizeSessionLedger(records, "sess-b");
  const backToA = summarizeSessionLedger(records, "sess-a");
  assert.equal(viewingB.costCny, 0.05);
  assert.equal(backToA.costCny, 0.01);
  assert.equal(backToA.lastTurn.costCny, 0.01);
});

test("累计计费给出缓存命中次数与命中率", () => {
  const records = [
    rec({ sessionId: "s", cachedTokens: 20, promptTokens: 100, timestamp: 1 }),
    rec({ id: "2", sessionId: "s", cachedTokens: 0, promptTokens: 50, timestamp: 2 }),
    rec({ id: "3", sessionId: "other", cachedTokens: 99, timestamp: 3 }),
  ];
  const dash = summarizeSessionLedger(records, "s");
  assert.equal(dash.cacheHitCount, 1);
  assert.equal(dash.turnCount, 2);
  assert.equal(dash.cacheHitRate, 0.5);
});

test("看板与账本同一汇总函数，数字一致", () => {
  const records = [
    rec({ sessionId: "s", cost: 0.002, promptTokens: 100, completionTokens: 40, timestamp: 1 }),
    rec({ id: "2", sessionId: "s", cost: 0.003, promptTokens: 50, completionTokens: 10, timestamp: 2 }),
    rec({ id: "3", sessionId: "other", cost: 9, timestamp: 3 }),
  ];
  const dashboard = summarizeSessionLedger(records, "s");
  const book = records.filter((r) => r.sessionId === "s").reduce((n, r) => n + r.cost, 0);
  assert.equal(dashboard.costCny, book);
  assert.equal(dashboard.costCny, 0.005);
  assert.equal(dashboard.promptTokens, 150);
  assert.equal(dashboard.lastTurn.costCny, 0.003);
});

test("美元按可配置汇率，默认 7.00", () => {
  assert.equal(DEFAULT_USD_CNY_RATE, 7);
  assert.equal(resolveUsdCnyRate(undefined), 7);
  assert.equal(resolveUsdCnyRate(0), 7);
  assert.equal(costCnyToUsd(7, 7), 1);
  assert.equal(costCnyToUsd(14, undefined), 2);
});

test("时间窗过滤不改写金额", () => {
  const now = Date.parse("2026-09-12T00:00:00.000Z");
  const records = [
    rec({ id: "old", timestamp: now - 10 * 86400000, cost: 1 }),
    rec({ id: "new", timestamp: now - 2 * 86400000, cost: 0.5 }),
  ];
  const week = filterLedgerByRange(records, "7d", now);
  assert.equal(week.length, 1);
  assert.equal(week[0].cost, 0.5);
  assert.equal(filterLedgerByRange(records, "all", now).length, 2);
});

test("readOwnUsageLedger：未登录 401，已登录只返回自己的行", async () => {
  const denied = await readOwnUsageLedger({ get: () => null }, {}, { resolveUserId: async () => null });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 401);

  const rows = [
    dbRow({ id: "mine", cost_cny: 0.125 }),
    dbRow({ id: "other", session_id: "x", cost_cny: 99 }),
  ];
  const allowed = await readOwnUsageLedger(
    { get: () => "Bearer t" },
    {},
    {
      resolveUserId: async () => USER,
      listRows: async (userId) => {
        assert.equal(userId, USER);
        return [rows[0]];
      },
    },
  );
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.records.length, 1);
    assert.equal(allowed.records[0].costCny, 0.125);
    assert.equal(allowed.records[0].id, "mine");
  }
});

test("GET /api/usage 不走付费闸门，只读路径自带登录校验", async () => {
  assert.equal(isPaidAiApiPath("/api/usage"), false);
  const denied = await readOwnUsageLedger({ get: () => null });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 401);
});

test("mergeLedgerWithLocal：切会话刷新不丢未回读的本地行，也不因 UUID 不同重复计", () => {
  const server = [
    rec({ id: "srv-1", sessionId: "sess-a", cost: 0.002, promptTokens: 100, completionTokens: 40, timestamp: 1 }),
  ];
  const local = [
    rec({ id: "local-dup", sessionId: "sess-a", cost: 9.99, promptTokens: 100, completionTokens: 40, timestamp: 1 }),
    rec({ id: "local-new", sessionId: "sess-a", cost: 0.01, promptTokens: 80, completionTokens: 20, timestamp: 9 }),
  ];
  const merged = mergeLedgerWithLocal(server, local);
  assert.equal(merged.some((r) => r.id === "local-dup"), false);
  assert.equal(merged.some((r) => r.id === "local-new"), true);
  assert.equal(merged.find((r) => r.id === "srv-1")?.cost, 0.002);
  const dash = summarizeSessionLedger(merged, "sess-a");
  assert.equal(dash.costCny, 0.012);
});

test("mergeLedgerWithLocal：同会话两笔相同 token，一笔只在本地时按指纹 1:1 消费不丢计", () => {
  const server = [
    rec({ id: "srv-1", sessionId: "sess-a", cost: 0.002, promptTokens: 100, completionTokens: 40, timestamp: 1 }),
  ];
  const local = [
    rec({ id: "local-echo", sessionId: "sess-a", cost: 0.002, promptTokens: 100, completionTokens: 40, timestamp: 1 }),
    rec({ id: "local-only", sessionId: "sess-a", cost: 0.002, promptTokens: 100, completionTokens: 40, timestamp: 2 }),
  ];
  const merged = mergeLedgerWithLocal(server, local);
  assert.equal(merged.length, 2);
  assert.equal(merged.some((r) => r.id === "srv-1"), true);
  assert.equal(merged.some((r) => r.id === "local-echo"), false);
  assert.equal(merged.some((r) => r.id === "local-only"), true);
  const dash = summarizeSessionLedger(merged, "sess-a");
  assert.equal(dash.costCny, 0.004);
  assert.equal(dash.promptTokens, 200);
  assert.equal(dash.completionTokens, 80);
});

test("billingRecordsFromLedger 批量映射", () => {
  const rows = billingRecordsFromLedger([
    toUsageLedgerViewRow(dbRow({ id: "a", cost_cny: 0.1 }) as unknown as Record<string, unknown>),
    toUsageLedgerViewRow(dbRow({ id: "b", cost_cny: 0.2, session_id: "sess-b" }) as unknown as Record<string, unknown>),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(Number((rows[0].cost + rows[1].cost).toFixed(6)), 0.3);
});
