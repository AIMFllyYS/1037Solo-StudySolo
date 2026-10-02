import {describe,expect,it} from 'vitest'
import {suggestTermCorrections,applyTermCorrection,undoLastCorrection,applyManualCorrection,planTranscriptCorrection} from '@/classolo/features/transcript/term-correction'
import {classCourseProfileSchema} from '@/classolo/lib/course/profile'
const ownerLesson='22222222-2222-4222-8222-222222222222',segmentId='33333333-3333-4333-8333-333333333333'
const profile=classCourseProfileSchema.parse({disciplineId:'medicine',subdisciplineId:'microbiology-immunology',language:'zh'})
describe('non-destructive subject terminology review',()=>{
  it('offers a one-character professional term correction without editing the source',()=>{
    const original='老师说淋吧细胞在这里成熟。'
    const candidate=suggestTermCorrections('s-1',original,['淋巴细胞'])[0]
    expect(candidate).toMatchObject({heard:'淋吧细胞',term:'淋巴细胞'})
    expect(original).toContain('淋吧细胞')
    const corrected=applyTermCorrection(original,candidate)
    expect(corrected.text).toBe('老师说淋巴细胞在这里成熟。')
    expect(undoLastCorrection(corrected.text,corrected.history).text).toBe(original)
  })
  it('does not propose a number or negation substitution',()=>{
    expect(suggestTermCorrections('s-1','剂量120毫克',['剂量100毫克'])).toHaveLength(0)
    expect(suggestTermCorrections('s-1','无菌操作',['有菌操作'])).toHaveLength(0)
  })
  it('keeps deliberate manual edits reversible, including an emoji before the edit',()=>{
    const original='🧠线粒题产生能量',manual=applyManualCorrection(original,'🧠线粒体产生能量')
    expect(manual.history[0].start).toBe(4)
    expect(undoLastCorrection(manual.text,manual.history).text).toBe(original)
  })
  it('rejects a stale candidate after the text has changed',()=>{
    const candidate=suggestTermCorrections('s-1','淋吧细胞',['淋巴细胞'])[0]
    expect(()=>applyTermCorrection('淋巴细胞',candidate)).toThrow('已变化')
  })
  it('keeps raw ASR text untouched through approve, undo and reset revisions',()=>{
    const rawText='🧠老师说淋吧细胞',candidate=suggestTermCorrections(segmentId,rawText,['淋巴细胞'])[0]
    const accepted=planTranscriptCorrection({sessionId:ownerLesson,segmentId,rawText,profile,action:{kind:'term',candidateId:candidate.id}})
    expect(rawText).toContain('淋吧细胞');expect(accepted).toMatchObject({revision:1,correctedText:'🧠老师说淋巴细胞'})
    const undone=planTranscriptCorrection({sessionId:ownerLesson,segmentId,rawText,profile,previous:accepted,action:{kind:'undo'}})
    expect(undone).toMatchObject({revision:2,correctedText:rawText,history:[]})
    const manual=planTranscriptCorrection({sessionId:ownerLesson,segmentId,rawText,profile,previous:undone,action:{kind:'manual',text:'🧠老师讲了淋巴细胞'}})
    const reset=planTranscriptCorrection({sessionId:ownerLesson,segmentId,rawText,profile,previous:manual,action:{kind:'reset'}})
    expect(reset).toMatchObject({revision:4,correctedText:rawText,history:[]})
  })
})
