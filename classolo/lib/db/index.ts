/** Authenticated classroom repository. No anonymous tenant or browser secrets. */
export type ClassoloDb = Readonly<{userId:string}>;
export type AsrSnapshot = {family:string;dialect:string;model:string;baseUrl:string;sampleRate:number;hotwordPack?:string};
export interface ClassSession {id:string;userId:string;title:string;status:string;startedAt:string;updatedAt:string;asrSnapshot:AsrSnapshot;archived?:boolean}
export interface TranscriptRow {id:string;sessionId:string;seq:number;startMs:number;endMs:number;text:string}
export interface ClassSnapshot {session:ClassSession;transcript:TranscriptRow[];outline:{outline:Record<string,unknown>;revision:number}|null;renders:RenderRow[];chat:ChatRow[]}
export interface RenderRow {id:string;sessionId:string;module:string;version:string;target:string;props:Record<string,unknown>;source:string;transcriptAnchor?:string|null;createdAt?:string|Date}
export interface ChatRow {id:string;sessionId:string;seq:number;role:'user'|'assistant'|'system'|'tool';content:string;parts?:unknown;createdAt?:string}
type Operation={key:string;op:string;input:Record<string,unknown>};
type Cache={sessions:Record<string,ClassSnapshot>;pending:Operation[]};
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
async function request(db:ClassoloDb,op:string,input:Record<string,unknown>,operationKey?:string){
  if(db.userId!==userId)throw new Error('账号已切换');
  const response=await fetch('/api/class/state',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({op,input,expectedUserId:db.userId,operationKey})});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`课堂同步失败 (${response.status})`);}
  return response.json();
}
const flushing=new Map<string,Promise<void>>();
export async function flushClassPending(db:ClassoloDb):Promise<void>{
  const active=flushing.get(db.userId);if(active)return active;
  const run=(async()=>{
    while(db.userId===userId){
      const item=read(db.userId).pending[0];if(!item)break;
      try{await request(db,item.op,item.input,item.key);}catch(error){lastError=error instanceof Error?error.message:'课堂尚未同步';notify();return;}
      if(db.userId!==userId)return;
      const latest=read(db.userId);latest.pending=latest.pending.filter(p=>p.key!==item.key);save(db.userId,latest);
    }
    if(db.userId===userId){lastError='';notify();}
  })().finally(()=>{flushing.delete(db.userId);});flushing.set(db.userId,run);return run;
}

async function write(db:ClassoloDb,op:string,input:Record<string,unknown>,apply:(cache:Cache)=>void){
  if(db.userId!==userId)throw new Error('账号已切换');
  const cache=read(db.userId);apply(cache);cache.pending.push({key:crypto.randomUUID(),op,input});save(db.userId,cache);
  await flushClassPending(db);
}
export async function insertSession(db:ClassoloDb,input:{id?:string;title:string;status:string;asrSnapshot:AsrSnapshot;startedAt?:Date}):Promise<ClassSession>{
  const row:ClassSession={...input,id:input.id||crypto.randomUUID(),userId:db.userId,startedAt:(input.startedAt||new Date()).toISOString(),updatedAt:new Date().toISOString()};
  await write(db,'session.save',{...row},cache=>{cache.sessions[row.id]={session:row,transcript:[],outline:null,renders:[],chat:[]};});return row;
}
export async function updateSession(db:ClassoloDb,id:string,patch:Record<string,unknown>){
  await write(db,'session.update',{id,...patch},cache=>{const value=cache.sessions[id];if(value)value.session={...value.session,...patch,updatedAt:new Date().toISOString()};});
}
export async function listSessions(db:ClassoloDb):Promise<ClassSession[]>{
  await flushClassPending(db);
  const cache=read(db.userId);
  try{const rows=await request(db,'session.list',{});for(const row of rows as ClassSession[]){if(!cache.sessions[row.id])cache.sessions[row.id]={session:row,transcript:[],outline:null,renders:[],chat:[]};else if(!cache.pending.some(p=>p.input.id===row.id||p.input.sessionId===row.id))cache.sessions[row.id].session=row;}save(db.userId,cache);}catch(error){lastError=error instanceof Error?error.message:'离线';notify();}
  return Object.values(cache.sessions).map(v=>v.session).filter(s=>!s.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
export async function loadClassSession(db:ClassoloDb,id:string):Promise<ClassSnapshot>{
  await flushClassPending(db);
  const cache=read(db.userId);
  try{if(!cache.pending.some(p=>p.input.sessionId===id||p.input.id===id)){cache.sessions[id]=await request(db,'session.load',{id});save(db.userId,cache);}}catch(error){lastError=error instanceof Error?error.message:'离线';notify();}
  const result=cache.sessions[id];if(!result)throw new Error('课堂记录不存在或不属于当前账号');return result;
}
export async function insertTranscriptSegments(db:ClassoloDb,rows:TranscriptRow[]):Promise<number>{
  if(!rows.length)return 0;
  await write(db,'transcript.append',{sessionId:rows[0].sessionId,rows},cache=>{const value=cache.sessions[rows[0].sessionId];if(value){const ids=new Set(value.transcript.map(r=>r.id));value.transcript.push(...rows.filter(r=>!ids.has(r.id)));}});return rows.length;
}
export async function upsertNoteOutline(db:ClassoloDb,input:{sessionId:string;outline:Record<string,unknown>;revision:number}){
  await write(db,'outline.save',input,cache=>{if(cache.sessions[input.sessionId])cache.sessions[input.sessionId].outline=input;});
}
export async function insertRenderMessage(db:ClassoloDb,input:RenderRow){
  await write(db,'render.save',{...input},cache=>{const value=cache.sessions[input.sessionId];if(value){value.renders=value.renders.filter(r=>r.id!==input.id);value.renders.push(input);}});
}
export async function insertChatMessage(db:ClassoloDb,input:Omit<ChatRow,'id'> & {id?:string}){
  const row:ChatRow={...input,id:input.id||crypto.randomUUID(),createdAt:new Date().toISOString()};
  await write(db,'chat.append',{...row},cache=>{cache.sessions[row.sessionId]?.chat.push(row);});
}
