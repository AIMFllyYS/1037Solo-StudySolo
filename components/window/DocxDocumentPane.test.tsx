import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({render:vi.fn()}))
vi.mock('docx-preview',()=>({renderAsync:f.render}))
import DocxDocumentPane from './DocxDocumentPane'
import {activateStorageOwner} from '@/lib/storage/ownerScope'

beforeEach(()=>{f.render.mockReset();activateStorageOwner('11111111-1111-4111-8111-111111111111');vi.stubGlobal('fetch',vi.fn(async (src:string)=>({ok:true,blob:async()=>new Blob([src])})))})
afterEach(()=>{cleanup();activateStorageOwner(null);vi.unstubAllGlobals()})
it('keeps an old slow render off-DOM when a new DOCX source arrives',async()=>{
  let release:(value?:unknown)=>void=()=>{}
  f.render.mockImplementation((_blob:Blob,host:HTMLElement)=>{
    const label=f.render.mock.calls.length===1?'A':'B'
    host.appendChild(Object.assign(document.createElement('span'),{textContent:label}))
    return label==='A'?new Promise(resolve=>{release=resolve}):Promise.resolve()
  })
  const {rerender}=render(<DocxDocumentPane src="blob:A" name="A.docx"/>)
  await waitFor(()=>expect(f.render).toHaveBeenCalledTimes(1))
  rerender(<DocxDocumentPane src="blob:B" name="B.docx"/>)
  expect(screen.queryByText('A')).not.toBeInTheDocument()
  expect(f.render).toHaveBeenCalledTimes(1)
  await act(async()=>{release();await Promise.resolve()})
  await waitFor(()=>expect(screen.getByText('B')).toBeInTheDocument())
  expect(screen.queryByText('A')).not.toBeInTheDocument()
})
it('abandons rendered output after owner switch and keeps a retry/download path on failure',async()=>{
  f.render.mockRejectedValueOnce(new Error('synthetic parse failure'))
  const {rerender}=render(<DocxDocumentPane src="blob:bad" name="bad.docx"/>)
  await waitFor(()=>expect(screen.getByText('synthetic parse failure')).toBeInTheDocument())
  expect(screen.getByRole('link',{name:'下载原件'})).toHaveAttribute('href','blob:bad')
  f.render.mockImplementationOnce(async(_blob:Blob,host:HTMLElement)=>{host.textContent='recovered'})
  await act(async()=>screen.getByRole('button',{name:'重试'}).click())
  await waitFor(()=>expect(screen.getByText('recovered')).toBeInTheDocument())
  activateStorageOwner('22222222-2222-4222-8222-222222222222')
  rerender(<DocxDocumentPane src="blob:new" name="new.docx"/>)
  expect(screen.queryByText('recovered')).not.toBeInTheDocument()
})
it('discards a late document render from the previous owner',async()=>{
  let release:()=>void=()=>{}
  f.render.mockImplementation((_blob:Blob,host:HTMLElement)=>new Promise<void>(resolve=>{host.textContent='old owner content';release=resolve}))
  render(<DocxDocumentPane src="blob:old" name="old.docx"/>)
  await waitFor(()=>expect(f.render).toHaveBeenCalledOnce())
  activateStorageOwner('22222222-2222-4222-8222-222222222222')
  await act(async()=>release())
  expect(screen.queryByText('old owner content')).not.toBeInTheDocument()
})
