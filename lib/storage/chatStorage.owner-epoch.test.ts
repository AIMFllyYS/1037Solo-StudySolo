import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {activateStorageOwner} from './ownerScope.ts'
import {__resetSessionV3ForTests,__waitSessionWritesForOwnerForTests,appendSessionMessages,flushPendingSessionCheckpoints,loadSessionMessages,saveSessionMessages} from './chatStorage.ts'

test('A queued append finishes in A storage after B signs in, without entering B session',async()=>{
  const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',id='same-session-id'
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  const msg=(id:string,text:string)=>({id,role:'assistant' as const,parts:[{type:'text' as const,text}],timestamp:1})
  activateStorageOwner(A)
  try{
    saveSessionMessages(id,[msg('a1','A synthetic body')])
    appendSessionMessages(id,[msg('a2','A pending addition')])
    activateStorageOwner(B)
    saveSessionMessages(id,[msg('b1','B own body')])
    await __waitSessionWritesForOwnerForTests(A,id)
    await __waitSessionWritesForOwnerForTests(B,id)
    await flushPendingSessionCheckpoints()
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),['b1'])
    activateStorageOwner(A)
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),['a1','a2'])
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})
