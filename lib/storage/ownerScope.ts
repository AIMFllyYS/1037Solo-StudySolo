/** Runtime owner is set only after canonical Account verification, never from local storage. */
let owner:string|null=null;
const hydrators=new Set<()=>Promise<void>>();
export function getStorageOwner(){return owner;}
export function activateStorageOwner(id:string|null){owner=id;}
export function ownedStorageKey(name:string){return owner?`ss-user:${owner}:${name}`:null;}
export function registerOwnerHydrator(fn:()=>Promise<void>){hydrators.add(fn);}
export async function hydrateOwnerStores(){await Promise.all([...hydrators].map(fn=>fn()));}
