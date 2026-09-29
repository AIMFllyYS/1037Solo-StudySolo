import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  nextMembershipPeriod,
  normalizeRedeemCode,
  publicRedeemMessage,
  redeemCodeForUser,
  setRedeemTestDeps,
  REDEEM_PUBLIC_ERROR,
  type RedeemCodeRow,
  type RedeemStore,
  type RedeemUserRow,
} from "./redeemCode.ts";

afterEach(() => {
  setRedeemTestDeps(null);
});

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = new Date("2026-09-13T00:00:00.000Z");

function memoryRedeem(init: {
  codes: RedeemCodeRow[];
  user: RedeemUserRow;
}): RedeemStore & {
  redemptions: string[];
  grants: Array<{ pool: string; tier: string; amountCny: number }>;
  user: RedeemUserRow;
} {
  const redemptions: string[] = [];
  const grants: Array<{ pool: string; tier: string; amountCny: number }> = [];
  const store: RedeemStore & {
    redemptions: string[];
    grants: typeof grants;
    user: RedeemUserRow;
  } = {
    redemptions,
    grants,
    user: init.user,
    async findCode(code) {
      return init.codes.find((row) => row.code === code) ?? null;
    },
    async getUser() {
      return store.user;
    },
    async hasRedemption(codeId, userId) {
      return redemptions.includes(`${codeId}:${userId}`);
    },
    async insertRedemption(codeId, userId) {
      const key = `${codeId}:${userId}`;
      if (redemptions.includes(key)) return "duplicate";
      redemptions.push(key);
      return "ok";
    },
    async incrementUsedCount(codeId, maxUses) {
      const row = init.codes.find((c) => c.id === codeId);
      if (!row || row.used_count >= maxUses) return false;
      row.used_count += 1;
      return true;
    },
    async applyUser(_userId, patch) {
      store.user = {
        ...store.user,
        tier: patch.tier,
        period_start: patch.periodStart.toISOString(),
        period_end: patch.periodEnd.toISOString(),
      };
    },
    async insertGrant(row) {
      grants.push({ pool: row.pool, tier: row.tier, amountCny: row.amountCny });
    },
  };
  return store;
}

test("同档叠加续期，跨档升级保留剩余天数", () => {
  const now = NOW;
  const stacked = nextMembershipPeriod({
    currentTier: "plus",
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    codeTier: "plus",
    months: 1,
    now,
  });
  assert.equal(stacked.tier, "plus");
  assert.equal(stacked.periodEnd.toISOString(), "2026-10-31T00:00:00.000Z");

  const upgraded = nextMembershipPeriod({
    currentTier: "free",
    periodStart: new Date("2026-09-01T00:00:00.000Z"),
    periodEnd: new Date("2026-09-23T00:00:00.000Z"),
    codeTier: "plus",
    months: 1,
    now,
  });
  assert.equal(upgraded.tier, "plus");
  assert.equal(upgraded.periodStart.toISOString(), now.toISOString());
  const remaining = new Date("2026-09-23T00:00:00.000Z").getTime() - now.getTime();
  assert.equal(upgraded.periodEnd.getTime(), now.getTime() + remaining + 30 * 24 * 60 * 60 * 1000);
});

test("有效码核销改变档位与周期；超 max_uses 与重复核销被拒", async () => {
  const store = memoryRedeem({
    user: {
      id: USER,
      tier: "free",
      period_start: "2026-09-01T00:00:00.000Z",
      period_end: "2026-10-01T00:00:00.000Z",
    },
    codes: [
      {
        id: "code-plus",
        code: "PLUS-1",
        tier: "plus",
        months: 1,
        max_uses: 1,
        used_count: 0,
        expires_at: null,
      },
      {
        id: "code-spent",
        code: "SPENT",
        tier: "pro",
        months: 1,
        max_uses: 1,
        used_count: 1,
        expires_at: null,
      },
    ],
  });
  setRedeemTestDeps({ store, now: () => NOW });

  const ok = await redeemCodeForUser(USER, "PLUS-1");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.tier, "plus");
    assert.equal(store.user.tier, "plus");
  }
  assert.equal(store.grants.length, 2);
  assert.deepEqual(
    store.grants.map((g) => g.pool).sort(),
    ["byok", "platform"],
  );

  const again = await redeemCodeForUser(USER, "PLUS-1");
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.errorCode, "already_redeemed");

  const spent = await redeemCodeForUser(USER, "SPENT");
  assert.equal(spent.ok, false);
  if (!spent.ok) assert.equal(spent.errorCode, "max_uses");

  const missing = await redeemCodeForUser(USER, "NO-SUCH");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errorCode, "invalid");
  assert.equal(publicRedeemMessage("invalid"), REDEEM_PUBLIC_ERROR);
  assert.equal(publicRedeemMessage("max_uses"), REDEEM_PUBLIC_ERROR);
  assert.equal(publicRedeemMessage("already_redeemed"), REDEEM_PUBLIC_ERROR);
  assert.equal(normalizeRedeemCode("  ABC  "), "ABC");
});


test("central redemption retains canonical tiers, retry status and lifetime expiry", async () => {
  const { centralRedeemResult } = await import("./redeemCode.ts");
  const kept = centralRedeemResult({ status: "higher_tier_kept", tier: "ultra", tier_expires_at: "infinity", is_student_verified: true });
  assert.equal(kept.tier, "ultra"); assert.equal(kept.lifetime, true); assert.equal(kept.periodEnd, null);
  const retry = centralRedeemResult({ status: "already_redeemed", tier: "pro_plus", tier_expires_at: "2026-11-01T00:00:00Z" });
  assert.equal(retry.status, "already_redeemed"); assert.equal(retry.tier, "pro_plus");
  assert.equal(retry.months, undefined); assert.equal(retry.periodStart, undefined);
  assert.throws(() => centralRedeemResult({ status: "paid", tier: "plus" }));
});
