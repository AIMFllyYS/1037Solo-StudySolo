import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('approved corrections are owner-scoped, reversible, and compare revisions atomically',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE ss_class_sessions(id uuid PRIMARY KEY,user_id uuid,updated_at timestamptz DEFAULT now());
      CREATE TABLE ss_class_transcripts(id uuid PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb NOT NULL);
      CREATE TABLE ss_class_outlines(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb DEFAULT '{}');
      CREATE TABLE ss_class_renders(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb DEFAULT '{}');
      CREATE TABLE ss_class_chats(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb DEFAULT '{}');
      CREATE OR REPLACE FUNCTION public.ss_class_can_read(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT current_setting(''request.jwt.claim.sub'',true)::uuid=p_user_id';
      GRANT SELECT,UPDATE ON ss_class_sessions TO service_role;GRANT SELECT,INSERT,UPDATE ON ss_class_transcripts,ss_class_outlines,ss_class_renders,ss_class_chats TO service_role;
      INSERT INTO ss_class_sessions(id,user_id) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
      INSERT INTO ss_class_transcripts(id,session_id,user_id,payload) VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','{"text":"老师说淋吧细胞"}');`)
    for(const name of ['202610020002_classroom_revisions.sql','202610020003_classroom_corrections.sql']){
      const source=readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8')
      await db.exec(source);await db.exec(source)
    }
    await db.exec('SET ROLE service_role')
    const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',segment='33333333-3333-4333-8333-333333333333'
    const save=async(expected:number,text:string,history:unknown[]=[],key=crypto.randomUUID(),uid=owner)=>{
      const result=await db.query<{value:{status:string;revision:number;row?:{correctedText:string}}}>('SELECT public.ss_class_save_correction($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7::uuid,$8) AS value',[uid,lesson,segment,expected,text,JSON.stringify(history),key,'a'.repeat(64)]);return result.rows[0].value
    }
    const key=crypto.randomUUID(),history=[{id:'term-1',kind:'term',start:4,before:'淋吧细胞',after:'淋巴细胞',atMs:1}]
    const revision=async()=>Number((await db.query<{value:string}>(`SELECT cloud_revision::text AS value FROM ss_class_sessions WHERE id='${lesson}'`)).rows[0].value)
    const startRevision=await revision()
    assert.equal((await save(0,'老师说淋巴细胞',history,key)).status,'saved')
    assert.equal(await revision(),startRevision+1)
    assert.equal((await save(0,'老师说淋巴细胞',history,key)).revision,1)
    assert.equal((await save(0,'错误覆盖')).status,'conflict')
    assert.equal((await save(1,'老师说淋吧细胞')).revision,2)
    assert.equal((await db.query<{text:string}>('SELECT payload->>\'text\' AS text FROM ss_class_transcripts')).rows[0].text,'老师说淋吧细胞')
    await assert.rejects(save(2,'他人内容',[],crypto.randomUUID(),'44444444-4444-4444-8444-444444444444'),/class_segment_not_owned/)
    await db.exec('RESET ROLE;SET ROLE authenticated')
    await assert.rejects(save(2,'越权内容'),/permission denied/)
    await db.exec(`SET request.jwt.claim.sub='44444444-4444-4444-8444-444444444444'`)
    assert.equal((await db.query<{count:string}>('SELECT count(*)::text AS count FROM ss_class_corrections')).rows[0].count,'0')
    await db.exec(`SET request.jwt.claim.sub='${owner}'`)
    assert.equal((await db.query<{count:string}>('SELECT count(*)::text AS count FROM ss_class_corrections')).rows[0].count,'1')
  }finally{await db.close()}
})
