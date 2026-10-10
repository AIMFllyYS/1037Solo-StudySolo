import type { SessionHeadV3, SessionWindowLoad } from "./types";
import { chatHeadKey, chatChunkKey, chatS3Prefix } from "./keys";
import type { ChatMessage } from '@/lib/types/chat';

import { idbStorage, chatSessionKey, chatBlobKey, listPersistedKeysForOwner, WRITE_DEBOUNCE_MS, registerStorageFlushHandler, commitSessionCheckpoint, readOwnedStorageItem, writeOwnedStorageItem, removeOwnedStorageItem } from '@/lib/storage/idbStorage';
import { compactStudyMessages } from '@/lib/chat/compactStudyParts';
import { normalizeStoredMessages } from '@/lib/chat/messageParts';
import {
  buildChunkSpine,
  dotEntriesFromSpine,
  planSessionChunks,
  spineDerivedTotals,
  turnsToMessageRange,
  windowStartTurn,
  INITIAL_WINDOW_TURNS,
  type TurnSpineEntry,
} from '@/lib/chat/turnSpine';
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';
import {getStorageOwner,onStorageOwnerChange} from '@/lib/storage/ownerScope';
import { mergeChatSnapshots } from '@/lib/storage/threeWayChatMerge';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/**
 * 尾部 chunk 常驻缓存：追加/流式更新都是同步 mutate + setItemLazy 调度，
 * flush 时序列化此刻最新内容（latest-wins，与旧防抖语义一致）。
 * 只装一个 chunk，成本与「最近 8 轮」成正比，与会话总长无关。
 */
interface TailCacheEntry {
  head: SessionHeadV3;
  chunkIndex: number;
  messages: ChatMessage[];
}
const tailCache = new Map<string, TailCacheEntry>();
const sessionWriteQueues = new Map<string, Promise<void>>();
const activeSessionWrites=new Set<string>();
type PendingTail={ownerId:string;sessionId:string;head:SessionHeadV3;chunks:Map<number,ChatMessage[]>;timer:ReturnType<typeof setTimeout>|null;flushPromise:Promise<void>|null;error:string|null;recoverySaved:boolean}
const pendingTail=new Map<string,PendingTail>();
const sessionTombstones=new Set<string>();
type FailedFullWrite={messages:ChatMessage[];reason:'storage_unavailable'|'checkpoint_conflict';recoverySaved:boolean}
const failedFullWrites=new Map<string,FailedFullWrite>();
const durableRecoveryStatus=new Set<string>();
type PendingFullWrite={ownerId:string;sessionId:string;latest:ChatMessage[]|null;baseMessages:ChatMessage[]|null;running:Promise<void>|null}
const pendingFullWrites=new Map<string,PendingFullWrite>();
const writeStatusListeners=new Set<()=>void>()
/** Transaction seam for deterministic cross-tab race tests; production uses native IDB CAS. */
export const sessionCheckpointIo = { commit: commitSessionCheckpoint };
const notifyWriteStatus=()=>{for(const listener of writeStatusListeners)listener()}
export function subscribeSessionWriteStatus(listener:()=>void){writeStatusListeners.add(listener);return()=>{writeStatusListeners.delete(listener)}}
registerResourceMetrics(()=>({tailCacheCount:tailCache.size,pendingSessionWrites:new Set([...sessionWriteQueues.keys(),...pendingTail.keys(),...failedFullWrites.keys(),...pendingFullWrites.keys()]).size,inFlightSessionWrites:activeSessionWrites.size}));

function sessionQueueKey(sessionId:string):string|null{const owner=getStorageOwner();return owner?`${owner}:${sessionId}`:null}
function enqueueSessionWriteForOwner(ownerId:string,sessionId:string,task:(ownerId:string)=>Promise<void>):Promise<void>{
  const key=`${ownerId}:${sessionId}`
  const prev = sessionWriteQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(()=>{}).then(async()=>{activeSessionWrites.add(key);try{await task(ownerId)}finally{activeSessionWrites.delete(key)}});
  const tracked = next.then(()=>{},(error)=>console.warn('[chatStorage] write failed',error instanceof Error?error.name:'unknown'));
  sessionWriteQueues.set(key, tracked);
  void tracked.finally(()=>{if(sessionWriteQueues.get(key)===tracked)sessionWriteQueues.delete(key)});
  return next;
}
function enqueueSessionWrite(sessionId:string,task:(ownerId:string)=>Promise<void>):Promise<void>{
  const owner=getStorageOwner();return owner?enqueueSessionWriteForOwner(owner,sessionId,task):Promise.reject(new Error('Storage owner unavailable'))
}

