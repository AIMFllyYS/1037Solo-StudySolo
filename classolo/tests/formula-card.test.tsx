import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
vi.mock('@/classolo/components/markdown',()=>({MarkdownStream:({markdown}:{markdown:string})=><div>{markdown}</div>}))
import {FormulaModule} from '@/classolo/features/render-modules/formula/Component'
import {validateFormulaProposal} from '@/classolo/features/formulas/validate'
import {getRenderMessages} from '@/classolo/lib/session'
import {resetRenderProjection} from '@/classolo/lib/session/writes/render'
import {resetTranscriptPublic,appendCommitted,patchTranscriptPublic,replaceCommitted} from '@/classolo/lib/session/writes/transcript'
import {setClassUserId} from '@/classolo/lib/db'
const owner='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',segmentId='33333333-3333-4333-8333-333333333333'
const source={id:segmentId,seq:1,text:'老师说二加二等于四。',startMs:0,endMs:8000}
const props=validateFormulaProposal({sourceSegmentId:segmentId,spokenText:'二加二等于四',latex:'2+2=4'},source.text,0)
const message={id:props.id,module:'formula',version:'1.0',target:'transcript' as const,props,meta:{createdAt:1,source:'silent-agent' as const,transcriptAnchor:segmentId}}
beforeEach(()=>{setClassUserId(owner);resetTranscriptPublic();resetRenderProjection();patchTranscriptPublic({sessionId:lesson});appendCommitted(source)})
afterEach(()=>{cleanup();setClassUserId(null)})
describe('formula status shown to a student',()=>{
  it('separates layout/numeric checks from the student confirming the source',()=>{
    render(<FormulaModule props={props} message={message}/>)
    expect(screen.getByText('排版可渲染')).toBeInTheDocument();expect(screen.getByText('有理数等式已检验')).toBeInTheDocument()
    expect(screen.queryByText('学生已确认与课堂来源一致')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'确认与课堂原文一致'}))
    expect(getRenderMessages('transcript')[0].props).toMatchObject({studentConfirmed:true,locked:true})
  })
  it('invalidates source confirmation after the underlying transcript changes',()=>{
    replaceCommitted({...source,text:'老师说别的公式',rawText:source.text,correctionRevision:1})
    render(<FormulaModule props={{...props,studentConfirmed:true}} message={message}/>)
    expect(screen.getByText('来源文稿已变化，需重新核对')).toBeInTheDocument()
    expect(screen.queryByText('学生已确认与课堂来源一致')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'确认与课堂原文一致'})).toBeDisabled()
  })
  it('lets the student select a concrete interpretation before checking an ambiguous formula',()=>{
    const ambiguous={...props,latex:'(a+b)^2',alternatives:['a+b^2','(a+b)^2'],semanticStatus:'ambiguous' as const}
    render(<FormulaModule props={ambiguous} message={{...message,props:ambiguous}}/>)
    fireEvent.click(screen.getByRole('button',{name:'a+b^2'}))
    expect(screen.getByLabelText('编辑公式 LaTeX')).toHaveValue('a+b^2')
  })
})
