import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PersistentExecutionStore } from "./store.server";
const owner = "20000000-0000-4000-8000-000000000001", fingerprint = "a".repeat(64);
test("real development admission refuses an absent shared authority instead of opening a second file budget", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "development", CLOUD_SANDBOX_ENABLED: "true", CLOUD_SANDBOX_API_KEY: `fixture-${"a".repeat(32)}`, CLOUD_SANDBOX_TEMPLATE: "fixture", CLOUD_SANDBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") });
  delete process.env.CLOUD_SANDBOX_BUDGET_AUTHORITY;
  try { await assert.rejects(() => new PersistentExecutionStore().reserve(randomUUID(), owner, 300000, Date.now()+60000), /SANDBOX_BUDGET_NOT_RECONCILED/); }
  finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
test("candidate reconciled RPC enforces reviewed marker and unresolved capacity inside one PostgreSQL transaction", { timeout: 60000 }, async () => {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean); insert into auth.users values('${owner}');`);
    const fixtures = JSON.parse(await readFile(new URL("./fixtures/shared-migrations.json",import.meta.url),"utf8")).fixtures as { sql:string }[];
    await db.exec(fixtures[1].sql);
    await db.exec(await readFile(new URL("../../scripts/sandbox/sql/reconciled-budget-candidate.sql",import.meta.url),"utf8"));
    await db.exec("grant authenticated,service_role to postgres; set role authenticated");
    await assert.rejects(()=>db.query("select public.ss_agent_execution_reserve_reconciled(gen_random_uuid(),$1,300000,to_char(now() at time zone 'Asia/Shanghai','YYYY-MM'),'fixture-run',70000000,70000000,now()+interval '5 minutes',$2)",[owner,fingerprint]),/permission denied/);
    await db.exec("reset role; set role service_role");
    const reserve = (id:string, fp=fingerprint) => db.query<{ok:boolean}>("select public.ss_agent_execution_reserve_reconciled($1,$2,300000,to_char(now() at time zone 'Asia/Shanghai','YYYY-MM'),'fixture-run',70000000,70000000,now()+interval '5 minutes',$3) as ok",[id,owner,fp]);
    await assert.rejects(()=>reserve(randomUUID()),/budget_not_reconciled/);
    await db.query("insert into public.ss_agent_execution_budgets(period_key,reserved_micro_cny,cap_micro_cny) values($1,1800000,1800000)",[`legacy:${fingerprint}`]);
    const first=randomUUID(), second=randomUUID(); assert.equal((await reserve(first)).rows[0].ok,true);
    assert.equal((await reserve(first)).rows[0].ok,true);
    await db.query("update public.ss_agent_execution_reservations set expires_at=now()-interval '1 minute' where id=$1",[first]);
    assert.equal((await reserve(second)).rows[0].ok,false,"expiry is not confirmation of a lost create's termination");
    await db.query("select public.ss_agent_execution_release($1,$2)",[first,owner]);
    assert.equal((await reserve(second)).rows[0].ok,true);
    await assert.rejects(()=>reserve(randomUUID(),"b".repeat(64)),/budget_not_reconciled/);
    const marker = await db.query<{reserved_micro_cny:number}>("select reserved_micro_cny from public.ss_agent_execution_budgets where period_key=$1",[`legacy:${fingerprint}`]);
    assert.equal(Number(marker.rows[0].reserved_micro_cny),1800000,"ordinary reserve never aggregates into or changes the legacy marker");
  } finally { await db.close(); }
});
