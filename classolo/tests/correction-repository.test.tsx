import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import {getClassCorrectionConflicts,getLocalClassSnapshot,getPendingCount,insertTranscriptSegments,queueClassTranscriptCorrection,resolveClassCorrectionConflict,setClassUserId} from '@/classolo/lib/db'
import {suggestTermCorrections} from '@/classolo/features/transcript/term-correction'
import {classCourseProfileSchema} from '@/classolo/lib/course/profile'
const owner='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',segmentId='33333333-3333-4333-8333-333333333333'
const rawText='老师说淋吧细胞',profile=classCourseProfileSchema.parse({disciplineId:'medicine',subdisciplineId:'microbiology-immunology',language:'zh'})
beforeEach(()=>{
  localStorage.clear();setClassUserId(owner)
  localStorage.setItem(`ss-class:v1:${owner}`,JSON.stringify({sessions:{[sid]:{session:{id:sid,userId:owner,title:'课堂',status:'ended',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),profile,asrSnapshot:{family:'text',dialect:'text',model:'none',baseUrl:'',sampleRate:16000}},transcript:[{id:segmentId,sessionId:sid,seq:1,startMs:0,endMs:1000,text:rawText}],outline:null,renders:[],chat:[],corrections:[]}},pending:[]}))
})
afterEach(()=>{setClassUserId(null);vi.unstubAllGlobals()})
describe('local correction durability and conflict queue',()=>{
  it('keeps the original transcript after a confirmed term edit, including offline queueing',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('offline')}))
    const candidate=suggestTermCorrections(segmentId,rawText,['淋巴细胞'])[0]
    const applied=queueClassTranscriptCorrection({userId:owner},{sessionId:sid,segmentId,action:{kind:'term',candidateId:candidate.id}})
    await applied.pending
    expect(applied.row).toMatchObject({revision:1,correctedText:'老师说淋巴细胞'})
    expect(getLocalClassSnapshot(sid)?.transcript[0].text).toBe(rawText)
    expect(getPendingCount()).toBe(1)
  })
  it('isolates a correction conflict so later transcript writes can continue',async()=>{
    let conflict=true
    vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init:RequestInit)=>{
      const body=JSON.parse(String(init.body))
      return body.op==='correction.save'&&conflict?Response.json({code:'CORRECTION_CONFLICT',revision:2,correction:{sessionId:sid,segmentId,revision:2,correctedText:'老师说淋巴细胞已经更新',history:[]},error:'冲突'},{status:409}):Response.json({ok:true,correction:getLocalClassSnapshot(sid)?.corrections?.[0]})
    }))
    const candidate=suggestTermCorrections(segmentId,rawText,['淋巴细胞'])[0]
    await queueClassTranscriptCorrection({userId:owner},{sessionId:sid,segmentId,action:{kind:'term',candidateId:candidate.id}}).pending
    expect(getClassCorrectionConflicts(sid)).toHaveLength(1);expect(getPendingCount()).toBe(0)
    await insertTranscriptSegments({userId:owner},[{id:crypto.randomUUID(),sessionId:sid,seq:2,startMs:1000,endMs:2000,text:'后续新片段'}])
    expect(getLocalClassSnapshot(sid)?.transcript).toHaveLength(2)
    conflict=false
    const local=resolveClassCorrectionConflict({userId:owner},sid,segmentId,'local');expect(local?.row?.revision).toBe(3);await local?.pending
    expect(getClassCorrectionConflicts(sid)).toHaveLength(0);expect(getLocalClassSnapshot(sid)?.transcript[0].text).toBe(rawText)
  })
})
