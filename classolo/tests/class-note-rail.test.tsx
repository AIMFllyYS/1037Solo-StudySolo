import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {ClassNoteRail} from '@/classolo/components/layout/class-note-rail'
import {appendCommitted,resetTranscriptPublic,patchTranscriptPublic} from '@/classolo/lib/session/writes/transcript'
import {resetRenderProjection,upsertRenderMessage} from '@/classolo/lib/session/writes/render'
const question=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined))
vi.mock('@/classolo/features/agent/class-question',()=>({generateClassQuestion:question}))

afterEach(()=>{cleanup();resetTranscriptPublic();resetRenderProjection();question.mockClear()})
it('keeps AI notes, thinking and answered questions in the left rail without a duplicate map',async()=>{
  act(()=>{
    patchTranscriptPublic({sessionId:'lesson'})
    appendCommitted({id:'source',seq:1,text:'房室瓣关闭形成第一心音',startMs:0,endMs:2000})
    upsertRenderMessage({id:'question',module:'ai-ask',version:'1.0',target:'transcript',props:{question:'第一心音由什么形成？',attempts:[{id:'11111111-1111-4111-8111-111111111111',response:'二尖瓣和三尖瓣',answer:'二尖瓣和三尖瓣关闭形成第一心音',evidenceIds:['source'],sourceRevisions:{source:0},atMs:1}]},meta:{createdAt:1,source:'silent-agent',transcriptAnchor:'source'}})
  })
  const flip=vi.fn(),ask=vi.fn()
  render(<ClassNoteRail note={<div>AI 生成的课堂笔记</div>} collapsed={false} onToggle={vi.fn()} onFlip={flip} onAsk={ask}/>)
  expect(screen.getByText('AI 生成的课堂笔记')).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'课堂思考引导'})).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'随堂提问与答案'})).toBeInTheDocument()
  expect(screen.getByText('二尖瓣和三尖瓣关闭形成第一心音')).toBeInTheDocument()
  expect(screen.queryByText('导图缩览')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'切换到课堂列表'}));expect(flip).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'追问助教'}));expect(ask).toHaveBeenCalled()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'生成下一题'})));expect(question).toHaveBeenCalledOnce()
})
