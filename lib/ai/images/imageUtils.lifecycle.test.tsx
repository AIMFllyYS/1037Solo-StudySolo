import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {compressImage} from './imageUtils'
import {getActiveObjectUrlCount} from '@/lib/resources/objectUrl'

const originalCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),originalRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
const revoke=vi.fn()
beforeEach(()=>{revoke.mockClear();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:broken-image')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});vi.stubGlobal('Image',class{onerror?:()=>void;set src(_value:string){queueMicrotask(()=>this.onerror?.())}})})
afterEach(()=>{vi.unstubAllGlobals();if(originalCreate)Object.defineProperty(URL,'createObjectURL',originalCreate);else delete (URL as {createObjectURL?:unknown}).createObjectURL;if(originalRevoke)Object.defineProperty(URL,'revokeObjectURL',originalRevoke);else delete (URL as {revokeObjectURL?:unknown}).revokeObjectURL})
it('releases the decode URL when an image cannot be decoded',async()=>{
  await expect(compressImage(new File(['synthetic'],'bad.png',{type:'image/png'}))).rejects.toThrow('图片解码失败')
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:broken-image')
  expect(getActiveObjectUrlCount()).toBe(0)
})
