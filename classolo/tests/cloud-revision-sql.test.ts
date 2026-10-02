import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('classroom child mutations advance a monotonic version without crossing owners',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
      CREATE TABLE ss_class_sessions(id uuid PRIMARY KEY,user_id uuid,updated_at timestamptz DEFAULT now());
      INSERT INTO ss_class_sessions(id,user_id) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');`)
    for(const name of ['transcripts','outlines','renders','chats'])await db.exec(`CREATE TABLE ss_class_${name}(id text PRIMARY KEY,session_id uuid,user_id uuid,payload jsonb DEFAULT '{}');GRANT SELECT,INSERT,UPDATE ON ss_class_${name} TO service_role;`)
    await db.exec('GRANT SELECT,UPDATE ON ss_class_sessions TO service_role')
    const migration=readFileSync(new URL('../../supabase/migrations/202610020002_classroom_revisions.sql',import.meta.url),'utf8')
    await db.exec(migration);await db.exec(migration);await db.exec('SET ROLE service_role')
    const revision=async()=>Number((await db.query<{value:string}>('SELECT cloud_revision::text AS value FROM ss_class_sessions')).rows[0].value)
    assert.equal(await revision(),0)
    for(const [i,name] of ['transcripts','outlines','renders','chats'].entries()){
      await db.query(`INSERT INTO ss_class_${name}(id,session_id,user_id) VALUES($1,$2::uuid,$3::uuid)`,[`row-${i}`,'22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111'])
      assert.equal(await revision(),i+1)
    }
    await db.exec("UPDATE ss_class_outlines SET payload='{\"nodes\":[]}'")
    assert.equal(await revision(),5)
    await db.query('INSERT INTO ss_class_chats(id,session_id,user_id) VALUES($1,$2::uuid,$3::uuid)',['wrong-owner','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'])
    assert.equal(await revision(),5)
  }finally{await db.close()}
})