function markTailDirty(sessionId:string,head:SessionHeadV3,index:number,messages:ChatMessage[],ownerId=getStorageOwner()){
  if(!ownerId)return
  const key=`${ownerId}:${sessionId}`
  let pending=pendingTail.get(key)
  if(!pending){pending={ownerId,sessionId,head,chunks:new Map(),timer:null,flushPromise:null,error:null,recoverySaved:false};pendingTail.set(key,pending)}
  pending.head=head;pending.chunks.set(index,messages)
  if(!pending.timer&&!pending.flushPromise)pending.timer=setTimeout(()=>{pending!.timer=null;void flushTailCheckpointByKey(key)},WRITE_DEBOUNCE_MS)
}

function flushTailCheckpoint(sessionId:string):Promise<void>{
  const key=sessionQueueKey(sessionId)
  return key?flushTailCheckpointByKey(key):Promise.resolve()
}
async function mergeTailAppendConflict(ownerId:string,sessionId:string,snapshot:Map<number,ChatMessage[]>):Promise<SessionHeadV3|null>{
  const remoteHead=await loadHeadV3(sessionId,ownerId);if(!remoteHead)return null
  const remote=await readTurnRange(sessionId,remoteHead,0,remoteHead.turnCount,ownerId)
  const byId=new Map(remote.map(message=>[message.id,message]))
  const additions:ChatMessage[]=[]
  for(const messages of snapshot.values())for(const message of messages){
    const existing=byId.get(message.id)
    if(existing){if(JSON.stringify(existing)!==JSON.stringify(message))return null;continue}
    byId.set(message.id,message);additions.push(message)
  }
  if(!additions.length){
    if(getStorageOwner()===ownerId){const chunkIndex=remoteHead.chunkCount-1;tailCache.set(sessionId,{head:remoteHead,chunkIndex,messages:(await readChunk(sessionId,chunkIndex,ownerId))??[]})}
    return remoteHead
  }
  return writeSessionV3Now(sessionId,[...remote,...additions],ownerId,remote)
}
function flushTailCheckpointByKey(key:string):Promise<void>{
  const pending=pendingTail.get(key)
  if(!pending)return Promise.resolve()
  if(pending.error==='checkpoint_conflict')return Promise.resolve()
  if(pending.timer){clearTimeout(pending.timer);pending.timer=null}
  if(pending.flushPromise)return pending.flushPromise
  const {ownerId,sessionId}=pending
  const task=enqueueSessionWriteForOwner(ownerId,sessionId,async()=>{
    const latest=pendingTail.get(key);if(latest!==pending||!pending.chunks.size)return
    const snapshot=new Map(pending.chunks);pending.chunks.clear()
    const headSnapshot=JSON.parse(JSON.stringify(pending.head)) as SessionHeadV3
    const entries:[string,string][]=[...snapshot].map(([index,messages])=>[chatChunkKey(sessionId,index),serializeSessionMessages(messages)])
    const committed=await loadHeadV3(sessionId,ownerId),expectedRevision=committed?.contentRevision??0
    headSnapshot.contentRevision=expectedRevision+1
    entries.push([chatHeadKey(sessionId),JSON.stringify(headSnapshot)])
    const outcome=await sessionCheckpointIo.commit({ownerId,headKey:chatHeadKey(sessionId),expectedRevision,entries})
    if(outcome.status==='saved'){
      pending.head.contentRevision=outcome.revision;pending.error=null;notifyWriteStatus()
    }else{
      if(outcome.status==='conflict'){
        const merged=await mergeTailAppendConflict(ownerId,sessionId,snapshot).catch(()=>null)
        if(merged){pending.head=merged;pending.error=null;notifyWriteStatus();return}
      }
      for(const [index,messages] of snapshot)if(!pending.chunks.has(index))pending.chunks.set(index,messages)
      pending.error=outcome.status==='conflict'?'checkpoint_conflict':outcome.reason
      if(outcome.status==='conflict')pending.recoverySaved=await writeOwnedStorageItem(ownerId,tailRecoveryKey(sessionId),serializeSessionMessages([...snapshot.values()].flat()))
      notifyWriteStatus()
      throw new Error(pending.error)
    }
  })
  pending.flushPromise=task.catch(()=>{}).finally(()=>{
    pending.flushPromise=null
    if(!pending.chunks.size){pendingTail.delete(key);return}
    // Persist failures wait for an explicit flush/new mutation rather than spinning on quota errors.
    if(!pending.error&&!pending.timer)pending.timer=setTimeout(()=>{pending.timer=null;void flushTailCheckpointByKey(key)},WRITE_DEBOUNCE_MS)
  })
  return pending.flushPromise
}

