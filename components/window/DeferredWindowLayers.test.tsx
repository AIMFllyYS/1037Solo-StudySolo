import {act,cleanup,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('next/dynamic',()=>({default:(loader:()=>Promise<unknown>)=>{
  const name=/import\([^)]*components\/([^"']+)/.exec(String(loader))?.[1]??'unknown'
  return function DynamicLayer(){return <div data-testid="active-window-layer" data-layer={name}/>}
}}))
vi.mock('@/components/notes/UserNoteProposalRuntime',()=>({default:()=>null}))
vi.mock('@/components/memory/MemoryInboxRuntime',()=>({default:()=>null}))
import DeferredWindowLayers from './DeferredWindowLayers'
import {useWindowManager} from '@/lib/stores/workspace/windowManager'
import {useUserNotes} from '@/lib/stores/learning/userNotes'
import {useMemoryInbox} from '@/lib/stores/learning/memoryInbox'

beforeEach(()=>{useWindowManager.setState({windows:[],activeWindowId:null});useUserNotes.setState({openEditorIds:[],libraryOpen:false});useMemoryInbox.setState({byId:{},order:[]})})
afterEach(cleanup)
it('keeps viewer chunks absent while idle and mounts only the requested window kind',()=>{
  render(<DeferredWindowLayers/>)
  expect(screen.queryAllByTestId('active-window-layer')).toHaveLength(0)
  act(()=>useWindowManager.setState({windows:[{id:'attachment-preview:synthetic',type:'attachment-preview'} as never]}))
  expect(screen.getAllByTestId('active-window-layer')).toHaveLength(1)
  act(()=>useWindowManager.setState({windows:[]}))
  expect(screen.queryAllByTestId('active-window-layer')).toHaveLength(0)
})

it('returns to zero mounted viewer layers after fifty open/close cycles',()=>{
  render(<DeferredWindowLayers/>)
  for(let index=0;index<50;index++){
    act(()=>useWindowManager.setState({windows:[{id:`attachment-preview:${index}`,type:'attachment-preview'} as never]}))
    expect(screen.queryAllByTestId('active-window-layer')).toHaveLength(1)
    act(()=>useWindowManager.setState({windows:[]}))
    expect(screen.queryAllByTestId('active-window-layer')).toHaveLength(0)
  }
})
