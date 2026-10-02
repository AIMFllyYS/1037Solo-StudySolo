import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('outline SQL CAS preserves hierarchy, rejects stale revisions, replays safely and enforces owner',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.ss_class_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,updated_at timestamptz DEFAULT now());
      CREATE TABLE public.ss_class_outlines(session_id uuid PRIMARY KEY,user_id uuid NOT NULL,revision integer NOT NULL,payload jsonb NOT NULL,updated_at timestamptz DEFAULT now());
      CREATE TABLE public.ss_class_transcripts(id uuid PRIMARY KEY,session_id uuid,user_id uuid);
      GRANT SELECT,INSERT,UPDATE ON public.ss_class_sessions,public.ss_class_outlines,public.ss_class_transcripts TO service_role;
      INSERT INTO public.ss_class_sessions(id,user_id) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/202610020001_classroom_outline_cas.sql',import.meta.url),'utf8'))
    const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
    const outline={nodes:[{id:'root',title:'力学',parentId:null},{id:'child',title:'定律',parentId:'root'}]}
    const key=crypto.randomUUID()
    const save=async(expected:number,revision:number,k=crypto.randomUUID(),user=owner,payload=outline)=>{
      const result=await db.query<{value:{status:string;revision:number;payload?:unknown}}>('SELECT public.ss_class_save_outline($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::uuid) AS value',[user,sid,expected,revision,JSON.stringify(payload),k]);return result.rows[0].value
    }
    await db.exec('SET ROLE service_role')
    assert.deepEqual(await save(0,1,key),{status:'saved',revision:1})
    assert.deepEqual(await save(0,1,key),{status:'saved',revision:1})
    assert.equal((await save(0,2)).status,'conflict')
    assert.deepEqual(await save(1,2),{status:'saved',revision:2})
    assert.equal((await save(1,3)).revision,2)
    const replayKey=crypto.randomUUID();await save(2,3,replayKey)
    await assert.rejects(save(2,4,replayKey),/operation_key_payload_mismatch/)
    const contenders=await Promise.all([save(3,4),save(3,4)])
    assert.deepEqual(contenders.map(row=>row.status).sort(),['conflict','saved'])
    const withMissingSource={nodes:outline.nodes.map(node=>({...node,sourceSegmentIds:['55555555-5555-4555-8555-555555555555']}))}
    await assert.rejects(save(4,5,crypto.randomUUID(),owner,withMissingSource),/invalid_outline_source/)
    assert.deepEqual((await db.query<{payload:unknown}>('SELECT payload FROM public.ss_class_outlines')).rows[0].payload,outline)
    await assert.rejects(save(2,3,crypto.randomUUID(),'44444444-4444-4444-8444-444444444444'),/class_session_not_owned/)
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await assert.rejects(save(2,3),/permission denied/)
  }finally{await db.close()}
})