export async function flushPendingSessionCheckpoints():Promise<void>{
  await Promise.all([...pendingTail.keys()].map(flushTailCheckpointByKey))
}
export function getSessionWriteFailure(sessionId:string):string|null{
  const key=sessionQueueKey(sessionId)
  return key?(failedFullWrites.get(key)?.reason??pendingTail.get(key)?.error??(durableRecoveryStatus.has(key)?'checkpoint_conflict':null)):null
}
function recoveryKey(sessionId:string){return `chat-recovery-s3:${sessionId}`}
function tailRecoveryKey(sessionId:string){return `chat-recovery-tail-s3:${sessionId}`}
export async function loadSessionRecovery(sessionId:string):Promise<ChatMessage[]|null>{
  const key=sessionQueueKey(sessionId),failed=key?failedFullWrites.get(key):null
  if(failed)return failed.messages
  const ownerId=getStorageOwner();if(!ownerId)return null
  const tailConflict=key?pendingTail.get(key)?.error==='checkpoint_conflict':false
  const raw=tailConflict
    ? (await readOwnedStorageItem(ownerId,tailRecoveryKey(sessionId)))??(await readOwnedStorageItem(ownerId,recoveryKey(sessionId)))
    : (await readOwnedStorageItem(ownerId,recoveryKey(sessionId)))??(await readOwnedStorageItem(ownerId,tailRecoveryKey(sessionId)))
  return raw?parseStoredMessages(raw):null
}
export function hasDurableSessionRecovery(sessionId:string):boolean{
  const key=sessionQueueKey(sessionId)
  return !!key&&(failedFullWrites.get(key)?.recoverySaved===true||pendingTail.get(key)?.recoverySaved===true||durableRecoveryStatus.has(key))
}
export async function hydrateSessionRecoveryStatus(sessionId:string):Promise<void>{
  const owner=getStorageOwner(),key=sessionQueueKey(sessionId)
  if(!owner||!key)return
  const found=Boolean((await readOwnedStorageItem(owner,recoveryKey(sessionId)))??(await readOwnedStorageItem(owner,tailRecoveryKey(sessionId))))
  if(getStorageOwner()!==owner)return
  if(found)durableRecoveryStatus.add(key);else durableRecoveryStatus.delete(key)
  notifyWriteStatus()
}
export function hasSessionWriteLease(sessionId:string):boolean{
  const key=sessionQueueKey(sessionId)
  return !!key&&(sessionWriteQueues.has(key)||pendingTail.has(key)||pendingFullWrites.has(key)||failedFullWrites.has(key))
}
export async function retrySessionWrite(sessionId:string):Promise<boolean>{
  const key=sessionQueueKey(sessionId)
  if(!key)return false
  const full=failedFullWrites.get(key)
  if(full?.reason==='checkpoint_conflict'||pendingTail.get(key)?.error==='checkpoint_conflict')return false
  if(full){
    const ownerId=getStorageOwner();if(!ownerId)return false
    const next=await enqueueSessionWriteForOwner(ownerId,sessionId,async()=>{
      const saved=await writeSessionV3Now(sessionId,full.messages,ownerId)
      if(!saved)throw new Error('storage_unavailable')
      failedFullWrites.delete(key);notifyWriteStatus()
    }).then(()=>true,()=>false)
    return next
  }
  if(pendingTail.has(key)){await flushTailCheckpointByKey(key);return !pendingTail.has(key)}
  return true
}
registerStorageFlushHandler(()=>{void flushPendingSessionCheckpoints()})
onStorageOwnerChange((previous,next)=>{
  if(previous===next)return
  tailCache.clear()
  durableRecoveryStatus.clear()
  if(previous)for(const key of pendingTail.keys())if(key.startsWith(`${previous}:`))void flushTailCheckpointByKey(key)
  notifyWriteStatus()
})

