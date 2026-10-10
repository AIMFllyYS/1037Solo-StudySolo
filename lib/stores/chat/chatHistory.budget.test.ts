import assert from 'node:assert/strict'
import {test} from 'node:test'
import {activateStorageOwner} from '@/lib/storage/ownerScope'
import {getResourceSnapshot} from '@/lib/performance/resourceMetrics'
import {acquireSessionLease,enforceHotSessionBudget,getHotSessionPressureBytes,useChatHistory} from './chatHistory.ts'

test('byte pressure keeps active and leased sessions, then converges when leases release',()=>{
  activateStorageOwner('11111111-1111-4111-8111-111111111111')
  const ids=['budget-0','budget-1','budget-2','budget-3']
  const body='X'.repeat(6*1024*1024)
  const messages=Object.fromEntries(ids.map(id=>[id,[{id,role:'assistant' as const,parts:[{type:'text' as const,text:body}],timestamp:1}]]))
  useChatHistory.setState({sessionsMeta:ids.map(id=>({id,title:id,createdAt:1,updatedAt:1,messageCount:1,artifactIds:[]})),messagesById:messages,sessionWindowById:{},activeSessionId:ids[0],loadedSessionIds:ids,sessionLoadState:Object.fromEntries(ids.map(id=>[id,'loaded'])),pinnedSessionIds:[],_hasHydrated:true})
  const leases=ids.slice(1).map(id=>acquireSessionLease(id,'visible'))
  try{
    enforceHotSessionBudget()
    assert.equal(Object.keys(useChatHistory.getState().messagesById).length,4)
    assert.ok(getHotSessionPressureBytes()>0)
    leases[1].release()
    assert.equal(useChatHistory.getState().messagesById[ids[2]],undefined)
    assert.equal(useChatHistory.getState().sessionLoadState[ids[2]],'idle')
    leases[2].release()
    assert.equal(useChatHistory.getState().messagesById[ids[3]],undefined)
    assert.equal(getHotSessionPressureBytes(),0)
    assert.ok(getResourceSnapshot().hotMessageEstimatedBytes<=32*1024*1024)
    assert.ok(useChatHistory.getState().messagesById[ids[0]])
    assert.ok(useChatHistory.getState().messagesById[ids[1]])
  }finally{for(const lease of leases)lease.release();activateStorageOwner(null)}
})
