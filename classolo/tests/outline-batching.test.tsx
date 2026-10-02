import {describe,expect,it} from 'vitest'
import {nextOutlineBatch,advanceOutlineProgress,applyOutlinePatch} from '@/classolo/features/notes/incremental'
import {diffOutlineLayout} from '@/classolo/components/mindmap/layout'
import type {OutlineProgress} from '@/classolo/lib/session/types'
const segment=(seq:number,text='主题正文')=>({id:`s-${seq}`,seq,text,startMs:seq*1000,endMs:seq*1000+500})
describe('whole-class incremental coverage',()=>{
  it('processes every character of a large imported transcript, not just its tail',()=>{
    const segments=Array.from({length:40},(_,i)=>segment(i+1,'字'.repeat(500)))
    let progress:OutlineProgress={},chars=0,runs=0
    for(;;){const batch=nextOutlineBatch(segments,progress);if(!batch.length)break;chars+=batch.reduce((n,s)=>n+s.text.length,0);progress=advanceOutlineProgress(progress,batch);runs++}
    expect(chars).toBe(20000);expect(runs).toBe(4);expect(Object.keys(progress)).toHaveLength(40)
  })
  it('resumes a partially processed long segment without losing its middle',()=>{
    const segments=[segment(1,'字'.repeat(20000))]
    const first=nextOutlineBatch(segments),progress=advanceOutlineProgress({},first),next=nextOutlineBatch(segments,progress)
    expect(first.reduce((n,s)=>n+s.text.length,0)).toBe(6000);expect(next[0].startChar).toBe(6000)
  })
  it('picks up an earlier recovered gap and reprocesses revised text',()=>{
    const a=segment(1),b=segment(3),progress=advanceOutlineProgress({},nextOutlineBatch([a,b]))
    expect(nextOutlineBatch([a,segment(2),b],progress).map(s=>s.id)).toEqual(['s-2'])
    expect(nextOutlineBatch([{...a,text:'修订后的正文'},b],progress).map(s=>s.id)).toEqual(['s-1'])
  })
  it('resolves a child temporary ID even when the parent is later in the response',()=>{
    const nodes=applyOutlinePatch([], [{id:'child',title:'子要点',parentId:'parent',sourceSegmentIds:['s-1']},{id:'parent',title:'主题',parentId:null,sourceSegmentIds:['s-1']}],new Set(['s-1']))
    expect(nodes.find(n=>n.title==='子要点')?.parentId).toBe(nodes.find(n=>n.title==='主题')?.id)
  })
  it('coalesces duplicate new concepts and preserves both evidence sources',()=>{
    const nodes=applyOutlinePatch([],[{id:'a',title:'重复主题',parentId:null,sourceSegmentIds:['s-1']},{id:'b',title:'重复主题',parentId:null,sourceSegmentIds:['s-2']}],new Set(['s-1','s-2']))
    expect(nodes).toHaveLength(1);expect(nodes[0].sourceSegmentIds).toEqual(['s-1','s-2'])
  })
  it('keeps all sibling positions in one layout pass when inserting a node',()=>{
    const root={id:'root',title:'主题'},a={id:'a',title:'a',parentId:'root'},b={id:'b',title:'b',parentId:'root'},c={id:'c',title:'c',parentId:'root'}
    const previous=diffOutlineLayout([],[root,a,b]),next=diffOutlineLayout(previous.graph.nodes,[root,a,c,b])
    const positions=next.graph.nodes.map(n=>`${n.position.x}:${n.position.y}`)
    expect(new Set(positions).size).toBe(4);expect(next.enteredIds).toEqual(['c'])
  })
})
