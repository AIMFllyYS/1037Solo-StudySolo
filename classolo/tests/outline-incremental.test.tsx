import {beforeEach,describe,expect,it,vi} from 'vitest'
const ai=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('@/classolo/lib/ai',()=>({generateText:ai.generate,createModel:vi.fn()}))
import {modelOutline} from '@/classolo/features/notes/organizer'
import {resetNotesPublic,patchNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,appendCommitted} from '@/classolo/lib/session/writes/transcript'
const old={id:'old-topic',title:'先前主题',parentId:null,sourceSegmentIds:['s-old']}
beforeEach(()=>{
  resetNotesPublic();resetTranscriptPublic();ai.generate.mockReset()
  appendCommitted({id:'s-old',seq:1,text:'先前主题的课堂内容',startMs:0,endMs:1000})
  appendCommitted({id:'s-new',seq:2,text:'新主题的课堂内容',startMs:1000,endMs:2000})
  patchNotesPublic({outlineDigest:[old]})
})
describe('incremental classroom outline',()=>{
  it('retains earlier topics and binds a new topic to a real segment',async()=>{
    ai.generate.mockResolvedValue({text:JSON.stringify({nodes:[{id:'new-1',title:'新主题',parentId:null,sourceSegmentIds:['s-new']}]})})
    const result=await modelOutline(['新主题的课堂内容'])
    expect(result.find(n=>n.id===old.id)).toMatchObject(old)
    expect(result.find(n=>n.title==='新主题')?.sourceSegmentIds).toEqual(['s-new'])
    expect(ai.generate.mock.calls[0][0].prompt).toContain(old.id)
  })
  it('preserves node identity when the model refines a title',async()=>{
    ai.generate.mockResolvedValue({text:JSON.stringify({nodes:[{id:old.id,title:'更准确的主题',parentId:null,sourceSegmentIds:['s-old']}]})})
    const result=await modelOutline(['先前主题的课堂内容'])
    expect(result).toHaveLength(1);expect(result[0]).toMatchObject({id:old.id,title:'更准确的主题'})
  })
  it('keeps user-locked content intact',async()=>{
    const manual={...old,locked:true,origin:'manual' as const};patchNotesPublic({outlineDigest:[manual]})
    ai.generate.mockResolvedValue({text:JSON.stringify({nodes:[{id:old.id,title:'模型覆盖',parentId:null,sourceSegmentIds:['s-new']}]})})
    expect((await modelOutline(['新主题的课堂内容']))[0]).toEqual(manual)
  })
  it('rejects fabricated provenance rather than storing an unresolvable citation',async()=>{
    ai.generate.mockResolvedValue({text:JSON.stringify({nodes:[{id:'new',title:'主题',parentId:null,sourceSegmentIds:['other-lesson-segment']}]})})
    await expect(modelOutline(['新主题的课堂内容'])).rejects.toThrow('outline model unavailable')
  })
})
