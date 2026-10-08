// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotesPublic } from '@/classolo/lib/session'
import { patchNotesPublic, resetNotesPublic } from '@/classolo/lib/session/writes/notes'
const f=vi.hoisted(()=>({verify:vi.fn(),rpc:vi.fn(),upsert:vi.fn(),from:vi.fn()}))
vi.mock('@/lib/files/owner.server',()=>({fileOwner:async()=>{const user=await f.verify();if(!user||user.mfaRequired)throw Object.assign(new Error('请先完成账号验证'),{status:user?403:401});return user.id;},fileFailure:(error:{message:string;status?:number})=>Response.json({error:error.message},{status:error.status??503})}))
vi.mock('@/lib/auth/serviceClient',()=>({createServiceAuthClient:()=>({from:f.from,rpc:f.rpc})}))
import { POST } from '@/app/api/class/state/route'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222'
const nodes=[{id:'root',title:'力学',parentId:null,sourceSegmentIds:['seg-1']},{id:'child',title:'定律',parentId:'root',sourceSegmentIds:['seg-2']}]
function request(over:Record<string,unknown>={}){return new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'outline.save',expectedUserId:owner,operationKey:'33333333-3333-4333-8333-333333333333',input:{sessionId:sid,expectedRevision:3,revision:4,outline:{nodes},...over}})})}
beforeEach(()=>{
  vi.resetAllMocks();resetNotesPublic();f.verify.mockResolvedValue({id:owner,mfaRequired:false});f.upsert.mockResolvedValue({error:null})
  f.rpc.mockResolvedValue({data:{status:'saved',revision:4,payload:{nodes}},error:null})
  f.from.mockImplementation(()=>{const chain:{[k:string]:unknown}={};chain.select=chain.eq=()=>chain;chain.maybeSingle=async()=>({data:{id:sid,user_id:owner},error:null});chain.upsert=f.upsert;return chain})
})
describe('outline cloud round trip',()=>{
  it('exposes version checks with the same authenticated owner filter',async()=>{
    const chain:{[key:string]:unknown}={};chain.select=()=>chain;chain.eq=vi.fn(()=>chain);chain.maybeSingle=async()=>({data:{id:sid,user_id:owner,cloud_revision:12},error:null});f.from.mockReturnValue(chain)
    const response=await POST(new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'session.version',expectedUserId:owner,input:{id:sid}})}))
    expect(response.status).toBe(200);expect(await response.json()).toEqual({revision:'12'});expect(chain.eq).toHaveBeenCalledWith('user_id',owner)
  })
  it('preserves persisted processing progress and fixed-node ownership',async()=>{
    const outline={nodes:[{...nodes[0],locked:true,origin:'manual'}],processedSegments:{'seg-1':{chars:10,fingerprint:'10:hash'}}}
    expect((await POST(request({outline}))).status).toBe(200);expect(f.rpc.mock.calls[0][1].p_outline).toEqual(outline)
  })
  it('restores a supplied revision without resetting it to one',()=>{patchNotesPublic({outlineDigest:nodes,outlineVersion:41});expect(getNotesPublic().outlineVersion).toBe(41);patchNotesPublic({outlineDigest:[...nodes]});expect(getNotesPublic().outlineVersion).toBe(42)})
  it('preserves hierarchy and provenance in the atomic RPC payload',async()=>{
    expect((await POST(request())).status).toBe(200)
    expect(f.rpc).toHaveBeenCalledWith('ss_class_save_outline',expect.objectContaining({p_user_id:owner,p_session_id:sid,p_expected_revision:3,p_revision:4,p_outline:{nodes},p_operation_key:'33333333-3333-4333-8333-333333333333'}))
    expect(f.upsert).not.toHaveBeenCalled()
  })
  it('returns a conflict and the current revision rather than overwriting a newer outline',async()=>{
    f.rpc.mockResolvedValue({data:{status:'conflict',revision:41,payload:{nodes}},error:null})
    const response=await POST(request());expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'OUTLINE_CONFLICT',revision:41})
  })
  it('rejects cyclic or orphan trees before any database write',async()=>{
    expect((await POST(request({outline:{nodes:[{id:'a',title:'a',parentId:'b'},{id:'b',title:'b',parentId:'a'}]}}))).status).toBe(400)
    expect((await POST(request({outline:{nodes:[{id:'a',title:'a',parentId:'missing'}]}}))).status).toBe(400)
    expect(f.rpc).not.toHaveBeenCalled();expect(f.upsert).not.toHaveBeenCalled()
  })
})