function parseStoredMessages(raw: string): ChatMessage[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return compactStudyMessages(normalizeStoredMessages(parsed), 'persist');
  } catch {
    return null;
  }
}

async function loadHeadV3(sessionId: string,ownerId?:string): Promise<SessionHeadV3 | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatHeadKey(sessionId)):await idbStorage.getItem(chatHeadKey(sessionId));
  if (!raw) return null;
  try {
    const head = JSON.parse(raw) as SessionHeadV3;
    if (head?.v === 3 && Array.isArray(head.spine)) return head;
    return null;
  } catch {
    return null;
  }
}

async function readChunk(sessionId: string, chunk: number,ownerId?:string): Promise<ChatMessage[] | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatChunkKey(sessionId,chunk)):await idbStorage.getItem(chatChunkKey(sessionId, chunk));
  if (!raw) return null;
  return parseStoredMessages(raw);
}

/** chunk c 覆盖的全局消息下标区间（spine 推导，不读正文）。 */
function chunkIndexRange(head: SessionHeadV3, chunk: number): { start: number; end: number } {
  const firstTurn = head.spine.find((entry) => entry.chunk === chunk);
  const nextChunkTurn = head.spine.find((entry) => entry.chunk === chunk + 1);
  return {
    start: firstTurn?.firstIndex ?? head.messageCount,
    end: nextChunkTurn?.firstIndex ?? head.messageCount,
  };
}

/** 读轮次区间 [fromTurn, toTurnExclusive) 的消息（按 spine 切片，只碰覆盖到的 chunk）。 */
async function readTurnRange(
  sessionId: string,
  head: SessionHeadV3,
  fromTurn: number,
  toTurnExclusive: number,
  ownerId?: string,
): Promise<ChatMessage[]> {
  if (toTurnExclusive <= fromTurn || head.spine.length === 0) return [];
  const { start, end } = turnsToMessageRange(head.spine, head.messageCount, fromTurn, toTurnExclusive);
  const firstChunk = head.spine[fromTurn]?.chunk ?? head.chunkCount - 1;
  const lastTurn = Math.min(toTurnExclusive, head.turnCount) - 1;
  const lastChunk = head.spine[lastTurn]?.chunk ?? head.chunkCount - 1;
  const out: ChatMessage[] = [];
  for (let chunk = firstChunk; chunk <= lastChunk; chunk += 1) {
    const messages = (await readChunk(sessionId, chunk, ownerId)) ?? [];
    const range = chunkIndexRange(head, chunk);
    const s = Math.max(start, range.start) - range.start;
    const e = Math.min(end, range.end) - range.start;
    out.push(...messages.slice(Math.max(0, s), Math.max(0, e)));
  }
  return out;
}

