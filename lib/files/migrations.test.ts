import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
test('cloud files share atomic quota, isolate owners, and soft-delete idempotently', { timeout: 60000 }, async () => {
  const db = await PGlite.create();
  const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002';
  const file = '20000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); insert into auth.users values('${owner}'),('${other}');`);
    const foundation = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/storage-foundation.json', import.meta.url)), 'utf8')) as { sha256: string; sql: string };
    assert.equal(createHash('sha256').update(foundation.sql).digest('hex'), foundation.sha256);
    await db.exec(foundation.sql);
    await db.exec('alter default privileges in schema public grant all on tables to service_role');
    await db.exec(readFileSync('supabase/migrations/202610080001_user_cloud_files.sql','utf8'));
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('service_role','public.ss_user_files','DELETE') as allowed")).rows[0]!.allowed, false);
    await db.exec("update public.membership_plans set storage_bytes=100 where id='free'; grant service_role,authenticated to postgres; set role service_role;");
    await db.query('select public.ss_file_prepare($1,$2,$3,$4,$5,$6,$7,$8,$9)', [owner,file,'public.txt','text/plain',60,'a'.repeat(64),30,'b'.repeat(64),'project-public']);
    await assert.rejects(() => db.query('select public.ss_file_prepare($1,gen_random_uuid(),$2,$3,20,$4,1,$5,null)',[owner,'overflow.txt','text/plain','a'.repeat(64),'b'.repeat(64)]), /storage_quota_exceeded/);
    await assert.rejects(() => db.query("select public.ss_file_transition($1,$2,'complete')",[other,file]), /no rows/);
    await db.query("select public.ss_file_transition($1,$2,'complete')",[owner,file]);
    await db.query("select public.ss_file_transition($1,$2,'complete')",[owner,file]);
    const committed = (await db.query<{used_bytes:number;reserved_bytes:number}>('select used_bytes,reserved_bytes from public.storage_accounts where user_id=$1',[owner])).rows[0]!;
    assert.equal(Number(committed.used_bytes),90); assert.equal(Number(committed.reserved_bytes),0);
    await db.query("select public.ss_file_transition($1,$2,'delete')",[owner,file]);
    await db.query("select public.ss_file_transition($1,$2,'delete')",[owner,file]);
    const deleted = (await db.query<{state:string;deleted_at:string}>('select state,deleted_at from public.ss_user_files where id=$1',[file])).rows[0]!;
    assert.equal(deleted.state,'deleted'); assert.ok(deleted.deleted_at);
    assert.equal(Number((await db.query<{used_bytes:number}>('select used_bytes from public.storage_accounts where user_id=$1',[owner])).rows[0]!.used_bytes),0);
    await assert.rejects(() => db.query("select public.ss_file_transition($1,$2,'complete')",[owner,file]), /file_not_pending/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(() => db.query('select * from public.ss_user_files'), /permission denied/);
    await assert.rejects(() => db.query("select public.ss_file_transition($1,$2,'delete')",[owner,file]), /permission denied/);
  } finally { await db.close(); }
});
