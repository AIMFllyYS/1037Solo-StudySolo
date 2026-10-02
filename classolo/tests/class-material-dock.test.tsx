import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
vi.mock('@/classolo/features/render-modules/host',()=>({RenderHost:({target}:{target:string})=><div>{target} source card</div>}))
import {ClassMaterialDock} from '@/classolo/components/layout/class-material-dock'
import {resetRenderProjection,upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {resetNotesPublic} from '@/classolo/lib/session/writes/notes'

afterEach(()=>{cleanup();resetRenderProjection();resetNotesPublic()})

it('reopens a compact material frame when new live content arrives after dismissal',()=>{
  render(<ClassMaterialDock/>)
  expect(screen.getByRole('complementary',{name:'课堂资料框'})).toHaveAttribute('data-open','true')
  fireEvent.click(screen.getByRole('button',{name:'收起资料框'}))
  expect(screen.getByRole('complementary',{name:'课堂资料框'})).toHaveAttribute('data-open','false')
  act(()=>upsertRenderMessage({id:'card-1',module:'rich-text',version:'1.0',target:'transcript',props:{text:'心脏传导'},meta:{createdAt:1,source:'system'}}))
  expect(screen.getByRole('complementary',{name:'课堂资料框'})).toHaveAttribute('data-open','true')
  expect(screen.getByText('transcript source card')).toBeInTheDocument()
  expect(screen.getByText(/新增 1/)).toBeInTheDocument()
})