/** Plan outside the transaction; publish all chunks and the head as one IDB checkpoint. */
export async function writeSessionV3Now(sessionId: string, messages: ChatMessage[],ownerId=getStorageOwner(),baseMessages?:ChatMessage[],attempt=0): Promise<SessionHeadV3 | null> {
  if(!ownerId)return null
  const plan = planSessionChunks(messages);
  const previous=await loadHeadV3(sessionId,ownerId),expectedRevision=previous?.contentRevision??0;
  const head: SessionHeadV3 = {
    v: 3,
    contentRevision:expectedRevision+1,
    messageCount: messages.length,
    turnCount: plan.spine.length,
    chunkCount: plan.chunks.length,
    spine: plan.spine,
  };
  const entries:[string,string][]=plan.chunks.map((chunk,index)=>[chatChunkKey(sessionId,index),serializeSessionMessages(chunk)]);
  entries.push([chatHeadKey(sessionId),JSON.stringify(head)]);
  const outcome=await sessionCheckpointIo.commit({ownerId,headKey:chatHeadKey(sessionId),expectedRevision,entries});
  if(outcome.status==='conflict'){
    if(!baseMessages||attempt>=2)throw new Error('checkpoint_conflict');
    const remoteHead=await loadHeadV3(sessionId,ownerId);
    if(!remoteHead)throw new Error('checkpoint_conflict');
    const remote=await readTurnRange(sessionId,remoteHead,0,remoteHead.turnCount,ownerId);
    const merged=mergeChatSnapshots(baseMessages,messages,remote);
    if(!merged)throw new Error('checkpoint_conflict');
    return writeSessionV3Now(sessionId,merged,ownerId,remote,attempt+1);
  }
  if(outcome.status!=='saved')return null;
  // v2 单 blob 键在 head 落盘之后才清：中途失败时 v2 仍是完整真相，下次读会重试迁移。
  await removeOwnedStorageItem(ownerId,chatSessionKey(sessionId));
  if(getStorageOwner()===ownerId)tailCache.set(sessionId, {
    head,
    chunkIndex: plan.chunks.length - 1,
    messages: [...plan.chunks[plan.chunks.length - 1]],
  });
  return head;
}

/** v2 单 blob → v3 分块的就地迁移（幂等；v3 head 已存在时不进这里）。 */
async function migrateV2ToV3(sessionId: string,ownerId?:string): Promise<SessionHeadV3 | null> {
  const raw = ownerId?await readOwnedStorageItem(ownerId,chatSessionKey(sessionId)):await idbStorage.getItem(chatSessionKey(sessionId));
  if (!raw) return null;
  const messages = parseStoredMessages(raw);
  if (!messages) return null;
  return writeSessionV3Now(sessionId, messages,ownerId??getStorageOwner());
}

async function ensureHeadV3(sessionId: string,ownerId=getStorageOwner()): Promise<SessionHeadV3 | null> {
  const cached = ownerId===getStorageOwner()?tailCache.get(sessionId)?.head:undefined;
  if (cached) return cached;
  return (await loadHeadV3(sessionId,ownerId??undefined)) ?? (await migrateV2ToV3(sessionId,ownerId??undefined));
}

async function ensureTailCache(sessionId: string,ownerId=getStorageOwner()): Promise<TailCacheEntry | null> {
  if(!ownerId)return null
  const hit = ownerId===getStorageOwner()?tailCache.get(sessionId):undefined;
  if (hit) return hit;
  const head = await ensureHeadV3(sessionId,ownerId);
  if (!head) return null;
  const chunkIndex = head.chunkCount - 1;
  const messages = (await readChunk(sessionId, chunkIndex,ownerId)) ?? [];
  const entry: TailCacheEntry = { head, chunkIndex, messages };
  if(ownerId===getStorageOwner())tailCache.set(sessionId, entry);
  return entry;
}

/** Mark the dirty chunk; the shared checkpoint commits it and the head in one transaction. */
function scheduleTailFlush(sessionId: string, entry: TailCacheEntry,ownerId=getStorageOwner()): void {
  markTailDirty(sessionId,entry.head,entry.chunkIndex,entry.messages,ownerId)
}

/**
 * 追加到尾部 chunk（同步路径：缓存命中即改即排程）。
 * 跨过 TURNS_PER_CHUNK 轮边界时把溢出的轮切进新 chunk——每 8 个 user 轮才发生一次，
 * 流式高频期永远命中「同一尾块内增长」这条快路径。
 */
