import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'

vi.mock('@/classolo/components/markdown',()=>({MarkdownStream:({markdown}:{markdown:string})=><div>{markdown}</div>}))
vi.mock('@/classolo/features/render-modules/ai-ask/answer',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/classolo/features/render-modules/ai-ask/answer')>()
  return {...actual,answerClassQuestion:vi.fn(async ({sources,onChunk}:{sources:{id:string}[];onChunk:(text:string)=>void})=>{const text=`参考答案是 A。依据 [${sources[0].id}]。`;onChunk(text);return text})}
})
vi.mock('@/classolo/features/render-modules/image/search',()=>({searchClassroomImage:vi.fn()}))

import {AiAskModule} from '@/classolo/features/render-modules/ai-ask/Component'
import {ImageModule} from '@/classolo/features/render-modules/image/Component'
import {citedEvidenceIds,questionEvidence} from '@/classolo/features/render-modules/ai-ask/answer'
import {searchClassroomImage} from '@/classolo/features/render-modules/image/search'
import {setClassUserId} from '@/classolo/lib/db'
import {getRenderMessages} from '@/classolo/lib/session'
import {resetRenderProjection,upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {appendCommitted,patchTranscriptPublic,resetTranscriptPublic,replaceCommitted} from '@/classolo/lib/session/writes/transcript'

const owner='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222',sourceId='33333333-3333-4333-8333-333333333333'
const segment={id:sourceId,seq:1,text:'课堂原文：A 是答案。',startMs:0,endMs:1000,correctionRevision:0}
const assessment={id:'assessment-1',module:'ai-ask',version:'1.0',target:'transcript' as const,props:{question:'选哪个？',choices:['A','B']},meta:{createdAt:1,source:'silent-agent' as const,transcriptAnchor:sourceId}}
beforeEach(()=>{setClassUserId(owner);resetTranscriptPublic();resetRenderProjection();patchTranscriptPublic({sessionId});appendCommitted(segment);vi.clearAllMocks()})
afterEach(()=>{cleanup();setClassUserId(null)})

describe('classroom answer and frozen visual evidence',()=>{
  it('keeps the answer inside its assessment, persists citations and detects corrected source',async()=>{
    upsertRenderMessage(assessment)
    const {rerender}=render(<AiAskModule props={assessment.props} message={assessment}/>)
    fireEvent.click(screen.getByRole('radio',{name:/A/}))
    fireEvent.click(screen.getByRole('button',{name:'提交并查看答案'}))
    await waitFor(()=>expect((getRenderMessages('transcript')[0].props as {attempts?:unknown[]}).attempts).toHaveLength(1))
    const saved=getRenderMessages('transcript')[0] as typeof assessment & {props:typeof assessment.props & {attempts:{id:string;response:string;answer:string;evidenceIds:string[];sourceRevisions:Record<string,number>;atMs:number}[]}}
    expect(saved.props.attempts[0].evidenceIds).toEqual([sourceId])
    rerender(<AiAskModule props={saved.props} message={saved}/>)
    expect(screen.getByLabelText('本题答案')).toHaveTextContent('参考答案是 A')
    replaceCommitted({...segment,text:'课堂更正：答案尚不确定',rawText:segment.text,correctionRevision:1})
    rerender(<AiAskModule props={saved.props} message={saved}/>)
    expect(screen.getByText('文稿已更正，请重新核对本题解释。')).toBeInTheDocument()
  })
  it('uses only supplied source IDs as citations',()=>{
    const sources=questionEvidence([segment],'missing')
    expect(citedEvidenceIds(`[${sourceId}] [invented]`,sources)).toEqual([sourceId])
  })
  it('renders a fixed image without a billable mount request',()=>{
    const result={status:'ready' as const,provider:'unsplash' as const,url:'https://images.unsplash.com/photo.jpg',alt:'解剖图',pageUrl:'https://unsplash.com/photos/abc',author:'Photographer',licenseUrl:'https://unsplash.com/license' as const,requestId:crypto.randomUUID()}
    const message={id:'image-1',module:'image',version:'1.0',target:'notes' as const,props:{query:'心脏',result},meta:{createdAt:1,source:'silent-agent' as const}}
    render(<ImageModule props={message.props} message={message}/>)
    expect(screen.getByText(/Photographer/)).toBeInTheDocument()
    expect(searchClassroomImage).not.toHaveBeenCalled()
  })
})
