import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/shared-migrations.json", import.meta.url)), "utf8")).fixtures as { name: string; source: string; sha256: string; sql: string }[];
test("Shared execution fixtures preserve canonical source and PostgreSQL ACL/budget semantics", { timeout: 60000 }, async () => {
  for (const fixture of fixtures) {
    assert.equal(createHash("sha256").update(fixture.sql).digest("hex"), fixture.sha256);
    const canonical = resolve(dirname(fileURLToPath(import.meta.url)), "../../../1037Solo-Shared/supabase/migrations", fixture.name);
    if (existsSync(canonical)) assert.equal(createHash("sha256").update(readFileSync(canonical)).digest("hex"), fixture.sha256, "Refresh only test fixtures after reviewing the Shared source");
  }
  const db = await PGlite.create({ extensions: { pgcrypto } });
  const a = "20000000-0000-4000-8000-000000000001", b = "20000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean); insert into auth.users values('${a}'),('${b}');`);
    for (const fixture of fixtures) await db.exec(fixture.sql);
    const tables = await db.query<{ relname: string; relrowsecurity: boolean; comment: string }>("select c.relname,c.relrowsecurity,obj_description(c.oid) as comment from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname like 'ss_agent_execution_%' or c.relname like 'ss_connector_%') and c.relkind='r'");
    assert.equal(tables.rows.length, 6); assert.ok(tables.rows.every(row => row.relrowsecurity && row.comment.startsWith("【ss_ StudySolo】")));
    await db.exec("grant authenticated,service_role to postgres; set role authenticated");
    await assert.rejects(() => db.query("select * from public.ss_agent_execution_records"), /permission denied/);
    await assert.rejects(() => db.query("select public.ss_agent_execution_lock(repeat('a',64),gen_random_uuid(),45)"), /permission denied/);
    await db.exec("reset role; set role service_role");
    const record = randomUUID();
    assert.equal((await db.query<{ ok: boolean }>("select public.ss_agent_execution_put($1,$2,'session','cipher',now()+interval '5 minutes') as ok", [record,a])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>("select public.ss_agent_execution_put($1,$2,'session','rebound',now()+interval '5 minutes') as ok", [record,b])).rows[0].ok, false);
    await assert.rejects(() => db.query("update public.ss_agent_execution_records set owner_uuid=$2 where id=$1", [record,b]), /immutable_execution_identity/);
    const lease = randomUUID(), nextLease = randomUUID(), key = "a".repeat(64);
    assert.equal((await db.query<{ ok: boolean }>("select public.ss_agent_execution_lock($1,$2,45) as ok", [key,lease])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>("select public.ss_agent_execution_lock($1,$2,45) as ok", [key,nextLease])).rows[0].ok, false);
    assert.equal((await db.query<{ ok: boolean }>("select public.ss_agent_execution_put($1,$2,'session','stale-write',now()+interval '5 minutes',$3,$4) as ok", [record,a,key,nextLease])).rows[0].ok, false);
    const reservation = randomUUID(), second = randomUUID();
    const reserve = (id: string, owner: string, amount: number) => db.query<{ ok: boolean }>("select public.ss_agent_execution_reserve($1,$2,$3,to_char(now() at time zone 'Asia/Shanghai','YYYY-MM'),'fixture-run',500000,500000,now()+interval '5 minutes') as ok", [id,owner,amount]);
    assert.equal((await reserve(reservation,a,300000)).rows[0].ok, true);
    assert.equal((await reserve(reservation,a,300000)).rows[0].ok, true);
    assert.equal((await reserve(reservation,b,300000)).rows[0].ok, false);
    assert.equal((await reserve(second,b,100000)).rows[0].ok, false, "Active instance capacity prevents a second tenant allocating");
    await db.query("select public.ss_agent_execution_release($1,$2)", [reservation,a]);
    assert.equal((await reserve(second,b,100000)).rows[0].ok, true);
    await db.query("select public.ss_agent_execution_release($1,$2)", [second,b]);
    assert.equal((await reserve(randomUUID(),a,200000)).rows[0].ok, false, "Closed reservations remain conservatively charged to operator cap");
    await db.exec("reset role");
    assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets where id='ss-agent-artifacts'")).rows[0].public, false);
  } finally { await db.close(); }
});
