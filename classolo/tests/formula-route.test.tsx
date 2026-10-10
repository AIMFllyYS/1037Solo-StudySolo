// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({verify:vi.fn(),from:vi.fn(),upsert:vi.fn(),source:vi.fn()}))
vi.mock('@/lib/files/owner.server',()=>({fileOwner:async()=>{const user=await f.verify();if(!user||user.mfaRequired)throw Object.assign(new Error('请先完成账号验证'),{status:user?403:401});return user.id;},fileFailure:(error:{message:string;status?:number})=>Response.json({error:error.message},{status:error.status??503})}))
vi.mock('@/lib/auth/server/serviceClient',()=>({createServiceAuthClient:()=>({from:f.from})}))
import {POST} from '@/app/api/class/state/route'
import {validateFormulaProposal} from '@/classolo/features/formulas/validate'
const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',sourceId='33333333-3333-4333-8333-333333333333'
const props=validateFormulaProposal({sourceSegmentId:sourceId,spokenText:'二加二等于四',latex:'2+2=4'},'老师说二加二等于四',0)
beforeEach(()=>{
  vi.resetAllMocks();f.verify.mockResolvedValue({id:owner,mfaRequired:false});f.source.mockReturnValue({id:sourceId});f.upsert.mockResolvedValue({error:null})
  f.from.mockImplementation((table:string)=>{const chain:Record<string,unknown>={};chain.select=chain.eq=()=>chain;chain.maybeSingle=async()=>({error:null,data:table==='ss_class_sessions'?{id:lesson,user_id:owner}:f.source()});chain.upsert=f.upsert;return chain})
})
function request(proposal:Record<string,unknown>,anchor=sourceId){return new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'render.save',expectedUserId:owner,input:{id:props.id,sessionId:lesson,module:'formula',version:'1.0',target:'transcript',props:proposal,source:'silent-agent',transcriptAnchor:anchor,createdAt:new Date().toISOString()}})})}
describe('formula cloud persistence boundary',()=>{
  it('stores a validated candidate anchored to an owned transcript segment',async()=>{
    const response=await POST(request(props));expect(response.status).toBe(200)
    expect(f.upsert.mock.calls[0][0].payload.props).toMatchObject({sourceSegmentId:sourceId,renderStatus:'valid',semanticStatus:'checked',studentConfirmed:false})
  })
  it('rejects a missing or mismatched source and malformed formula state',async()=>{
    expect((await POST(request({...props,renderStatus:'made-up'}))).status).toBe(400)
    expect((await POST(request(props,crypto.randomUUID()))).status).toBe(400)
    f.source.mockReturnValue(null)
    expect((await POST(request(props))).status).toBe(400)
    expect(f.upsert).not.toHaveBeenCalled()
  })
})
