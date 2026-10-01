/** Authenticated classroom repository. No anonymous tenant or browser secrets. */
import type {ClassCourseProfile} from '@/classolo/lib/course/profile'
import {DEFAULT_CLASS_COURSE_PROFILE,parseClassCourseProfile} from '@/classolo/lib/course/profile'
import {planTranscriptCorrection,type CorrectionAction,type CorrectionRecord} from '@/classolo/features/transcript/term-correction'
export type ClassoloDb = Readonly<{userId:string}>;
export type AsrSnapshot = {family:string;dialect:string;model:string;baseUrl:string;sampleRate:number;hotwordPack?:string};
export interface ClassSession {id:string;userId:string;title:string;status:string;startedAt:string;updatedAt:string;asrSnapshot:AsrSnapshot;profile?:ClassCourseProfile;noteId?:string;archived?:boolean;cloudRevision?:string}
export interface TranscriptRow {id:string;sessionId:string;seq:number;startMs:number;endMs:number;text:string}
export interface ClassSnapshot {session:ClassSession;transcript:TranscriptRow[];outline:{outline:Record<string,unknown>;revision:number}|null;renders:RenderRow[];chat:ChatRow[];corrections?:CorrectionRecord[]}
export interface RenderRow {id:string;sessionId:string;module:string;version:string;target:string;props:Record<string,unknown>;source:string;transcriptAnchor?:string|null;createdAt?:string|Date}
export interface ChatRow {id:string;sessionId:string;seq:number;role:'user'|'assistant'|'system'|'tool';content:string;parts?:unknown;createdAt?:string}
type Operation={key:string;op:string;input:Record<string,unknown>};
export type ClassOutlineConflict={revision:number;outline:Record<string,unknown>|null};
export type ClassCorrectionConflict={sessionId:string;segmentId:string;revision:number;remote:CorrectionRecord|null;local:CorrectionRecord};
type Cache={sessions:Record<string,ClassSnapshot>;pending:Operation[];versions?:Record<string,number>;cloudVersions?:Record<string,string>;conflicts?:Record<string,ClassOutlineConflict>;correctionConflicts?:Record<string,ClassCorrectionConflict>};
class ClassSyncRequestError extends Error {constructor(message:string,readonly status:number,readonly details:Record<string,unknown>){super(message);}}
let userId:string|null=null;
let lastError='';
let revision=0;
export function getClassRevision(){return revision;}
let hydrating=false;
export function setClassHydrating(value:boolean){hydrating=value;}
export function isClassHydrating(){return hydrating;}
const listeners=new Set<()=>void>();
const notify=()=>{revision++;listeners.forEach(fn=>fn());};
export function setClassUserId(id:string|null){userId=id;lastError='';notify();}
export function getClassUserId(){return userId;}
export function getSyncError(){return lastError;}
export function subscribeClassSync(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export async function getDb():Promise<ClassoloDb>{if(!userId)throw new Error('请先登录统一账号');return Object.freeze({userId});}
function key(id:string){return `ss-class:v1:${id}`;}
function read(id:string):Cache{
  try{const raw=localStorage.getItem(key(id));if(raw){const parsed=JSON.parse(raw);if(parsed.sessions&&Array.isArray(parsed.pending))return parsed;}}catch{}
  return {sessions:{},pending:[]};
}
function save(id:string,value:Cache){
  if(id!==userId)throw new Error('账号已切换，停止课堂写入');
  try{localStorage.setItem(key(id),JSON.stringify(value));}catch{lastError='本地缓存无法写入，请暂停录音并导出课堂记录';notify();throw new Error(lastError);}
  notify();
}
export function getLocalClassSnapshot(id:string){return userId?read(userId).sessions[id]??null:null;}
export function getPendingCount(){return userId?read(userId).pending.length:0;}
export function getClassOutlineConflict(id:string){return userId?read(userId).conflicts?.[id]??null:null;}
export function getClassCorrectionConflicts(id:string){return userId?Object.values(read(userId).correctionConflicts??{}).filter(row=>row.sessionId===id):[];}
export function getPendingClassCorrectionCount(id:string){return userId?read(userId).pending.filter(row=>row.op==='correction.save'&&row.input.sessionId===id).length:0;}
async function request(db:ClassoloDb,op:string,input:Record<string,unknown>,operationKey?:string){
  if(db.userId!==userId)throw new Error('账号已切换');
  const response=await fetch('/api/class/state',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({op,input,expectedUserId:db.userId,operationKey})});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ClassSyncRequestError(body.error||`课堂同步失败 (${response.status})`,response.status,body);}
  return response.json();
}
const flushing=new Map<string,Promise<void>>();
export async function flushClassPending(db:ClassoloDb):Promise<void>{
  const active=flushing.get(db.userId);if(active)return active;
  const run=(async()=>{
    while(db.userId===userId){
      const item=read(db.userId).pending[0];if(!item)break;
      let reply:Record<string,unknown>;
      try{reply=await request(db,item.op,item.input,item.key);}catch(error){
        if(db.userId!==userId)return;
        if(error instanceof ClassSyncRequestError&&error.details.code==='OUTLINE_CONFLICT'){
          const latest=read(db.userId),id=String(item.input.sessionId);
          latest.conflicts={...latest.conflicts,[id]:{revision:Number(error.details.revision)||0,outline:(error.details.outline as Record<string,unknown>|null)??null}};
          latest.pending=latest.pending.filter(p=>!(p.op==='outline.save'&&p.input.sessionId===id));
          save(db.userId,latest);lastError=error.message;notify();continue;
        }
        if(error instanceof ClassSyncRequestError&&error.details.code==='CORRECTION_CONFLICT'){
          const latest=read(db.userId),sessionId=String(item.input.sessionId),segmentId=String(item.input.segmentId);
          const local=latest.sessions[sessionId]?.corrections?.find(row=>row.segmentId===segmentId);
          if(local){const key=`${sessionId}:${segmentId}`;
            latest.correctionConflicts={...latest.correctionConflicts,[key]:{sessionId,segmentId,local,revision:Number(error.details.revision)||0,remote:(error.details.correction as CorrectionRecord|null)??null}};
          }
          latest.pending=latest.pending.filter(p=>!(p.op==='correction.save'&&p.input.sessionId===sessionId&&p.input.segmentId===segmentId));
          save(db.userId,latest);lastError=error.message;notify();continue;
        }
        lastError=error instanceof Error?error.message:'课堂尚未同步';notify();return;
      }
      if(db.userId!==userId)return;
      const latest=read(db.userId);latest.pending=latest.pending.filter(p=>p.key!==item.key);
      if(item.op==='correction.save'&&reply.correction){
        const session=latest.sessions[String(item.input.sessionId)],row=reply.correction as CorrectionRecord;
        if(session?.corrections){const current=session.corrections.find(entry=>entry.segmentId===row.segmentId);if(current?.revision===row.revision)session.corrections=session.corrections.map(entry=>entry.segmentId===row.segmentId?row:entry)}
      }
      save(db.userId,latest);
    }
    if(db.userId===userId){const current=read(db.userId);lastError=Object.keys(current.conflicts||{}).length?'课堂导图有版本冲突，本地草稿已保留':Object.keys(current.correctionConflicts||{}).length?'课堂文稿校正有版本冲突，本地修改已保留':'';notify();}
  })().finally(()=>{flushing.delete(db.userId);});flushing.set(db.userId,run);return run;
}

