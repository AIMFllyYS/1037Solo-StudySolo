import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {getActiveObjectUrlCount} from './objectUrl'
import {disposePptxPreviewer,trackPptxMedia} from './pptxPreviewLease'

const original=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL')
const revoke=vi.fn()
beforeEach(()=>{revoke.mockClear();Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke})})
afterEach(()=>{expect(getActiveObjectUrlCount()).toBe(0);if(original)Object.defineProperty(URL,'revokeObjectURL',original);else delete (URL as {revokeObjectURL?:unknown}).revokeObjectURL})
it('releases only previewer-owned media once, including media created after a late load',()=>{
  const wrapper=document.createElement('div'),destroy=vi.fn()
  document.body.appendChild(wrapper)
  const previewer={wrapper,destroy,pptx:{medias:{audio:'blob:audio',video:'blob:video',remote:'https://example.invalid/media'} as Record<string,string>}}
  trackPptxMedia(previewer)
  expect(getActiveObjectUrlCount()).toBe(2)
  disposePptxPreviewer(previewer);disposePptxPreviewer(previewer)
  expect(destroy).toHaveBeenCalledTimes(1)
  expect(wrapper.isConnected).toBe(false)
  expect(revoke.mock.calls.map(call=>call[0]).sort()).toEqual(['blob:audio','blob:video'])
  previewer.pptx.medias.late='blob:late'
  trackPptxMedia(previewer);trackPptxMedia(previewer)
  expect(revoke.mock.calls.map(call=>call[0]).sort()).toEqual(['blob:audio','blob:late','blob:video'])
})
