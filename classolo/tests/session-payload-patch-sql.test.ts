import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('classroom note and profile patches merge atomically under one owner',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE ss_class_sessions(id uuid PRIMARY KEY,user_id uuid,payload jsonb NOT NULL DEFAULT '{}',updated_at timestamptz DEFAULT now());
      CREATE TABLE ss_class_transcripts(id uuid PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb);
      CREATE TABLE ss_class_outlines(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb);
      CREATE TABLE ss_class_renders(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb);
      CREATE TABLE ss_class_chats(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb);
      GRANT SELECT,UPDATE ON ss_class_sessions TO service_role;
      GRANT SELECT,INSERT,UPDATE ON ss_class_transcripts,ss_class_outlines,ss_class_renders,ss_class_chats TO service_role;
      INSERT INTO ss_class_sessions(id,user_id,payload) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{"startedAt":"2026-10-02","asrSnapshot":{"family":"rest"}}');`)
    for(const name of ['202610020002_classroom_revisions.sql','202610020004_classroom_session_payload_patch.sql']){
      const source=readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');await db.exec(source);await db.exec(source)
    }
    await db.exec('SET ROLE service_role')
    const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222'
    const save=(patch:Record<string,unknown>,user=owner)=>db.query<{value:Record<string,unknown>}>('SELECT public.ss_class_patch_session_payload($1::uuid,$2::uuid,$3::jsonb) AS value',[user,lesson,JSON.stringify(patch)])
    await save({profile:{disciplineId:'medicine'}})
    const next=await save({noteId:'note-123'})
    assert.deepEqual(next.rows[0].value,{startedAt:'2026-10-02',asrSnapshot:{family:'rest'},profile:{disciplineId:'medicine'},noteId:'note-123'})
    assert.equal((await db.query<{revision:string}>(`SELECT cloud_revision::text AS revision FROM ss_class_sessions WHERE id='${lesson}'`)).rows[0].revision,'2')
    await assert.rejects(save({noteId:'alien'},'44444444-4444-4444-8444-444444444444'),/class_session_not_owned/)
    await assert.rejects(save({userId:'spoof'}),/invalid_class_session_patch/)
    await db.exec('RESET ROLE;SET ROLE authenticated')
    await assert.rejects(save({noteId:'unauthorized'}),/permission denied/)
  }finally{await db.close()}
})
