import assert from 'node:assert/strict'
import {test} from 'node:test'
import {ensureClassChatSession} from '../lib/agent/class-chat.ts'

const context={subjectId:'anatomy',categoryId:'',itemId:'',currentTopic:'课堂 心动周期',academicYear:'sophomore-1'}
function fixture(){
  const values=new Map<string,string>(),created:string[]=[] ,switched:string[]=[]
  const history={_hasHydrated:true,sessionsMeta:[] as Array<{id:string}>,createSession:()=>{const id=`chat-${created.length+1}`;created.push(id);history.sessionsMeta.push({id});return id},switchSession:(id:string)=>{switched.push(id)},updateSessionTitle:()=>{}}
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  return {history,storage,created,switched,values}
}
test('Class questions create one lesson-bound conversation and reuse it',()=>{
  const f=fixture()
  const first=ensureClassChatSession(f.history,'owner-A','lesson-1',context,'心动周期',f.storage)
  const second=ensureClassChatSession(f.history,'owner-A','lesson-1',context,'心动周期',f.storage)
  assert.equal(first,'chat-1');assert.equal(second,first)
  assert.deepEqual(f.created,['chat-1']);assert.deepEqual(f.switched,['chat-1'])
})
test('Class chat mapping stays scoped by account and lesson',()=>{
  const f=fixture()
  assert.equal(ensureClassChatSession(f.history,'owner-A','lesson-1',context,'A',f.storage),'chat-1')
  assert.equal(ensureClassChatSession(f.history,'owner-A','lesson-2',context,'B',f.storage),'chat-2')
  assert.equal(ensureClassChatSession(f.history,'owner-B','lesson-1',context,'A',f.storage),'chat-3')
})
test('Class chat does not create a conversation before hydration',()=>{
  const f=fixture();f.history._hasHydrated=false
  assert.equal(ensureClassChatSession(f.history,'owner-A','lesson-1',context,'A',f.storage),null)
  assert.deepEqual(f.created,[])
})
