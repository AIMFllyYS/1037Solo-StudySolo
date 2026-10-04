import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { loadQuotaSnapshot, setQuotaGateTestDeps, sharedWalletFields } from "./quotaGate.ts";
import { quotaViewSchema } from "./quotaView.ts";

const BALANCE = { available_microcredits: "12000000", held_microcredits: "2000000", charged_microcredits: "55000000" };
const MEMBERSHIP = { plan_id: "pro", monthly_microcredits: "20000000" };

test("sharedWalletFields lifts exact microcredit strings from raw RPC rows", () => {
  assert.deepEqual(sharedWalletFields(BALANCE, MEMBERSHIP), {
    wallet: BALANCE,
    monthlyMicrocredits: "20000000",
  });
});

test("sharedWalletFields accepts array-wrapped rows and numeric amounts", () => {
  const out = sharedWalletFields([{ ...BALANCE, charged_microcredits: 0 }], [MEMBERSHIP]);
  assert.equal(out.wallet?.charged_microcredits, "0");
  assert.equal(out.monthlyMicrocredits, "20000000");
});

test("missing rows yield no fields — never invented zeros", () => {
  assert.deepEqual(sharedWalletFields(null, null), {});
  assert.deepEqual(sharedWalletFields(BALANCE, { plan_id: "pro" }), { wallet: BALANCE });
  assert.deepEqual(sharedWalletFields({}, MEMBERSHIP), { monthlyMicrocredits: "20000000" });
});

test("a partial wallet row is omitted rather than half-trusted", () => {
  const out = sharedWalletFields({ available_microcredits: "12000000" }, MEMBERSHIP);
  assert.equal(out.wallet, undefined);
  assert.equal(out.monthlyMicrocredits, "20000000");
});

test("present-but-malformed amounts reject the snapshot", () => {
  for (const bad of ["abc", "12.5", "-5", "1e3"]) {
    assert.throws(() => sharedWalletFields({ ...BALANCE, available_microcredits: bad }, null), /Invalid central credit balance/);
    assert.throws(() => sharedWalletFields(BALANCE, { monthly_microcredits: bad }), /Invalid central credit balance/);
  }
});

test("digit strings above the safe-integer bound are rejected, not truncated", () => {
  const unsafe = String(Number.MAX_SAFE_INTEGER + 1);
  assert.throws(() => sharedWalletFields({ ...BALANCE, available_microcredits: unsafe }, null), /Invalid central credit balance/);
  assert.throws(() => sharedWalletFields(BALANCE, { monthly_microcredits: unsafe }), /Invalid central credit balance/);
});

const BASE_VIEW = {
  userId: "u1", tier: "pro", periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  platform: { cap: 70, used: 1, remaining: 69 }, byok: { cap: 70, used: 1, remaining: 69 },
};

test("quotaView accepts the optional wallet fields", () => {
  const view = quotaViewSchema.parse({ ...BASE_VIEW, sharedWallet: true, wallet: BALANCE, monthlyMicrocredits: "20000000" });
  assert.equal(view.wallet?.available_microcredits, "12000000");
  assert.equal(view.monthlyMicrocredits, "20000000");
});

test("quotaView stays backwards compatible without the new fields", () => {
  assert.doesNotThrow(() => quotaViewSchema.parse(BASE_VIEW));
  assert.doesNotThrow(() => quotaViewSchema.parse({ ...BASE_VIEW, sharedWallet: true, heldCny: 1.5 }));
});

test("quotaView rejects malformed microcredit strings", () => {
  assert.throws(() => quotaViewSchema.parse({ ...BASE_VIEW, wallet: { ...BALANCE, available_microcredits: "12.5" } }));
  assert.throws(() => quotaViewSchema.parse({ ...BASE_VIEW, monthlyMicrocredits: "-1" }));
  assert.throws(() => quotaViewSchema.parse({ ...BASE_VIEW, monthlyMicrocredits: String(Number.MAX_SAFE_INTEGER + 1) }));
});

test("quotaView safeParse never throws on regex-dirty amounts — it just fails", () => {
  for (const bad of ["abc", "12.5", "1e3", " 12 ", "0x10"]) {
    assert.equal(quotaViewSchema.safeParse({ ...BASE_VIEW, monthlyMicrocredits: bad }).success, false, bad);
    assert.equal(
      quotaViewSchema.safeParse({ ...BASE_VIEW, wallet: { ...BALANCE, held_microcredits: bad } }).success,
      false,
      `wallet ${bad}`,
    );
  }
  assert.equal(quotaViewSchema.safeParse({ ...BASE_VIEW, monthlyMicrocredits: "20000000" }).success, true);
});

/* ── Live shared snapshot: exact fields are required, never invented ── */

const PERIOD = { period_start: "2026-10-01T00:00:00Z", period_end: "2026-10-31T00:00:00Z" };

function rpcStub(over: { balance?: unknown; membership?: unknown; period?: unknown } = {}) {
  return async (name: string) => {
    if (name === "ensure_period_credits") return { data: "period" in over ? over.period : PERIOD, error: null };
    if (name === "credit_account_summary") return { data: "balance" in over ? over.balance : BALANCE, error: null };
    if (name === "ecosystem_entitlements") return { data: "membership" in over ? over.membership : MEMBERSHIP, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  };
}

afterEach(() => setQuotaGateTestDeps(null));

test("the live snapshot carries exact wallet strings, the configured grant and the RPC plan", async () => {
  setQuotaGateTestDeps({ rpc: rpcStub() });
  const snapshot = await loadQuotaSnapshot("u-live");
  assert.deepEqual(snapshot?.wallet, BALANCE);
  assert.equal(snapshot?.monthlyMicrocredits, "20000000");
  assert.equal(snapshot?.tier, "pro");
});

test("a live snapshot with a partial wallet row throws — no fabricated zeros", async () => {
  setQuotaGateTestDeps({ rpc: rpcStub({ balance: { available_microcredits: "12000000" } }) });
  await assert.rejects(() => loadQuotaSnapshot("u-partial"), /Shared credit summary unavailable/);
});

test("a live snapshot without the configured grant throws", async () => {
  setQuotaGateTestDeps({ rpc: rpcStub({ membership: { plan_id: "pro" } }) });
  await assert.rejects(() => loadQuotaSnapshot("u-nogrant"), /Shared credit summary unavailable/);
});

test("a live snapshot with an unsafe amount throws — no silent zero or truncation", async () => {
  setQuotaGateTestDeps({
    rpc: rpcStub({ balance: { ...BALANCE, held_microcredits: String(Number.MAX_SAFE_INTEGER + 1) } }),
  });
  await assert.rejects(() => loadQuotaSnapshot("u-unsafe"), /Invalid central credit balance/);
});

test("a live snapshot with a malformed or reversed period fails closed", async () => {
  for (const period of [
    { ...PERIOD, period_start: null },
    { ...PERIOD, period_end: null },
    { ...PERIOD, period_start: true },
    { ...PERIOD, period_start: 0 }, // new Date(0) is valid — the string requirement is what rejects it
    { period_start: "2026-10-31T00:00:00Z", period_end: "2026-10-01T00:00:00Z" },
    { period_start: "not a date", period_end: "2026-10-01T00:00:00Z" },
    null,
  ]) {
    setQuotaGateTestDeps({ rpc: rpcStub({ period }) });
    await assert.rejects(
      () => loadQuotaSnapshot(`u-badperiod-${JSON.stringify(period)?.length ?? "x"}`),
      /Shared allowance period unavailable/,
      JSON.stringify(period),
    );
  }
});