async function write(db:ClassoloDb,op:string,input:Record<string,unknown>,apply:(cache:Cache)=>void){
  if(db.userId!==userId)throw new Error('账号已切换');
  const cache=read(db.userId);apply(cache);
  const changedSession=String(input.sessionId||input.id||'');
  cache.versions={...cache.versions,[changedSession]:(cache.versions?.[changedSession]||0)+1};
  cache.pending.push({key:crypto.randomUUID(),op,input});save(db.userId,cache);
  await flushClassPending(db);
}
export async function insertSession(db:ClassoloDb,input:{id?:string;title:string;status:string;asrSnapshot:AsrSnapshot;profile?:ClassCourseProfile;startedAt?:Date}):Promise<ClassSession>{
  const row:ClassSession={...input,id:input.id||crypto.randomUUID(),userId:db.userId,startedAt:(input.startedAt||new Date()).toISOString(),updatedAt:new Date().toISOString()};
  await write(db,'session.save',{...row},cache=>{cache.sessions[row.id]={session:row,transcript:[],outline:null,renders:[],chat:[]};});return row;
}
export async function updateSession(db:ClassoloDb,id:string,patch:Record<string,unknown>){
  await write(db,'session.update',{id,...patch},cache=>{const value=cache.sessions[id];if(value)value.session={...value.session,...patch,updatedAt:new Date().toISOString()};});
}
export async function listSessions(db:ClassoloDb):Promise<ClassSession[]>{
  await flushClassPending(db);
  const versions=read(db.userId).versions;
  try{
    const rows=await request(db,'session.list',{}),cache=read(db.userId);
    for(const row of rows as ClassSession[]){
      if((cache.versions?.[row.id]||0)!==(versions?.[row.id]||0))continue;
      if(!cache.sessions[row.id])cache.sessions[row.id]={session:row,transcript:[],outline:null,renders:[],chat:[]};
      else if(!cache.pending.some(p=>p.input.id===row.id||p.input.sessionId===row.id))cache.sessions[row.id].session=row;
    }
    save(db.userId,cache);
  }catch(error){if(db.userId===userId){lastError=error instanceof Error?error.message:'离线';notify();}}
  if(db.userId!==userId)throw new Error('账号已切换');
  const cache=read(db.userId);
  return Object.values(cache.sessions).map(v=>v.session).filter(s=>!s.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export async function loadClassSession(db:ClassoloDb,id:string):Promise<ClassSnapshot>{
  await flushClassPending(db);
  const initial=read(db.userId),version=initial.versions?.[id]||0;
  try{
    if(!initial.pending.some(p=>p.input.sessionId===id||p.input.id===id)&&!initial.conflicts?.[id]){
      const remote=await request(db,'session.load',{id}),latest=read(db.userId);
      if((latest.versions?.[id]||0)===version&&!latest.pending.some(p=>p.input.sessionId===id||p.input.id===id)&&!latest.conflicts?.[id]){latest.sessions[id]=remote;latest.cloudVersions={...latest.cloudVersions,[id]:String(remote.session.cloudRevision??remote.session.updatedAt??'')};save(db.userId,latest);}
    }
  }catch(error){if(db.userId===userId){lastError=error instanceof Error?error.message:'离线';notify();}}
  if(db.userId!==userId)throw new Error('账号已切换');
  const cache=read(db.userId);
  const result=cache.sessions[id];if(!result)throw new Error('课堂记录不存在或不属于当前账号');return result;
}
/** Check a cheap revision first; a changed snapshot is applied only if the local read version still matches. */
export async function refreshClassSession(db:ClassoloDb,id:string,isLocalWriter:()=>boolean):Promise<ClassSnapshot|null>{
  if(isLocalWriter())return null;
  const initial=read(db.userId),version=initial.versions?.[id]||0;
  if(initial.conflicts?.[id]||initial.pending.some(p=>p.input.sessionId===id||p.input.id===id))return null;
  const remoteVersion=await request(db,'session.version',{id});
  if(db.userId!==userId||isLocalWriter())return null;
  if(initial.cloudVersions?.[id]===remoteVersion.revision)return null;
  const remote:ClassSnapshot=await request(db,'session.load',{id});
  if(db.userId!==userId||isLocalWriter())return null;
  const latest=read(db.userId);
  if((latest.versions?.[id]||0)!==version||latest.conflicts?.[id]||latest.pending.some(p=>p.input.sessionId===id||p.input.id===id))return null;
  if(remote.session.userId!==db.userId||remote.session.id!==id)throw new Error('课堂快照归属不匹配');
  latest.sessions[id]=remote;latest.cloudVersions={...latest.cloudVersions,[id]:remote.session.cloudRevision??remoteVersion.revision};save(db.userId,latest);
  return remote;
}
export async function insertTranscriptSegments(db:ClassoloDb,rows:TranscriptRow[]):Promise<number>{
  if(!rows.length)return 0;
  await write(db,'transcript.append',{sessionId:rows[0].sessionId,rows},cache=>{const value=cache.sessions[rows[0].sessionId];if(value){const ids=new Set(value.transcript.map(r=>r.id));value.transcript.push(...rows.filter(r=>!ids.has(r.id)));}});return rows.length;
}
export async function upsertNoteOutline(db:ClassoloDb,input:{sessionId:string;outline:Record<string,unknown>;revision:number}){
  const current=read(db.userId),conflict=current.conflicts?.[input.sessionId];
  if(conflict){
    if(current.sessions[input.sessionId])current.sessions[input.sessionId].outline=input;
    current.versions={...current.versions,[input.sessionId]:(current.versions?.[input.sessionId]||0)+1};
    save(db.userId,current);return;
  }
  const expectedRevision=current.sessions[input.sessionId]?.outline?.revision||0;
  await write(db,'outline.save',{...input,expectedRevision},cache=>{if(cache.sessions[input.sessionId])cache.sessions[input.sessionId].outline=input;});
}
export function queueClassTranscriptCorrection(db:ClassoloDb,input:{sessionId:string;segmentId:string;action:CorrectionAction}){
  if(db.userId!==userId)throw new Error('账号已切换')
  const snapshot=read(db.userId),session=snapshot.sessions[input.sessionId]
  if(!session)throw new Error('课堂记录不存在')
  if(snapshot.correctionConflicts?.[`${input.sessionId}:${input.segmentId}`])throw new Error('请先处理此文稿的同步冲突')
  const source=session.transcript.find(row=>row.id===input.segmentId)
  if(!source)throw new Error('原始文稿不存在')
  const prior=session.corrections?.find(row=>row.segmentId===input.segmentId)
  const action={...input.action,atMs:input.action.atMs??Date.now()} as CorrectionAction
  const next=planTranscriptCorrection({sessionId:input.sessionId,segmentId:input.segmentId,rawText:source.text,previous:prior,profile:session.session.profile?parseClassCourseProfile(session.session.profile):DEFAULT_CLASS_COURSE_PROFILE,action})
  const pending=write(db,'correction.save',{...input,expectedRevision:prior?.revision??0,action},cache=>{
    const current=cache.sessions[input.sessionId]
    if(!current)return
    current.corrections=[...(current.corrections??[]).filter(row=>row.segmentId!==input.segmentId),next]
  })
  const stored=read(db.userId).sessions[input.sessionId]?.corrections?.find(row=>row.segmentId===input.segmentId)
  if(!stored||stored.revision!==next.revision){void pending.catch(()=>{});throw new Error('本地校正无法保存，请检查存储空间')}
  return {row:stored,pending}
}
export function resolveClassCorrectionConflict(db:ClassoloDb,id:string,segmentId:string,choice:'remote'|'local'){
  if(db.userId!==userId)throw new Error('账号已切换')
  const key=`${id}:${segmentId}`,cache=read(db.userId),conflict=cache.correctionConflicts?.[key]
  if(!conflict)return null
  const session=cache.sessions[id];if(!session)throw new Error('课堂记录不存在')
  session.corrections=[...(session.corrections??[]).filter(row=>row.segmentId!==segmentId),...(conflict.remote?[conflict.remote]:[])]
  delete cache.correctionConflicts![key];cache.versions={...cache.versions,[id]:(cache.versions?.[id]||0)+1};save(db.userId,cache)
  if(choice==='local'&&conflict.local.correctedText!==conflict.remote?.correctedText)return queueClassTranscriptCorrection(db,{sessionId:id,segmentId,action:{kind:'manual',text:conflict.local.correctedText}})
  return {row:conflict.remote,pending:Promise.resolve()}
}
/** Conflict choices are explicit. A raced cloud write will produce another CAS conflict. */
export async function resolveClassOutlineConflict(db:ClassoloDb,id:string,choice:'local'|'remote'){
  const cache=read(db.userId),conflict=cache.conflicts?.[id],snapshot=cache.sessions[id];
  if(!conflict||!snapshot)return null;
  const outline=choice==='local'?snapshot.outline?.outline:conflict.outline;
  delete cache.conflicts![id];
  snapshot.outline=conflict.outline?{outline:conflict.outline,revision:conflict.revision}:null;
  cache.versions={...cache.versions,[id]:(cache.versions?.[id]||0)+1};
  save(db.userId,cache);
  if(choice==='local'&&outline)await upsertNoteOutline(db,{sessionId:id,outline,revision:conflict.revision+1});
  return read(db.userId).sessions[id]?.outline??null;
}
export async function insertRenderMessage(db:ClassoloDb,input:RenderRow){
  await write(db,'render.save',{...input},cache=>{const value=cache.sessions[input.sessionId];if(value){value.renders=value.renders.filter(r=>r.id!==input.id);value.renders.push(input);}});
}
export async function insertChatMessage(db:ClassoloDb,input:Omit<ChatRow,'id'> & {id?:string}){
  const row:ChatRow={...input,id:input.id||crypto.randomUUID(),createdAt:new Date().toISOString()};
  await write(db,'chat.append',{...row},cache=>{cache.sessions[row.sessionId]?.chat.push(row);});
}
