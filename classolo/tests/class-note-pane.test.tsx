import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
vi.mock('@/classolo/components/markdown',()=>({MarkdownStream:({markdown}:{markdown:string})=><article>{markdown}</article>}))
import {ClassNotePane} from '@/classolo/features/notes/class-note-pane'
import {useUserNotes} from '@/lib/stores/learning/userNotes'

const owner='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222'
beforeEach(()=>{useUserNotes.setState({byId:{},order:[],_hasHydrated:true})})
afterEach(cleanup)
it('keeps the same note in preview after saving a manual edit',()=>{
  const id=useUserNotes.getState().createNote('physics',{title:'课堂',markdown:'# 旧笔记',source:{kind:'class',label:'课堂',sessionId,ownerId:owner}})
  render(<ClassNotePane sessionId={sessionId} noteId={id} ownerId={owner} onOrganize={()=>{}}/>)
  expect(screen.getByText('# 旧笔记')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'编辑'}))
  fireEvent.change(screen.getByLabelText('本课笔记'),{target:{value:'# 旧笔记\n\n我的补充'}})
  fireEvent.click(screen.getByRole('button',{name:'预览'}))
  expect(screen.getByText(/我的补充/)).toBeInTheDocument()
  expect(useUserNotes.getState().byId[id].markdown).toContain('我的补充')
  fireEvent.click(screen.getByRole('button',{name:'编辑'}))
  expect(screen.getByLabelText('本课笔记')).toHaveValue('# 旧笔记\n\n我的补充')
})
