/** Numeric-only diagnostic snapshot. Never register content, tokens, credentials or user IDs. */
export interface ResourceSnapshot {
  timestampMs: number
  ownerEpoch: number
  loadedSessionCount: number
  hotMessageEstimatedBytes: number
  artifactBodyEstimatedBytes: number
  documentBodyEstimatedBytes: number
  imageGenBodyEstimatedBytes: number
  pinnedSessionCount: number
  tailCacheCount: number
  pendingSessionWrites: number
  inFlightSessionWrites: number
  activeObjectUrls: number
  mountedPdfPages: number
  pdfBitmapBytes: number
  mountedPptxSlides: number
  syncPendingKeys: number
  syncInFlightJobs: number
  searchWorkerCount: number
  searchPendingJobs: number
}
export type ResourceGauge = Exclude<keyof ResourceSnapshot,'timestampMs'>
type Reader = () => Partial<Record<ResourceGauge,number>>
const readers=new Map<symbol,Reader>()
const EMPTY:Readonly<Record<ResourceGauge,number>>={ownerEpoch:0,loadedSessionCount:0,hotMessageEstimatedBytes:0,artifactBodyEstimatedBytes:0,documentBodyEstimatedBytes:0,imageGenBodyEstimatedBytes:0,pinnedSessionCount:0,tailCacheCount:0,pendingSessionWrites:0,inFlightSessionWrites:0,activeObjectUrls:0,mountedPdfPages:0,pdfBitmapBytes:0,mountedPptxSlides:0,syncPendingKeys:0,syncInFlightJobs:0,searchWorkerCount:0,searchPendingJobs:0}

export function registerResourceMetrics(read:Reader):()=>void{
  const key=Symbol('resource-owner');readers.set(key,read)
  let removed=false
  return ()=>{if(removed)return;removed=true;readers.delete(key)}
}

export function getResourceSnapshot():Readonly<ResourceSnapshot>{
  const numbers:{[K in ResourceGauge]:number}={...EMPTY}
  for(const read of readers.values()){
    const values=read()
    for(const key of Object.keys(EMPTY) as ResourceGauge[]){
      const value=values[key]
      if(value===undefined)continue
      if(!Number.isFinite(value)||value<0)throw new Error(`Invalid resource metric: ${key}`)
      numbers[key]=key==='ownerEpoch'?Math.max(numbers[key],value):numbers[key]+value
    }
  }
  return Object.freeze({timestampMs:Date.now(),...numbers})
}

/** Test-only reset; production resource owners must release their own registration. */
export function resetResourceMetricsForTests(){readers.clear()}
