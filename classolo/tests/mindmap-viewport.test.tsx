import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,render} from '@testing-library/react'
const f=vi.hoisted(()=>({fit:vi.fn()}))
vi.mock('@xyflow/react',()=>({ReactFlow:()=>null,ReactFlowProvider:({children}:{children:import('react').ReactNode})=>children,Background:()=>null,Controls:()=>null,Handle:()=>null,Position:{Left:'left',Right:'right'},useReactFlow:()=>({fitView:f.fit})}))
import {ClassroomMindmap} from '@/classolo/components/mindmap/canvas'
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks()})
describe('reading viewport preservation',()=>{
  it('fits once and leaves subsequent content changes under the user viewport',()=>{
    const callbacks:FrameRequestCallback[]=[]
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{callbacks.push(cb);return callbacks.length});vi.stubGlobal('cancelAnimationFrame',vi.fn())
    const {rerender}=render(<ClassroomMindmap nodes={[{id:'root',title:'主题'}]}/>);act(()=>callbacks[0](0));expect(f.fit).toHaveBeenCalledOnce()
    rerender(<ClassroomMindmap nodes={[{id:'root',title:'主题'},{id:'child',title:'新要点',parentId:'root'}]}/>);expect(callbacks).toHaveLength(1);expect(f.fit).toHaveBeenCalledOnce()
  })
})
