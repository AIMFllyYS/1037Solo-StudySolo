// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({verify:vi.fn(),course:vi.fn(),config:vi.fn(),reserve:vi.fn(),settle:vi.fn(),cancel:vi.fn()}))
vi.mock('@/lib/auth/server/aiGate',()=>({extractAccessToken:()=> 'synthetic',verifySupabaseAccessToken:f.verify}))
vi.mock('@/lib/content/noteImages',()=>({searchNoteImages:f.course}))
vi.mock('@/lib/billing/settlement/classImageSearch',()=>({classImageSearchConfig:f.config}))
vi.mock('@/lib/billing/settlement/centralCredits',()=>({reserveCredit:f.reserve,settleCredit:f.settle,cancelCredit:f.cancel,CreditAdmissionError:class CreditAdmissionError extends Error{constructor(message:string,readonly status:number){super(message)}}}))
import {POST} from '@/app/api/class/image-search/route'

beforeEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();f.verify.mockResolvedValue({id:'11111111-1111-4111-8111-111111111111',mfaRequired:false});f.config.mockReturnValue({key:'synthetic',cnyPerCall:1});f.reserve.mockResolvedValue({id:'reservation'});f.settle.mockResolvedValue(undefined)})
function request(){return new Request('https://local.invalid/api/class/image-search',{method:'POST',headers:{'content-type':'application/json','x-request-id':crypto.randomUUID()},body:JSON.stringify({query:'肝小叶',subjectId:'histology'})})}
describe('classroom image evidence order',()=>{
  it('uses an on-site textbook image before paid external search',async()=>{
    f.course.mockReturnValue([{src:'/images/histology/textbook/fig.png',alt:'肝小叶',caption:'肝小叶结构',path:'histology/textbook/ch01',title:'组胚教材',score:8}])
    const remote=vi.spyOn(globalThis,'fetch')
    const response=await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({charged:false,results:[{provider:'course',url:'/images/histology/textbook/fig.png',pageUrl:'/histology/textbook/ch01'}]})
    expect(f.config).not.toHaveBeenCalled();expect(f.reserve).not.toHaveBeenCalled();expect(remote).not.toHaveBeenCalled()
  })
  it('uses the billable image API only if no relevant local figure is found',async()=>{
    f.course.mockReturnValue([])
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({results:[{id:'photo-1',urls:{small:'https://images.unsplash.com/photo.jpg'},user:{name:'Artist'}}]}),{status:200}))
    const response=await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({charged:true,results:[{provider:'unsplash',pageUrl:'https://unsplash.com/photos/photo-1'}]})
    expect(f.reserve).toHaveBeenCalledOnce();expect(f.settle).toHaveBeenCalledOnce()
  })
})
