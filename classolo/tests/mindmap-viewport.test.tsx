import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,render} from '@testing-library/react'
const f=vi.hoisted(()=>({fit:vi.fn(),props:{} as Record<string,unknown>}))
vi.mock('@xyflow/react',()=>({ReactFlow:(props:Record<string,unknown>)=>{f.props=props;return null},ReactFlowProvider:({children}:{children:import('react').ReactNode})=>children,Background:()=>null,Controls:()=>null,Handle:()=>null,Position:{Left:'left',Right:'right'},useReactFlow:()=>({fitView:f.fit})}))
import {ClassroomMindmap} from '@/classolo/components/mindmap/canvas'
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks()})
describe('reading viewport preservation',()=>{
  it('fits once and leaves subsequent content changes under the user viewport',()=>{
    const callbacks:FrameRequestCallback[]=[]
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{callbacks.push(cb);return callbacks.length});vi.stubGlobal('cancelAnimationFrame',vi.fn())
    const {rerender}=render(<ClassroomMindmap nodes={[{id:'root',title:'主题'}]}/>);act(()=>callbacks[0](0));expect(f.fit).toHaveBeenCalledOnce()
    rerender(<ClassroomMindmap nodes={[{id:'root',title:'主题'},{id:'child',title:'新要点',parentId:'root'}]}/>);expect(callbacks).toHaveLength(1);expect(f.fit).toHaveBeenCalledOnce()
  })
  it('keeps a manually moved node in the owner-scoped classroom layout after remount',()=>{
    localStorage.clear()
    const nodes=[{id:'root',title:'心脏传导系统'}]
    const first=render(<ClassroomMindmap nodes={nodes} layoutKey="owner-A:lesson"/>)
    act(()=>{(f.props.onNodeDragStop as (event:unknown,node:{id:string;position:{x:number;y:number}})=>void)(null,{id:'root',position:{x:240,y:130}})})
    expect(JSON.parse(localStorage.getItem('ss-class-map-layout:owner-A:lesson')||'{}').root).toEqual({x:240,y:130})
    first.unmount()
    render(<ClassroomMindmap nodes={nodes} layoutKey="owner-A:lesson"/>)
    expect((f.props.nodes as Array<{position:{x:number;y:number}}>)[0].position).toEqual({x:240,y:130})
  })
})
