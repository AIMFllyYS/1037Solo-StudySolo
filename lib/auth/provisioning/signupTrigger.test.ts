import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  SIGNUP_GRANT_AMOUNT_CNY,
  SIGNUP_GRANT_SOURCE,
  SIGNUP_TRIGGER_FN,
  SIGNUP_TRIGGER_NAME,
  isAuthUserId,
  probeSignupEmail,
  verifySignupTriggerOnce,
} from "./signupTrigger.ts";

test("signup trigger constants match 0001_init handle_new_user", () => {
  assert.equal(SIGNUP_TRIGGER_NAME, "on_auth_user_created");
  assert.equal(SIGNUP_TRIGGER_FN, "handle_new_user");
  assert.equal(SIGNUP_GRANT_SOURCE, "signup");
  assert.equal(SIGNUP_GRANT_AMOUNT_CNY, 7);
  assert.equal(isAuthUserId("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isAuthUserId("not-a-uuid"), false);
  assert.match(probeSignupEmail(1), /@users\.invalid$/);

  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
  assert.match(sql, /create or replace function public\.handle_new_user\(\)/);
  assert.match(sql, /create trigger on_auth_user_created/);
  assert.match(sql, /values \(new\.id, 'platform', 'free', 7\.0000, v_start, v_end, 'signup'\)/);
});

test("verifySignupTriggerOnce asserts both rows then deletes the probe user", async () => {
  const deleted: string[] = [];
  const storeCalls: string[] = [];
  const proof = await verifySignupTriggerOnce(
    {
      async createUser(email) {
        assert.match(email, /@users\.invalid$/);
        return { id: "11111111-1111-4111-8111-111111111111" };
      },
      async deleteUser(id) {
        deleted.push(id);
      },
    },
    {
      async countAppUsers(userId) {
        storeCalls.push(`app_users:${userId}`);
        return 1;
      },
      async countQuotaGrants(userId) {
        storeCalls.push(`quota_grants:${userId}`);
        return 1;
      },
    },
    probeSignupEmail(42),
  );
  assert.equal(proof.appUsers, 1);
  assert.equal(proof.quotaGrants, 1);
  assert.equal(proof.cleanedUp, true);
  assert.deepEqual(deleted, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(storeCalls.length, 2);
});

test("verifySignupTriggerOnce still deletes when the trigger missed a row", async () => {
  const deleted: string[] = [];
  await assert.rejects(
    () =>
      verifySignupTriggerOnce(
        {
          async createUser() {
            return { id: "11111111-1111-4111-8111-111111111111" };
          },
          async deleteUser(id) {
            deleted.push(id);
          },
        },
        {
          async countAppUsers() {
            return 1;
          },
          async countQuotaGrants() {
            return 0;
          },
        },
        "issue61-trigger-miss@users.invalid",
      ),
    /quota_grants=0/,
  );
  assert.deepEqual(deleted, ["11111111-1111-4111-8111-111111111111"]);
});
