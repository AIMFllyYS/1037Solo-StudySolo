import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react'
const fixture=vi.hoisted(()=>({queue:vi.fn(),refresh:vi.fn()}))
vi.mock('@/classolo/lib/db',()=>({getDb:async()=>({userId:'synthetic'}),queueClassTranscriptCorrection:fixture.queue}))
vi.mock('@/classolo/features/notes/organizer',()=>({requestOutlineRefresh:fixture.refresh}))
import {TranscriptSegmentLine} from '@/classolo/features/transcript/segment-line'
import {getTranscriptPublic} from '@/classolo/lib/session'
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
const sid='22222222-2222-4222-8222-222222222222',source={id:'33333333-3333-4333-8333-333333333333',seq:1,text:'老师说淋吧细胞',startMs:0,endMs:1000}
beforeEach(()=>{vi.resetAllMocks();resetTranscriptPublic();patchTranscriptPublic({sessionId:sid,recordingStatus:'stopped'});appendCommitted(source)
  fixture.queue.mockReturnValue({row:{revision:1,correctedText:'老师说淋巴细胞'},pending:Promise.resolve()})
})
afterEach(cleanup)
describe('classroom transcript correction controls',()=>{
  it('offers a reviewed term, keeps the original visible, and updates the live classroom after approval',async()=>{
    render(<TranscriptSegmentLine segment={source} sessionId={sid} terms={['淋巴细胞']} highlighted={false}/>)
    fireEvent.click(screen.getByRole('button',{name:'更正第1段文稿'}))
    expect(screen.getByText(/ASR 原文/)).toHaveTextContent(source.text)
    fireEvent.click(screen.getByRole('button',{name:'淋吧细胞 → 淋巴细胞'}))
    await waitFor(()=>expect(getTranscriptPublic().committed[0]).toMatchObject({text:'老师说淋巴细胞',rawText:source.text,correctionRevision:1}))
    expect(fixture.queue).toHaveBeenCalledWith(expect.anything(),{sessionId:sid,segmentId:source.id,action:{kind:'term',candidateId:expect.any(String)}})
    expect(fixture.refresh).toHaveBeenCalledOnce()
  })
  it('lets the student deliberately edit a phrase if no preset candidate exists',async()=>{
    render(<TranscriptSegmentLine segment={source} sessionId={sid} terms={[]} highlighted={false}/>)
    fireEvent.click(screen.getByRole('button',{name:'更正第1段文稿'}))
    fireEvent.change(screen.getByLabelText('手动校正第1段'),{target:{value:'老师说淋巴细胞'}})
    fireEvent.click(screen.getByRole('button',{name:'保存校正'}))
    await waitFor(()=>expect(fixture.queue).toHaveBeenCalledWith(expect.anything(),{sessionId:sid,segmentId:source.id,action:{kind:'manual',text:'老师说淋巴细胞'}}))
  })
})
