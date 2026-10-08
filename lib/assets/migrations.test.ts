import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('asset versions atomically CAS, deduplicate bodies, enforce quota and isolate roles', { timeout: 60000 }, async () => {
    const db = await PGlite.create(), owner = '10000000-0000-4000-8000-000000000001', hash = 'a'.repeat(64), mutation = '20000000-0000-4000-8000-000000000001';
    try {
        await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);insert into auth.users values('${owner}');`);
        await db.exec(JSON.parse(readFileSync('lib/files/fixtures/storage-foundation.json', 'utf8')).sql);
        await db.exec(`create table public.ss_sync_documents(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),kind text,client_id text,payload jsonb,deleted boolean,updated_at timestamptz default now(),unique(user_id,kind,client_id));create table public.ss_data_storage_refs(table_name text,row_key text,user_id uuid,storage_request_key text,primary key(table_name,row_key));grant select,insert,update on ss_sync_documents to service_role;grant select on ss_data_storage_refs to service_role;`);
        const classSchema = readFileSync('supabase/migrations/202609270001_classroom_cloud.sql', 'utf8');
        await db.exec(classSchema.slice(classSchema.indexOf('CREATE TABLE'), classSchema.indexOf('CREATE OR REPLACE FUNCTION')));
        await db.exec('ALTER TABLE ss_class_sessions ADD COLUMN cloud_revision bigint NOT NULL DEFAULT 0; GRANT SELECT,INSERT,UPDATE ON ss_class_sessions,ss_class_transcripts,ss_class_outlines,ss_class_renders,ss_class_chats TO service_role');
        await db.exec(readFileSync('supabase/migrations/202610020002_classroom_revisions.sql', 'utf8'));
        await db.exec('ALTER TABLE ss_class_transcripts ADD UNIQUE(id,session_id,user_id)');
        const corrections = readFileSync('supabase/migrations/202610020003_classroom_corrections.sql', 'utf8');
        await db.exec(corrections.slice(corrections.indexOf('CREATE TABLE'), corrections.indexOf('ALTER TABLE public.ss_class_corrections ENABLE')));
        await db.exec('GRANT SELECT,INSERT,UPDATE ON ss_class_corrections TO service_role');
        const old = readFileSync('supabase/migrations/202609270002_studysolo_content.sql', 'utf8');
        const start = old.indexOf('CREATE OR REPLACE FUNCTION public.ss_account_row_storage()');
        const end = old.indexOf('DO $$', start);
        await db.exec(old.slice(start, end));
        await db.exec('CREATE TRIGGER ss_account_storage AFTER INSERT OR UPDATE ON public.ss_sync_documents FOR EACH ROW EXECUTE FUNCTION public.ss_account_row_storage()');
        await db.exec('CREATE TRIGGER ss_account_storage AFTER INSERT OR UPDATE ON ss_class_sessions FOR EACH ROW EXECUTE FUNCTION ss_account_row_storage(); CREATE TRIGGER ss_account_storage AFTER INSERT OR UPDATE ON ss_class_transcripts FOR EACH ROW EXECUTE FUNCTION ss_account_row_storage()');
        await db.exec(readFileSync('supabase/migrations/202609270004_sync_assets.sql', 'utf8'));
        await db.exec(readFileSync('supabase/migrations/202610080001_user_cloud_files.sql', 'utf8'));
        await db.query('insert into ss_sync_documents(user_id,kind,client_id,payload,deleted) values($1,$2,$3,$4,true)', [owner, 'artifact', 'old-deleted', { id: 'old-deleted', html: 'old retained original' }]);
        assert.ok(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes) > 0);
        await db.exec(readFileSync('supabase/migrations/202610080002_asset_versions.sql', 'utf8'));
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), 0);
        await db.exec(readFileSync('supabase/migrations/202610090001_asset_concurrency_guards.sql','utf8'));
        await db.exec(readFileSync('supabase/migrations/202610090002_inactive_asset_meter.sql','utf8'));
        await db.exec("update membership_plans set storage_bytes=100000 where id='free';grant service_role,authenticated to postgres;set role service_role");
        const payload = { id: 'asset', title: 'asset', html: '', status: 'done', bodyStorage: { v: 1, fields: [{ path: ['html'], format: 'text', bytes: 80, chunks: [hash] }] } };
        await db.query('select ss_sync_prepare($1,$2,$3,$4,0,$5,$6)', [owner, mutation, 'artifact', 'asset', payload, [{ sha256: hash, size: 80 }]]);
        await db.query('select ss_sync_commit($1,$2)', [owner, mutation]);
        await db.query('select ss_sync_commit($1,$2)', [owner, mutation]);
        const before = Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes);
        assert.ok(before > 80);
        assert.equal((await db.query<{
            count: number;
        }>('select count(*) as count from asset_index where archived_at is null')).rows[0].count, 1);
        assert.equal(Number((await db.query<{
            revision: number;
        }>("select revision from ss_sync_documents where client_id='asset'")).rows[0].revision), 1);
        await assert.rejects(() => db.query('select ss_sync_prepare($1,gen_random_uuid(),$2,$3,0,$4,$5)', [owner, 'artifact', 'asset', payload, []]), /revision_conflict/);
        await db.exec(`reset role;update membership_plans set storage_bytes=${before} where id='free';set role service_role`);
        await db.query("select ss_sync_archive($1,'artifact','asset',1,false)", [owner]);
        await db.query("select ss_sync_archive($1,'artifact','asset',1,false)", [owner]);
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), 0);
        await db.exec("reset role;update membership_plans set storage_bytes=1 where id='free';set role service_role");
        await assert.rejects(() => db.query("select ss_sync_archive($1,'artifact','asset',2,true)", [owner]), /storage_quota_exceeded/);
        assert.equal((await db.query<{
            deleted: boolean;
        }>("select deleted from ss_sync_documents where client_id='asset'")).rows[0].deleted, true);
        await db.exec("reset role;update membership_plans set storage_bytes=100000 where id='free';set role service_role");
        await db.query("select ss_sync_archive($1,'artifact','asset',2,true)", [owner]);
        await db.query("select ss_sync_archive($1,'artifact','asset',2,true)", [owner]);
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), before);
        const repeat = (await db.query<{revision:number;deleted:boolean}>('select * from ss_sync_commit($1,$2)',[owner,mutation])).rows[0];
        assert.equal(Number(repeat.revision),1);assert.equal(repeat.deleted,false);
        await db.query("select ss_sync_archive($1,'artifact','asset',3,false)", [owner]);
        const replayPrepared=(await db.query<{ss_sync_prepare:{state:string;chunks:unknown[]}}>('select ss_sync_prepare($1,$2,$3,$4,0,$5,$6)',[owner,mutation,'artifact','asset',payload,[{sha256:hash,size:80}]])).rows[0].ss_sync_prepare;
        assert.equal(replayPrepared.state,'committed');assert.equal(replayPrepared.chunks.length,0);
        assert.equal(Number((await db.query<{used_bytes:number}>('select used_bytes from storage_accounts where user_id=$1',[owner])).rows[0].used_bytes),0);
        await db.query("select ss_sync_archive($1,'artifact','asset',4,true)",[owner]);
        const held='20000000-0000-4000-8000-000000000003';
        await db.query('select ss_sync_prepare($1,$2,$3,$4,0,$5,$6)',[owner,held,'artifact','held',{...payload,id:'held'},[{sha256:hash,size:80}]]);
        await db.query("select ss_sync_archive($1,'artifact','asset',5,false)",[owner]);
        assert.equal((await db.query<{state:string}>('select state from ss_sync_body_chunks where sha256=$1',[hash])).rows[0].state,'ready');
        await db.query('select ss_sync_commit($1,$2)',[owner,held]);
        await db.query("select ss_sync_archive($1,'artifact','held',1,false)",[owner]);
        const cancelled = '20000000-0000-4000-8000-000000000002';
        await db.query('select ss_sync_prepare($1,$2,$3,$4,0,$5,$6)', [owner, cancelled, 'artifact', 'copy', { ...payload, id: 'copy' }, [{ sha256: hash, size: 80 }]]);
        await db.query('select ss_sync_cancel($1,$2)', [owner, cancelled]);
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), 0);
        await db.exec("reset role;update membership_plans set storage_bytes=0 where id='free';set role service_role");
        await db.query("select ss_sync_archive($1,'artifact','never-uploaded',0,false)",[owner]);
        assert.equal(Number((await db.query<{used_bytes:number}>('select used_bytes from storage_accounts where user_id=$1',[owner])).rows[0].used_bytes),0);
        await assert.rejects(()=>db.query("select ss_sync_archive($1,'artifact','never-uploaded',1,true)",[owner]),/asset_original_missing/);
        await db.exec("reset role;update membership_plans set storage_bytes=100000 where id='free';set role service_role");
        const lesson = '30000000-0000-4000-8000-000000000001';
        await db.query('insert into ss_class_sessions(id,user_id,title,status) values($1,$2,$3,$4)', [lesson, owner, 'lesson', 'ended']);
        await db.query('insert into ss_class_transcripts(id,session_id,user_id,seq,payload) values(gen_random_uuid(),$1,$2,0,$3)', [lesson, owner, { text: 'class original' }]);
        const classBytes = Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes);
        assert.ok(classBytes > 0);
        await db.query('insert into ss_class_transcripts(id,session_id,user_id,seq,payload) values(gen_random_uuid(),$1,$2,1,$3)', [lesson, owner, { text: 'second raw' }]);
        const bothSegments = (await db.query<{
            id: string;
        }>('select id from ss_class_transcripts where session_id=$1', [lesson])).rows;
        for (const segment of bothSegments)
            await db.query('insert into ss_class_corrections(session_id,segment_id,user_id,revision,payload,last_operation_key) values($1,$2,$3,1,$4,gen_random_uuid())', [lesson, segment.id, owner, { correctedText: 'correction ' + segment.id }]);
        assert.equal(Number((await db.query<{
            count: number;
        }>("select count(*) as count from ss_data_storage_refs where table_name='ss_class_corrections'")).rows[0].count), 2);
        const allClassBytes = Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes);
        assert.ok(allClassBytes > classBytes);
        await db.query('select ss_class_archive($1,$2,2,false)', [owner, lesson]);
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), 0);
        await assert.rejects(() => db.query('insert into ss_class_transcripts(id,session_id,user_id,seq,payload) values(gen_random_uuid(),$1,$2,1,$3)', [lesson, owner, { text: 'late write' }]), /classroom_in_trash/);
        await db.query('select ss_class_archive($1,$2,3,true)', [owner, lesson]);
        assert.equal(Number((await db.query<{
            used_bytes: number;
        }>('select used_bytes from storage_accounts where user_id=$1', [owner])).rows[0].used_bytes), allClassBytes);
        await db.exec('reset role;set role authenticated');
        await assert.rejects(() => db.query('select * from ss_sync_body_chunks'), /permission denied/);
        await assert.rejects(() => db.query('select ss_sync_commit($1,$2)', [owner, mutation]), /permission denied/);
    }
    finally {
        await db.close();
    }
});
