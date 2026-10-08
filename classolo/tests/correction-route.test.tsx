// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({verify:vi.fn(),rpc:vi.fn(),calls:[] as [string,string,unknown][],correction:null as null|Record<string,unknown>}))
vi.mock('@/lib/files/owner.server',()=>({fileOwner:async()=>{const user=await f.verify();if(!user||user.mfaRequired)throw Object.assign(new Error('请先完成账号验证'),{status:user?403:401});return user.id;},fileFailure:(error:{message:string;status?:number})=>Response.json({error:error.message},{status:error.status??503})}))
vi.mock('@/lib/auth/serviceClient',()=>({createServiceAuthClient:()=>({from:(table:string)=>{
  const chain:Record<string,unknown>={};chain.select=()=>chain;chain.eq=(name:string,value:unknown)=>{f.calls.push([table,name,value]);return chain}
  chain.maybeSingle=async()=>({error:null,data:table==='ss_class_sessions'?{id:'22222222-2222-4222-8222-222222222222',user_id:'11111111-1111-4111-8111-111111111111',payload:{profile:{version:1,disciplineId:'medicine',subdisciplineId:'microbiology-immunology',language:'zh',courseName:'',materialSubjectId:null,customTerms:[]}}}:table==='ss_class_transcripts'?{payload:{text:'老师说淋吧细胞'}}:f.correction});return chain
},rpc:f.rpc})}))
import {POST} from '@/app/api/class/state/route'
import {suggestTermCorrections} from '@/classolo/features/transcript/term-correction'
const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',segment='33333333-3333-4333-8333-333333333333',key='44444444-4444-4444-8444-444444444444'
const candidateId=suggestTermCorrections(segment,'老师说淋吧细胞',['淋巴细胞'])[0].id
function request(action:{kind:string;candidateId?:string;text?:string;atMs?:number}={kind:'term',candidateId,atMs:1234},expectedRevision=0){return new Request('https://local.invalid/api/class/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'correction.save',expectedUserId:owner,operationKey:key,input:{sessionId:lesson,segmentId:segment,expectedRevision,action}})})}
beforeEach(()=>{vi.clearAllMocks();f.calls.length=0;f.correction=null;f.verify.mockResolvedValue({id:owner,mfaRequired:false});f.rpc.mockImplementation(async(_name,args)=>({error:null,data:{status:'saved',revision:1,row:{sessionId:lesson,segmentId:segment,revision:1,correctedText:args.p_next_text,history:args.p_history,actionHash:args.p_action_hash}}}))})
describe('authenticated classroom correction endpoint',()=>{
  it('saves a student-approved term overlay with a stable operation key and leaves ASR raw text intact',async()=>{
    const result=await POST(request());expect(result.status).toBe(200);expect((await result.json()).correction.correctedText).toBe('老师说淋巴细胞')
    const [name,args]=f.rpc.mock.calls[0];expect(name).toBe('ss_class_save_correction');expect(args).toMatchObject({p_user_id:owner,p_session_id:lesson,p_segment_id:segment,p_expected_revision:0,p_operation_key:key,p_next_text:'老师说淋巴细胞'})
    expect(f.calls).toContainEqual(['ss_class_transcripts','user_id',owner]);expect(f.calls).toContainEqual(['ss_class_corrections','user_id',owner])
  })
  it('acks a lost response retry without paying for or writing a second correction',async()=>{
    const first=await POST(request());const body=await first.json();f.correction={payload:body.correction,revision:1,last_operation_key:key};f.rpc.mockClear()
    const retried=await POST(request());expect(retried.status).toBe(200);expect(f.rpc).not.toHaveBeenCalled()
  })
  it('reports a stale edit with the latest overlay rather than overwriting it',async()=>{
    f.correction={payload:{sessionId:lesson,segmentId:segment,revision:2,correctedText:'云端修改',history:[]},revision:2,last_operation_key:crypto.randomUUID()}
    const response=await POST(request());expect(response.status).toBe(409);expect(await response.json()).toMatchObject({code:'CORRECTION_CONFLICT',revision:2});expect(f.rpc).not.toHaveBeenCalled()
  })
})
