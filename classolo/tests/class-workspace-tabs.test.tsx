import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {WorkbenchShell} from '@/classolo/components/layout/workbench-shell'

class ResizeObserverStub{observe(){}disconnect(){}}
beforeEach(()=>{vi.stubGlobal('ResizeObserver',ResizeObserverStub)})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})

describe('class workspace navigation',()=>{
  it('mounts only the focused work area and keeps a dedicated mobile question entry',()=>{
    const select=vi.fn()
    const {rerender}=render(<WorkbenchShell chrome={false} selected="transcript" onSelect={select} note={<div>笔记编辑器</div>} transcript={<div>录音文稿</div>} notes={<div>导图</div>} transcriptRender={<div>练习卡</div>} notesRender={<div>资料卡</div>} ask={<div>课堂助教</div>}/>)
    expect(screen.getByText('录音文稿')).toBeInTheDocument()
    expect(within(screen.getByRole('tabpanel')).queryByText('导图')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'提问'}))
    expect(select).toHaveBeenCalledWith('ask')
    rerender(<WorkbenchShell chrome={false} selected="ask" onSelect={select} ask={<div>课堂助教</div>}/>)
    expect(screen.getByText('课堂助教')).toBeInTheDocument()
  })
})
