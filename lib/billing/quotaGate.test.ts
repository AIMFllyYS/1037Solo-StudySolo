import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  PLATFORM_QUOTA_EXHAUSTED_MESSAGE,
  QUOTA_UNAVAILABLE_CODE,
  QUOTA_UNAVAILABLE_STATUS,
  TIER_QUOTA_CNY,
  assertQuotaAvailable,
  isQuotaServiceUnconfigured,
  ledgerRowCountsTowardPool,
  loadQuotaSnapshot,
  rollQuotaPeriod,
  setQuotaGateTestDeps,
  sumGrantCap,
  sumLedgerUsed,
  type QuotaGrantRow,
  type QuotaLedgerRow,
  type QuotaStore,
  type QuotaUserRow,
} from "./quotaGate.ts";

afterEach(() => {
  setQuotaGateTestDeps(null);
});

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = new Date("2026-09-13T00:00:00.000Z");

function memoryStore(init: {
  user: QuotaUserRow;
  grants?: QuotaGrantRow[];
  ledger?: QuotaLedgerRow[];
}): QuotaStore & { saved?: { start: string; end: string } } {
  const store: QuotaStore & { saved?: { start: string; end: string } } = {
    async getUser() {
      return init.user;
    },
    async savePeriod(_userId, period) {
      store.saved = { start: period.start.toISOString(), end: period.end.toISOString() };
      init.user.period_start = period.start.toISOString();
      init.user.period_end = period.end.toISOString();
    },
    async listGrants() {
      return init.grants ?? [];
    },
    async listLedger() {
      return init.ledger ?? [];
    },
  };
  return store;
}

test("历史 byok 主模型行不计入任何池，平台侧开销计入 byok", () => {
  assert.equal(
    ledgerRowCountsTowardPool({
      pool: "byok",
      kind: "llm",
      cost_cny: 1.2,
      meta: { source: "chat-main" },
    }),
    null,
  );
  assert.equal(
    ledgerRowCountsTowardPool({
      pool: "byok",
      kind: "embedding",
      cost_cny: 0.001,
      meta: { source: "embedding" },
    }),
    "byok",
  );
  assert.equal(
    ledgerRowCountsTowardPool({
      pool: "platform",
      kind: "llm",
      cost_cny: 0.4,
      meta: { source: "chat-main" },
    }),
    "platform",
  );
});

test("额度聚合按当前周期 grants 之和，缺省回落到档位定额", () => {
  const period = {
    start: new Date("2026-09-01T00:00:00.000Z"),
    end: new Date("2026-10-01T00:00:00.000Z"),
  };
  const grants: QuotaGrantRow[] = [
    {
      pool: "platform",
      tier: "plus",
      amount_cny: 70,
      period_start: period.start.toISOString(),
      period_end: period.end.toISOString(),
    },
    {
      pool: "platform",
      tier: "free",
      amount_cny: 7,
      period_start: period.start.toISOString(),
      period_end: period.end.toISOString(),
    },
  ];
  assert.equal(sumGrantCap(grants, period, "platform", "plus"), 70);
  assert.equal(sumGrantCap([], period, "platform", "free"), TIER_QUOTA_CNY.free);
  assert.equal(TIER_QUOTA_CNY.plus, 70);
  assert.equal(TIER_QUOTA_CNY.pro, 700);
});

test("滚动 30 天：过期窗口按用户锚点前进，旧账不计入", async () => {
  const start = new Date("2026-07-15T00:00:00.000Z");
  const end = new Date("2026-08-14T00:00:00.000Z");
  const rolled = rollQuotaPeriod({ start, end }, NOW);
  assert.equal(rolled.rolled, true);
  assert.ok(rolled.period.start.getTime() <= NOW.getTime());
  assert.ok(rolled.period.end.getTime() > NOW.getTime());
  assert.equal(rolled.period.end.getTime() - rolled.period.start.getTime(), 30 * 24 * 60 * 60 * 1000);

  const store = memoryStore({
    user: {
      id: USER,
      tier: "free",
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    },
    ledger: [
      { pool: "platform", kind: "llm", cost_cny: 7, meta: { source: "chat-main" } },
    ],
  });
  store.listLedger = async (_userId, period) => {
    if (period.start.getTime() === start.getTime()) {
      return [{ pool: "platform", kind: "llm", cost_cny: 7, meta: { source: "chat-main" } }];
    }
    return [];
  };
  setQuotaGateTestDeps({ store, now: () => NOW });
  const snapshot = await loadQuotaSnapshot(USER);
  assert.ok(snapshot);
  assert.equal(snapshot.rolled, true);
  assert.equal(snapshot.used.platform, 0);
  assert.equal(snapshot.remaining.platform, 7);
});