function applyAppendToTail(sessionId: string, appended: ChatMessage[],entry=tailCache.get(sessionId),ownerId=getStorageOwner()): void {
  if (!entry) return;
  const all = [...entry.messages, ...appended];
  const olderSpine = entry.head.spine.filter((s) => s.chunk < entry.chunkIndex);
  const startTurn = olderSpine.length;
  const lastOlder = olderSpine[olderSpine.length - 1];
  const startIndex = lastOlder ? lastOlder.firstIndex + lastOlder.messageCount : 0;
  const tailSpine = buildChunkSpine(all, { startTurn, startIndex, chunkIndex: entry.chunkIndex });
  const byChunk = new Map<number, ChatMessage[]>();
  for (const s of tailSpine) {
    const arr = byChunk.get(s.chunk) ?? [];
    arr.push(...all.slice(s.firstIndex - startIndex, s.firstIndex - startIndex + s.messageCount));
    byChunk.set(s.chunk, arr);
  }
  entry.head.spine = [...olderSpine, ...tailSpine];
  entry.head.turnCount = entry.head.spine.length;
  entry.head.messageCount += appended.length;
  let maxChunk = entry.chunkIndex;
  for (const [chunk, msgs] of byChunk) {
    if (chunk === entry.chunkIndex) {
      entry.messages = msgs;
      scheduleTailFlush(sessionId, entry,ownerId);
    } else {
      // 新 chunk 只写一次；若它就是新尾块，把缓存接力过去。
      const nextEntry: TailCacheEntry = { head: entry.head, chunkIndex: chunk, messages: msgs };
      markTailDirty(sessionId,nextEntry.head,chunk,nextEntry.messages,ownerId)
      if (chunk > maxChunk) {
        maxChunk = chunk;
        if(ownerId===getStorageOwner())tailCache.set(sessionId, nextEntry);
      }
    }
  }
  entry.head.chunkCount = maxChunk + 1;
}

/** 追加消息（store 的 addMessage 走这里）。缓存就绪则同步排程，否则排队先装尾块。 */
export function appendSessionMessages(sessionId: string, appended: ChatMessage[]): void {
  if (!isBrowser() || appended.length === 0) return;
  const key=sessionQueueKey(sessionId);if(!key||sessionTombstones.has(key))return;
  if (tailCache.has(sessionId)) {
    applyAppendToTail(sessionId, appended);
    return;
  }
  void enqueueSessionWrite(sessionId, async (ownerId) => {
    if(sessionTombstones.has(`${ownerId}:${sessionId}`))return;
    const entry = await ensureTailCache(sessionId,ownerId);
    if (!entry) {
      // head 都没有 = 会话还没建过：按整段写（空会话 addMessage 的落点）。
      await writeSessionV3Now(sessionId, appended,ownerId);
      return;
    }
    applyAppendToTail(sessionId, appended,entry,ownerId);
  });
}

/** 更新一条消息（流式 updateMessage 走这里）：命中尾块同步改，否则排队回扫旧 chunk。 */
export function writeSessionMessage(sessionId: string, message: ChatMessage): void {
  if (!isBrowser()) return;
  const key=sessionQueueKey(sessionId);if(!key||sessionTombstones.has(key))return;
  const entry = tailCache.get(sessionId);
  if (entry) {
    const index = entry.messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      entry.messages[index] = message;
      scheduleTailFlush(sessionId, entry);
      return;
    }
  }
  void enqueueSessionWrite(sessionId, async (ownerId) => {
    if(sessionTombstones.has(`${ownerId}:${sessionId}`))return;
    const tail = await ensureTailCache(sessionId,ownerId);
    if (!tail) return;
    const tailIndex = tail.messages.findIndex((m) => m.id === message.id);
    if (tailIndex >= 0) {
      tail.messages[tailIndex] = message;
      scheduleTailFlush(sessionId, tail,ownerId);
      return;
    }
    // 非尾块更新（极少见：编辑旧轮）——从新到旧回扫，命中即重写那一个 chunk。
    for (let chunk = tail.head.chunkCount - 2; chunk >= 0; chunk -= 1) {
      const messages = await readChunk(sessionId, chunk,ownerId);
      if (!messages) continue;
      const index = messages.findIndex((m) => m.id === message.id);
      if (index < 0) continue;
      messages[index] = message;
      markTailDirty(sessionId,tail.head,chunk,messages,ownerId)
      return;
    }
  });
}

/** 释放内存里的尾块缓存（会话被驱逐/删除时调用）。 */
export function dropSessionTailCache(sessionId: string): void {
  tailCache.delete(sessionId);
}

