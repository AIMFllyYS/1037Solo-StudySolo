import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('@/lib/storage/chatStorage',async importOriginal=>({...await importOriginal<typeof import('@/lib/storage/chatStorage')>(),loadSessionWindow:f.read}))
import {activateStorageOwner} from '@/lib/storage/ownerScope'
import {useChatHistory} from '@/lib/stores/chat/chatHistory'

beforeEach(()=>{f.read.mockReset();activateStorageOwner('11111111-1111-4111-8111-111111111111');useChatHistory.setState({sessionsMeta:[{id:'session-a',title:'A',createdAt:1,updatedAt:1,messageCount:1,artifactIds:[]}],messagesById:{},sessionWindowById:{},sessionLoadState:{},activeSessionId:'session-a',loadedSessionIds:[],pinnedSessionIds:[],_hasHydrated:true})})
afterEach(()=>{activateStorageOwner(null);vi.clearAllMocks()})
it('does not revive A messages after B becomes the active owner',async()=>{
  let release:(value:unknown)=>void=()=>{}
  f.read.mockReturnValue(new Promise(resolve=>{release=resolve}))
  const pending=useChatHistory.getState().ensureSessionLoaded('session-a')
  activateStorageOwner('22222222-2222-4222-8222-222222222222')
  release({messages:[{id:'a-message',role:'assistant',parts:[{type:'text',text:'synthetic A'}],timestamp:1}],spine:[],turnCount:1,messageCount:1,startTurn:0,startIndex:0})
  await pending
  expect(useChatHistory.getState().messagesById['session-a']).toBeUndefined()
  expect(useChatHistory.getState().sessionsMeta).toHaveLength(0)
})
