import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/auth/server/rateLimit";
import { setQuotaGateTestDeps } from "@/lib/billing/quota/quotaGate";
import {
  REDEEM_PUBLIC_ERROR,
  REDEEM_RATE_LIMIT_MAX,
  setRedeemTestDeps,
  type RedeemStore,
  type RedeemUserRow,
} from "@/lib/billing/quota/redeemCode";
import { POST } from "@/app/api/redeem/route";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

afterEach(() => {
  resetRateLimitStore();
  setQuotaGateTestDeps(null);
  setRedeemTestDeps(null);
});

function request(body: unknown, headers?: Record<string, string>) {
  return new Request("https://local.invalid/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function mockUser() {
  setQuotaGateTestDeps({
    resolveUserId: async () => USER,
  });
}

function storeWithCode(code: string, used = 0, max = 1): RedeemStore {
  const user: RedeemUserRow = {
    id: USER,
    tier: "free",
    period_start: "2026-09-01T00:00:00.000Z",
    period_end: "2026-10-01T00:00:00.000Z",
  };
  const row = {
    id: "c1",
    code,
    tier: "plus" as const,
    months: 1,
    max_uses: max,
    used_count: used,
    expires_at: null,
  };
  const redeemed = new Set<string>();
  return {
    async findCode(value) {
      return value === row.code ? { ...row } : null;
    },
    async getUser() {
      return user;
    },
    async hasRedemption(codeId, userId) {
      return redeemed.has(`${codeId}:${userId}`);
    },
    async insertRedemption(codeId, userId) {
      const key = `${codeId}:${userId}`;
      if (redeemed.has(key)) return "duplicate";
      redeemed.add(key);
      return "ok";
    },
    async incrementUsedCount() {
      if (row.used_count >= row.max_uses) return false;
      row.used_count += 1;
      return true;
    },
    async applyUser(_id, patch) {
      user.tier = patch.tier;
      user.period_start = patch.periodStart.toISOString();
      user.period_end = patch.periodEnd.toISOString();
    },
    async insertGrant() {},
  };
}

test("未登录核销 401，不泄漏码", async () => {
  const res = await POST(request({ code: "SECRET-CODE" }));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.doesNotMatch(body.error, /SECRET-CODE/);
});

test("无效码与超限码返回同一句，不回显是否存在", async () => {
  mockUser();
  setRedeemTestDeps({ store: storeWithCode("REAL", 1, 1) });
  const missing = await POST(request({ code: "NOPE" }));
  const spent = await POST(request({ code: "REAL" }));
  assert.equal(missing.status, 400);
  assert.equal(spent.status, 400);
  const a = (await missing.json()) as { error: string };
  const b = (await spent.json()) as { error: string };
  assert.equal(a.error, REDEEM_PUBLIC_ERROR);
  assert.equal(b.error, a.error);
  assert.doesNotMatch(JSON.stringify(a), /REAL|NOPE|plus|pro/);
});

test("有效码核销成功且响应不含码原文", async () => {
  mockUser();
  setRedeemTestDeps({ store: storeWithCode("PLUS-OK", 0, 1) });
  const res = await POST(request({ code: "PLUS-OK" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; tier: string; error?: string };
  assert.equal(body.ok, true);
  assert.equal(body.tier, "plus");
  assert.doesNotMatch(JSON.stringify(body), /PLUS-OK/);
});

test("核销接口复用 rateLimit 且更严", async () => {
  mockUser();
  setRedeemTestDeps({ store: storeWithCode("PLUS-OK", 0, 20) });
  let blocked = 0;
  for (let i = 0; i < REDEEM_RATE_LIMIT_MAX + 2; i += 1) {
    const res = await POST(request({ code: "NOPE" }));
    if (res.status === 429) blocked += 1;
  }
  assert.ok(blocked >= 1);
  assert.ok(REDEEM_RATE_LIMIT_MAX < 30);
});
