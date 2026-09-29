import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {getDb,setClassUserId,insertSession,insertTranscriptSegments,flushClassPending,getPendingCount,listSessions} from '../lib/db/index.ts';
import {activateStorageOwner,ownedStorageKey} from '../../lib/storage/ownerScope.ts';
const A='f1111111-1111-4111-8111-111111111111';
const B='f2222222-2222-4222-8222-222222222222';
const originalFetch=globalThis.fetch;
let values:Map<string,string>;
const session=(title:string)=>({title,status:'ended',asrSnapshot:{family:'text-import',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}});
beforeEach(()=>{
 values=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size;}}});
 setClassUserId(null);activateStorageOwner(null);
});
afterEach(()=>{globalThis.fetch=originalFetch;setClassUserId(null);activateStorageOwner(null);});

test('no anonymous classroom database exists',async()=>{
 await assert.rejects(getDb(),/登录/);
 assert.equal(ownedStorageKey('user-notes'),null);
});

test('offline writes retain verified owner and stable idempotency keys',async()=>{
 const calls:string[]=[];
 globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(String(init?.body)).operationKey);throw new TypeError('offline');};
 setClassUserId(A);const db=await getDb();const saved=await insertSession(db,session('A private'));
 assert.equal(getPendingCount(),1);
 assert.equal(saved.userId,A);
 globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(String(init?.body)).operationKey);return Response.json({ok:true});};
 await flushClassPending(db);assert.equal(getPendingCount(),0);
 assert.equal(calls[0],calls[1]);
 await flushClassPending(db);assert.equal(calls.length,2);
});

test('account switch does not expose or replay another owner cache',async()=>{
 globalThis.fetch=async()=>{throw new TypeError('offline');};
 setClassUserId(A);const a=await getDb();const row=await insertSession(a,session('A secret'));
 setClassUserId(B);const b=await getDb();
 globalThis.fetch=async()=>Response.json([]);
 assert.deepEqual(await listSessions(b),[]);
 assert.equal(getPendingCount(),0);
 await assert.rejects(insertTranscriptSegments(a,[{id:crypto.randomUUID(),sessionId:row.id,seq:1,startMs:0,endMs:0,text:'private'}]),/切换/);
 assert.match(values.get(`ss-class:v1:${A}`)||'',/A secret/);
 assert.doesNotMatch(values.get(`ss-class:v1:${B}`)||'',/A secret/);
});

test('in-flight old-owner response cannot acknowledge or overwrite new-owner data',async()=>{
 let releaseA:(response:Response)=>void=()=>{};
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(body.expectedUserId===A)return new Promise<Response>(resolve=>{releaseA=resolve;});
  return Response.json({ok:true});
 };
 setClassUserId(A);const a=await getDb();const old=insertSession(a,session('A'));
 await new Promise(resolve=>setTimeout(resolve,0));
 setClassUserId(B);const b=await getDb();await insertSession(b,session('B'));
 releaseA(Response.json({ok:true}));await old;
 assert.equal(getPendingCount(),0);
 assert.equal(JSON.parse(values.get(`ss-class:v1:${A}`)!).pending.length,1);
 assert.doesNotMatch(values.get(`ss-class:v1:${B}`)||'',/"title":"A"/);
});

test('local quota failure prevents proceeding to cloud writes',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true});};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});
 setClassUserId(A);await assert.rejects(insertSession(await getDb(),session('A')),/缓存无法写入/);
 assert.equal(calls,0);
});

test('host content keys are scoped only after identity verification',()=>{
 values.set('user-notes','unbound historical data');
 assert.equal(ownedStorageKey('user-notes'),null);
 activateStorageOwner(A);assert.equal(ownedStorageKey('user-notes'),`ss-user:${A}:user-notes`);
 activateStorageOwner(B);assert.equal(ownedStorageKey('user-notes'),`ss-user:${B}:user-notes`);
 assert.equal(values.get('user-notes'),'unbound historical data');
});
