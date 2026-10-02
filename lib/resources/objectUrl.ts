import {registerResourceMetrics} from '@/lib/performance/resourceMetrics'

export interface ObjectUrlLease {url:string;release():void}
const registry=new Map<string,{references:number}>()
registerResourceMetrics(()=>({activeObjectUrls:registry.size}))

/** Adopt an already-created blob URL. Every consumer owns one idempotent reference. */
export function adoptObjectUrl(url:string):ObjectUrlLease{
  if(!url.startsWith('blob:'))throw new Error('Only blob URLs can be leased')
  const entry=registry.get(url)??{references:0}
  entry.references++;registry.set(url,entry)
  let released=false
  return {url,release(){
    if(released)return;released=true
    const current=registry.get(url)
    if(!current)return
    current.references--
    if(current.references<=0){registry.delete(url);URL.revokeObjectURL(url)}
  }}
}
export function createObjectUrlLease(blob:Blob):ObjectUrlLease{return adoptObjectUrl(URL.createObjectURL(blob))}
export function getActiveObjectUrlCount(){return registry.size}
