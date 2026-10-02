/** Runtime owner is set only after canonical Account verification, never from local storage. */
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';
let owner:string|null=null;
let epoch=0;
let controller=new AbortController();
const ownerListeners=new Set<(previous:string|null,next:string|null,epoch:number)=>void>();
const hydrators=new Set<()=>Promise<void>>();
export function getStorageOwner(){return owner;}
export function getOwnerEpoch(){return epoch;}
export function onStorageOwnerChange(listener:(previous:string|null,next:string|null,epoch:number)=>void){ownerListeners.add(listener);return()=>ownerListeners.delete(listener);}
export function activateStorageOwner(id:string|null){
  if(owner===id)return;
  const previous=owner;owner=id;epoch++;
  controller.abort();controller=new AbortController();
  for(const listener of [...ownerListeners])listener(previous,id,epoch);
}
export function ownedStorageKey(name:string){return owner?`ss-user:${owner}:${name}`:null;}
export function ownedStorageKeyFor(id:string,name:string){return `ss-user:${id}:${name}`;}
export function captureStorageOperation(targetId:string){
  if(!owner)throw new Error('Storage owner unavailable');
  const ownerId=owner,ownerEpoch=epoch,signal=controller.signal;
  return Object.freeze({ownerId,ownerEpoch,targetId,signal,isCurrent:()=>owner===ownerId&&epoch===ownerEpoch&&!signal.aborted});
}
export function registerOwnerHydrator(fn:()=>Promise<void>){hydrators.add(fn);}
export async function hydrateOwnerStores(){await Promise.all([...hydrators].map(fn=>fn()));}
registerResourceMetrics(()=>({ownerEpoch:epoch}));
