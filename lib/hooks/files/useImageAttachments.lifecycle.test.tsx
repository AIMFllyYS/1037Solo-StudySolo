import {act,cleanup,renderHook} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({convert:vi.fn()}))
vi.mock('@/lib/files/client',()=>({uploadCloudFile:vi.fn(async()=>({id:'11111111-1111-4111-8111-111111111111'}))}))
vi.mock('@/lib/project/parse',()=>({extractFileText:vi.fn(async()=>'公开测试正文')}))
vi.mock('@/lib/ai/images/imageUtils',async importOriginal=>({...await importOriginal<typeof import('@/lib/ai/images/imageUtils')>(),filesToAttachments:f.convert}))
import {useImageAttachments} from './useImageAttachments'
import {useSettings} from '../../stores/settings'
import {activateStorageOwner} from '@/lib/storage/ownerScope'
import {getActiveObjectUrlCount} from '@/lib/resources/objectUrl'

const original=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
const revoke=vi.fn()
beforeEach(()=>{f.convert.mockReset();revoke.mockClear();Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});activateStorageOwner('11111111-1111-4111-8111-111111111111');useSettings.setState({selectedModelId:'mimo-v2.5',customApiGroups:[]})})
afterEach(()=>{cleanup();activateStorageOwner(null);expect(getActiveObjectUrlCount()).toBe(0);if(original)Object.defineProperty(URL,'revokeObjectURL',original);else delete (URL as {revokeObjectURL?:unknown}).revokeObjectURL})
const attachment=(file:File,url:string)=>({type:'local-file' as const,file,mimeType:'application/pdf' as const,name:file.name,size:file.size,dataUrl:url})
it('owns committed conversion URLs and releases them on unmount',async()=>{
  const file=new File(['synthetic'],'sample.pdf',{type:'application/pdf'})
  f.convert.mockResolvedValue({attachments:[attachment(file,'blob:committed')],errors:[]})
  const {result,unmount}=renderHook(()=>useImageAttachments())
  await act(async()=>{await result.current.addFiles([file])})
  expect(getActiveObjectUrlCount()).toBe(1)
  unmount()
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:committed')
})
it('disposes a conversion that arrives after unmount without attaching it to state',async()=>{
  const file=new File(['synthetic'],'late.pdf',{type:'application/pdf'})
  let release:(value:unknown)=>void=()=>{}
  f.convert.mockReturnValue(new Promise(resolve=>{release=resolve}))
  const {result,unmount}=renderHook(()=>useImageAttachments())
  let pending:Promise<void>=Promise.resolve()
  act(()=>{pending=result.current.addFiles([file])})
  unmount()
  release({attachments:[attachment(file,'blob:late')],errors:[]})
  await pending
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late')
})
