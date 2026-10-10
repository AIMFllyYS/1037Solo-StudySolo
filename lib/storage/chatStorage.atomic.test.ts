import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createStore,get as idbGet} from 'idb-keyval'
import {activateStorageOwner,ownedStorageKey} from './ownerScope.ts'
import {commitSessionCheckpoint,flushPendingWrites,writeOwnedStorageItem} from './idbStorage.ts'
import {__resetSessionV3ForTests,__waitSessionWritesForTests,appendSessionMessages,dropSessionTailCache,flushPendingSessionCheckpoints,getSessionWriteFailure,hasDurableSessionRecovery,hydrateSessionRecoveryStatus,loadSessionMessages,loadSessionRecovery,retrySessionWrite,saveSessionMessages,serializeSessionMessages,sessionCheckpointIo,writeSessionMessage} from './chatStorage.ts'
import {planSessionChunks} from '@/lib/chat/messages/turnSpine'

const owner='11111111-1111-4111-8111-111111111111',session='atomic-fixture'
const message=(index:number)=>({id:`message-${index}`,role:index%2?'assistant' as const:'user' as const,parts:[{type:'text' as const,text:`synthetic-${index}`}],timestamp:index})
const storage=new Map<string,string>()

test('a failed later chunk leaves the prior committed classroom conversation readable',async()=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value)},removeItem:key=>{storage.delete(key)},key:index=>[...storage.keys()][index]??null,get length(){return storage.size},clear:()=>storage.clear()} as Storage
  activateStorageOwner(owner)
  try{
    const old=Array.from({length:20},(_,index)=>message(index))
    saveSessionMessages(session,old);await __waitSessionWritesForTests(session)
    assert.deepEqual((await loadSessionMessages(session))?.map(row=>row.id),old.map(row=>row.id))
    const testStore=createStore('gailvlun-db','keyval')
    const before=await idbGet<string>(ownedStorageKey(`chat-s3:${session}:h`)!,testStore)
    assert.equal(JSON.parse(before!).contentRevision,1)
    const original=IDBObjectStore.prototype.put
    let failed=false
    IDBObjectStore.prototype.put=function(value,key){
      if(!failed&&typeof key==='string'&&key.endsWith(`chat-s3:${session}:c:1`)){failed=true;throw new DOMException('synthetic quota failure','QuotaExceededError')}
      return original.call(this,value,key)
    }
    const originalFallback=localStorage.setItem
    localStorage.setItem=()=>{throw new DOMException('synthetic fallback quota','QuotaExceededError')}
    try{saveSessionMessages(session,[...old,message(20),message(21)]);await __waitSessionWritesForTests(session)}
    finally{IDBObjectStore.prototype.put=original;localStorage.setItem=originalFallback}
    assert.equal(failed,true)
    dropSessionTailCache(session)
    assert.deepEqual((await loadSessionMessages(session))?.map(row=>row.id),old.map(row=>row.id))
    const after=await idbGet<string>(ownedStorageKey(`chat-s3:${session}:h`)!,testStore)
    assert.equal(JSON.parse(after!).contentRevision,1)
    assert.equal(getSessionWriteFailure(session),'storage_unavailable')
    assert.equal(await retrySessionWrite(session),true)
    dropSessionTailCache(session)
    assert.deepEqual((await loadSessionMessages(session))?.map(row=>row.id),[...old,message(20),message(21)].map(row=>row.id))
    assert.equal(getSessionWriteFailure(session),null)
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('a failed tail append does not publish a head that refers to missing chunks',async()=>{
  const id='atomic-tail-fixture',testStore=createStore('gailvlun-db','keyval')
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new DOMException('synthetic fallback quota','QuotaExceededError')},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  try{
    const old=Array.from({length:16},(_,index)=>message(index))
    saveSessionMessages(id,old);await __waitSessionWritesForTests(id)
    const original=IDBObjectStore.prototype.put
    let failed=false
    IDBObjectStore.prototype.put=function(value,key){if(!failed&&typeof key==='string'&&key.endsWith(`chat-s3:${id}:c:1`)){failed=true;throw new DOMException('synthetic quota','QuotaExceededError')}return original.call(this,value,key)}
    try{
      appendSessionMessages(id,[message(16),message(17)])
      flushPendingWrites()
      await flushPendingSessionCheckpoints()
      await idbGet(ownedStorageKey(`chat-s3:${id}:h`)!,testStore)
    }finally{IDBObjectStore.prototype.put=original}
    assert.equal(failed,true)
    dropSessionTailCache(id)
    const head=await idbGet<string>(ownedStorageKey(`chat-s3:${id}:h`)!,testStore)
    assert.equal(JSON.parse(head!).messageCount,16)
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),old.map(row=>row.id))
    await flushPendingSessionCheckpoints()
    dropSessionTailCache(id)
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),[...old,message(16),message(17)].map(row=>row.id))
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('captured-owner conflict recovery survives reload boundaries without appearing in another account',async()=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  try{
    const snapshot=[message(100),message(101)]
    assert.equal(await writeOwnedStorageItem(owner,'chat-recovery-s3:recovery-fixture',JSON.stringify(snapshot)),true)
    __resetSessionV3ForTests()
    await hydrateSessionRecoveryStatus('recovery-fixture')
    assert.equal(getSessionWriteFailure('recovery-fixture'),'checkpoint_conflict')
    assert.equal(hasDurableSessionRecovery('recovery-fixture'),true)
    assert.deepEqual((await loadSessionRecovery('recovery-fixture'))?.map(row=>row.id),snapshot.map(row=>row.id))
    activateStorageOwner('22222222-2222-4222-8222-222222222222')
    assert.equal(await loadSessionRecovery('recovery-fixture'),null)
    activateStorageOwner(owner)
    await hydrateSessionRecoveryStatus('recovery-fixture')
    assert.deepEqual((await loadSessionRecovery('recovery-fixture'))?.map(row=>row.id),snapshot.map(row=>row.id))
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('a real IDB CAS conflict merges remote append with a local compact replacement',async(t)=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  const id='three-way-race'
  try{
    const base=[message(200)]
    saveSessionMessages(id,base);await __waitSessionWritesForTests(id)
    const local=[message(201)]
    const remote=[...base,message(202)]
    let injected=false
    t.mock.method(sessionCheckpointIo,'commit',async(input:Parameters<typeof commitSessionCheckpoint>[0])=>{
      if(!injected){
        injected=true
        const plan=planSessionChunks(remote)
        const head={v:3,contentRevision:input.expectedRevision+1,messageCount:remote.length,turnCount:plan.spine.length,chunkCount:plan.chunks.length,spine:plan.spine}
        const entries:[string,string][]=[...plan.chunks.map((chunk,index)=>[`chat-s3:${id}:c:${index}`,serializeSessionMessages(chunk)] as [string,string]),[`chat-s3:${id}:h`,JSON.stringify(head)]]
        assert.equal((await commitSessionCheckpoint({ownerId:owner,headKey:`chat-s3:${id}:h`,expectedRevision:input.expectedRevision,entries})).status,'saved')
      }
      return commitSessionCheckpoint(input)
    })
    saveSessionMessages(id,local,base);await __waitSessionWritesForTests(id)
    dropSessionTailCache(id)
    assert.equal(injected,true)
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),[local[0].id,remote[1].id])
    assert.equal(getSessionWriteFailure(id),null)
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('divergent same-message CAS conflict preserves remote authority and local recovery',async(t)=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  const id='divergent-race'
  try{
    const base=[message(300)]
    saveSessionMessages(id,base);await __waitSessionWritesForTests(id)
    const local=[{...base[0],parts:[{type:'text' as const,text:'local revision'}]}]
    const remote=[{...base[0],parts:[{type:'text' as const,text:'remote revision'}]}]
    let injected=false
    t.mock.method(sessionCheckpointIo,'commit',async(input:Parameters<typeof commitSessionCheckpoint>[0])=>{
      if(!injected){
        injected=true
        const plan=planSessionChunks(remote)
        const head={v:3,contentRevision:input.expectedRevision+1,messageCount:remote.length,turnCount:plan.spine.length,chunkCount:plan.chunks.length,spine:plan.spine}
        const entries:[string,string][]=[...plan.chunks.map((chunk,index)=>[`chat-s3:${id}:c:${index}`,serializeSessionMessages(chunk)] as [string,string]),[`chat-s3:${id}:h`,JSON.stringify(head)]]
        assert.equal((await commitSessionCheckpoint({ownerId:owner,headKey:`chat-s3:${id}:h`,expectedRevision:input.expectedRevision,entries})).status,'saved')
      }
      return commitSessionCheckpoint(input)
    })
    saveSessionMessages(id,local,base);await __waitSessionWritesForTests(id)
    dropSessionTailCache(id)
    assert.equal(getSessionWriteFailure(id),'checkpoint_conflict')
    assert.equal((await loadSessionMessages(id))?.[0]?.parts[0]?.type,'text')
    assert.equal(((await loadSessionMessages(id))?.[0]?.parts[0] as {text:string}).text,'remote revision')
    assert.equal(((await loadSessionRecovery(id))?.[0]?.parts[0] as {text:string}).text,'local revision')
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('tail append CAS conflict replays both tabs without losing either append',async(t)=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  const id='tail-append-race'
  try{
    const base=[message(400)]
    saveSessionMessages(id,base);await __waitSessionWritesForTests(id)
    appendSessionMessages(id,[message(401)])
    const remote=[...base,message(402)]
    let injected=false
    t.mock.method(sessionCheckpointIo,'commit',async(input:Parameters<typeof commitSessionCheckpoint>[0])=>{
      if(!injected){
        injected=true
        const plan=planSessionChunks(remote)
        const head={v:3,contentRevision:input.expectedRevision+1,messageCount:remote.length,turnCount:plan.spine.length,chunkCount:plan.chunks.length,spine:plan.spine}
        const entries:[string,string][]=[...plan.chunks.map((chunk,index)=>[`chat-s3:${id}:c:${index}`,serializeSessionMessages(chunk)] as [string,string]),[`chat-s3:${id}:h`,JSON.stringify(head)]]
        assert.equal((await commitSessionCheckpoint({ownerId:owner,headKey:`chat-s3:${id}:h`,expectedRevision:input.expectedRevision,entries})).status,'saved')
      }
      return commitSessionCheckpoint(input)
    })
    await flushPendingSessionCheckpoints()
    dropSessionTailCache(id)
    assert.deepEqual((await loadSessionMessages(id))?.map(row=>row.id),[base[0].id,remote[1].id,'message-401'])
    assert.equal(getSessionWriteFailure(id),null)
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})

test('tail edit conflict keeps the remote committed text and backs up local draft',async(t)=>{
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0,clear:()=>{}} as Storage
  activateStorageOwner(owner)
  const id='tail-edit-race'
  try{
    const base=[message(500)]
    saveSessionMessages(id,base);await __waitSessionWritesForTests(id)
    writeSessionMessage(id,{...base[0],parts:[{type:'text',text:'local tail edit'}]})
    const remote=[{...base[0],parts:[{type:'text' as const,text:'remote tail edit'}]}]
    let injected=false
    t.mock.method(sessionCheckpointIo,'commit',async(input:Parameters<typeof commitSessionCheckpoint>[0])=>{
      if(!injected){
        injected=true
        const plan=planSessionChunks(remote)
        const head={v:3,contentRevision:input.expectedRevision+1,messageCount:remote.length,turnCount:plan.spine.length,chunkCount:plan.chunks.length,spine:plan.spine}
        const entries:[string,string][]=[...plan.chunks.map((chunk,index)=>[`chat-s3:${id}:c:${index}`,serializeSessionMessages(chunk)] as [string,string]),[`chat-s3:${id}:h`,JSON.stringify(head)]]
        assert.equal((await commitSessionCheckpoint({ownerId:owner,headKey:`chat-s3:${id}:h`,expectedRevision:input.expectedRevision,entries})).status,'saved')
      }
      return commitSessionCheckpoint(input)
    })
    await flushPendingSessionCheckpoints()
    dropSessionTailCache(id)
    assert.equal(getSessionWriteFailure(id),'checkpoint_conflict')
    assert.equal(((await loadSessionMessages(id))?.[0]?.parts[0] as {text:string}).text,'remote tail edit')
    assert.equal(((await loadSessionRecovery(id))?.[0]?.parts[0] as {text:string}).text,'local tail edit')
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})
