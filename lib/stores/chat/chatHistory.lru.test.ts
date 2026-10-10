import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {activateStorageOwner,ownedStorageKey} from '@/lib/storage/ownerScope'
import {chatSessionKey} from '@/lib/storage/idbStorage'
import {__resetSessionV3ForTests,loadSessionMessages} from '@/lib/storage/chatStorage'
import {useChatHistory} from './chatHistory.ts'

test('LRU evicts actual resident messages and windows without deleting persisted history',async()=>{
  const memory=new Map<string,string>()
  globalThis.window={addEventListener(){}} as unknown as Window & typeof globalThis
  globalThis.document={addEventListener(){},visibilityState:'visible'} as unknown as Document
  globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value)},removeItem:key=>{memory.delete(key)},key:index=>[...memory.keys()][index]??null,get length(){return memory.size},clear:()=>memory.clear()} as Storage
  activateStorageOwner('11111111-1111-4111-8111-111111111111')
  try{
    const metas=Array.from({length:5},(_,index)=>({id:`lru-${index}`,title:`Fixture ${index}`,createdAt:index,updatedAt:index,messageCount:1,artifactIds:[]}))
    for(const meta of metas)memory.set(ownedStorageKey(chatSessionKey(meta.id))!,JSON.stringify([{id:`body-${meta.id}`,role:'assistant',parts:[{type:'text',text:'synthetic persisted body'}],timestamp:1}]))
    useChatHistory.setState({sessionsMeta:metas,messagesById:{},sessionWindowById:{},activeSessionId:'lru-4',sessionLoadState:{},loadedSessionIds:[],pinnedSessionIds:[],_hasHydrated:true,_activeMessagesReady:true})
    for(const meta of metas)await useChatHistory.getState().ensureSessionLoaded(meta.id)
    const state=useChatHistory.getState()
    assert.deepEqual(Object.keys(state.messagesById).sort(),state.loadedSessionIds.slice().sort())
    assert.equal(Object.keys(state.sessionWindowById).length,4)
    assert.ok(!state.messagesById['lru-0'])
    assert.deepEqual((await loadSessionMessages('lru-0'))?.map(row=>row.id),['body-lru-0'])
  }finally{
    __resetSessionV3ForTests();activateStorageOwner(null)
    delete (globalThis as {window?:unknown}).window;delete (globalThis as {document?:unknown}).document;delete (globalThis as {localStorage?:unknown}).localStorage
  }
})
