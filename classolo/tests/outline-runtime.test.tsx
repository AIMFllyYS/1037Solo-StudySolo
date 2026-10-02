import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const ai=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('@/classolo/lib/ai',()=>({generateText:ai.generate,createModel:vi.fn()}))
import {startOutlineOrganizer,requestOutlineRefresh,runOutlineRefreshNow,OutlineModelUnavailable} from '@/classolo/features/notes/organizer'
import {resetNotesPublic,patchNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic,hydrateTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {getNotesPublic} from '@/classolo/lib/session'
let stop:(()=>void)|undefined
beforeEach(()=>{
  vi.useFakeTimers();resetNotesPublic();resetTranscriptPublic();ai.generate.mockReset()
  ai.generate.mockImplementation(async({prompt}:{prompt:string})=>{
    const data=JSON.parse(prompt.split('\n').at(-1)!) as {newTranscript:{id:string;text:string}[]}
    return {text:JSON.stringify({nodes:[...new Map(data.newTranscript.map(row=>[row.id,{id:`new-${row.id}`,title:row.text.slice(0,20),parentId:null,sourceSegmentIds:[row.id]}])).values()]})}
  })
})
afterEach(()=>{stop?.();vi.useRealTimers()})
describe('real organizer state and progress integration',()=>{
  it('drains the whole backlog and retains all accumulated topics',async()=>{
    patchTranscriptPublic({sessionId:'lesson',autoOrganize:true});stop=startOutlineOrganizer()
    for(let i=1;i<=40;i++)appendCommitted({id:`s-${i}`,seq:i,text:`主题${i}：`+'字'.repeat(496),startMs:i*1000,endMs:i*1000+500})
    await vi.advanceTimersByTimeAsync(22000)
    expect(ai.generate).toHaveBeenCalledTimes(4)
    const nodes=getNotesPublic().outlineDigest
    expect(new Set(nodes.flatMap(node=>[...(node.sourceSegmentIds??[])])).size).toBe(40)
    for(let i=1;i<=40;i++)expect(nodes.some(node=>node.title.startsWith(`主题${i}：`))).toBe(true)
    expect(Object.keys(getNotesPublic().processedSegments??{})).toHaveLength(40)
  })
  it('keeps passive viewers from running paid analysis until they explicitly request it',async()=>{
    hydrateTranscriptPublic('lesson',[{id:'s-1',seq:1,text:'当前课堂',startMs:0,endMs:1000}]);stop=startOutlineOrganizer()
    appendCommitted({id:'s-2',seq:2,text:'远端新增',startMs:1000,endMs:2000});await vi.advanceTimersByTimeAsync(20000)
    expect(ai.generate).not.toHaveBeenCalled();requestOutlineRefresh();await vi.advanceTimersByTimeAsync(5000);expect(ai.generate).toHaveBeenCalledOnce()
  })
  it('does not automatically repeat an unknown charged request',async()=>{
    const generate=vi.fn(async()=>{throw new OutlineModelUnavailable(new TypeError('sent then disconnected'))})
    patchNotesPublic({outlineDigest:[{id:'old',title:'保留内容'}]});let commit!:()=>void
    stop=startOutlineOrganizer({generate,readTexts:()=>['新文稿'],subscribeCommitted:cb=>{commit=cb;return()=>{}}})
    commit();await vi.advanceTimersByTimeAsync(60000);expect(generate).toHaveBeenCalledOnce();expect(getNotesPublic().outlineDigest[0].title).toBe('保留内容')
  })
  it('finishes an imported transcript outline immediately before its deep link is published',async()=>{
    patchTranscriptPublic({sessionId:'imported-lesson',autoOrganize:true});stop=startOutlineOrganizer()
    appendCommitted({id:'imported-segment',seq:1,text:'窦房结与房室结的传导顺序',startMs:0,endMs:1000})
    await runOutlineRefreshNow(true)
    expect(ai.generate).toHaveBeenCalledOnce()
    expect(getNotesPublic().outlineDigest[0]?.sourceSegmentIds).toContain('imported-segment')
    expect(Object.keys(getNotesPublic().processedSegments??{})).toContain('imported-segment')
  })
})
