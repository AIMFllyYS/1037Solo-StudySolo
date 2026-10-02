import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
vi.mock('@/classolo/components/mindmap',()=>({ClassroomMindmap:({onNodeClick}:{onNodeClick:(id:string)=>void})=><button onClick={()=>onNodeClick('node')}>选择节点</button>}))
vi.mock('@/classolo/features/notes/organizer',()=>({startOutlineOrganizer:()=>()=>{},requestOutlineRefresh:vi.fn()}))
import {NotesPane} from '@/classolo/features/notes/pane'
import {getNotesPublic} from '@/classolo/lib/session'
import {resetNotesPublic,patchNotesPublic} from '@/classolo/lib/session/writes/notes'
import {resetTranscriptPublic,appendCommitted} from '@/classolo/lib/session/writes/transcript'
beforeEach(()=>{resetNotesPublic();resetTranscriptPublic();appendCommitted({id:'source',seq:1,text:'课堂内容',startMs:0,endMs:1000});patchNotesPublic({outlineDigest:[{id:'node',title:'原主题',sourceSegmentIds:['source']}]})})
afterEach(cleanup)
describe('student mindmap edits',()=>{
  it('saves and locks a changed title without changing its identity or provenance',()=>{
    render(<NotesPane/>);fireEvent.click(screen.getByText('选择节点'));fireEvent.change(screen.getByLabelText('导图节点标题'),{target:{value:'学生补充的主题'}});fireEvent.click(screen.getByText('保存并固定'))
    expect(getNotesPublic().outlineDigest[0]).toMatchObject({id:'node',title:'学生补充的主题',sourceSegmentIds:['source'],origin:'manual',locked:true})
    fireEvent.click(screen.getByText('允许 AI 整理'));expect(getNotesPublic().outlineDigest[0]).toMatchObject({origin:'ai',locked:false})
  })
})
