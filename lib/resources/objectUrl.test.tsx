import {StrictMode} from 'react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,renderHook,waitFor} from '@testing-library/react'
import {getResourceSnapshot} from '@/lib/performance/resourceMetrics'
import {adoptObjectUrl,createObjectUrlLease,getActiveObjectUrlCount} from './objectUrl'
import {useObjectUrl} from './useObjectUrl'

const originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL')
const originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
let created=0
const revoke=vi.fn()
beforeEach(()=>{created=0;revoke.mockClear();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>`blob:synthetic-${++created}`)});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke})})
afterEach(()=>{cleanup();expect(getActiveObjectUrlCount()).toBe(0);if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else delete (URL as {createObjectURL?:unknown}).createObjectURL;if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else delete (URL as {revokeObjectURL?:unknown}).revokeObjectURL})

it('releases a shared URL only after its final independent lease',()=>{
  const first=createObjectUrlLease(new Blob(['synthetic']))
  const second=adoptObjectUrl(first.url)
  expect(getResourceSnapshot().activeObjectUrls).toBe(1)
  first.release();first.release();expect(revoke).not.toHaveBeenCalled()
  second.release();second.release();expect(revoke).toHaveBeenCalledTimes(1)
})
it('survives StrictMode replay and fast source replacement with symmetric cleanup',async()=>{
  const one=new Blob(['one']),two=new Blob(['two'])
  const {result,rerender,unmount}=renderHook(({blob}:{blob:Blob})=>useObjectUrl(blob),{initialProps:{blob:one},wrapper:StrictMode})
  await waitFor(()=>expect(result.current).toMatch(/^blob:/))
  const firstUrl=result.current
  rerender({blob:two})
  await waitFor(()=>expect(result.current).toMatch(/^blob:/))
  expect(result.current).not.toBe(firstUrl)
  expect(getActiveObjectUrlCount()).toBe(1)
  unmount()
  expect(revoke).toHaveBeenCalledTimes(created)
})