test("共享额度耗尽时平台和 BYOK 开销均拒绝", async () => {
  const period = {
    start: new Date("2026-09-01T00:00:00.000Z"),
    end: new Date("2026-10-01T00:00:00.000Z"),
  };
  setQuotaGateTestDeps({
    now: () => new Date("2026-09-10T00:00:00.000Z"),
    store: memoryStore({
      user: {
        id: USER,
        tier: "free",
        period_start: period.start.toISOString(),
        period_end: period.end.toISOString(),
      },
      grants: [
        {
          pool: "platform",
          tier: "free",
          amount_cny: 7,
          period_start: period.start.toISOString(),
          period_end: period.end.toISOString(),
        },
      ],
      ledger: [{ pool: "platform", kind: "llm", cost_cny: 7, meta: { source: "chat-main" } }],
    }),
  });
  const blocked = await assertQuotaAvailable({ userId: USER, pool: "platform" });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.match(blocked.error, /生态共享/);
    assert.equal(blocked.error, PLATFORM_QUOTA_EXHAUSTED_MESSAGE);
    assert.equal(blocked.status, 402);
  }
  const byokMain = await assertQuotaAvailable({ userId: USER, pool: null });
  assert.equal(byokMain.ok, false);
});

test("额度查询失败不放行：返回 503，不能把故障当成额度充足", async () => {
  const broken: QuotaStore = {
    async getUser() {
      throw new Error("fetch failed: ECONNRESET");
    },
    async savePeriod() {},
    async listGrants() {
      return [];
    },
    async listLedger() {
      return [];
    },
  };
  setQuotaGateTestDeps({ store: broken, now: () => NOW });
  const decision = await assertQuotaAvailable({ userId: USER, pool: "platform" });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.status, QUOTA_UNAVAILABLE_STATUS);
    assert.equal(decision.code, QUOTA_UNAVAILABLE_CODE);
  }
});

test("未配置额度服务也必须拒绝", async () => {
  const unconfigured: QuotaStore = {
    async getUser() {
      throw new Error("Need SUPABASE_SERVICE_ROLE_KEY");
    },
    async savePeriod() {},
    async listGrants() {
      return [];
    },
    async listLedger() {
      return [];
    },
  };
  setQuotaGateTestDeps({ store: unconfigured, now: () => NOW });
  const decision = await assertQuotaAvailable({ userId: USER, pool: "platform" });
  assert.equal(decision.ok, false);
  assert.equal(isQuotaServiceUnconfigured(new Error("Need SUPABASE_SERVICE_ROLE_KEY")), true);
  assert.equal(isQuotaServiceUnconfigured(new Error("fetch failed")), false);
});

test("无 userId 拒绝，不能以 proxy 为由省略身份", async () => {
  const open = await assertQuotaAvailable({ userId: null, pool: "platform" });
  assert.equal(open.ok, false);
});

test("sumLedgerUsed 排除历史错 pool 的 BYOK 主模型", () => {
  const rows: QuotaLedgerRow[] = [
    { pool: "byok", kind: "llm", cost_cny: 12, meta: { source: "chat-main" } },
    { pool: "byok", kind: "web-search", cost_cny: 0.002, meta: { source: "webSearch" } },
    { pool: "platform", kind: "llm", cost_cny: 1.5, meta: { source: "chat-main" } },
  ];
  assert.equal(sumLedgerUsed(rows, "byok"), 0.002);
  assert.equal(sumLedgerUsed(rows, "platform"), 1.5);
});
