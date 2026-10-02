import {adoptObjectUrl,type ObjectUrlLease} from './objectUrl'

export interface PptxMediaPreviewer{
  pptx?:{medias?:Record<string,string>}
  wrapper?:HTMLElement
  destroy():void
}
type Ownership={destroyed:boolean;seen:Set<string>;leases:Map<string,ObjectUrlLease>}
const owners=new WeakMap<PptxMediaPreviewer,Ownership>()
function stateOf(previewer:PptxMediaPreviewer){let state=owners.get(previewer);if(!state){state={destroyed:false,seen:new Set(),leases:new Map()};owners.set(previewer,state)}return state}

/** pptx-preview 1.0.7 exposes media blob URLs under pptx.medias; destroy() does not revoke them. */
export function trackPptxMedia(previewer:PptxMediaPreviewer){
  const state=stateOf(previewer)
  for(const url of Object.values(previewer.pptx?.medias??{})){
    if(!url?.startsWith('blob:')||state.seen.has(url))continue
    state.seen.add(url)
    const lease=adoptObjectUrl(url)
    if(state.destroyed)lease.release();else state.leases.set(url,lease)
  }
}

export function disposePptxPreviewer(previewer:PptxMediaPreviewer){
  const state=stateOf(previewer)
  trackPptxMedia(previewer)
  if(state.destroyed)return
  state.destroyed=true
  for(const lease of state.leases.values())lease.release()
  state.leases.clear()
  previewer.destroy()
  previewer.wrapper?.remove()
}
