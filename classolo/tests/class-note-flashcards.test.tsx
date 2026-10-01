import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'

const ai=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('@/classolo/lib/ai',()=>({createModel:()=>({}),generateText:ai.generate}))
import {buildClassNoteMarkdown,resolveClassNoteProposal,saveClassNote} from '@/classolo/features/notes/class-note'
import {generateClassroomFlashcards} from '@/classolo/features/notes/knowledge-cards'
import {setClassUserId} from '@/classolo/lib/db'
import {patchTranscriptPublic,resetTranscriptPublic,appendCommitted} from '@/classolo/lib/session/writes/transcript'
import {useUserNotes} from '@/lib/stores/userNotes'
import {useReviewCards} from '@/lib/stores/reviewCards'

const owner='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{setClassUserId(owner);resetTranscriptPublic();patchTranscriptPublic({sessionId,recordingStatus:'stopped'});useUserNotes.setState({byId:{},order:[],_hasHydrated:true});useReviewCards.setState({byId:{},order:[],_hasHydrated:true});ai.generate.mockReset()})
afterEach(()=>setClassUserId(null))

describe('whole-course notes and review cards',()=>{
  it('updates one class note while preserving manual writing and proposing changes after an edit',()=>{
    const row={id:'seg-1',seq:1,text:'牛顿第二定律',startMs:0,endMs:1000}
    const markdown=buildClassNoteMarkdown({sessionId,title:'物理',transcript:[row],outline:[{id:'topic',title:'运动',sourceSegmentIds:[row.id]}],renders:[]})
    expect(markdown).toContain(`/class?session=${sessionId}&segment=seg-1`)
    const first=saveClassNote({ownerId:owner,sessionId,title:'物理',subjectId:'physics',markdown})
    const notes=useUserNotes.getState()
    notes.updateNote(first.id,{markdown:`${notes.byId[first.id].markdown}\n我自己的理解`})
    const updated=saveClassNote({ownerId:owner,sessionId,noteId:first.id,title:'物理',subjectId:'physics',markdown:markdown+'\n新增内容'})
    expect(updated).toMatchObject({id:first.id,status:'updated'})
    expect(useUserNotes.getState().byId[first.id].markdown).toContain('我自己的理解')
    const changed=useUserNotes.getState().byId[first.id].markdown.replace('牛顿第二定律','老师课堂里的原文')
    notes.updateNote(first.id,{markdown:changed})
    const proposal=saveClassNote({ownerId:owner,sessionId,noteId:first.id,title:'物理',subjectId:'physics',markdown:markdown+'\n再新增'})
    expect(proposal.status).toBe('proposal')
    expect(useUserNotes.getState().byId[first.id].markdown).toContain('老师课堂里的原文')
    expect(useUserNotes.getState().order).toEqual([first.id])
    const accepted=resolveClassNoteProposal(useUserNotes.getState().byId[first.id],'accept')
    expect(accepted?.markdown).toContain('再新增')
    expect(accepted?.markdown).toContain('我自己的理解')
    expect(accepted?.markdown).not.toContain('待采纳课堂更新')
  })
  it('covers every transcript batch and saves cards with real source IDs',async()=>{
    for(let index=0;index<25;index++)appendCommitted({id:`seg-${index}`,seq:index+1,text:`概念 ${index}`,startMs:index*1000,endMs:(index+1)*1000})
    ai.generate.mockImplementation(async ({prompt}:{prompt:string})=>{
      const id=prompt.match(/\[(seg-\d+)\]/)?.[1]
      return {text:JSON.stringify({cards:[{front:`复习 ${id}`,back:'答案',sourceSegmentIds:[id]}]})}
    })
    const result=await generateClassroomFlashcards({sessionId,subjectId:'physics',title:'整节课'})
    expect(ai.generate).toHaveBeenCalledTimes(3)
    expect(result).toEqual({saved:3})
    expect(Object.values(useReviewCards.getState().byId).every(card=>card.classSessionId===sessionId&&card.sourceSegmentIds?.length===1)).toBe(true)
    const again=await generateClassroomFlashcards({sessionId,subjectId:'physics'})
    expect(again.saved).toBe(0)
  })
  it('does not write any cards if the account switches before generation finishes',async()=>{
    appendCommitted({id:'seg-1',seq:1,text:'内容',startMs:0,endMs:1000})
    let release:(value:{text:string})=>void=()=>{}
    ai.generate.mockReturnValue(new Promise(resolve=>{release=resolve}))
    const pending=generateClassroomFlashcards({sessionId})
    setClassUserId('44444444-4444-4444-8444-444444444444')
    release({text:JSON.stringify({cards:[{front:'问题',back:'答案',sourceSegmentIds:['seg-1']}]})})
    expect((await pending).saved).toBe(0)
    expect(useReviewCards.getState().order).toHaveLength(0)
  })
})
