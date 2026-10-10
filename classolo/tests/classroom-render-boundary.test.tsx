// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({verify:vi.fn(),from:vi.fn(),upsert:vi.fn(),ids:vi.fn()}))
vi.mock('@/lib/files/owner.server',()=>({fileOwner:async()=>{const user=await f.verify();if(!user||user.mfaRequired)throw Object.assign(new Error('请先完成账号验证'),{status:user?403:401});return user.id;},fileFailure:(error:{message:string;status?:number})=>Response.json({error:error.message},{status:error.status??503})}))
vi.mock('@/lib/auth/server/serviceClient',()=>({createServiceAuthClient:()=>({from:f.from})}))
import {POST} from '@/app/api/class/state/route'
const owner='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222',sourceId='33333333-3333-4333-8333-333333333333'
beforeEach(()=>{
  vi.resetAllMocks();f.verify.mockResolvedValue({id:owner,mfaRequired:false});f.upsert.mockResolvedValue({error:null});f.ids.mockReturnValue([{id:sourceId}])
  f.from.mockImplementation((table:string)=>{const chain:Record<string,unknown>={};chain.select=chain.eq=()=>chain;chain.in=async()=>({error:null,data:f.ids()});chain.maybeSingle=async()=>({error:null,data:table==='ss_class_sessions'?{id:sessionId,user_id:owner}:{id:sourceId}});chain.upsert=f.upsert;return chain})
})
function request(module:string,props:Record<string,unknown>,anchor?:string){return new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'render.save',expectedUserId:owner,input:{id:'card-1',sessionId,module,version:'1.0',target:'transcript',props,source:'silent-agent',transcriptAnchor:anchor}})})}
describe('classroom fixed artifact boundary',()=>{
  it('persists a cited answer only when its evidence belongs to the owned class',async()=>{
    const props={question:'什么是重点？',assessmentId:'card-1',attempts:[{id:crypto.randomUUID(),response:'A',answer:`依据 [${sourceId}]`,evidenceIds:[sourceId],sourceRevisions:{[sourceId]:0},atMs:1}]}
    expect((await POST(request('ai-ask',props))).status).toBe(200)
    f.ids.mockReturnValue([])
    expect((await POST(request('ai-ask',props))).status).toBe(400)
    expect((await POST(request('ai-ask',{...props,assessmentId:'other'}))).status).toBe(400)
  })
  it('accepts a fixed SVG artifact with an owned source and rejects an alien source',async()=>{
    const props={kind:'svg',title:'抽象示意',content:'<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>',sourceSegmentId:sourceId,sourceRevision:0}
    expect((await POST(request('visual',props,sourceId))).status).toBe(200)
    expect((await POST(request('visual',props,crypto.randomUUID()))).status).toBe(400)
  })
})