/** 测试专用：清掉模块级尾块缓存与写队列（不同用例互不串场）。 */
export function __resetSessionV3ForTests(): void {
  tailCache.clear();
  sessionWriteQueues.clear();
  for(const pending of pendingTail.values())if(pending.timer)clearTimeout(pending.timer)
  pendingTail.clear()
  sessionTombstones.clear()
  failedFullWrites.clear()
  durableRecoveryStatus.clear()
  pendingFullWrites.clear()
  activeSessionWrites.clear()
}

/** 测试专用：等某条会话的写队列清空（saveSessionMessages 等 fire-and-forget 的落点）。 */
export function __waitSessionWritesForTests(sessionId: string): Promise<void> {
  const owner=getStorageOwner();return owner?__waitSessionWritesForOwnerForTests(owner,sessionId):Promise.resolve()
}
export function __waitSessionWritesForOwnerForTests(ownerId:string,sessionId:string):Promise<void>{
  return (sessionWriteQueues.get(`${ownerId}:${sessionId}`)??Promise.resolve()).catch(()=>{})
}

/**
 * 打开会话时的窗口读：head + 覆盖最近 tailTurns 轮的少数 chunk。
 * 顺手把尾块塞进 tailCache——之后追加/流式更新都是同步排程，不再回读。
 */
export async function loadSessionWindow(
  sessionId: string,
  tailTurns = INITIAL_WINDOW_TURNS,
): Promise<SessionWindowLoad | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  const startTurn = windowStartTurn(head.turnCount, tailTurns);
  const startIndex = head.spine[startTurn]?.firstIndex ?? head.messageCount;
  const messages = await readTurnRange(sessionId, head, startTurn, head.turnCount);
  if (!tailCache.has(sessionId) && head.chunkCount > 0) {
    const tail = (await readChunk(sessionId, head.chunkCount - 1)) ?? [];
    tailCache.set(sessionId, { head, chunkIndex: head.chunkCount - 1, messages: tail });
  }
  return {
    messages,
    spine: head.spine,
    turnCount: head.turnCount,
    messageCount: head.messageCount,
    startTurn,
    startIndex,
  };
}

/** 「加载更早」/定位点回跳：读 [startTurn - count, startTurn) 这段轮次的消息。 */
export async function loadTurnsBefore(
  sessionId: string,
  startTurn: number,
  count: number,
): Promise<{ messages: ChatMessage[]; fromTurn: number; startIndex: number } | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  const fromTurn = Math.max(0, startTurn - count);
  const messages = await readTurnRange(sessionId, head, fromTurn, startTurn);
  return { messages, fromTurn, startIndex: head.spine[fromTurn]?.firstIndex ?? 0 };
}

/** 定位点/顶栏合计用的轻量视图：只读 head。 */
/**
 * 请求路径的尾部读：从 spine 尾端向前收满 minMessages 条为止，只解析覆盖到的 chunk。
 * 会话比 minMessages 短时等价全量装配；长会话只碰尾部少数几个 chunk。
 */
export async function loadSessionTail(
  sessionId: string,
  minMessages: number,
): Promise<ChatMessage[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  let covered = 0;
  let fromTurn = head.turnCount;
  while (fromTurn > 0 && covered < minMessages) {
    fromTurn -= 1;
    covered += head.spine[fromTurn]?.messageCount ?? 0;
  }
  return readTurnRange(sessionId, head, fromTurn, head.turnCount);
}

export async function loadSessionSpine(sessionId: string): Promise<TurnSpineEntry[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  return head?.spine ?? null;
}

/** Summary builders inspect only the head before choosing bounded chunk reads. */
export async function loadSessionSummaryHead(sessionId: string): Promise<{ revision: number; messageCount: number; spine: TurnSpineEntry[] } | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  return head ? { revision: head.contentRevision ?? 0, messageCount: head.messageCount, spine: head.spine } : null;
}

export { dotEntriesFromSpine, spineDerivedTotals };

