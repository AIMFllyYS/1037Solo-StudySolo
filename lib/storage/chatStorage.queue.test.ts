import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {activateStorageOwner} from './ownerScope.ts'
import {__resetSessionV3ForTests,__waitSessionWritesForTests,appendSessionMessages,deleteSessionData,dropSessionTailCache,loadSessionMessages,saveSessionMessages} from './chatStorage.ts'
import {getResourceSnapshot} from '@/lib/performance/resourceMetrics'

test('dropping a hot tail never detaches an in-flight write; settled queue entries disappear',async()=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner('22222222-2222-4222-8222-222222222222')
  try{
    const message={id:'m1',role:'assistant' as const,parts:[{type:'text' as const,text:'synthetic persisted result'}],timestamp:1}
    saveSessionMessages('queue-fixture',[message])
    assert.equal(getResourceSnapshot().pendingSessionWrites,1)
    dropSessionTailCache('queue-fixture')
    assert.equal(getResourceSnapshot().pendingSessionWrites,1)
    await __waitSessionWritesForTests('queue-fixture')
    assert.deepEqual((await loadSessionMessages('queue-fixture'))?.map(row=>row.id),['m1'])
    for(let i=0;i<30;i++){const id=`queue-${i}`;saveSessionMessages(id,[message]);await __waitSessionWritesForTests(id)}
    assert.equal(getResourceSnapshot().pendingSessionWrites,0)
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('a queued writer cannot resurrect a session after deletion',async()=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner('33333333-3333-4333-8333-333333333333')
  try{
    const message={id:'old',role:'assistant' as const,parts:[{type:'text' as const,text:'synthetic body'}],timestamp:1}
    saveSessionMessages('deleted-fixture',[message]);await __waitSessionWritesForTests('deleted-fixture')
    const removing=deleteSessionData('deleted-fixture')
    appendSessionMessages('deleted-fixture',[{...message,id:'late'}])
    saveSessionMessages('deleted-fixture',[message,{...message,id:'late-full'}])
    await removing
    assert.equal(await loadSessionMessages('deleted-fixture'),null)
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('one thousand complete checkpoints coalesce and leave no settled queue registry',async()=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner('44444444-4444-4444-8444-444444444444')
  const original=IDBObjectStore.prototype.put
  let heads=0
  IDBObjectStore.prototype.put=function(value,key){if(typeof key==='string'&&key.endsWith('chat-s3:coalesced:h'))heads++;return original.call(this,value,key)}
  try{
    for(let i=0;i<1000;i++)saveSessionMessages('coalesced',[{id:`version-${i}`,role:'assistant',parts:[{type:'text',text:`synthetic-${i}`}],timestamp:i}])
    await __waitSessionWritesForTests('coalesced')
    assert.deepEqual((await loadSessionMessages('coalesced'))?.map(row=>row.id),['version-999'])
    assert.ok(heads<=2,`expected at most one in-flight and one latest, got ${heads}`)
    assert.equal(getResourceSnapshot().pendingSessionWrites,0)
  }finally{
    IDBObjectStore.prototype.put=original;__resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})
