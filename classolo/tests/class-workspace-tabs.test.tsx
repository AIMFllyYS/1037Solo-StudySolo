import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {WorkbenchShell} from '@/classolo/components/layout/workbench-shell'

let observed:ResizeObserverCallback|null=null
class ResizeObserverStub{constructor(callback:ResizeObserverCallback){observed=callback}observe(){}disconnect(){}}
beforeEach(()=>{vi.stubGlobal('ResizeObserver',ResizeObserverStub)})
afterEach(()=>{cleanup();observed=null;vi.unstubAllGlobals()})

describe('class unified workspace',()=>{
  it('keeps transcript, editable map and materials visible in one desktop workspace',()=>{
    render(<WorkbenchShell chrome={false} transcript={<div>录音文稿</div>} mindmap={<div>可缩放导图</div>} materials={<div>资料卡</div>}/>)
    expect(screen.getByText('录音文稿')).toBeInTheDocument()
    expect(screen.getByText('可缩放导图')).toBeInTheDocument()
    expect(screen.getByText('资料卡')).toBeInTheDocument()
    expect(screen.queryByRole('tablist',{name:'课堂工作区'})).not.toBeInTheDocument()
    expect(screen.getByRole('separator',{name:'调整文稿与导图高度'})).toBeInTheDocument()
  })
  it('uses mobile jump actions without hiding the transcript or map',()=>{
    const openNotes=vi.fn(),setAsk=vi.fn()
    const {rerender}=render(<WorkbenchShell chrome={false} transcript={<div>录音文稿</div>} mindmap={<div>可缩放导图</div>} materials={<div>资料卡</div>} ask={<div>课堂助教</div>} onOpenNotes={openNotes} onAskOpenChange={setAsk}/>)
    act(()=>observed?.([{contentRect:{width:600}}] as ResizeObserverEntry[],{} as ResizeObserver))
    expect(screen.getByText('录音文稿')).toBeInTheDocument()
    expect(screen.getByText('可缩放导图')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'笔记'}));expect(openNotes).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'提问'}));expect(setAsk).toHaveBeenCalledWith(true)
    rerender(<WorkbenchShell chrome={false} transcript={<div>录音文稿</div>} mindmap={<div>可缩放导图</div>} materials={<div>资料卡</div>} ask={<div>课堂助教</div>} askOpen onAskOpenChange={setAsk}/>)
    expect(screen.getByText('课堂助教')).toBeInTheDocument()
  })
})