/**
 * 全量装配读（sync 上行 / 导出 / GC / 请求构造 / 手动 compact 用）。
 * 名字保留 loadSessionMessages：全量消费方的调用语义不变。
 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[] | null> {
  if (!isBrowser()) return null;
  const head = await ensureHeadV3(sessionId);
  if (!head) return null;
  if (head.turnCount === 0) return [];
  return readTurnRange(sessionId, head, 0, head.turnCount);
}

export function serializeSessionMessages(messages: ChatMessage[]): string {
  return JSON.stringify(compactStudyMessages(messages, 'persist'));
}

function startFullWriteDrain(key:string,entry:PendingFullWrite){
  if(entry.running)return
  const task=enqueueSessionWriteForOwner(entry.ownerId,entry.sessionId,async()=>{
    while(entry.latest&&!sessionTombstones.has(key)){
      const messages=entry.latest,baseMessages=entry.baseMessages??undefined;entry.latest=null;entry.baseMessages=null
      try{
        const saved=await writeSessionV3Now(entry.sessionId,messages,entry.ownerId,baseMessages)
        if(!saved)throw new Error('storage_unavailable')
        if(failedFullWrites.delete(key))notifyWriteStatus()
      }catch(error){
        const snapshot=entry.latest??messages
        const conflict=error instanceof Error&&error.message==='checkpoint_conflict'
        const recoverySaved=conflict?await writeOwnedStorageItem(entry.ownerId,recoveryKey(entry.sessionId),serializeSessionMessages(snapshot)):false
        failedFullWrites.set(key,{messages:snapshot,reason:conflict?'checkpoint_conflict':'storage_unavailable',recoverySaved})
        notifyWriteStatus()
        entry.latest=null;throw error
      }
    }
  })
  entry.running=task.catch(()=>{}).finally(()=>{
    entry.running=null
    if(entry.latest&&!sessionTombstones.has(key)&&!failedFullWrites.has(key))startFullWriteDrain(key,entry)
    else pendingFullWrites.delete(key)
  })
}

/** Complete checkpoint snapshots coalesce to one in-flight plus one latest pending. */
export function saveSessionMessages(sessionId: string, messages: ChatMessage[], baseMessages?: ChatMessage[]): void {
  if (!isBrowser()) return;
  const ownerId=getStorageOwner(),key=sessionQueueKey(sessionId);if(!key||!ownerId||sessionTombstones.has(key))return;
  void flushTailCheckpoint(sessionId);
  let entry=pendingFullWrites.get(key)
  if(!entry){entry={ownerId,sessionId,latest:null,baseMessages:null,running:null};pendingFullWrites.set(key,entry)}
  entry.latest=messages
  entry.baseMessages=baseMessages??null
  startFullWriteDrain(key,entry)
}

/** Durable counterpart for page-by-page cloud pull; ordinary streaming stays coalesced. */
export async function saveSessionMessagesCommitted(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const key = sessionQueueKey(sessionId);
  if (!key) throw new Error("storage_owner_unavailable");
  saveSessionMessages(sessionId, messages);
  while (true) {
    const pending = pendingFullWrites.get(key);
    if (!pending) break;
    if (pending.running) await pending.running;
    if (!pending.latest) break;
  }
  const failure = failedFullWrites.get(key)?.reason;
  if (failure) throw new Error(failure);
}

export async function deleteSessionData(sessionId: string, blobIds: string[] = []): Promise<void> {
  if (!isBrowser()) return;
  const owner=getStorageOwner();if(!owner)return
  sessionTombstones.add(`${owner}:${sessionId}`)
  // v3 分块键走写队列尾部：先让排队的 flush 落完，再整组删，避免删完又被 lazy 写复活。
  await flushTailCheckpoint(sessionId)
  await enqueueSessionWrite(sessionId, async (ownerId) => {
    const prefix = chatS3Prefix(sessionId);
    const keys = await listPersistedKeysForOwner(ownerId);
    for (const key of keys) {
      if (key.startsWith(prefix)) await removeOwnedStorageItem(ownerId,key);
    }
    if(getStorageOwner()===ownerId)tailCache.delete(sessionId);
  });
  await removeOwnedStorageItem(owner,chatSessionKey(sessionId));
  for (const id of blobIds) {
    try {
      await removeOwnedStorageItem(owner,chatBlobKey(id));
    } catch {
      // ignore
    }
  }
}
