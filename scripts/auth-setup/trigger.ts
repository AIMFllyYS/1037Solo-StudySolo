import { resolveManagementAuthEnv } from "../../lib/auth/env.ts";

import { createServiceAuthClient } from "../../lib/auth/server/serviceClient.ts";

import { SIGNUP_GRANT_AMOUNT_CNY, SIGNUP_GRANT_SOURCE, isAuthUserId, probeSignupEmail, verifySignupTriggerOnce } from "../../lib/auth/provisioning/signupTrigger.ts";
import { createManagementApiExecutor } from "../../lib/db/migrate.ts";

function countFromRows(rows: Array<Record<string, unknown>>): number {
  const n = rows[0]?.n ?? rows[0]?.count;
  return Number(n ?? rows.length);
}

export async function cmdVerifyTrigger() {
  const mgmt = resolveManagementAuthEnv();
  const service = createServiceAuthClient();
  const sql = createManagementApiExecutor(mgmt);
  const email = probeSignupEmail();

  const proof = await verifySignupTriggerOnce(
    {
      async createUser(probeEmail) {
        const { data, error } = await service.auth.admin.createUser({
          email: probeEmail,
          email_confirm: true,
        });
        if (error || !data.user?.id) {
          throw new Error(error?.message ?? "admin.createUser returned no user");
        }
        return { id: data.user.id };
      },
      async deleteUser(id) {
        const { error } = await service.auth.admin.deleteUser(id);
        if (error) throw new Error(error.message);
      },
    },
    {
      async countAppUsers(userId) {
        if (!isAuthUserId(userId)) throw new Error("refusing non-UUID user id");
        return countFromRows(
          await sql.query(`select count(*)::int as n from public.app_users where id = '${userId}'`),
        );
      },
      async countQuotaGrants(userId) {
        if (!isAuthUserId(userId)) throw new Error("refusing non-UUID user id");
        const rows = await sql.query<{ n?: number; source?: string; amount_cny?: string }>(
          `select count(*)::int as n, min(source) as source, min(amount_cny)::text as amount_cny
           from public.quota_grants where user_id = '${userId}'`,
        );
        const row = rows[0];
        if (row?.source && row.source !== SIGNUP_GRANT_SOURCE) {
          throw new Error(`quota_grants.source=${row.source}`);
        }
        if (row?.amount_cny && Number(row.amount_cny) !== SIGNUP_GRANT_AMOUNT_CNY) {
          throw new Error(`quota_grants.amount_cny=${row.amount_cny}`);
        }
        return countFromRows(rows);
      },
    },
    email,
  );

  const leftover = await sql.query<{ n?: number; auth_users?: number; app_users?: number; quota_grants?: number }>(
    `select
       (select count(*)::int from auth.users where id = '${proof.userId}') as auth_users,
       (select count(*)::int from public.app_users where id = '${proof.userId}') as app_users,
       (select count(*)::int from public.quota_grants where user_id = '${proof.userId}') as quota_grants`,
  );
  const left = leftover[0] ?? {};

  console.log("signup trigger");
  console.log(`  email: ${proof.email}`);
  console.log(`  userId: ${proof.userId}`);
  console.log(`  appUsers: ${proof.appUsers}`);
  console.log(`  quotaGrants: ${proof.quotaGrants}`);
  console.log(`  cleanedUp: ${proof.cleanedUp}`);
  console.log(`  leftoverAuthUsers: ${left.auth_users ?? left.n ?? "?"}`);
  console.log(`  leftoverAppUsers: ${left.app_users ?? "?"}`);
  console.log(`  leftoverQuotaGrants: ${left.quota_grants ?? "?"}`);
  if (Number(left.auth_users) !== 0 || Number(left.app_users) !== 0 || Number(left.quota_grants) !== 0) {
    throw new Error("probe user leftover rows remain");
  }
}