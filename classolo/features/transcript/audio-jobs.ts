import { get, set, update } from 'idb-keyval'

export type AudioJobStatus = 'queued' | 'processing' | 'complete' | 'retryable' | 'uncertain'
export interface ClassAudioJob {
  key:string;sessionId:string;bytes:number;createdAt:number;requestId:string;
  startMs:number;endMs:number;status:AudioJobStatus;text?:string;error?:string;
  id?:string;seq?:number;prompt?:string;
}
export const audioIndexKey=(owner:string)=>`ss-class-audio-index:${owner}`

export async function persistAudioJob(input:{ownerId:string;sessionId:string;requestId:string;wav:ArrayBuffer;startMs:number;endMs:number;seq?:number;prompt?:string}):Promise<string>{
  const key=`ss-class-audio:${input.ownerId}:${input.sessionId}:${input.requestId}`
  await set(key,input.wav)
  const job:ClassAudioJob={key,id:input.requestId,seq:input.seq,prompt:input.prompt,sessionId:input.sessionId,bytes:input.wav.byteLength,createdAt:Date.now(),requestId:input.requestId,startMs:input.startMs,endMs:input.endMs,status:'queued'}
  await update<ClassAudioJob[]>(audioIndexKey(input.ownerId),rows=>[...(rows||[]).filter(row=>row.key!==key),job])
  return key
}
export async function patchAudioJob(owner:string,key:string,patch:Partial<ClassAudioJob>){
  await update<ClassAudioJob[]>(audioIndexKey(owner),rows=>(rows||[]).map(row=>row.key===key?{...row,...patch}:row))
}
export async function listAudioJobs(owner:string,sessionId:string):Promise<ClassAudioJob[]>{
  return ((await get<ClassAudioJob[]>(audioIndexKey(owner)))||[]).filter(row=>row.sessionId===sessionId)
}
export const readAudioJobBytes=(key:string)=>get<ArrayBuffer>(key)
